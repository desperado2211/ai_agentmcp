const storageKey = "expenseos-expenses";
const monthlyBudget = 6000;
const categoryLimit = 200;

const form = document.getElementById("expenseForm");
const titleInput = document.getElementById("title");
const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const merchantInput = document.getElementById("merchant");
const paymentMethodInput = document.getElementById("paymentMethod");
const dateInput = document.getElementById("date");
const notesInput = document.getElementById("notes");
const recurringInput = document.getElementById("recurring");
const expenseIdInput = document.getElementById("expenseId");
const submitButton = document.getElementById("submitButton");
const formTitle = document.getElementById("formTitle");
const resetButton = document.getElementById("resetButton");
const exportButton = document.getElementById("exportButton");
const transactionList = document.getElementById("transactionList");
const trendList = document.getElementById("trendList");
const monthlyHistoryList = document.getElementById("monthlyHistoryList");
const weeklyTrendList = document.getElementById("weeklyTrendList");
const weeklySummary = document.getElementById("weeklySummary");
const weeklyTrendBadge = document.getElementById("weeklyTrendBadge");
const weeklyStartDate = new Date(2026, 9, 1); // Oct 1, 2026
const totalSpent = document.getElementById("totalSpent");
const incomeValue = document.getElementById("incomeValue");
const savingsValue = document.getElementById("savingsValue");
const todaySpent = document.getElementById("todaySpent");
const heroBadge = document.getElementById("heroBadge");
const budgetStatus = document.getElementById("budgetStatus");
const budgetBar = document.getElementById("budgetBar");
const budgetWarning = document.getElementById("budgetWarning");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const themeToggle = document.getElementById("themeToggle");
const navButtons = document.querySelectorAll(".nav-link");

let expenses = [];
let editingId = null;
let uiState = { search: "", category: "all", theme: "dark" };

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function showSyncError(message) {
  transactionList.innerHTML = `<div class="empty-state">${message}</div>`;
}

// One-time import of expenses saved in this browser before the DB was used.
async function migrateLocalExpenses() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    return;
  }
  if (!Array.isArray(saved) || !saved.length) return;

  for (const item of saved) {
    try {
      await ExpenseStore.create(item);
    } catch (error) {
      // 409 = already imported, 400 = invalid entry (still kept in the backup below).
      if (error.status !== 409 && error.status !== 400) throw error;
    }
  }
  // Keep a backup rather than deleting the browser copy outright.
  localStorage.setItem(`${storageKey}-backup`, JSON.stringify(saved));
  localStorage.removeItem(storageKey);
}

async function loadExpenses() {
  try {
    await ExpenseStore.ready();
    await migrateLocalExpenses();
    expenses = await ExpenseStore.list();
  } catch (error) {
    expenses = [];
    render();
    showSyncError(ExpenseStore.unreachableMessage);
    return;
  }
  render();
}

function getMonthlyExpenses() {
  const now = new Date();
  return expenses.filter((item) => {
    const itemDate = new Date(item.date);
    return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
  });
}

function getTodayExpenses() {
  const today = new Date().toISOString().slice(0, 10);
  return expenses.filter((item) => item.date === today);
}

function getMonthTotal(date) {
  return expenses
    .filter((item) => {
      const itemDate = new Date(item.date);
      return itemDate.getMonth() === date.getMonth() && itemDate.getFullYear() === date.getFullYear();
    })
    .reduce((sum, item) => sum + Number(item.amount), 0);
}

function getFilteredExpenses() {
  const query = uiState.search.trim().toLowerCase();
  return expenses.filter((item) => {
    const matchesSearch = !query || `${item.title} ${item.merchant} ${item.notes} ${item.category}`.toLowerCase().includes(query);
    const matchesCategory = uiState.category === "all" || item.category === uiState.category;
    return matchesSearch && matchesCategory;
  });
}

function resetForm() {
  form.reset();
  expenseIdInput.value = "";
  editingId = null;
  submitButton.textContent = "Save expense";
  formTitle.textContent = "Add a new expense";
  dateInput.value = new Date().toISOString().slice(0, 10);
}

function setTheme(theme) {
  uiState.theme = theme;
  document.body.classList.toggle("theme-light", theme === "light");
  themeToggle.textContent = theme === "light" ? "☾" : "☀";
  localStorage.setItem("expenseos-theme", theme);
}

function renderSummary() {
  const monthlyExpenses = getMonthlyExpenses();
  const todayExpenses = getTodayExpenses();
  const total = monthlyExpenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const income = 7200;
  const savings = income - total;
  const todayTotal = todayExpenses.reduce((sum, item) => sum + Number(item.amount), 0);

  const now = new Date();
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthTotal = getMonthTotal(previousMonthDate);
  let changePercent = 0;
  if (previousMonthTotal > 0) {
    changePercent = ((total - previousMonthTotal) / previousMonthTotal) * 100;
  } else if (total > 0) {
    changePercent = 100;
  }
  const sign = changePercent >= 0 ? "+" : "";
  heroBadge.textContent = `${sign}${changePercent.toFixed(1)}% this month`;

  totalSpent.textContent = formatCurrency(total);
  incomeValue.textContent = formatCurrency(income);
  savingsValue.textContent = formatCurrency(Math.max(savings, 0));
  todaySpent.textContent = formatCurrency(todayTotal);

  const usage = Math.min(100, (total / monthlyBudget) * 100);
  budgetStatus.textContent = `${formatCurrency(total)} of ${formatCurrency(monthlyBudget)}`;
  budgetBar.style.width = `${usage}%`;
  budgetBar.classList.toggle("over-limit", total > monthlyBudget);
  budgetWarning.textContent = total > monthlyBudget ? "Budget exceeded" : `You have ${formatCurrency(Math.max(monthlyBudget - total, 0))} remaining`;
  budgetWarning.classList.toggle("over-limit", total > monthlyBudget);
}

function renderTransactions() {
  const filtered = getFilteredExpenses().sort((a, b) => new Date(b.date) - new Date(a.date));
  if (!filtered.length) {
    transactionList.innerHTML = '<div class="empty-state">No transactions match your filters yet.</div>';
    return;
  }

  transactionList.innerHTML = filtered
    .map((item) => {
      const isIncome = item.category === "Salary";
      const amountClass = isIncome ? "positive" : "negative";
      const prefix = isIncome ? "+" : "-";
      return `
        <article class="transaction-item" data-category="${item.category}">
          <div class="transaction-meta">
            <span class="transaction-title">${item.title}</span>
            <span class="transaction-sub">${item.merchant || "No merchant"} • ${formatDate(item.date)} <span class="category-chip">${item.category}</span></span>
          </div>
          <div class="transaction-meta">
            <span class="amount-pill ${amountClass}">${prefix}${formatCurrency(Number(item.amount))}</span>
            <span class="transaction-sub">${item.recurring ? "Recurring" : "One-time"}</span>
          </div>
          <div class="transaction-meta">
            <button class="ghost-btn edit-btn" data-id="${item.id}" type="button">Edit</button>
            <button class="ghost-btn delete-btn" data-id="${item.id}" type="button">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTrends() {
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const getMonthTotals = (date) => {
    const monthExpenses = expenses.filter((item) => {
      const itemDate = new Date(item.date);
      return itemDate.getMonth() === date.getMonth() && itemDate.getFullYear() === date.getFullYear();
    });

    return monthExpenses.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + Number(item.amount);
      return acc;
    }, {});
  };

  const currentTotals = getMonthTotals(currentMonth);
  const previousTotals = getMonthTotals(previousMonth);

  const categories = Array.from(new Set([...Object.keys(currentTotals), ...Object.keys(previousTotals)]));
  const entries = categories
    .map((category) => {
      const currentAmount = currentTotals[category] || 0;
      const previousAmount = previousTotals[category] || 0;
      let changePercent = 0;

      if (previousAmount > 0) {
        changePercent = ((currentAmount - previousAmount) / previousAmount) * 100;
      } else if (currentAmount > 0) {
        changePercent = 100;
      }

      return { category, currentAmount, previousAmount, changePercent };
    })
    .filter((item) => item.currentAmount > 0)
    .sort((a, b) => {
      if (b.changePercent !== a.changePercent) return b.changePercent - a.changePercent;
      return b.currentAmount - a.currentAmount;
    });

  if (!entries.length) {
    trendList.innerHTML = '<div class="empty-state">Add a few expenses to see where you are spending more.</div>';
    return;
  }

  trendList.innerHTML = entries
    .slice(0, 6)
    .map(({ category, currentAmount, previousAmount, changePercent }) => {
      const changeText = changePercent > 0 ? `↑ ${changePercent.toFixed(1)}% vs last month` : changePercent < 0 ? `↓ ${Math.abs(changePercent).toFixed(1)}% vs last month` : `No change vs last month`;
      const changeClass = changePercent > 0 ? "up" : changePercent < 0 ? "down" : "";
      return `
        <div class="trend-item" data-category="${category}">
          <div>
            <div class="trend-label">${category}</div>
            <div class="trend-amount">${formatCurrency(currentAmount)}</div>
          </div>
          <div class="trend-amount trend-change ${changeClass}">${changeText}</div>
        </div>
      `;
    })
    .join("");
}

function renderMonthlyHistory() {
  const now = new Date();
  const monthsToShow = 6;

  const entries = Array.from({ length: monthsToShow }, (_, i) => {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - i - 1, 1);
    const total = getMonthTotal(monthDate);
    const previousTotal = getMonthTotal(previousMonthDate);

    let changePercent = 0;
    if (previousTotal > 0) {
      changePercent = ((total - previousTotal) / previousTotal) * 100;
    } else if (total > 0) {
      changePercent = 100;
    }

    return {
      label: monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      total,
      changePercent,
    };
  }).filter((entry) => entry.total > 0);

  if (!entries.length) {
    monthlyHistoryList.innerHTML = '<div class="empty-state">Add expenses to see your monthly spend history.</div>';
    return;
  }

  monthlyHistoryList.innerHTML = entries
    .map(({ label, total, changePercent }) => {
      const changeText = changePercent > 0 ? `↑ ${changePercent.toFixed(1)}% vs previous month` : changePercent < 0 ? `↓ ${Math.abs(changePercent).toFixed(1)}% vs previous month` : `No change vs previous month`;
      const changeClass = changePercent > 0 ? "up" : changePercent < 0 ? "down" : "";
      return `
        <div class="trend-item">
          <div>
            <div class="trend-label">${label}</div>
            <div class="trend-amount">${formatCurrency(total)}</div>
          </div>
          <div class="trend-amount trend-change ${changeClass}">${changeText}</div>
        </div>
      `;
    })
    .join("");
}

// Parse "YYYY-MM-DD" as a local date (new Date("YYYY-MM-DD") is UTC and can shift a day).
function parseLocalDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getWeekStart(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
  return start;
}

function getPercentChange(current, previous) {
  if (previous > 0) return ((current - previous) / previous) * 100;
  return null;
}

function formatChange(changePercent, label) {
  if (changePercent === null) return `New vs ${label}`;
  if (changePercent > 0) return `↑ ${changePercent.toFixed(1)}% vs ${label}`;
  if (changePercent < 0) return `↓ ${Math.abs(changePercent).toFixed(1)}% vs ${label}`;
  return `No change vs ${label}`;
}

function getWeeklyTotals(startDate) {
  const currentStart = getWeekStart(new Date());
  const firstStart = getWeekStart(startDate);
  const weekCount = Math.round((currentStart - firstStart) / (7 * 86400000)) + 1;

  const weeks = Array.from({ length: Math.max(weekCount, 0) }, (_, i) => {
    const start = new Date(firstStart);
    start.setDate(start.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    // The first week may begin mid-week (e.g. Oct 1 is a Thursday).
    return { start: i === 0 ? new Date(startDate) : start, end, total: 0, categories: {} };
  });

  expenses.forEach((item) => {
    if (item.category === "Salary") return;
    const date = parseLocalDate(item.date);
    if (date < startDate) return;
    const index = Math.round((getWeekStart(date) - firstStart) / (7 * 86400000));
    if (index < 0 || index >= weeks.length) return;
    weeks[index].total += Number(item.amount);
    weeks[index].categories[item.category] = (weeks[index].categories[item.category] || 0) + Number(item.amount);
  });

  return weeks.map((week, i) => ({
    ...week,
    changePercent: i ? getPercentChange(week.total, weeks[i - 1].total) : null,
    isCurrent: i === weeks.length - 1,
    isPartial: week.start.getDay() !== 1,
  }));
}

function renderWeeklyTrends() {
  const weeks = getWeeklyTotals(weeklyStartDate);
  if (!weeks.some((week) => week.total > 0)) {
    weeklySummary.innerHTML = "";
    weeklyTrendBadge.textContent = "";
    weeklyTrendList.innerHTML = `<div class="empty-state">No expenses since ${formatDate(weeklyStartDate)} yet.</div>`;
    return;
  }

  const current = weeks[weeks.length - 1];
  const previous = weeks[weeks.length - 2] || { total: 0, categories: {} };
  // Average and trend use full, finished weeks only, so a partial first week doesn't skew them.
  const completed = weeks.filter((week) => !week.isCurrent && !week.isPartial).map((week) => week.total);
  const average = completed.length ? completed.reduce((sum, value) => sum + value, 0) / completed.length : 0;

  // Least-squares slope over completed weeks.
  const meanX = (completed.length - 1) / 2;
  const denominator = completed.reduce((sum, _, x) => sum + (x - meanX) ** 2, 0);
  const slope = denominator ? completed.reduce((sum, y, x) => sum + (x - meanX) * (y - average), 0) / denominator : 0;
  const direction = average && slope > average * 0.05 ? "rising" : average && slope < -average * 0.05 ? "falling" : "flat";
  const directionText = { rising: "↑ Trending up", falling: "↓ Trending down", flat: "→ Holding steady" }[direction];
  weeklyTrendBadge.textContent = `${directionText} (${slope >= 0 ? "+" : "-"}${formatCurrency(Math.abs(slope))}/week)`;

  const daysElapsed = Math.floor((new Date() - getWeekStart(new Date())) / 86400000) + 1;
  const topMover = Object.keys({ ...current.categories, ...previous.categories })
    .map((category) => ({ category, change: (current.categories[category] || 0) - (previous.categories[category] || 0) }))
    .sort((a, b) => b.change - a.change)[0];

  const tiles = [
    ["This week", formatCurrency(current.total), formatChange(current.changePercent, "last week")],
    ["Projected", formatCurrency((current.total / daysElapsed) * 7), `Based on ${daysElapsed} day${daysElapsed === 1 ? "" : "s"}`],
    ["Weekly average", formatCurrency(average), completed.length ? formatChange(getPercentChange(current.total, average), "average") : "Needs a full week"],
    topMover && topMover.change > 0
      ? ["Biggest increase", topMover.category, `+${formatCurrency(topMover.change)} vs last week`]
      : ["Biggest increase", "None", "No category is up this week"],
  ];
  weeklySummary.innerHTML = tiles
    .map(([label, value, meta]) => `
        <div>
          <div class="trend-amount">${label}</div>
          <div class="trend-label">${value}</div>
          <div class="trend-amount">${meta}</div>
        </div>
      `)
    .join("");

  const peak = Math.max(...weeks.map((week) => week.total)) || 1;
  weeklyTrendList.innerHTML = weeks
    .slice()
    .reverse()
    .map((week) => {
      const changeClass = week.changePercent > 0 ? "up" : week.changePercent < 0 ? "down" : "";
      const label = `${formatDate(week.start)} – ${formatDate(week.end)}${week.isCurrent ? " (this week)" : ""}`;
      return `
        <div class="trend-item week-row${week.isCurrent ? " current" : ""}">
          <div>
            <div class="trend-label">${label}</div>
            <div class="trend-amount">${formatCurrency(week.total)}</div>
          </div>
          <div class="week-bar"><div class="week-bar-fill" style="width: ${(week.total / peak) * 100}%"></div></div>
          <div class="trend-amount trend-change ${changeClass}">${week === weeks[0] ? "Starting week" : formatChange(week.changePercent, "prev week")}</div>
        </div>
      `;
    })
    .join("");
}

function render() {
  renderSummary();
  renderTransactions();
  renderTrends();
  renderMonthlyHistory();
  renderWeeklyTrends();
}

async function addOrUpdateExpense(payload) {
  if (editingId) {
    const updated = await ExpenseStore.update(editingId, payload);
    expenses = expenses.map((item) => (item.id === updated.id ? updated : item));
  } else {
    const created = await ExpenseStore.create(payload);
    expenses.unshift(created);
  }
  render();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    title: titleInput.value.trim(),
    amount: Number(amountInput.value),
    category: categoryInput.value,
    merchant: merchantInput.value.trim(),
    paymentMethod: paymentMethodInput.value.trim(),
    date: dateInput.value,
    notes: notesInput.value.trim(),
    recurring: recurringInput.checked,
  };

  if (!payload.title || !payload.amount || !payload.category || !payload.date) return;
  submitButton.disabled = true;
  try {
    await addOrUpdateExpense(payload);
    resetForm();
  } catch (error) {
    alert(`Couldn't save expense: ${error.message}`);
  } finally {
    submitButton.disabled = false;
  }
});

resetButton.addEventListener("click", resetForm);
exportButton.addEventListener("click", () => {
  if (!expenses.length) return;
  const rows = [
    ["Title", "Amount", "Category", "Merchant", "Payment Method", "Date", "Notes", "Recurring"],
    ...expenses.map((item) => [item.title, item.amount, item.category, item.merchant, item.paymentMethod, item.date, item.notes, item.recurring ? "Yes" : "No"]),
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `expenseos-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

searchInput.addEventListener("input", (event) => {
  uiState.search = event.target.value;
  renderTransactions();
});

categoryFilter.addEventListener("change", (event) => {
  uiState.category = event.target.value;
  renderTransactions();
});

themeToggle.addEventListener("click", () => {
  setTheme(uiState.theme === "dark" ? "light" : "dark");
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    navButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");

    const targetId = button.dataset.target;
    if (!targetId) return;

    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

document.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const editButton = target.closest(".edit-btn");
  const deleteButton = target.closest(".delete-btn");

  if (editButton) {
    const item = expenses.find((entry) => entry.id === editButton.dataset.id);
    if (!item) return;
    editingId = item.id;
    expenseIdInput.value = item.id;
    titleInput.value = item.title;
    amountInput.value = item.amount;
    categoryInput.value = item.category;
    merchantInput.value = item.merchant || "";
    paymentMethodInput.value = item.paymentMethod || "";
    dateInput.value = item.date;
    notesInput.value = item.notes || "";
    recurringInput.checked = Boolean(item.recurring);
    submitButton.textContent = "Update expense";
    formTitle.textContent = "Edit expense";
    titleInput.focus();
    return;
  }

  if (deleteButton) {
    const id = deleteButton.dataset.id;
    try {
      await ExpenseStore.remove(id);
    } catch (error) {
      alert(`Couldn't delete expense: ${error.message}`);
      return;
    }
    expenses = expenses.filter((item) => item.id !== id);
    render();
  }
});

const savedTheme = localStorage.getItem("expenseos-theme") || "dark";
setTheme(savedTheme);
resetForm();
dateInput.value = new Date().toISOString().slice(0, 10);
render();
loadExpenses();
