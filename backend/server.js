const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'expenses.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection failed:', err.message);
  } else {
    console.log('Connected to SQLite database');
  }
});

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });
}

initDb();

app.get('/api/expenses', (req, res) => {
  db.all('SELECT * FROM expenses ORDER BY date DESC, created_at DESC', [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post('/api/expenses', (req, res) => {
  const { id, description, amount, category, date } = req.body;

  if (!description || !amount || !category || !date) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const expenseId = id || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  db.run(
    'INSERT INTO expenses (id, description, amount, category, date) VALUES (?, ?, ?, ?, ?)',
    [expenseId, description, Number(amount), category, date],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.status(201).json({ id: expenseId, description, amount: Number(amount), category, date });
    }
  );
});

app.put('/api/expenses/:id', (req, res) => {
  const { description, amount, category, date } = req.body;

  if (!description || !amount || !category || !date) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  db.run(
    'UPDATE expenses SET description = ?, amount = ?, category = ?, date = ? WHERE id = ?',
    [description, Number(amount), category, date, req.params.id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id: req.params.id, description, amount: Number(amount), category, date });
    }
  );
});

app.delete('/api/expenses/:id', (req, res) => {
  db.run('DELETE FROM expenses WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ success: true, deletedId: req.params.id });
  });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
