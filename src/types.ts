export type SpaceRole = 'owner' | 'editor' | 'viewer'

export interface SpaceMember {
  role: SpaceRole
  joinedAt: number
}

export interface Space {
  id: string
  name: string
  // Legacy owner field kept for backward compatibility during migration.
  uid?: string
  ownerId?: string
  members?: Record<string, SpaceMember>
  memberUids?: string[]
  memberCount?: number
  shareCode?: string
  order: number
  archived: boolean
  createdAt: number
  currentUserRole?: SpaceRole
  isOwner?: boolean
}

export interface SpacePreference {
  spaceId: string
  archived: boolean
  order: number
  updatedAt: number
}

export type SpaceJoinRequestStatus = 'pending' | 'approved' | 'rejected'

export interface SpaceJoinRequest {
  id: string
  spaceId: string
  requesterUid: string
  requesterEmail: string
  status: SpaceJoinRequestStatus
  createdAt: number
  updatedAt: number
  reviewedByUid?: string
}

export interface Transaction {
  id: string
  spaceId: string
  uid: string
  type: 'in' | 'out'
  amount: number
  currency: string
  description: string
  date: string // ISO date string YYYY-MM-DD
  createdAt: number
  updatedAt: number
}
