import { useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useSpaces } from '../hooks/useSpaces'
import { useTransactions } from '../hooks/useTransactions'
import { useJoinRequests } from '../hooks/useJoinRequests'
import BalanceSummary from '../components/BalanceSummary'
import TransactionList from '../components/TransactionList'
import TransactionForm from '../components/TransactionForm'
import type { Space, SpaceRole, Transaction } from '../types'

type FormMode = { mode: 'add' } | { mode: 'edit'; tx: Transaction } | { mode: 'duplicate'; tx: Transaction } | null

function exportCSV(transactions: Transaction[], spaceName: string) {
  const header = 'Date,Type,Amount,Currency,Description'
  const rows = transactions.map(t =>
    [t.date, t.type, t.amount, t.currency, `"${t.description.replace(/"/g, '""')}"`].join(',')
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${spaceName}-transactions.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function roleLabel(role: SpaceRole) {
  if (role === 'owner') return 'Owner'
  if (role === 'editor') return 'Editor'
  return 'Viewer'
}

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const {
    spaces,
    loading: spacesLoading,
    addSpace,
    renameSpace,
    archiveSpace,
    deleteSpace,
    reorderSpace,
    rotateShareCode,
    updateMemberRole,
    removeMember,
  } = useSpaces()
  const activeSpaces = spaces.filter(s => !s.archived)
  const archivedSpaces = spaces.filter(s => s.archived)

  const [activeId, setActiveId] = useState<string | null>(null)
  const activeSpace = activeSpaces.find(s => s.id === (activeId ?? activeSpaces[0]?.id)) ?? activeSpaces[0] ?? null
  const currentSpaceId = activeSpace?.id ?? null
  const canWriteTransactions = Boolean(activeSpace && activeSpace.currentUserRole !== 'viewer')
  const canManageSpace = activeSpace?.currentUserRole === 'owner'

  const { transactions, addTransaction, updateTransaction, deleteTransaction } = useTransactions(currentSpaceId)
  const { pendingRequests, requestJoinByCode, approveRequest, rejectRequest } = useJoinRequests(currentSpaceId, canManageSpace)

  const [formMode, setFormMode] = useState<FormMode>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [spaceMenu, setSpaceMenu] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [showNewSpace, setShowNewSpace] = useState(false)
  const [confirmDeleteSpace, setConfirmDeleteSpace] = useState<Space | null>(null)

  const [showShareModal, setShowShareModal] = useState(false)
  const [shareInfo, setShareInfo] = useState('')
  const [showMembersModal, setShowMembersModal] = useState(false)

  const [showJoinModal, setShowJoinModal] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinState, setJoinState] = useState<{ error?: string; success?: string; loading: boolean }>({ loading: false })

  const members = useMemo(() => {
    if (!activeSpace?.members) return []
    return Object.entries(activeSpace.members)
      .sort((a, b) => {
        if (a[1].role === 'owner') return -1
        if (b[1].role === 'owner') return 1
        return a[0].localeCompare(b[0])
      })
  }, [activeSpace])

  const handleSave = async (data: Omit<Transaction, 'id' | 'uid' | 'spaceId' | 'createdAt' | 'updatedAt'>) => {
    if (formMode?.mode === 'edit') {
      await updateTransaction(formMode.tx.id, data, canWriteTransactions)
    } else {
      await addTransaction(data, canWriteTransactions)
    }
  }

  const handleAddSpace = async () => {
    const name = newSpaceName.trim()
    if (!name) return
    await addSpace(name)
    setNewSpaceName('')
    setShowNewSpace(false)
  }

  const handleRequestJoin = async () => {
    setJoinState({ loading: true })
    try {
      const result = await requestJoinByCode(joinCode)
      setJoinState({ loading: false, success: `Join request sent for ${result.spaceName}. Waiting for owner approval.` })
      setJoinCode('')
    } catch (error) {
      setJoinState({ loading: false, error: error instanceof Error ? error.message : 'Failed to send join request' })
    }
  }

  return (
    <div className="flex flex-col h-dvh bg-slate-950 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <h1 className="text-lg font-bold text-indigo-400">Tracker</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setJoinState({ loading: false }); setShowJoinModal(true) }}
            className="text-xs text-indigo-300 hover:text-indigo-100 bg-indigo-900/40 px-3 py-1.5 rounded-lg"
          >
            Join
          </button>
          <span className="text-xs text-slate-500 truncate max-w-[120px]">{user?.email}</span>
          <button onClick={() => logout()}
            className="text-xs text-slate-400 hover:text-slate-100 bg-slate-800 px-3 py-1.5 rounded-lg">
            Sign out
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex-shrink-0 border-b border-slate-800">
        <div className="flex overflow-x-auto scrollbar-hide px-4 gap-1 pb-0">
          {spacesLoading ? (
            <div className="py-3 text-sm text-slate-500">Loading...</div>
          ) : (
            <>
              {activeSpaces.map(space => (
                <div key={space.id} className="relative flex-shrink-0 group">
                  <button
                    onClick={() => { setActiveId(space.id); setSpaceMenu(null) }}
                    className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                      activeSpace?.id === space.id
                        ? 'border-indigo-500 text-indigo-400'
                        : 'border-transparent text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {space.name}
                    {space.currentUserRole !== 'owner' && <span className="ml-1 text-[10px] text-slate-500">shared</span>}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setSpaceMenu(spaceMenu === space.id ? null : space.id) }}
                    className="absolute right-0 top-2 text-slate-500 hover:text-slate-100 text-xs opacity-0 group-hover:opacity-100 transition-opacity px-0.5"
                  >▾</button>
                  {spaceMenu === space.id && (
                    <div className="absolute left-0 top-full z-20 bg-slate-800 rounded-xl shadow-xl overflow-hidden w-48 mt-1">
                      {space.currentUserRole === 'owner' && (
                        <button onClick={() => { setRenaming({ id: space.id, name: space.name }); setSpaceMenu(null) }}
                          className="w-full text-left px-4 py-2.5 text-sm text-slate-100 hover:bg-slate-700">Rename</button>
                      )}
                      <button onClick={() => { reorderSpace(space.id, 'up'); setSpaceMenu(null) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-100 hover:bg-slate-700">Move left</button>
                      <button onClick={() => { reorderSpace(space.id, 'down'); setSpaceMenu(null) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-100 hover:bg-slate-700">Move right</button>
                      {space.currentUserRole === 'owner' && (
                        <>
                          <button onClick={() => { setShowShareModal(true); setShareInfo(''); setSpaceMenu(null) }}
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-100 hover:bg-slate-700">Share code</button>
                          <button onClick={() => { setShowMembersModal(true); setSpaceMenu(null) }}
                            className="w-full text-left px-4 py-2.5 text-sm text-slate-100 hover:bg-slate-700">Manage members</button>
                        </>
                      )}
                      <button onClick={() => { archiveSpace(space.id, true); setSpaceMenu(null) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-700">Archive</button>
                      <button onClick={() => { setConfirmDeleteSpace(space); setSpaceMenu(null) }}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-slate-700">
                        {space.currentUserRole === 'owner' ? 'Delete space' : 'Leave space'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <button
                onClick={() => setShowNewSpace(true)}
                className="flex-shrink-0 px-3 py-3 text-slate-500 hover:text-indigo-400 text-sm transition-colors"
              >+ New</button>
            </>
          )}
        </div>
      </div>

      {/* Balance summary */}
      {activeSpace && <BalanceSummary transactions={transactions} />}

      {!spacesLoading && activeSpaces.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
          <p className="text-slate-400">No spaces yet. Create one or join with a share code.</p>
          <div className="flex gap-3">
            <button onClick={() => setShowJoinModal(true)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold rounded-xl px-6 py-3 transition-colors">
              Join Space
            </button>
            <button onClick={() => setShowNewSpace(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl px-6 py-3 transition-colors">
              Create Space
            </button>
          </div>
        </div>
      )}

      {activeSpace && (
        <TransactionList
          transactions={transactions}
          onEdit={tx => setFormMode({ mode: 'edit', tx })}
          onDuplicate={tx => setFormMode({ mode: 'duplicate', tx })}
          onDelete={id => deleteTransaction(id, canWriteTransactions)}
          canWrite={canWriteTransactions}
        />
      )}

      {activeSpace && (
        <div className="flex-shrink-0 px-4 py-3 border-t border-slate-800 flex items-center gap-2">
          <button
            onClick={() => setFormMode({ mode: 'add' })}
            disabled={!canWriteTransactions}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-400 text-white font-semibold rounded-xl py-3 transition-colors text-sm"
          >
            {canWriteTransactions ? '+ Add Transaction' : 'Read-only (viewer)'}
          </button>
          <button
            onClick={() => exportCSV(transactions, activeSpace.name)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl px-4 py-3 text-sm transition-colors"
            title="Export CSV"
          >
            CSV
          </button>
        </div>
      )}

      {archivedSpaces.length > 0 && (
        <div className="flex-shrink-0 px-4 pb-3">
          <button
            onClick={() => setShowArchived(v => !v)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showArchived ? 'Hide archived' : `Show ${archivedSpaces.length} archived space${archivedSpaces.length > 1 ? 's' : ''}`}
          </button>
          {showArchived && (
            <div className="mt-2 space-y-1">
              {archivedSpaces.map(s => (
                <div key={s.id} className="flex items-center gap-2 bg-slate-900 rounded-xl px-4 py-2">
                  <span className="text-sm text-slate-400 flex-1">{s.name}</span>
                  <button onClick={() => archiveSpace(s.id, false)}
                    className="text-xs text-indigo-400 hover:underline">Unarchive</button>
                  <button onClick={() => setConfirmDeleteSpace(s)}
                    className="text-xs text-red-400 hover:underline">{s.currentUserRole === 'owner' ? 'Delete' : 'Leave'}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {formMode && (
        <TransactionForm
          initial={formMode.mode !== 'add' ? formMode.tx : null}
          isDuplicate={formMode.mode === 'duplicate'}
          onSave={handleSave}
          onClose={() => setFormMode(null)}
        />
      )}

      {showNewSpace && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-100">New Space</h2>
            <input
              autoFocus
              value={newSpaceName}
              onChange={e => setNewSpaceName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddSpace()}
              placeholder="Space name"
              className="w-full bg-slate-800 rounded-xl px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowNewSpace(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-xl py-2.5 text-sm font-medium">Cancel</button>
              <button onClick={handleAddSpace}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 text-sm font-semibold">Create</button>
            </div>
          </div>
        </div>
      )}

      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-100">Join Shared Space</h2>
            <input
              autoFocus
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleRequestJoin()}
              placeholder="Enter share code"
              className="w-full bg-slate-800 rounded-xl px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
            />
            {joinState.error && <p className="text-sm text-red-400">{joinState.error}</p>}
            {joinState.success && <p className="text-sm text-green-400">{joinState.success}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowJoinModal(false)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-xl py-2.5 text-sm font-medium">Close</button>
              <button onClick={handleRequestJoin} disabled={joinState.loading}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-semibold">
                {joinState.loading ? 'Sending...' : 'Request access'}
              </button>
            </div>
          </div>
        </div>
      )}

      {renaming && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-0 sm:px-6">
          <div className="bg-slate-900 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-100">Rename Space</h2>
            <input
              autoFocus
              value={renaming.name}
              onChange={e => setRenaming({ ...renaming, name: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && renameSpace(renaming.id, renaming.name).then(() => setRenaming(null))}
              className="w-full bg-slate-800 rounded-xl px-4 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-3">
              <button onClick={() => setRenaming(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-xl py-2.5 text-sm font-medium">Cancel</button>
              <button onClick={() => renameSpace(renaming.id, renaming.name).then(() => setRenaming(null))}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 text-sm font-semibold">Save</button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && activeSpace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <p className="text-slate-100 font-semibold">Share code for {activeSpace.name}</p>
            <p className="text-2xl tracking-[0.2em] font-bold text-indigo-300 bg-slate-900 rounded-xl px-4 py-3 text-center">
              {activeSpace.shareCode ?? 'Unavailable'}
            </p>
            {shareInfo && <p className="text-sm text-green-400">{shareInfo}</p>}
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (!activeSpace.shareCode) return
                  await navigator.clipboard.writeText(activeSpace.shareCode)
                  setShareInfo('Code copied to clipboard')
                }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-xl py-2.5 text-sm font-medium"
              >
                Copy
              </button>
              <button
                onClick={async () => {
                  await rotateShareCode(activeSpace.id)
                  setShareInfo('Share code rotated')
                }}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 text-sm font-semibold"
              >
                Rotate
              </button>
            </div>
            <button onClick={() => setShowShareModal(false)}
              className="w-full bg-slate-900 hover:bg-slate-700 text-slate-200 rounded-xl py-2.5 text-sm">Close</button>
          </div>
        </div>
      )}

      {showMembersModal && activeSpace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-lg space-y-5 max-h-[80vh] overflow-y-auto">
            <p className="text-slate-100 font-semibold">Manage members</p>

            <div className="space-y-2">
              {members.map(([uid, member]) => (
                <div key={uid} className="bg-slate-900 rounded-xl px-3 py-2 flex items-center gap-2">
                  <span className="text-xs text-slate-300 flex-1 truncate">{uid === user?.uid ? `${user?.email} (you)` : uid}</span>
                  <span className="text-xs text-slate-500">{roleLabel(member.role)}</span>
                  {member.role !== 'owner' && (
                    <select
                      value={member.role}
                      onChange={e => updateMemberRole(activeSpace.id, uid, e.target.value as SpaceRole)}
                      className="bg-slate-700 text-slate-100 text-xs rounded-lg px-2 py-1"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  )}
                  {member.role !== 'owner' && (
                    <button
                      onClick={() => removeMember(activeSpace.id, uid)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-200">Pending requests</p>
              {pendingRequests.length === 0 && (
                <p className="text-xs text-slate-500">No pending requests</p>
              )}
              {pendingRequests.map(req => (
                <div key={req.id} className="bg-slate-900 rounded-xl px-3 py-2 flex items-center gap-2">
                  <span className="text-xs text-slate-300 flex-1 truncate">{req.requesterEmail || req.requesterUid}</span>
                  <button
                    onClick={() => approveRequest(req.id)}
                    className="text-xs text-green-400 hover:text-green-300"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => rejectRequest(req.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Reject
                  </button>
                </div>
              ))}
            </div>

            <button onClick={() => setShowMembersModal(false)}
              className="w-full bg-slate-900 hover:bg-slate-700 text-slate-200 rounded-xl py-2.5 text-sm">Close</button>
          </div>
        </div>
      )}

      {confirmDeleteSpace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-xs space-y-4">
            <p className="text-slate-100 font-semibold">
              {confirmDeleteSpace.currentUserRole === 'owner'
                ? `Delete "${confirmDeleteSpace.name}" for all members?`
                : `Leave "${confirmDeleteSpace.name}"?`}
            </p>
            <p className="text-sm text-slate-400">
              {confirmDeleteSpace.currentUserRole === 'owner'
                ? 'All transactions and pending requests in this space will be permanently deleted.'
                : 'You will lose access to this shared space.'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeleteSpace(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-100 rounded-xl py-2.5 text-sm font-medium">Cancel</button>
              <button onClick={() => { deleteSpace(confirmDeleteSpace.id); setConfirmDeleteSpace(null) }}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white rounded-xl py-2.5 text-sm font-semibold">
                {confirmDeleteSpace.currentUserRole === 'owner' ? 'Delete' : 'Leave'}
              </button>
            </div>
          </div>
        </div>
      )}

      {spaceMenu && <div className="fixed inset-0 z-10" onClick={() => setSpaceMenu(null)} />}
    </div>
  )
}
