import type { Transaction } from '../types'

interface Props {
  transactions: Transaction[]
}

export default function BalanceSummary({ transactions }: Props) {
  const totalIn = transactions.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0)
  const totalOut = transactions.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0)
  const net = totalIn - totalOut

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="grid grid-cols-3 gap-2 px-4 py-3">
      <div className="bg-slate-800 rounded-xl p-3 text-center">
        <p className="text-xs text-slate-400 mb-1">In</p>
        <p className="text-base font-bold text-green-400">+{fmt(totalIn)}</p>
      </div>
      <div className="bg-slate-800 rounded-xl p-3 text-center">
        <p className="text-xs text-slate-400 mb-1">Out</p>
        <p className="text-base font-bold text-red-400">-{fmt(totalOut)}</p>
      </div>
      <div className="bg-slate-800 rounded-xl p-3 text-center">
        <p className="text-xs text-slate-400 mb-1">Net</p>
        <p className={`text-base font-bold ${net >= 0 ? 'text-indigo-400' : 'text-orange-400'}`}>
          {net >= 0 ? '+' : ''}{fmt(net)}
        </p>
      </div>
    </div>
  )
}
