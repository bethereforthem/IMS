'use client'

import { useEffect, useState, useCallback } from 'react'
import { adminPortalApi, type AdminUser } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { Users, Lock, Unlock, UserX, UserCheck, Key, Search } from 'lucide-react'

const ROLE_COLOR: Record<string, string> = {
  SYSTEM_ADMIN:       '#a78bfa',
  NISS_DIRECTOR:      '#818cf8',
  NISS_OFFICER:       '#6366f1',
  RNP_COMMANDER:      '#3b82f6',
  RNP_DETECTIVE:      '#60a5fa',
  RNP_PATROL:         '#93c5fd',
  RDF_COMMANDER:      '#22c55e',
  RDF_BORDER_OFFICER: '#86efac',
  RIB_INVESTIGATOR:   '#e11d48',
  RIB_ANALYST:        '#fb7185',
  RCS_SUPERINTENDENT: '#64748b',
  RCS_OFFICER:        '#94a3b8',
  VILLAGE_LEADER:     '#f59e0b',
  SIEM_ANALYST:       '#f97316',
}

const ALL_ROLES = Object.keys(ROLE_COLOR)

export default function AdminUsersPage() {
  const [users,   setUsers]   = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [selected, setSelected] = useState<AdminUser | null>(null)
  const [roleEdit,  setRoleEdit]  = useState('')
  const [newPwd,    setNewPwd]    = useState('')
  const [working,   setWorking]   = useState(false)
  const [msg,       setMsg]       = useState('')

  const load = useCallback(() => {
    setLoading(true)
    adminPortalApi.listUsers()
      .then(r => setUsers(r.data?.users ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = users.filter(u =>
    !search ||
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.badge_number.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase()) ||
    u.institution.toLowerCase().includes(search.toLowerCase())
  )

  const act = async (fn: () => Promise<unknown>, successMsg: string) => {
    setWorking(true); setMsg('')
    try { await fn(); setMsg(successMsg); load() }
    catch (e: unknown) { setMsg(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`) }
    finally { setWorking(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <Users style={{ width: 22, height: 22, color: '#3b82f6' }} />
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>User Management</h1>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{users.length} total users</p>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#64748b' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, badge, role, institution…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#0f172a', border: '1px solid #1e293b',
            borderRadius: '8px', padding: '8px 12px 8px 32px',
            color: '#f1f5f9', fontSize: '13px', outline: 'none',
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: '16px' }}>

        {/* User table */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading users…</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#1e293b' }}>
                  {['User', 'Institution', 'Role', 'Status', 'Last Login', ''].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr
                    key={u.id}
                    onClick={() => { setSelected(u); setRoleEdit(u.role); setNewPwd(''); setMsg('') }}
                    style={{
                      borderTop: '1px solid #1e293b', cursor: 'pointer',
                      background: selected?.id === u.id ? '#1e293b' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>{u.full_name}</div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>{u.badge_number}</div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', color: '#94a3b8' }}>{u.institution}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        background: (ROLE_COLOR[u.role] ?? '#64748b') + '22',
                        color: ROLE_COLOR[u.role] ?? '#64748b',
                        fontSize: '10px', fontWeight: 700,
                        padding: '2px 7px', borderRadius: '4px',
                      }}>{u.role}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        background: !u.active ? '#450a0a' : u.locked ? '#451a03' : '#052e16',
                        color: !u.active ? '#fca5a5' : u.locked ? '#fde68a' : '#6ee7b7',
                        fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
                      }}>
                        {!u.active ? 'DISABLED' : u.locked ? 'LOCKED' : 'ACTIVE'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '11px', color: '#64748b' }}>
                      {u.last_login_at ? formatDistanceToNow(new Date(u.last_login_at), { addSuffix: true }) : 'Never'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: '11px', color: '#3b82f6' }}>Manage →</span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* User detail panel */}
        {selected && (
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#f1f5f9' }}>{selected.full_name}</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>{selected.badge_number} · {selected.institution}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px' }}>×</button>
            </div>

            {msg && (
              <div style={{
                background: msg.startsWith('Error') ? '#450a0a' : '#052e16',
                color: msg.startsWith('Error') ? '#fca5a5' : '#6ee7b7',
                border: `1px solid ${msg.startsWith('Error') ? '#ef4444' : '#22c55e'}33`,
                borderRadius: '6px', padding: '8px 12px', fontSize: '12px', marginBottom: '12px',
              }}>{msg}</div>
            )}

            {/* Enable / Disable */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Account Status</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  disabled={working || !selected.active}
                  onClick={() => act(() => adminPortalApi.updateUser(selected.id, { active: false }), 'User disabled')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    background: '#450a0a', color: '#fca5a5', border: '1px solid #ef444433',
                    borderRadius: '5px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer',
                    opacity: (!selected.active || working) ? 0.5 : 1,
                  }}
                >
                  <UserX style={{ width: 12, height: 12 }} /> Disable
                </button>
                <button
                  disabled={working || selected.active}
                  onClick={() => act(() => adminPortalApi.updateUser(selected.id, { active: true }), 'User enabled')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    background: '#052e16', color: '#6ee7b7', border: '1px solid #22c55e33',
                    borderRadius: '5px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer',
                    opacity: (selected.active || working) ? 0.5 : 1,
                  }}
                >
                  <UserCheck style={{ width: 12, height: 12 }} /> Enable
                </button>
                <button
                  disabled={working || selected.locked}
                  onClick={() => act(() => adminPortalApi.updateUser(selected.id, { locked: false }), 'User unlocked')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f633',
                    borderRadius: '5px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer',
                    opacity: (!selected.locked || working) ? 0.5 : 1,
                  }}
                >
                  <Unlock style={{ width: 12, height: 12 }} /> Unlock
                </button>
              </div>
            </div>

            {/* Role change */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Role / Permissions</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={roleEdit}
                  onChange={e => setRoleEdit(e.target.value)}
                  style={{
                    flex: 1, background: '#1e293b', border: '1px solid #334155',
                    color: '#f1f5f9', borderRadius: '5px', padding: '6px 8px', fontSize: '12px',
                  }}
                >
                  {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button
                  disabled={working || roleEdit === selected.role}
                  onClick={() => act(() => adminPortalApi.changeRole(selected.id, roleEdit), `Role changed to ${roleEdit}`)}
                  style={{
                    background: '#1e3a5f', color: '#93c5fd', border: '1px solid #3b82f633',
                    borderRadius: '5px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer',
                    opacity: (roleEdit === selected.role || working) ? 0.5 : 1,
                  }}
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Password reset */}
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Reset Credentials</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="password"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder="New password (min 8 chars)"
                  style={{
                    flex: 1, background: '#1e293b', border: '1px solid #334155',
                    color: '#f1f5f9', borderRadius: '5px', padding: '6px 8px', fontSize: '12px',
                    outline: 'none',
                  }}
                />
                <button
                  disabled={working || newPwd.length < 8}
                  onClick={() => act(() => adminPortalApi.resetCredentials(selected.id, newPwd).then(() => setNewPwd('')), 'Password reset & sessions revoked')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    background: '#451a03', color: '#fde68a', border: '1px solid #f59e0b33',
                    borderRadius: '5px', padding: '6px 12px', fontSize: '11px', cursor: 'pointer',
                    opacity: (newPwd.length < 8 || working) ? 0.5 : 1,
                  }}
                >
                  <Key style={{ width: 12, height: 12 }} /> Reset
                </button>
              </div>
            </div>

            {/* Stats */}
            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #1e293b', display: 'flex', gap: '16px' }}>
              <div>
                <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>MFA Failures</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: selected.mfa_failures > 3 ? '#ef4444' : '#64748b' }}>{selected.mfa_failures}</div>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Member Since</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                  {formatDistanceToNow(new Date(selected.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
