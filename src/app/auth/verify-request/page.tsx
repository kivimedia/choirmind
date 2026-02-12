'use client'

import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Link from 'next/link'

export default function VerifyRequestPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <span className="mb-3 block text-5xl" aria-hidden="true">
            &#9993;
          </span>
          <h1 className="text-3xl font-bold text-primary">בדקו את האימייל</h1>
        </div>

        <Card className="!p-6">
          <div className="space-y-4 text-center">
            <p className="text-lg text-foreground">
              שלחנו לכם קישור התחברות לאימייל.
            </p>
            <p className="text-sm text-text-muted">
              לחצו על הקישור באימייל כדי להתחבר ל-ChoirMind.
              <br />
              אם לא קיבלתם, בדקו בתיקיית הספאם.
            </p>
            <div className="pt-2">
              <Link href="/auth/signin">
                <Button variant="ghost" size="sm">
                  חזרה לדף ההתחברות
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
