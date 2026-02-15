# App Audit Fixes — Feb 2026

Full audit of all pages, features, and mobile accessibility. 15 issues found and fixed.

## HIGH priority

### 1. Pricing page: no feedback after Stripe checkout
**File:** `src/app/(app)/pricing/page.tsx`
**Problem:** Checkout redirects to `/pricing?success=true` etc., but page never read URL params. Users had no confirmation.
**Fix:** Added `useSearchParams` to detect redirect params. Shows green banner on success, yellow on cancel, auto-dismisses after 6s. Also fixed silent error handling in checkout/portal calls — now shows error message.

### 2. XP formula inconsistency
**File:** `src/app/api/vocal-analysis/webhook/route.ts`
**Problem:** Hardcoded tier brackets (`>=90 → 25xp`) instead of `calculateVocalXp()` from `src/lib/xp.ts`. Missed streak multipliers, section improvement bonuses.
**Fix:** Now calls `calculateVocalXp()` with streak data and previous session scores for improvement bonuses.

### 3. Achievements not checked after vocal practice
**File:** `src/app/api/vocal-analysis/webhook/route.ts`
**Problem:** `checkAndUnlockAchievements()` never called after vocal analysis. Achievements like `first_vocal`, `perfect_section`, `choir_ready` could never unlock from recordings.
**Fix:** Added `checkAndUnlockAchievements()` call inside the transaction with full context (songId, scores, previous scores).

### 4. Memory strength hardcoded to 1.0
**File:** `src/app/api/practice/review/route.ts`
**Problem:** `memoryStrength = 1.0` hardcoded — all chunks appeared "locked in" regardless of performance.
**Fix:** Now calls `getMemoryStrength()` and `getStatus()` from `src/lib/spaced-repetition.ts`.

### 5. Polling timeout too short for long songs
**File:** `src/components/vocal/FullSongRecordingPanel.tsx`
**Problem:** 100 attempts x 3s = 5 min max. Demucs on full songs can take longer.
**Fix:** Increased to 200 attempts (~10 min timeout).

## MEDIUM priority — Mobile UX

### 6. Small touch targets on practice page
**Files:** `src/app/(app)/practice/[songId]/page.tsx`, `src/components/audio/AudioPlayer.tsx`
**Problem:** Chunk dots 10px, fade buttons 28px, play/pause 36px — all below 44px WCAG minimum.
**Fix:**
- Chunk dots: `h-2.5 w-2.5` → `h-4 w-4`
- Fade buttons: `min-w-[28px]` → `min-w-[36px]`
- Play/pause: `h-9 w-9` → `h-11 w-11 sm:h-9 sm:w-9`
- Skip buttons: `h-8 w-8` → `h-10 w-10 sm:h-8 sm:w-8`

### 7. Filter bar crowded on mobile
**File:** `src/app/(app)/songs/page.tsx`
**Problem:** 7 filter buttons + bulk action buttons overflow on small phones.
**Fix:** Added `flex-wrap` to filter container. Bulk actions now `flex-col sm:flex-row`.

### 8. Session detail score cards overflow
**File:** `src/app/(app)/vocal-practice/sessions/[sessionId]/page.tsx`
**Problem:** `flex gap-6` overflows on 375px phones.
**Fix:** Changed to `flex flex-wrap gap-3 sm:gap-6`.

### 9. History filter row not responsive
**File:** `src/app/(app)/vocal-practice/history/page.tsx`
**Problem:** Filter label + select + trend in single flex row without wrapping.
**Fix:** Added `flex-wrap` and responsive gap `gap-2 sm:gap-3`.

### 10. Toggle switch breaks in RTL
**File:** `src/app/(app)/choir/[choirId]/manage/page.tsx`
**Problem:** Hardcoded `translate-x-5` — knob moves wrong direction in RTL.
**Fix:** Added `rtl:-translate-x-5` for correct RTL behavior.

### 11. Director scan checkbox too small
**File:** `src/app/(app)/director/scan/page.tsx`
**Problem:** `h-5 w-5` (20px) below touch target minimum.
**Fix:** Increased to `h-6 w-6` (24px).

## LOW priority — Cosmetic

### 12. Profile stats grid cramped on mobile
**File:** `src/app/(app)/profile/page.tsx`
**Problem:** `grid-cols-3 gap-4` with no responsive adjustment.
**Fix:** Changed gap to `gap-2 sm:gap-4`.

### 13. Silent error handling in multiple pages
**Files:** `profile/page.tsx`, `settings/page.tsx`, `pricing/page.tsx`
**Problem:** `catch { // ignore }` — users see infinite loading spinner on errors.
**Fix:** Added error state + retry button to all three pages.

### 14. Back button arrow wrong in RTL
**File:** `src/app/(app)/songs/[songId]/page.tsx`
**Problem:** Arrow SVG points left (LTR convention), should point right in Hebrew.
**Fix:** Added `rtl:rotate-180` to the SVG element.

### 15. Lyrics font not responsive
**Files:** `src/components/practice/KaraokeDisplay.tsx`, `src/components/practice/FadeOutDisplay.tsx`
**Problem:** Hardcoded `fontSize: 24px` — too large on phones <320px.
**Fix:** Changed to `fontSize: clamp(18px, 5vw, 24px)`.

---

## Files changed (16 app files)

| File | Fixes |
|------|-------|
| `src/app/(app)/pricing/page.tsx` | #1, #13 |
| `src/app/api/vocal-analysis/webhook/route.ts` | #2, #3 |
| `src/app/api/practice/review/route.ts` | #4 |
| `src/components/vocal/FullSongRecordingPanel.tsx` | #5 |
| `src/app/(app)/practice/[songId]/page.tsx` | #6 |
| `src/components/audio/AudioPlayer.tsx` | #6 |
| `src/app/(app)/songs/page.tsx` | #7 |
| `src/app/(app)/vocal-practice/sessions/[sessionId]/page.tsx` | #8 |
| `src/app/(app)/vocal-practice/history/page.tsx` | #9 |
| `src/app/(app)/choir/[choirId]/manage/page.tsx` | #10 |
| `src/app/(app)/director/scan/page.tsx` | #11 |
| `src/app/(app)/profile/page.tsx` | #12, #13 |
| `src/app/(app)/settings/page.tsx` | #13 |
| `src/app/(app)/songs/[songId]/page.tsx` | #14 |
| `src/components/practice/KaraokeDisplay.tsx` | #15 |
| `src/components/practice/FadeOutDisplay.tsx` | #15 |
