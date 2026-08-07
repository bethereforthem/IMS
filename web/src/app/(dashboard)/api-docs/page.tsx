'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Cookies from 'js-cookie'
import Link from 'next/link'
import { useAuth, dashboardRoute } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { ArrowLeft, ShieldAlert, Loader2 } from 'lucide-react'
import 'swagger-ui-react/swagger-ui.css'

// swagger-ui-react touches `window` on import — must stay out of SSR.
const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin" />
      Loading API explorer…
    </div>
  ),
})

export default function ApiDocsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [spec, setSpec] = useState<object | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  useEffect(() => {
    if (!user) return
    api
      .get('/openapi')
      .then(res => setSpec(res.data))
      .catch(err => setError(err?.response?.data?.error ?? 'Failed to load API specification'))
  }, [user])

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href={dashboardRoute(user.role)}
              className="flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <div className="h-5 w-px bg-slate-700" />
            <div>
              <h1 className="text-lg font-semibold text-slate-100">IMS API Reference</h1>
              <p className="text-xs text-slate-500">
                Generated from the route handlers — {user.badge_number} · {user.role}
              </p>
            </div>
          </div>
          <span className="hidden items-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 sm:flex">
            <ShieldAlert className="h-3.5 w-3.5" />
            RESTRICTED
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && (
          <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {!error && !spec && (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading specification…
          </div>
        )}

        {spec && (
          <div className="ims-swagger rounded-lg bg-white p-2">
            <SwaggerUI
              spec={spec}
              docExpansion="none"
              defaultModelsExpandDepth={-1}
              persistAuthorization
              tryItOutEnabled
              // Every "Try it out" call carries the signed-in officer's token,
              // so the explorer is bound by the same RBAC as the real UI.
              requestInterceptor={(req: { headers: Record<string, string> }) => {
                const token = Cookies.get('ims_access_token')
                if (token) req.headers.Authorization = `Bearer ${token}`
                return req
              }}
            />
          </div>
        )}
      </main>
    </div>
  )
}
