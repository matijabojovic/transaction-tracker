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
import type { Transaction } from '../types'

export function useTransactions(spaceId: string | null) {
  const { user } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !spaceId) {
      setTransactions([])
      setLoading(false)
      return
    }
    const q = query(
      collection(db, 'transactions'),
      where('spaceId', '==', spaceId),
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction)))
      setLoading(false)
    })
    return unsub
  }, [user, spaceId])

  const addTransaction = async (
    data: Omit<Transaction, 'id' | 'uid' | 'spaceId' | 'createdAt' | 'updatedAt'>,
    canWrite = true
  ) => {
    if (!user || !spaceId) return
    if (!canWrite) throw new Error('Read-only access to this shared space')
    const now = Timestamp.now().toMillis()
    await addDoc(collection(db, 'transactions'), {
      ...data,
      uid: user.uid,
      spaceId,
      createdAt: now,
      updatedAt: now,
    })
  }

  const updateTransaction = async (
    id: string,
    data: Partial<Omit<Transaction, 'id' | 'uid' | 'spaceId' | 'createdAt'>>,
    canWrite = true
  ) => {
    if (!canWrite) throw new Error('Read-only access to this shared space')
    await updateDoc(doc(db, 'transactions', id), {
      ...data,
      updatedAt: Timestamp.now().toMillis(),
    })
  }

  const deleteTransaction = async (id: string, canWrite = true) => {
    if (!canWrite) throw new Error('Read-only access to this shared space')
    await deleteDoc(doc(db, 'transactions', id))
  }

  return { transactions, loading, addTransaction, updateTransaction, deleteTransaction }
}
