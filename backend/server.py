import argparse
import json
import os
import sqlite3
import uuid
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

DB_PATH = os.path.join(os.path.dirname(__file__), "expenses.db")


# Columns added after the original schema: (name, SQL definition).
EXTRA_COLUMNS = [
    ("merchant", "TEXT DEFAULT ''"),
    ("payment_method", "TEXT DEFAULT ''"),
    ("notes", "TEXT DEFAULT ''"),
    ("recurring", "INTEGER DEFAULT 0"),
]

# Frontend files the server hands out; everything else (e.g. expenses.db) stays private.
FRONTEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_FILES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/script.js": ("script.js", "text/javascript; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/dashboard": ("dashboard.html", "text/html; charset=utf-8"),
    "/dashboard.html": ("dashboard.html", "text/html; charset=utf-8"),
}


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            date TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    existing = {row[1] for row in conn.execute("PRAGMA table_info(expenses)")}
    for name, definition in EXTRA_COLUMNS:
        if name not in existing:
            conn.execute(f"ALTER TABLE expenses ADD COLUMN {name} {definition}")
    conn.commit()
    conn.close()


def row_to_expense(row):
    """DB row -> the shape the frontend uses."""
    return {
        "id": row["id"],
        "title": row["description"],
        "amount": row["amount"],
        "category": row["category"],
        "merchant": row["merchant"] or "",
        "paymentMethod": row["payment_method"] or "",
        "date": row["date"],
        "notes": row["notes"] or "",
        "recurring": bool(row["recurring"]),
    }


def parse_expense(data):
    """Validate a request body; returns (fields, error)."""
    title = str(data.get("title") or data.get("description") or "").strip()
    category = str(data.get("category") or "").strip()
    expense_date = str(data.get("date") or "").strip()
    try:
        amount = float(data.get("amount"))
    except (TypeError, ValueError):
        amount = 0
    if not title or amount <= 0 or not category or not expense_date:
        return None, "Missing required fields"
    try:
        date.fromisoformat(expense_date)
    except ValueError:
        return None, "Date must be YYYY-MM-DD"
    return {
        "description": title,
        "amount": amount,
        "category": category,
        "date": expense_date,
        "merchant": str(data.get("merchant") or "").strip(),
        "payment_method": str(data.get("paymentMethod") or "").strip(),
        "notes": str(data.get("notes") or "").strip(),
        "recurring": 1 if data.get("recurring") else 0,
    }, None


def fetch_expense(conn, expense_id):
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    return row_to_expense(row) if row else None


init_db()

# Categories that count as income, not spending (matches the frontend).
INCOME_CATEGORIES = {"Salary"}
# Weekly slope (as a share of the average week) below which the trend is "flat".
TREND_THRESHOLD = 0.05


def week_start(day):
    """Monday of the week containing `day`."""
    return day - timedelta(days=day.weekday())


def percent_change(current, previous):
    if previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)


def weekly_summary(weeks=8, today=None):
    """Spending per week (Mon-Sun) for the last `weeks` weeks, oldest first, plus trend stats."""
    today = today or date.today()
    current_start = week_start(today)
    # Fetch one extra week so the oldest week also gets a week-over-week change.
    first_start = current_start - timedelta(weeks=weeks)
    end = current_start + timedelta(days=7)

    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT amount, category, date FROM expenses WHERE date >= ? AND date < ?",
        (first_start.isoformat(), end.isoformat()),
    ).fetchall()
    conn.close()

    buckets = [
        {"start": first_start + timedelta(weeks=i), "total": 0.0, "count": 0, "categories": {}}
        for i in range(weeks + 1)
    ]
    for amount, category, raw_date in rows:
        if category in INCOME_CATEGORIES:
            continue
        try:
            day = date.fromisoformat(raw_date[:10])
        except ValueError:
            continue
        bucket = buckets[(week_start(day) - first_start).days // 7]
        bucket["total"] += amount
        bucket["count"] += 1
        bucket["categories"][category] = bucket["categories"].get(category, 0.0) + amount

    result = []
    for previous, bucket in zip(buckets, buckets[1:]):
        start = bucket["start"]
        result.append(
            {
                "week_start": start.isoformat(),
                "week_end": (start + timedelta(days=6)).isoformat(),
                "total": round(bucket["total"], 2),
                "count": bucket["count"],
                "change_percent": percent_change(bucket["total"], previous["total"]),
                "categories": {k: round(v, 2) for k, v in sorted(bucket["categories"].items(), key=lambda kv: -kv[1])},
                "is_current": start == current_start,
            }
        )

    current = result[-1]
    previous = result[-2] if len(result) > 1 else None
    completed = [w["total"] for w in result if not w["is_current"]]
    average = sum(completed) / len(completed) if completed else 0.0

    # Least-squares slope over completed weeks: how much spending changes per week.
    slope = 0.0
    if len(completed) >= 2:
        n = len(completed)
        mean_x = (n - 1) / 2
        slope = sum((x - mean_x) * (y - average) for x, y in enumerate(completed)) / sum(
            (x - mean_x) ** 2 for x in range(n)
        )
    if average and slope > average * TREND_THRESHOLD:
        direction = "rising"
    elif average and slope < -average * TREND_THRESHOLD:
        direction = "falling"
    else:
        direction = "flat"

    days_elapsed = (today - current_start).days + 1
    category_changes = []
    if previous:
        for category in set(current["categories"]) | set(previous["categories"]):
            now_amount = current["categories"].get(category, 0.0)
            before_amount = previous["categories"].get(category, 0.0)
            category_changes.append(
                {
                    "category": category,
                    "current": now_amount,
                    "previous": before_amount,
                    "change": round(now_amount - before_amount, 2),
                    "change_percent": percent_change(now_amount, before_amount),
                }
            )
        category_changes.sort(key=lambda c: -c["change"])

    return {
        "weeks": result,
        "summary": {
            "current_week_total": current["total"],
            "previous_week_total": previous["total"] if previous else 0.0,
            "change_percent": current["change_percent"],
            "projected_current_week": round(current["total"] / days_elapsed * 7, 2),
            "average_weekly": round(average, 2),
            "vs_average_percent": percent_change(current["total"], average),
            "trend": direction,
            "trend_per_week": round(slope, 2),
            "category_changes": category_changes,
        },
    }


def format_change(value):
    if value is None:
        return "  n/a"
    arrow = "↑" if value > 0 else "↓" if value < 0 else "="
    return f"{arrow} {abs(value):.1f}%"


def print_weekly_report(weeks):
    data = weekly_summary(weeks)
    summary = data["summary"]
    peak = max((w["total"] for w in data["weeks"]), default=0) or 1
    bar_width = 30

    print(f"\nWeekly spending — last {weeks} weeks\n")
    print(f"{'Week of':<12} {'Total':>11}  {'vs prev':>8}  Trend")
    for week in data["weeks"]:
        bar = "█" * round(week["total"] / peak * bar_width)
        label = week["week_start"] + ("*" if week["is_current"] else " ")
        print(f"{label:<12} {week['total']:>11,.2f}  {format_change(week['change_percent']):>8}  {bar}")
    print("  * current week (in progress)\n")

    print(f"This week so far:   {summary['current_week_total']:,.2f}  (projected {summary['projected_current_week']:,.2f})")
    print(f"Last week:          {summary['previous_week_total']:,.2f}")
    print(f"Average week:       {summary['average_weekly']:,.2f}  (this week {format_change(summary['vs_average_percent']).strip()})")
    print(f"Overall trend:      {summary['trend']} ({summary['trend_per_week']:+,.2f} per week)")

    movers = [c for c in summary["category_changes"] if c["change"]]
    if movers:
        print("\nBiggest changes vs last week:")
        for c in movers[:5]:
            print(f"  {c['category']:<14} {c['change']:>+10,.2f}  ({c['previous']:,.2f} → {c['current']:,.2f})")
    print()


class ExpenseHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _read_json(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")
        try:
            data = json.loads(body or "{}")
        except json.JSONDecodeError:
            return None
        return data if isinstance(data, dict) else None

    def _send_static(self, path):
        filename, content_type = STATIC_FILES[path]
        try:
            with open(os.path.join(FRONTEND_DIR, filename), "rb") as f:
                body = f.read()
        except OSError:
            self._send_json(404, {"error": "Not found"})
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in STATIC_FILES:
            self._send_static(parsed.path)
            return

        if parsed.path == "/api/expenses/weekly":
            try:
                weeks = int(parse_qs(parsed.query).get("weeks", ["8"])[0])
            except ValueError:
                weeks = 8
            self._send_json(200, weekly_summary(max(1, min(weeks, 104))))
            return

        if parsed.path != "/api/expenses":
            self._send_json(404, {"error": "Not found"})
            return

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM expenses ORDER BY date DESC, created_at DESC"
        ).fetchall()
        conn.close()
        self._send_json(200, [row_to_expense(row) for row in rows])

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/expenses":
            self._send_json(404, {"error": "Not found"})
            return

        data = self._read_json()
        if data is None:
            self._send_json(400, {"error": "Invalid JSON"})
            return
        fields, error = parse_expense(data)
        if error:
            self._send_json(400, {"error": error})
            return

        # Clients may supply their own id (used when importing browser-saved expenses).
        expense_id = str(data.get("id") or uuid.uuid4())
        conn = sqlite3.connect(DB_PATH)
        try:
            conn.execute(
                "INSERT INTO expenses (id, description, amount, category, date, merchant, payment_method, notes, recurring)"
                " VALUES (:id, :description, :amount, :category, :date, :merchant, :payment_method, :notes, :recurring)",
                {"id": expense_id, **fields},
            )
            conn.commit()
        except sqlite3.IntegrityError:
            conn.close()
            self._send_json(409, {"error": "Expense already exists", "id": expense_id})
            return
        expense = fetch_expense(conn, expense_id)
        conn.close()
        self._send_json(201, expense)

    def do_PUT(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/expenses/"):
            self._send_json(404, {"error": "Not found"})
            return

        expense_id = parsed.path.split("/")[-1]
        data = self._read_json()
        if data is None:
            self._send_json(400, {"error": "Invalid JSON"})
            return
        fields, error = parse_expense(data)
        if error:
            self._send_json(400, {"error": error})
            return

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.execute(
            "UPDATE expenses SET description = :description, amount = :amount, category = :category, date = :date,"
            " merchant = :merchant, payment_method = :payment_method, notes = :notes, recurring = :recurring"
            " WHERE id = :id",
            {"id": expense_id, **fields},
        )
        conn.commit()
        if cursor.rowcount == 0:
            conn.close()
            self._send_json(404, {"error": "Expense not found"})
            return
        expense = fetch_expense(conn, expense_id)
        conn.close()
        self._send_json(200, expense)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/expenses/"):
            self._send_json(404, {"error": "Not found"})
            return

        expense_id = parsed.path.split("/")[-1]
        conn = sqlite3.connect(DB_PATH)
        conn.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        conn.commit()
        conn.close()
        self._send_json(200, {"success": True, "deletedId": expense_id})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Expense tracker API server")
    parser.add_argument("command", nargs="?", choices=["serve", "weekly"], default="serve")
    parser.add_argument("--weeks", type=int, default=8, help="weeks to include in the weekly report")
    args = parser.parse_args()

    if args.command == "weekly":
        print_weekly_report(max(1, args.weeks))
        raise SystemExit

    server = ThreadingHTTPServer(("0.0.0.0", 3000), ExpenseHandler)
    print("Server running on http://localhost:3000")
    server.serve_forever()
