# Choirmind Project Status — Feb 15, 2026

## Recent Work (Latest Session)

### 1. DTW Alignment Drift Defense (DEPLOYED)
**Problem:** Gibberish/humming before actual lyrics caused FastDTW to lock onto the wrong section. Radius=50 prevented recovery, cascading bad scores for the entire recording.
**Fix — 3 layers in `vocal-service/processing.py`:**
- **Layer 1:** `_detect_singing_onset()` — trims leading noise by sliding a 1s window over the first 5s checking voicing ratio, pitch stability, and octave-folded pitch match vs reference
- **Layer 2:** Multi-feature DTW — 3D vectors `[log_pitch, voicing_flag, rms_energy]` weighted `[1.0, 0.5, 0.3]` so gibberish is structurally unmatchable
- **Layer 3:** `_check_path_sanity()` — post-DTW slope check at 1s intervals, logs warnings for drift (diagnostic only)
**Status:** Deployed to Modal ✅

### 2. Refund Minute Deduction (DEPLOYED)
**Problem:** Admin refunds via Stripe didn't deduct the purchased minutes from the user's quota.
**Fix:** `src/app/api/admin/refund/route.ts` now:
- Looks up checkout session metadata (`seconds` for top-ups, `monthlySeconds` for subscriptions)
- Falls back to `monthlySecondsLimit` for renewal invoices
- Proportional deduction for partial refunds
- Clamps so `purchasedSeconds` never goes below 0
- UI shows deducted minutes in success message
**Status:** Deployed ✅

### 3. Scoring Level / Sensitivity (DEPLOYED)
User can choose vocal analysis strictness in profile page:
- **choir** — generous thresholds (hobby choir singers)
- **semi_pro** — balanced
- **pro** — strict (professional standard)
Stored in `User.scoringLevel`, passed to vocal service via job metadata, applied in `scoring.py` via `LEVEL_THRESHOLDS`.
**Status:** Deployed ✅

### 4. Full App Audit — 15 Issues Fixed (DEPLOYED)
Complete audit documented in `AUDIT-FIXES.md`. Summary:

| Priority | # | Issues |
|----------|---|--------|
| HIGH | 5 | Stripe checkout feedback, XP formula, achievements after vocal, memory strength, polling timeout |
| MEDIUM | 6 | Touch targets (WCAG 44px), filter overflow, score cards, history filters, RTL toggle, checkbox size |
| LOW | 4 | Profile stats grid, silent error handling ×3, RTL back arrow, lyrics font responsiveness |

16 files modified, all committed and pushed.

---

## Previous Work (Earlier Sessions)

### Audio Quality
- WAV conversion changed from 22050Hz to 44100Hz PCM s16le
- MediaRecorder bitrate set to 128kbps Opus
- Dual audio player (debug) for A/B comparison — **TODO: remove when no longer needed**

### Musical Staff Visualization
- Dynamic staff lines centered on actual note range (not hardcoded treble clef)
- Touch-friendly horizontal scroll with fade gradient hint
- Hz-based note matching (100/150 cents thresholds) instead of exact string comparison

### Note Separation
- Lower onset detection delta (0.07→0.03), backtrack enabled
- Energy-dip splitting for repeated same-pitch notes
- 50ms onset tolerance

### Admin Features
- Admin payments page with search, user quota display, and refund modal
- Plan minutes: Starter 30m, Pro 150m, Studio 500m
- Song count hints on pricing plans
- Free vocal analysis quota: 20 minutes

### Recording & Analysis Pipeline
- Full-song recording panel with karaoke-style auto-advancing lyrics
- Reference vocal comparison view (user vs ref audio, note-by-note)
- Practice history with session detail pages
- Quota bar and credits display
- Mic selection persisted to localStorage

---

## Open Issues / TODO

1. **Remove temporary dual audio player** — WebM vs WAV comparison in headphones mode is debug-only. Remove once distortion confirmed fully resolved.

2. **Background music during recording on iOS** — `getUserMedia()` interrupts `<audio>` playback. Plan exists in `PLAN-practice-reimagine.md` (Part 3) to route backing track through same Web Audio API AudioContext.

3. **Credits/quota display in recording UI** — Quota shown on dashboard/pricing but not prominently in the recording modal itself.

4. **Note separation accuracy** — Improved but may need further tuning based on user feedback.

5. **Practice reimagination (PLAN-practice-reimagine.md)** — ✅ DONE (~95%)
   - Phase 1: Accompaniment tracks via Demucs ✅
   - Phase 2: Continuous fading practice ✅
   - Phase 3: Full-song recording with auto-advancing lyrics ✅
   - Phase 4: Polish — mostly done, minor animation enhancements possible

---

## Key Infrastructure

| Component | Location |
|-----------|----------|
| Frontend | Vercel — auto-deploys from `main` branch |
| Vocal Service | Modal.com — `cd vocal-service && PYTHONIOENCODING=utf-8 python -m modal deploy app.py` |
| Database | Neon PostgreSQL — `npm run db:push` for schema changes |
| Stripe | Live mode — webhooks configured for checkout + subscription events |
| S3 | Audio storage — recordings, reference vocals, accompaniments |

## Commit History (Recent)

```
1b201a4 Fix 15 audit issues: XP formula, achievements, memory strength, mobile UX, RTL, error handling
86e085b Add scoring level setting, refund minute deduction, and DTW drift defense
25242ec Add song count hints to pricing plans and top-ups
ec04572 Add admin payments page with refund support and payment method update
a1de3ab Update plan minutes: Starter 30m, Pro 150m, Studio 500m
b3539c6 Fix recommended badge clipping on pricing page
85f8699 Add pricing link to user dropdown and quota bar button on history page
5e8083d Change free vocal analysis quota from 60 to 20 minutes
f53a2da Fix ref/user audio swap, show pre-lyric notes, open comparison by default
a5af986 Fix note-to-lyric line alignment: use absolute timestamps
```
