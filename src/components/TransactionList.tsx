import { useState } from 'react'
import type { Transaction } from '../types'

interface Props {
  transactions: Transaction[]
  onEdit: (tx: Transaction) => void
  onDuplicate: (tx: Transaction) => void
  onDelete: (id: string) => void
}

export default function TransactionList({ transactions, onEdit, onDuplicate, onDelete }: Props) {
  const [search, setSearch] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const filtered = transactions.filter(t => {
    const q = search.toLowerCase()
    return (
      t.description.toLowerCase().includes(q) ||
      t.currency.toLowerCase().includes(q) ||
      String(t.amount).includes(q)
    )
  })

  // Group by month
  const groups: Record<string, Transaction[]> = {}
  for (const tx of filtered) {
    const key = tx.date.slice(0, 7) // YYYY-MM
    if (!groups[key]) groups[key] = []
    groups[key].push(tx)
  }
  const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a))

  const monthLabel = (key: string) => {
    const [y, m] = key.split('-')
    return new Date(Number(y), Number(m) - 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })
  }

  const handleDelete = (id: string) => {
    setConfirmId(id)
    setOpenMenuId(null)
  }

  const confirmDelete = () => {
    if (confirmId) onDelete(confirmId)
    setConfirmId(null)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Search */}
      <div className="px-4 pb-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search transactions…"
          className="w-full bg-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
        />
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-slate-500 text-sm mt-8">No transactions yet</p>
      )}

      {sortedKeys.map(key => (
        <div key={key}>
          <p className="px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-slate-950">
            {monthLabel(key)}
          </p>
          <ul className="px-4 space-y-2 pb-2">
            {groups[key].map(tx => (
              <li key={tx.id} className="bg-slate-800 rounded-xl p-3 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tx.type === 'in' ? 'bg-green-400' : 'bg-red-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-100 truncate">{tx.description || '(no description)'}</p>
                  <p className="text-xs text-slate-400">{tx.date}</p>
                </div>
                <p className={`text-sm font-bold flex-shrink-0 ${tx.type === 'in' ? 'text-green-400' : 'text-red-400'}`}>
                  {tx.type === 'in' ? '+' : '-'}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.currency}
                </p>
                {/* Context menu */}
                <div className="relative flex-shrink-0">
                  <button
                    onClick={() => setOpenMenuId(openMenuId === tx.id ? null : tx.id)}
                    className="text-slate-400 hover:text-slate-100 px-1 py-0.5 text-lg leading-none"
                  >⋯</button>
                  {openMenuId === tx.id && (
                    <div className="absolute right-0 top-6 z-10 bg-slate-700 rounded-xl shadow-xl overflow-hidden w-36">
                      <button onClick={() => { onEdit(tx); setOpenMenuId(null) }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-600 text-slate-100">Edit</button>
                      <button onClick={() => { onDuplicate(tx); setOpenMenuId(null) }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-600 text-slate-100">Duplicate</button>
                      <button onClick={() => handleDelete(tx.id)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-600 text-red-400">Delete</button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Delete confirmation modal */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-xs space-y-4">
            <p className="text-slate-100 font-semibold">Delete this transaction?</p>
            <p className="text-sm text-slate-400">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmId(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-xl py-2.5 text-sm font-medium">Cancel</button>
              <button onClick={confirmDelete}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-xl py-2.5 text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Dismiss menu on outside click */}
      {openMenuId && (
        <div className="fixed inset-0 z-0" onClick={() => setOpenMenuId(null)} />
      )}
    </div>
  )
}
