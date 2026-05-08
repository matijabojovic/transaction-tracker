import { useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDocs,
  limit,
  setDoc,
  runTransaction,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import type { Space, SpaceJoinRequest } from '../types'

interface UseJoinRequestsResult {
  pendingRequests: SpaceJoinRequest[]
  requestJoinByCode: (shareCode: string) => Promise<{ spaceId: string; spaceName: string }>
  approveRequest: (requestId: string) => Promise<void>
  rejectRequest: (requestId: string) => Promise<void>
}

export function useJoinRequests(spaceId: string | null, isOwner: boolean): UseJoinRequestsResult {
  const { user } = useAuth()
  const [pendingRequests, setPendingRequests] = useState<SpaceJoinRequest[]>([])

  useEffect(() => {
    if (!spaceId || !isOwner) {
      setPendingRequests([])
      return
    }

    const q = query(
      collection(db, 'spaceJoinRequests'),
      where('spaceId', '==', spaceId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setPendingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as SpaceJoinRequest)))
    })

    return unsub
  }, [spaceId, isOwner])

  const requestJoinByCode = async (shareCode: string) => {
    if (!user) throw new Error('You must be signed in to join a space')
    const normalized = shareCode.trim().toUpperCase()
    if (!normalized) throw new Error('Enter a valid share code')

    const codeSnap = await getDocs(
      query(collection(db, 'spaceCodes'), where('shareCode', '==', normalized), limit(1))
    )
    if (codeSnap.empty) throw new Error('Space not found for this code')

    const codeDoc = codeSnap.docs[0].data() as { spaceId: string; spaceName: string }

    const now = Timestamp.now().toMillis()
    const reqId = `${codeDoc.spaceId}_${user.uid}`
    await setDoc(doc(db, 'spaceJoinRequests', reqId), {
      spaceId: codeDoc.spaceId,
      requesterUid: user.uid,
      requesterEmail: user.email ?? '',
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }, { merge: true })

    return {
      spaceId: codeDoc.spaceId,
      spaceName: codeDoc.spaceName,
    }
  }

  const approveRequest = async (requestId: string) => {
    if (!user) return

    await runTransaction(db, async (tx) => {
      const reqRef = doc(db, 'spaceJoinRequests', requestId)
      const reqSnap = await tx.get(reqRef)
      if (!reqSnap.exists()) return

      const req = reqSnap.data() as SpaceJoinRequest
      if (req.status !== 'pending') return

      const spaceRef = doc(db, 'spaces', req.spaceId)
      const spaceSnap = await tx.get(spaceRef)
      if (!spaceSnap.exists()) throw new Error('Space no longer exists')

      const space = spaceSnap.data() as Space
      const ownerId = space.ownerId ?? space.uid
      if (ownerId !== user.uid) throw new Error('Only owner can approve requests')

      const members = { ...(space.members ?? {}) }
      members[req.requesterUid] = {
        role: 'viewer',
        joinedAt: Timestamp.now().toMillis(),
      }
      const memberUids = Array.from(new Set([...(space.memberUids ?? Object.keys(space.members ?? {})), req.requesterUid]))

      tx.update(spaceRef, {
        members,
        memberUids,
        memberCount: memberUids.length,
      })
      tx.update(reqRef, {
        status: 'approved',
        reviewedByUid: user.uid,
        updatedAt: Timestamp.now().toMillis(),
      })
    })
  }

  const rejectRequest = async (requestId: string) => {
    if (!user) return

    await runTransaction(db, async (tx) => {
      const reqRef = doc(db, 'spaceJoinRequests', requestId)
      const reqSnap = await tx.get(reqRef)
      if (!reqSnap.exists()) return

      const req = reqSnap.data() as SpaceJoinRequest
      if (req.status !== 'pending') return

      const spaceRef = doc(db, 'spaces', req.spaceId)
      const spaceSnap = await tx.get(spaceRef)
      if (!spaceSnap.exists()) throw new Error('Space no longer exists')

      const space = spaceSnap.data() as Space
      const ownerId = space.ownerId ?? space.uid
      if (ownerId !== user.uid) throw new Error('Only owner can reject requests')

      tx.update(reqRef, {
        status: 'rejected',
        reviewedByUid: user.uid,
        updatedAt: Timestamp.now().toMillis(),
      })
    })
  }

  return {
    pendingRequests,
    requestJoinByCode,
    approveRequest,
    rejectRequest,
  }
}
