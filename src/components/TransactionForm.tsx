import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import type { Transaction } from '../types'

interface Props {
  initial?: Partial<Transaction> | null
  isDuplicate?: boolean
  onSave: (data: Omit<Transaction, 'id' | 'uid' | 'spaceId' | 'createdAt' | 'updatedAt'>) => Promise<void>
  onClose: () => void
}

const today = () => new Date().toISOString().slice(0, 10)

export default function TransactionForm({ initial, isDuplicate, onSave, onClose }: Props) {
  const [type, setType] = useState<'in' | 'out'>(initial?.type ?? 'in')
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'USD')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [date, setDate] = useState(initial?.date ?? today())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initial) {
      setType(initial.type ?? 'in')
      setAmount(initial.amount?.toString() ?? '')
      setCurrency(initial.currency ?? 'USD')
      setDescription(initial.description ?? '')
      setDate(isDuplicate ? today() : (initial.date ?? today()))
    }
  }, [initial, isDuplicate])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0) return setError('Enter a valid positive amount')
    if (!currency.trim()) return setError('Currency is required')
    setError('')
    setLoading(true)
    try {
      await onSave({ type, amount: parsed, currency: currency.trim().toUpperCase(), description: description.trim(), date })
      onClose()
    } catch {
      setError('Failed to save transaction')
    } finally {
      setLoading(false)
    }
  }

  const title = isDuplicate ? 'Duplicate Transaction' : initial?.id ? 'Edit Transaction' : 'Add Transaction'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-0 sm:px-6">
      <div className="bg-slate-900 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-2xl leading-none">×</button>
        </div>

        {error && <p className="text-sm text-red-400 bg-red-950 rounded-lg px-3 py-2">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* In / Out toggle */}
          <div className="flex rounded-xl overflow-hidden border border-slate-700">
            <button type="button" onClick={() => setType('in')}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${type === 'in' ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              In
            </button>
            <button type="button" onClick={() => setType('out')}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${type === 'out' ? 'bg-red-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              Out
            </button>
          </div>

          {/* Amount + Currency */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-slate-400 mb-1">Amount</label>
              <input type="number" step="0.01" min="0.01" required value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full bg-slate-800 rounded-xl px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
                inputMode="decimal" />
            </div>
            <div className="w-24">
              <label className="block text-xs text-slate-400 mb-1">Currency</label>
              <input type="text" required value={currency} onChange={e => setCurrency(e.target.value)} maxLength={8}
                className="w-full bg-slate-800 rounded-xl px-3 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 uppercase" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} maxLength={200}
              className="w-full bg-slate-800 rounded-xl px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Date</label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)}
              className="w-full bg-slate-800 rounded-xl px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors">
            {loading ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  )
}
