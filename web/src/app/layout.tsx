import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/components/shared/AuthProvider'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: {
    default: 'IMS — Rwanda Intelligence Management System',
    template: '%s · IMS',
  },
  description: 'Rwanda Intelligence Management System — Restricted Access · Authorized Personnel Only',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
  other: {
    'theme-color': '#000000',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="shortcut icon" href="/icon.svg" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased">
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: { background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155' },
              error: { iconTheme: { primary: '#DC2626', secondary: '#FEE2E2' } },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  )
}
