// Expense storage shared by index.html and dashboard.html.
// On GitHub Pages it reads and writes a JSON file in a private GitHub repo (see config.js);
// when served by backend/server.py it uses the local SQLite API.
(function () {
  const config = window.EXPENSE_CONFIG || {};
  const servedByPython = location.port === "3000";
  const useGitHub = Boolean(config.githubDataRepo) && !servedByPython;
  const API_BASE = location.protocol.startsWith("http") && servedByPython ? "" : "http://localhost:3000";

  function httpError(message, status) {
    const error = new Error(message);
    error.status = status;
    return error;
  }

  // Same rules as parse_expense in backend/server.py.
  function validate(payload) {
    const amount = Number(payload.amount);
    const item = {
      title: String(payload.title || "").trim(),
      amount,
      category: String(payload.category || "").trim(),
      merchant: String(payload.merchant || "").trim(),
      paymentMethod: String(payload.paymentMethod || "").trim(),
      date: String(payload.date || "").trim(),
      notes: String(payload.notes || "").trim(),
      recurring: Boolean(payload.recurring),
    };
    if (!item.title || !(amount > 0) || !item.category || !item.date) throw httpError("Missing required fields", 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) throw httpError("Date must be YYYY-MM-DD", 400);
    return item;
  }

  // ---------- local Python server ----------
  async function rest(path, options = {}) {
    const response = await fetch(`${API_BASE}/api/expenses${path}`, {
      ...options,
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(data.error || `Request failed (${response.status})`, response.status);
    return data;
  }

  const local = {
    mode: "local",
    unreachableMessage: `Can't reach the expense server at ${API_BASE || location.origin}. Start it with: python3 backend/server.py`,
    ready: async () => {},
    list: () => rest(""),
    create: (payload) => rest("", { method: "POST", body: JSON.stringify(payload) }),
    update: (id, payload) => rest(`/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) }),
    remove: (id) => rest(`/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };

  // ---------- GitHub repo file ----------
  const TOKEN_KEY = "expenseos-github-token";
  const repo = config.githubDataRepo;
  const filePath = config.githubDataPath || "expenses.json";
  let token = "";
  try {
    token = localStorage.getItem(TOKEN_KEY) || "";
  } catch {}

  const toBase64 = (text) => {
    let binary = "";
    new TextEncoder().encode(text).forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary);
  };
  const fromBase64 = (text) => new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

  async function github(path, options = {}, authToken = token) {
    const response = await fetch(`https://api.github.com${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${authToken}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(data.message || `GitHub request failed (${response.status})`, response.status);
    return data;
  }

  const contentsUrl = () => `/repos/${repo}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}`;

  async function readFile() {
    try {
      const data = await github(contentsUrl());
      const items = JSON.parse(fromBase64(data.content || "") || "[]");
      return { items: Array.isArray(items) ? items : [], sha: data.sha };
    } catch (error) {
      if (error.status === 404) return { items: [], sha: null };
      throw error;
    }
  }

  // Read, apply the change, write back. If someone else saved in between (409), redo it on the fresh copy.
  async function mutate(change, message) {
    for (let attempt = 0; ; attempt += 1) {
      const { items, sha } = await readFile();
      const result = change(items);
      try {
        await github(contentsUrl(), {
          method: "PUT",
          body: JSON.stringify({ message, content: toBase64(`${JSON.stringify(items, null, 2)}\n`), ...(sha ? { sha } : {}) }),
        });
        return result;
      } catch (error) {
        if (error.status !== 409 || attempt >= 2) throw error;
      }
    }
  }

  const byNewest = (a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""));

  let tokenPending;

  function tokenForm() {
    const overlay = document.createElement("div");
    overlay.className = "auth-overlay";
    overlay.innerHTML = `
      <style>
        .auth-overlay { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 16px; overflow-y: auto;
          background: rgba(0, 0, 0, 0.55); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
        .auth-card { width: 100%; max-width: 380px; background: #fff; color: #1d1d1f; border-radius: 16px; padding: 24px; }
        .auth-card h2 { margin: 0 0 4px; font-size: 1.25rem; }
        .auth-card p { margin: 0 0 14px; color: #6e6e73; font-size: 0.9rem; }
        .auth-card a { color: #0071e3; }
        .auth-card label { display: block; font-size: 0.85rem; color: #6e6e73; margin-bottom: 12px; }
        .auth-card input { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 10px 12px;
          font: inherit; font-size: 16px; border: 1px solid #d2d2d7; border-radius: 10px; background: inherit; color: inherit; }
        .auth-card button { width: 100%; padding: 11px; font: inherit; font-weight: 600; border: 0; border-radius: 10px;
          background: #0071e3; color: #fff; cursor: pointer; }
        .auth-card button:disabled { opacity: 0.6; }
        .auth-error { color: #d70015; font-size: 0.85rem; min-height: 1.2em; margin: 8px 0 0; }
        @media (prefers-color-scheme: dark) {
          .auth-card { background: #1d1d1f; color: #f5f5f7; }
          .auth-card input { border-color: #424245; }
          .auth-card a { color: #2997ff; }
        }
      </style>
      <form class="auth-card">
        <h2>Connect to GitHub</h2>
        <p>Expenses are saved to <strong></strong>. Paste a
          <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained token</a>
          with <em>Contents: Read and write</em> access to that repo. It's kept only on this device.</p>
        <label>GitHub token<input type="password" name="token" autocomplete="off" spellcheck="false" required /></label>
        <button type="submit">Connect</button>
        <div class="auth-error" role="alert"></div>
      </form>`;
    overlay.querySelector("strong").textContent = repo;
    document.body.append(overlay);
    const form = overlay.querySelector("form");
    const errorEl = overlay.querySelector(".auth-error");
    const button = overlay.querySelector("button");
    form.token.focus();

    return new Promise((resolve) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const candidate = form.token.value.trim();
        button.disabled = true;
        errorEl.textContent = "";
        try {
          await github(`/repos/${repo}`, {}, candidate);
        } catch (error) {
          button.disabled = false;
          errorEl.textContent =
            error.status === 401 ? "GitHub didn't accept that token." : error.status === 404 ? `That token can't see ${repo}.` : error.message;
          return;
        }
        token = candidate;
        try {
          localStorage.setItem(TOKEN_KEY, token);
        } catch {}
        overlay.remove();
        resolve();
      });
    });
  }

  function addSignOutButton() {
    if (document.getElementById("signOutButton")) return;
    const button = document.createElement("button");
    button.id = "signOutButton";
    button.type = "button";
    button.textContent = "Disconnect";
    button.title = "Forget the GitHub token on this device";
    button.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:50;padding:6px 12px;border-radius:999px;border:1px solid rgba(128,128,128,0.4);" +
      "background:rgba(128,128,128,0.15);color:inherit;font:13px system-ui,-apple-system,sans-serif;cursor:pointer;backdrop-filter:blur(6px);";
    button.addEventListener("click", () => {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {}
      location.reload();
    });
    document.body.append(button);
  }

  async function ensureToken() {
    if (!token) {
      tokenPending ||= tokenForm().finally(() => (tokenPending = null));
      await tokenPending;
    }
  }

  const remote = {
    mode: "github",
    unreachableMessage: `Couldn't load expenses from ${repo}. Check your connection, or tap Disconnect and enter a new token.`,
    async ready() {
      await ensureToken();
      addSignOutButton();
    },
    async list() {
      try {
        return (await readFile()).items.sort(byNewest);
      } catch (error) {
        // Token revoked or expired: forget it and ask again.
        if (error.status === 401) {
          token = "";
          try {
            localStorage.removeItem(TOKEN_KEY);
          } catch {}
          await ensureToken();
          return (await readFile()).items.sort(byNewest);
        }
        throw error;
      }
    },
    create(payload) {
      const item = { id: String(payload.id || crypto.randomUUID()), ...validate(payload), createdAt: new Date().toISOString() };
      return mutate((items) => {
        if (items.some((existing) => existing.id === item.id)) throw httpError("Expense already exists", 409);
        items.push(item);
        return item;
      }, `Add expense: ${item.title}`);
    },
    update(id, payload) {
      const fields = validate(payload);
      return mutate((items) => {
        const index = items.findIndex((existing) => existing.id === id);
        if (index === -1) throw httpError("Expense not found", 404);
        items[index] = { ...items[index], ...fields, id };
        return items[index];
      }, `Update expense: ${fields.title}`);
    },
    remove(id) {
      return mutate((items) => {
        const index = items.findIndex((existing) => existing.id === id);
        if (index === -1) throw httpError("Expense not found", 404);
        const [removed] = items.splice(index, 1);
        return removed;
      }, "Delete expense");
    },
  };

  window.ExpenseStore = useGitHub ? remote : local;
})();
