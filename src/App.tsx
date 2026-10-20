import { motion } from 'framer-motion'
import {
  ArrowUpRight,
  BadgeDollarSign,
  BarChart3,
  CreditCard,
  LayoutGrid,
  PiggyBank,
  Receipt,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react'

const stats = [
  { label: 'Total Expenses', value: '$4,280', change: '+8.2%', icon: Receipt },
  { label: 'Monthly Budget', value: '$7,500', change: '78% used', icon: Wallet },
  { label: 'Income', value: '$9,200', change: '+12.4%', icon: BadgeDollarSign },
  { label: 'Savings', value: '$2,920', change: '+6.1%', icon: PiggyBank },
]

const transactions = [
  { title: 'Groceries', category: 'Food', amount: '-$84.20', date: 'Today', merchant: 'Whole Foods' },
  { title: 'Salary Deposit', category: 'Income', amount: '+$3,200', date: 'Today', merchant: 'Acme Co.' },
  { title: 'Train Pass', category: 'Transport', amount: '-$32.00', date: 'Yesterday', merchant: 'Metro' },
]

function App() {
  return (
    <div className="min-h-screen bg-transparent text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 lg:flex-row lg:p-6">
        <aside className="w-full rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur-xl lg:w-72">
          <div className="mb-8 flex items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 p-2.5">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Finora</p>
              <h1 className="text-lg font-semibold tracking-tight">ExpenseOS</h1>
            </div>
          </div>

          <nav className="space-y-2">
            {[
              ['Dashboard', LayoutGrid, true],
              ['Transactions', Receipt, false],
              ['Budgets', Wallet, false],
              ['Analytics', BarChart3, false],
              ['Settings', Settings, false],
            ].map(([label, Icon, active]) => (
              <button
                key={label}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium transition ${
                  active ? 'bg-white/10 text-white shadow-lg shadow-cyan-500/10' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>

          <div className="mt-8 rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 p-4">
            <p className="text-sm font-semibold text-cyan-300">Premium insights</p>
            <p className="mt-2 text-sm text-slate-300">Your spending is trending 14% lower than last month.</p>
          </div>
        </aside>

        <main className="flex-1 space-y-6">
          <header className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-cyan-300">Good evening, Maya</p>
                <h2 className="text-2xl font-semibold tracking-tight">Your finances are looking healthy.</h2>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
                  <Search className="h-4 w-4" />
                  <input className="w-32 bg-transparent outline-none md:w-48" placeholder="Search" />
                </label>
                <button className="rounded-2xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20">
                  + Add Expense
                </button>
              </div>
            </div>
          </header>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {stats.map((item, index) => {
              const Icon = item.icon
              return (
                <motion.article
                  key={item.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06 }}
                  className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/30 backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between">
                    <div className="rounded-2xl bg-white/10 p-2">
                      <Icon className="h-5 w-5 text-cyan-300" />
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                      {item.change}
                    </span>
                  </div>
                  <p className="mt-4 text-sm text-slate-400">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{item.value}</p>
                  <div className="mt-4 h-2 rounded-full bg-white/10">
                    <div className="h-2 w-[70%] rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" />
                  </div>
                </motion.article>
              )
            })}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Recent Transactions</h3>
                  <p className="text-sm text-slate-400">Daily activity across your accounts.</p>
                </div>
                <button className="text-sm font-semibold text-cyan-300">View all</button>
              </div>
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div key={tx.title} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                    <div>
                      <p className="font-medium">{tx.title}</p>
                      <p className="text-sm text-slate-400">{tx.merchant} • {tx.date}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${tx.amount.startsWith('+') ? 'text-emerald-300' : 'text-slate-100'}`}>
                        {tx.amount}
                      </p>
                      <p className="text-sm text-slate-400">{tx.category}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Budget Health</h3>
                  <p className="text-sm text-slate-400">Stay on track this month.</p>
                </div>
                <TrendingUp className="h-5 w-5 text-cyan-300" />
              </div>
              <div className="space-y-4">
                {[
                  ['Housing', 72],
                  ['Food', 58],
                  ['Travel', 34],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-300">{label}</span>
                      <span className="font-medium text-slate-100">{value}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10">
                      <div className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                You’re within your monthly target and have $1,120 remaining.
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
