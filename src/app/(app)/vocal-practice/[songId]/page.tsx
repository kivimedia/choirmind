'use client'

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function VocalPracticeRedirect({
  params,
}: {
  params: Promise<{ songId: string }>
}) {
  const { songId } = use(params)
  const router = useRouter()

  useEffect(() => {
    // Redirect to song detail page where vocal recording is now integrated
    router.replace(`/songs/${songId}`)
  }, [songId, router])

  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-pulse text-text-muted">{'מעביר לדף השיר...'}</div>
    </div>
  )
}
