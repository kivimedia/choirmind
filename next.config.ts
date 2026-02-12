import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { execSync } from 'child_process'

const withNextIntl = createNextIntlPlugin()

// Inject build version at build time
let gitHash = 'dev'
try {
  gitHash = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  // Not in a git repo (e.g. Vercel build) — try env
  gitHash = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'unknown'
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: gitHash,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
}

export default withNextIntl(nextConfig)
