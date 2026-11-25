// Talks to the shared-data function. With no VITE_API_URL the app runs in local mode and keeps data in this browser only.
export const API: string | undefined = import.meta.env.VITE_API_URL || undefined

export type Role = 'manager' | 'staff'
export interface Auth { token: string; role: Role }
export const ROLE_NAME: Record<Role, string> = { manager: 'ຜູ້ຈັດການ', staff: 'ພະນັກງານ' }

const AUTH_KEY = 'bonus-workspace/auth'
export const savedAuth = (): Auth | null => { try { return JSON.parse(localStorage.getItem(AUTH_KEY) ?? 'null') } catch { return null } }
export const keepAuth = (a: Auth | null) => (a ? localStorage.setItem(AUTH_KEY, JSON.stringify(a)) : localStorage.removeItem(AUTH_KEY))

/** Throws when the network is down; otherwise returns the status and the JSON body. */
export async function api(body: Record<string, unknown>): Promise<{ status: number; body: any }> {
  const r = await fetch(API!, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}
