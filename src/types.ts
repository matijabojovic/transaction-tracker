export interface Space {
  id: string
  name: string
  uid: string
  order: number
  archived: boolean
  createdAt: number
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
