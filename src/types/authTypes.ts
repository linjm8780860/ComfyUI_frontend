/** Auth types stub - auth removed */
export interface AuthUserInfo {
  id: string
  name?: string
  email?: string
  photoURL?: string
}

export interface ApiKeyAuthHeader {
  'X-API-KEY': string
}
