import { useState, useEffect } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import type { Space } from '../types'

export function useSpaces() {
  const { user } = useAuth()
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'spaces'),
      where('uid', '==', user.uid),
      orderBy('order', 'asc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setSpaces(snap.docs.map(d => ({ id: d.id, ...d.data() } as Space)))
      setLoading(false)
    })
    return unsub
  }, [user])

  const addSpace = async (name: string) => {
    if (!user) return
    const maxOrder = spaces.reduce((m, s) => Math.max(m, s.order), -1)
    await addDoc(collection(db, 'spaces'), {
      name,
      uid: user.uid,
      order: maxOrder + 1,
      archived: false,
      createdAt: Timestamp.now().toMillis(),
    })
  }

  const renameSpace = async (id: string, name: string) => {
    await updateDoc(doc(db, 'spaces', id), { name })
  }

  const archiveSpace = async (id: string, archived: boolean) => {
    await updateDoc(doc(db, 'spaces', id), { archived })
  }

  const deleteSpace = async (id: string) => {
    await deleteDoc(doc(db, 'spaces', id))
  }

  const reorderSpace = async (id: string, direction: 'up' | 'down') => {
    const idx = spaces.findIndex(s => s.id === id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= spaces.length) return
    const a = spaces[idx]
    const b = spaces[swapIdx]
    await Promise.all([
      updateDoc(doc(db, 'spaces', a.id), { order: b.order }),
      updateDoc(doc(db, 'spaces', b.id), { order: a.order }),
    ])
  }

  return { spaces, loading, addSpace, renameSpace, archiveSpace, deleteSpace, reorderSpace }
}
