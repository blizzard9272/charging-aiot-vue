export const AUTH_TOKEN_KEY = 'chargingaiot_auth_token'
export const AUTH_USER_KEY = 'chargingaiot_auth_user'

export interface AuthUser {
  user_id: number
  user__uuid: string
  username: string
  role: number
}

export const getAuthToken = () => {
  return localStorage.getItem(AUTH_TOKEN_KEY) || ''
}

export const hasAuthToken = () => {
  return getAuthToken() !== ''
}

export const setAuthToken = (token: string) => {
  const safeToken = String(token || '').trim()
  if (safeToken) {
    localStorage.setItem(AUTH_TOKEN_KEY, safeToken)
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY)
  }
}

export const getAuthUser = (): AuthUser | null => {
  const raw = localStorage.getItem(AUTH_USER_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    const userId = typeof parsed?.user_id === 'number'
      ? parsed.user_id
      : (typeof parsed?.id === 'number' ? parsed.id : null)

    const username = typeof parsed?.username === 'string' ? parsed.username : null

    let role: number | null = null
    if (typeof parsed?.role === 'number') {
      role = parsed.role
    } else if (typeof parsed?.role === 'string') {
      const roleText = parsed.role.toLowerCase()
      const map: Record<string, number> = { super_admin: 1, admin: 2, manager: 3, maintainer: 4 }
      role = map[roleText] ?? null
    }

    const uuid = typeof parsed?.user__uuid === 'string' ? parsed.user__uuid : ''

    if (typeof userId === 'number' && typeof username === 'string' && typeof role === 'number') {
      return { user_id: userId, user__uuid: uuid, username, role }
    }

    return null
  } catch {
    return null
  }
}

export const setAuthUser = (user: AuthUser | null) => {
  if (user) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(AUTH_USER_KEY)
  }
}

export const clearAuth = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
}
