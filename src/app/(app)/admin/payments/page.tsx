'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

interface PaymentUser {
  id: string
  name: string | null
  email: string
  stripeCustomerId: string | null
  createdAt: string
  plan: string | null
  freeSecondsUsed: number
  freeSecondsLimit: number
  purchasedSeconds: number
  monthlySecondsLimit: number
  stripeSubscriptionId: string | null
  stripeCurrentPeriodEnd: string | null
}

interface Charge {
  id: string
  amount: number
  currency: string
  status: string
  refunded: boolean
  amountRefunded: number
  created: number
  description: string | null
  receiptUrl: string | null
}

export default function AdminPaymentsPage() {
  const { data: session } = useSession()
  const [users, setUsers] = useState<PaymentUser[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Refund modal state
  const [refundUser, setRefundUser] = useState<PaymentUser | null>(null)
  const [charges, setCharges] = useState<Charge[]>([])
  const [chargesLoading, setChargesLoading] = useState(false)
  const [refundLoading, setRefundLoading] = useState<string | null>(null)
  const [refundResult, setRefundResult] = useState<{ chargeId: string; message: string } | null>(null)

  const isAdmin = session?.user?.role === 'admin'

  const fetchUsers = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('search', q)
      const res = await fetch(`/api/admin/payments?${params}`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) fetchUsers('')
  }, [isAdmin, fetchUsers])

  // Debounced search
  useEffect(() => {
    if (!isAdmin) return
    const timeout = setTimeout(() => fetchUsers(search), 300)
    return () => clearTimeout(timeout)
  }, [search, isAdmin, fetchUsers])

  async function openRefundModal(user: PaymentUser) {
    setRefundUser(user)
    setCharges([])
    setRefundResult(null)
    setChargesLoading(true)
    try {
      const res = await fetch(`/api/admin/refund?userId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setCharges(data.charges)
      }
    } finally {
      setChargesLoading(false)
    }
  }

  async function issueRefund(chargeId: string, amount?: number) {
    setRefundLoading(chargeId)
    setRefundResult(null)
    try {
      const res = await fetch('/api/admin/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chargeId, amount, userId: refundUser?.id }),
      })
      const data = await res.json()
      if (res.ok) {
        const minDeducted = data.deductedSeconds ? Math.floor(data.deductedSeconds / 60) : 0
        const deductMsg = minDeducted > 0 ? `. קוזזו ${minDeducted} דקות` : ''
        setRefundResult({ chargeId, message: `החזר בוצע בהצלחה (${data.id})${deductMsg}` })
        // Refresh charges and users table
        if (refundUser) {
          const r = await fetch(`/api/admin/refund?userId=${refundUser.id}`)
          if (r.ok) setCharges((await r.json()).charges)
        }
        fetchUsers(search)
      } else {
        setRefundResult({ chargeId, message: `שגיאה: ${data.error}` })
      }
    } finally {
      setRefundLoading(null)
    }
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl py-12 text-center">
        <p className="text-lg text-danger font-medium">אין לך הרשאה לצפות בדף זה</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">ניהול תשלומים</h1>
        <p className="mt-1 text-text-muted">צפייה במשתמשים, מנויים והחזרים כספיים</p>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="חיפוש לפי שם או אימייל..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:max-w-md"
        />
      </div>

      {/* Users table */}
      <Card className="overflow-x-auto">
        {loading ? (
          <div className="animate-pulse space-y-3 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded bg-border/30" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="py-8 text-center text-text-muted">לא נמצאו משתמשים</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-text-muted">
                <th className="px-3 py-3 text-start font-medium">משתמש</th>
                <th className="px-3 py-3 text-start font-medium">תוכנית</th>
                <th className="px-3 py-3 text-start font-medium">מכסה</th>
                <th className="px-3 py-3 text-start font-medium">Stripe</th>
                <th className="px-3 py-3 text-start font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const totalMin = Math.floor((user.freeSecondsLimit + user.purchasedSeconds) / 60)
                const usedMin = Math.floor(user.freeSecondsUsed / 60)
                const hasSubscription = !!user.stripeSubscriptionId
                const subscriptionActive = user.stripeCurrentPeriodEnd
                  ? new Date(user.stripeCurrentPeriodEnd) > new Date()
                  : false

                return (
                  <tr key={user.id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-3">
                      <div>
                        <p className="font-medium text-foreground">{user.name || '—'}</p>
                        <p className="text-xs text-text-muted">{user.email}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {user.plan ? (
                        <Badge variant="primary">
                          {user.plan.charAt(0).toUpperCase() + user.plan.slice(1)}
                        </Badge>
                      ) : (
                        <span className="text-text-muted">חינם</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-foreground">{usedMin}/{totalMin}</span>
                      <span className="text-text-muted text-xs mr-1">דק׳</span>
                    </td>
                    <td className="px-3 py-3">
                      {user.stripeCustomerId ? (
                        <div className="flex flex-col gap-0.5">
                          {hasSubscription && (
                            <Badge variant={subscriptionActive ? 'primary' : 'default'}>
                              {subscriptionActive ? 'פעיל' : 'לא פעיל'}
                            </Badge>
                          )}
                          {!hasSubscription && (
                            <span className="text-xs text-text-muted">ללא מנוי</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {user.stripeCustomerId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openRefundModal(user)}
                        >
                          החזר כספי
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Refund Modal */}
      {refundUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground">
                החזר כספי — {refundUser.name || refundUser.email}
              </h2>
              <button
                type="button"
                onClick={() => setRefundUser(null)}
                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-hover hover:text-foreground transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {chargesLoading ? (
              <div className="animate-pulse space-y-3 py-4">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 rounded bg-border/30" />
                ))}
              </div>
            ) : charges.length === 0 ? (
              <p className="py-6 text-center text-text-muted">לא נמצאו חיובים</p>
            ) : (
              <div className="space-y-3">
                {charges.map((charge) => {
                  const date = new Date(charge.created * 1000)
                  const amountStr = (charge.amount / 100).toFixed(2)
                  const refundedStr = (charge.amountRefunded / 100).toFixed(2)
                  const isFullyRefunded = charge.refunded
                  const resultMsg = refundResult?.chargeId === charge.id ? refundResult.message : null

                  return (
                    <div
                      key={charge.id}
                      className="rounded-xl border border-border p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground">
                              ${amountStr} {charge.currency.toUpperCase()}
                            </span>
                            <Badge variant={charge.status === 'succeeded' ? 'primary' : 'default'}>
                              {charge.status}
                            </Badge>
                            {isFullyRefunded && <Badge variant="default">הוחזר</Badge>}
                          </div>
                          <p className="text-xs text-text-muted mt-1">
                            {date.toLocaleDateString('he-IL')} {date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {charge.description && (
                            <p className="text-xs text-text-muted mt-0.5">{charge.description}</p>
                          )}
                          {charge.amountRefunded > 0 && !isFullyRefunded && (
                            <p className="text-xs text-text-muted mt-0.5">
                              הוחזר חלקית: ${refundedStr}
                            </p>
                          )}
                          {resultMsg && (
                            <p className={`text-xs mt-1 ${resultMsg.startsWith('שגיאה') ? 'text-danger' : 'text-primary'}`}>
                              {resultMsg}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {!isFullyRefunded && charge.status === 'succeeded' && (
                            <Button
                              variant="outline"
                              size="sm"
                              loading={refundLoading === charge.id}
                              onClick={() => issueRefund(charge.id)}
                            >
                              החזר מלא
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
