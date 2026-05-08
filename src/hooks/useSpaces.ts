import { useState, useEffect } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  setDoc,
  getDocs,
  writeBatch,
  arrayRemove,
  runTransaction,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import type { Space, SpaceMember, SpaceRole } from '../types'

function generateShareCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase()
}

function sortByOrder(spaces: Space[]) {
  return [...spaces].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    return a.name.localeCompare(b.name)
  })
}

export function useSpaces() {
  const { user } = useAuth()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setSpaces([])
      setLoading(false)
      return
    }

    let sharedDocs: Space[] = []
    let legacyDocs: Space[] = []
    let prefsBySpace: Record<string, { archived?: boolean; order?: number }> = {}
    let sharedReady = false
    let legacyReady = false
    let prefsReady = false

    const recompute = () => {
      const merged = new Map<string, Space>()
      for (const s of legacyDocs) merged.set(s.id, s)
      for (const s of sharedDocs) merged.set(s.id, s)

      const normalized = Array.from(merged.values())
        .map((space, idx) => {
          const members = space.members ?? {
            [space.ownerId ?? space.uid ?? user.uid]: {
              role: 'owner' as const,
              joinedAt: space.createdAt ?? Timestamp.now().toMillis(),
            },
          }
          const ownerId = space.ownerId ?? space.uid ?? user.uid
          const role = members[user.uid]?.role ?? (ownerId === user.uid ? 'owner' : undefined)
          if (!role) return null

          const pref = prefsBySpace[space.id]
          const archived = pref?.archived ?? space.archived ?? false
          const order = pref?.order ?? space.order ?? idx
          const memberUids = space.memberUids ?? Object.keys(members)

          return {
            ...space,
            ownerId,
            members,
            memberUids,
            memberCount: space.memberCount ?? memberUids.length,
            archived,
            order,
            currentUserRole: role,
            isOwner: role === 'owner',
          } as Space
        })
        .filter((space): space is Space => Boolean(space))

      setSpaces(sortByOrder(normalized))
      if (sharedReady && legacyReady && prefsReady) {
        setLoading(false)
      }
    }

    const sharedQuery = query(collection(db, 'spaces'), where('memberUids', 'array-contains', user.uid))
    const legacyQuery = query(collection(db, 'spaces'), where('uid', '==', user.uid))
    const prefsQuery = collection(db, 'users', user.uid, 'spacePrefs')

    const unsubShared = onSnapshot(sharedQuery, (snap) => {
      sharedDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Space))
      sharedReady = true
      recompute()
    })

    const unsubLegacy = onSnapshot(legacyQuery, (snap) => {
      legacyDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Space))
      legacyReady = true
      recompute()
    })

    const unsubPrefs = onSnapshot(prefsQuery, (snap) => {
      prefsBySpace = {}
      for (const prefDoc of snap.docs) {
        const data = prefDoc.data() as { archived?: boolean; order?: number }
        prefsBySpace[prefDoc.id] = data
      }
      prefsReady = true
      recompute()
    })

    return () => {
      unsubShared()
      unsubLegacy()
      unsubPrefs()
    }
  }, [user])

  const addSpace = async (name: string) => {
    if (!user) return
    const now = Timestamp.now().toMillis()
    const maxOrder = spaces.reduce((m, s) => Math.max(m, s.order), -1)
    const shareCode = generateShareCode()
    const members: Record<string, SpaceMember> = {
      [user.uid]: {
        role: 'owner',
        joinedAt: now,
      },
    }
    const docRef = await addDoc(collection(db, 'spaces'), {
      name,
      uid: user.uid,
      ownerId: user.uid,
      members,
      memberUids: [user.uid],
      memberCount: 1,
      shareCode,
      order: maxOrder + 1,
      archived: false,
      createdAt: now,
    })

    await setDoc(doc(db, 'spaceCodes', docRef.id), {
      spaceId: docRef.id,
      spaceName: name,
      shareCode,
      ownerId: user.uid,
      updatedAt: now,
    }, { merge: true })

    await setDoc(doc(db, 'users', user.uid, 'spacePrefs', docRef.id), {
      archived: false,
      order: maxOrder + 1,
      updatedAt: now,
    }, { merge: true })
  }

  const renameSpace = async (id: string, name: string) => {
    const current = spaces.find(s => s.id === id)
    if (!current || current.currentUserRole !== 'owner') return
    const now = Timestamp.now().toMillis()
    await Promise.all([
      updateDoc(doc(db, 'spaces', id), { name }),
      setDoc(doc(db, 'spaceCodes', id), {
        spaceName: name,
        updatedAt: now,
      }, { merge: true }),
    ])
  }

  const archiveSpace = async (id: string, archived: boolean) => {
    if (!user) return
    await setDoc(doc(db, 'users', user.uid, 'spacePrefs', id), {
      archived,
      updatedAt: Timestamp.now().toMillis(),
    }, { merge: true })
  }

  const deleteSpace = async (id: string) => {
    if (!user) return
    const current = spaces.find(s => s.id === id)
    if (!current) return

    if (current.currentUserRole === 'owner') {
      const txSnap = await getDocs(query(collection(db, 'transactions'), where('spaceId', '==', id)))
      const reqSnap = await getDocs(query(collection(db, 'spaceJoinRequests'), where('spaceId', '==', id)))
      const batch = writeBatch(db)
      batch.delete(doc(db, 'spaces', id))
      for (const txDoc of txSnap.docs) {
        batch.delete(txDoc.ref)
      }
      for (const reqDoc of reqSnap.docs) {
        batch.delete(reqDoc.ref)
      }
      batch.delete(doc(db, 'spaceCodes', id))
      batch.delete(doc(db, 'users', user.uid, 'spacePrefs', id))
      await batch.commit()
      return
    }

    const members = { ...(current.members ?? {}) }
    delete members[user.uid]
    const memberCount = Math.max(0, (current.memberCount ?? Object.keys(current.members ?? {}).length) - 1)
    await updateDoc(doc(db, 'spaces', id), {
      members,
      memberUids: arrayRemove(user.uid),
      memberCount,
    })
    await deleteDoc(doc(db, 'users', user.uid, 'spacePrefs', id))
  }

  const reorderSpace = async (id: string, direction: 'up' | 'down') => {
    if (!user) return
    const visible = sortByOrder(spaces.filter(s => !s.archived))
    const idx = visible.findIndex(s => s.id === id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= visible.length) return
    const a = visible[idx]
    const b = visible[swapIdx]
    const now = Timestamp.now().toMillis()
    await Promise.all([
      setDoc(doc(db, 'users', user.uid, 'spacePrefs', a.id), {
        order: b.order,
        updatedAt: now,
      }, { merge: true }),
      setDoc(doc(db, 'users', user.uid, 'spacePrefs', b.id), {
        order: a.order,
        updatedAt: now,
      }, { merge: true }),
    ])
  }

  const rotateShareCode = async (id: string) => {
    const current = spaces.find(s => s.id === id)
    if (!current || current.currentUserRole !== 'owner') return
    const shareCode = generateShareCode()
    const now = Timestamp.now().toMillis()
    await Promise.all([
      updateDoc(doc(db, 'spaces', id), { shareCode }),
      setDoc(doc(db, 'spaceCodes', id), {
        spaceId: id,
        spaceName: current.name,
        shareCode,
        ownerId: current.ownerId ?? current.uid,
        updatedAt: now,
      }, { merge: true }),
    ])
  }

  const updateMemberRole = async (spaceId: string, memberUid: string, role: SpaceRole) => {
    const current = spaces.find(s => s.id === spaceId)
    if (!current || current.currentUserRole !== 'owner') return
    const ownerId = current.ownerId ?? current.uid
    if (!ownerId || memberUid === ownerId) return

    await runTransaction(db, async (tx) => {
      const spaceRef = doc(db, 'spaces', spaceId)
      const snap = await tx.get(spaceRef)
      if (!snap.exists()) return
      const data = snap.data() as Space
      const members = { ...(data.members ?? {}) }
      const existing = members[memberUid]
      if (!existing) return
      members[memberUid] = {
        ...existing,
        role,
      }
      tx.update(spaceRef, { members })
    })
  }

  const removeMember = async (spaceId: string, memberUid: string) => {
    const current = spaces.find(s => s.id === spaceId)
    if (!current || current.currentUserRole !== 'owner') return
    const ownerId = current.ownerId ?? current.uid
    if (!ownerId || memberUid === ownerId) return

    await runTransaction(db, async (tx) => {
      const spaceRef = doc(db, 'spaces', spaceId)
      const snap = await tx.get(spaceRef)
      if (!snap.exists()) return
      const data = snap.data() as Space
      const members = { ...(data.members ?? {}) }
      if (!members[memberUid]) return
      delete members[memberUid]
      const memberUids = (data.memberUids ?? Object.keys(data.members ?? {})).filter(uid => uid !== memberUid)
      tx.update(spaceRef, {
        members,
        memberUids,
        memberCount: memberUids.length,
      })
    })
  }

  return {
    spaces,
    loading,
    addSpace,
    renameSpace,
    archiveSpace,
    deleteSpace,
    reorderSpace,
    rotateShareCode,
    updateMemberRole,
    removeMember,
  }
}
