# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ChoirMind is a science-based song learning app for choirs. It combines spaced repetition, vocal analysis with real-time scoring, and gamification. Hebrew is the primary language (RTL UI).

## Commands

```bash
# Development
npm run dev              # Start dev server on port 3001
npm run build            # Production build (also runs type checking)
npm run lint             # ESLint

# Database (Prisma + Neon PostgreSQL)
npm run db:push          # Push schema changes to database
npm run db:generate      # Regenerate Prisma client (also runs on postinstall)
npm run db:studio        # Open Prisma Studio GUI
npm run db:seed          # Seed database (npx tsx prisma/seed.ts)

# Vocal analysis microservice (Python, Modal.com)
cd vocal-service && modal serve app.py    # Local dev
cd vocal-service && modal deploy app.py   # Deploy to Modal
```

## Architecture

### Two-service system

1. **Next.js app** (TypeScript, Vercel) — UI, API routes, auth, database access
2. **Vocal service** (`vocal-service/`) — Python FastAPI on Modal.com with GPU (Demucs vocal isolation, pitch/timing/dynamics scoring, Claude coaching tips)

### Frontend stack

- **Next.js 16** with App Router, React 19, TypeScript
- **Tailwind CSS 4** via PostCSS
- **next-intl** for i18n — translations in `messages/he.json` and `messages/en.json`
- **NextAuth v4** with JWT strategy — email magic links (Resend) + Google OAuth
- **Prisma 6** ORM connecting to Neon serverless PostgreSQL
- **Zustand** for client state (choir selection, notifications)
- **Howler.js** for audio playback with voice part switching
- **Framer Motion** for animations

### Path alias

`@/*` maps to `./src/*` (configured in tsconfig.json).

### Route structure

- `src/app/(app)/` — Protected routes (songs, choirs, practice, dashboard)
- `src/app/auth/` — Sign-in and email verification pages
- `src/app/api/` — REST API endpoints (songs, choirs, vocal-analysis, etc.)

### Key hooks

- `useAudioEngine` — Multi-source audio playback (Howler primary, YouTube/Spotify fallback). Handles voice part selection, playback rate, loop regions, time polling.
- `useVocalRecorder` — Web Audio API microphone recording. Captures WebM Opus @ 128kbps. Has "headphones mode" that disables echo cancellation and skips Demucs isolation.

### Vocal analysis pipeline

```
Browser recording → S3 upload → VocalAnalysisJob created →
Modal service processes:
  Demucs isolation (GPU) → Feature extraction (pitch/onsets/energy) →
  DTW alignment vs reference → Scoring (50% pitch, 30% timing, 20% dynamics) →
  Claude Haiku coaching tips (Hebrew) →
Webhook → VocalPracticeSession saved → Frontend polls and displays results
```

### Data model highlights (prisma/schema.prisma)

- `Song` has many `Chunk`s (verse/chorus/bridge sections) and `AudioTrack`s (per voice part)
- `ReferenceVocal` stores isolated vocals + accompaniment + extracted features per chunk
- `UserChunkProgress` tracks SM-2 spaced repetition state and fade level (0-5) per user per chunk
- `VocalAnalysisJob` is the job queue (PENDING → PROCESSING → COMPLETED/FAILED)
- `VocalPracticeSession` stores scoring results
- Auth models (Account, Session, VerificationToken) follow NextAuth Prisma adapter conventions

### Spaced repetition & gamification

- SM-2 algorithm in `src/lib/spaced-repetition.ts` — manages ease factor, intervals, review scheduling
- Fade levels (0-5) in `src/lib/fade-engine.ts` — progressively removes accompaniment
- XP system in `src/lib/xp.ts` with streaks and achievements (`src/lib/achievements.ts`)

## Vocal Service Details

Python microservice in `vocal-service/`:
- `app.py` — Modal app definition, FastAPI endpoints, S3/DB integration
- `processing.py` — Demucs isolation, librosa/Parselmouth feature extraction, FastDTW alignment
- `scoring.py` — Pitch (Hz deviation + cents), timing (onset alignment), dynamics (energy ratio)
- `coaching.py` — Anthropic Claude Haiku generates Hebrew coaching feedback

Deployed on Modal.com with NVIDIA A10G GPU. Secrets stored in Modal dashboard under `choirmind-vocal` secret group.

## Environment Variables

The app requires these in `.env.local`:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `RESEND_API_KEY`, `EMAIL_FROM` — For magic link emails
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` — S3 for audio storage
- `VOCAL_SERVICE_URL` — Modal endpoint URL
- Optional: `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY` (Whisper auto-sync)

## Conventions

- Hebrew is the primary UI language; all user-facing strings go through next-intl (`useTranslations`)
- RTL layout via `<html lang="he" dir="rtl">`
- Server components for layouts/data fetching; `'use client'` directive for interactive components
- API routes handle auth via `getServerSession(authOptions)` from `src/lib/auth.ts`
- Prisma client singleton in `src/lib/db.ts` (imported as `prisma`)
- Voice parts: soprano, mezzo, alto, tenor, baritone, bass, mix, playback, full
