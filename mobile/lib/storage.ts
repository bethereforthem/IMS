import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'ims_access_token'
const USER_KEY  = 'ims_user'

export async function saveSession(token: string, user: Record<string, unknown>) {
  await SecureStore.setItemAsync(TOKEN_KEY, token)
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user))
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function getSavedUser(): Promise<Record<string, unknown> | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY)
  await SecureStore.deleteItemAsync(USER_KEY)
}
