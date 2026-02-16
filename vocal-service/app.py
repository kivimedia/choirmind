"""
Choirmind Vocal Analysis Service — Modal.com microservice.

Endpoints:
    POST /api/v1/process-vocal-analysis   — Analyse a user recording
    POST /api/v1/prepare-reference        — Prepare a reference vocal
    GET  /api/v1/health                   — Health check
"""

import json
import logging
import os
import tempfile
import time
import traceback
import uuid
from datetime import datetime, timezone
from typing import Optional

import modal
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("vocal-service")

# ---------------------------------------------------------------------------
# Modal app & image
# ---------------------------------------------------------------------------

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "fastapi",
        "uvicorn",
        "boto3",
        "anthropic>=0.45.0",
        "numpy",
        "librosa",
        "praat-parselmouth",
        "fastdtw",
        "scipy",
        "torch",
        "torchaudio",
        "torchcodec",
        "soundfile",
        "psycopg2-binary",
        "pydantic",
        "demucs",
        "yt-dlp",
    )
    .env({"TORCHAUDIO_BACKEND": "soundfile", "TORCH_HOME": "/root/.cache/torch"})
    # Pre-download all 4 Demucs htdemucs_ft checkpoint files into the image.
    # Using Python+urllib to guarantee files persist on disk in the image layer.
    .run_commands(
        "python -c \""
        "import urllib.request, os; "
        "d='/root/.cache/torch/hub/checkpoints'; os.makedirs(d, exist_ok=True); "
        "base='https://dl.fbaipublicfiles.com/demucs/hybrid_transformer'; "
        "names=['f7e0c4bc-ba3fe64a','d12395a8-e57c48e6','92cfc3b6-ef3bcb9c','04573f0d-f3cf25b2']; "
        "[urllib.request.urlretrieve(f'{base}/{n}.th', f'{d}/{n}.th') or print(f'Downloaded {n}.th') for n in names]; "
        "print('Files:', os.listdir(d))"
        "\""
    )
    .add_local_file("processing.py", "/root/processing.py")
    .add_local_file("scoring.py", "/root/scoring.py")
    .add_local_file("coaching.py", "/root/coaching.py")
)

app = modal.App(
    name="choirmind-vocal-service",
    image=image,
    secrets=[modal.Secret.from_name("choirmind-vocal")],
)

web_app = FastAPI(title="Choirmind Vocal Analysis", version="1.0.0")

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ProcessVocalRequest(BaseModel):
    jobId: str
    userId: str
    songId: str
    voicePart: str
    recordingS3Key: str
    recordingDurationMs: int
    useHeadphones: bool = False
    referenceVocalId: Optional[str] = None
    scoringLevel: str = "choir"


class PrepareReferenceRequest(BaseModel):
    referenceVocalId: str
    songId: str
    voicePart: str
    sourceTrackId: str
    audioFileUrl: str


class YouTubeExtractRequest(BaseModel):
    youtube_url: str


class SeparateStemsRequest(BaseModel):
    s3_key: str


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def _get_db_conn():
    """Return a psycopg2 connection using DATABASE_URL."""
    import psycopg2

    dsn = os.environ["DATABASE_URL"]
    return psycopg2.connect(dsn)


def _update_job_status(
    job_id: str,
    status: str,
    error_message: Optional[str] = None,
    practice_session_id: Optional[str] = None,
):
    """Update VocalAnalysisJob status in PostgreSQL."""
    conn = _get_db_conn()
    try:
        with conn.cursor() as cur:
            now = datetime.now(timezone.utc)
            if status == "PROCESSING":
                cur.execute(
                    """
                    UPDATE "VocalAnalysisJob"
                    SET status = %s,
                        "startedAt" = %s,
                        attempts = attempts + 1
                    WHERE id = %s
                    """,
                    (status, now, job_id),
                )
            elif status == "COMPLETED":
                cur.execute(
                    """
                    UPDATE "VocalAnalysisJob"
                    SET status = %s,
                        "completedAt" = %s,
                        "practiceSessionId" = %s
                    WHERE id = %s
                    """,
                    (status, now, practice_session_id, job_id),
                )
            elif status == "FAILED":
                cur.execute(
                    """
                    UPDATE "VocalAnalysisJob"
                    SET status = %s,
                        "completedAt" = %s,
                        "errorMessage" = %s
                    WHERE id = %s
                    """,
                    (status, now, error_message, job_id),
                )
        conn.commit()
    finally:
        conn.close()


def _update_job_stage(job_id: str, stage: str, conn=None):
    """Update the stage field for progress tracking.

    If conn is provided, reuses it (caller manages lifecycle).
    Otherwise opens and closes its own connection.
    """
    own_conn = conn is None
    if own_conn:
        conn = _get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'UPDATE "VocalAnalysisJob" SET stage = %s WHERE id = %s',
                (stage, job_id),
            )
        conn.commit()
    finally:
        if own_conn:
            conn.close()


def _update_reference_status(
    ref_id: str,
    status: str,
    isolated_url: Optional[str] = None,
    features_url: Optional[str] = None,
    duration_ms: Optional[int] = None,
    error_message: Optional[str] = None,
    accompaniment_url: Optional[str] = None,
):
    """Update ReferenceVocal status in PostgreSQL."""
    conn = _get_db_conn()
    try:
        with conn.cursor() as cur:
            now = datetime.now(timezone.utc)
            if status == "READY":
                cur.execute(
                    """
                    UPDATE "ReferenceVocal"
                    SET status = %s,
                        "isolatedFileUrl" = %s,
                        "featuresFileUrl" = %s,
                        "durationMs" = %s,
                        "accompanimentFileUrl" = %s,
                        "updatedAt" = %s
                    WHERE id = %s
                    """,
                    (status, isolated_url, features_url, duration_ms, accompaniment_url, now, ref_id),
                )
            elif status == "PROCESSING":
                cur.execute(
                    """
                    UPDATE "ReferenceVocal"
                    SET status = %s,
                        "updatedAt" = %s
                    WHERE id = %s
                    """,
                    (status, now, ref_id),
                )
            elif status == "FAILED":
                cur.execute(
                    """
                    UPDATE "ReferenceVocal"
                    SET status = %s,
                        "errorMessage" = %s,
                        "updatedAt" = %s
                    WHERE id = %s
                    """,
                    (status, error_message, now, ref_id),
                )
        conn.commit()
    finally:
        conn.close()


def _create_vocal_practice_session(
    user_id: str,
    song_id: str,
    voice_part: str,
    recording_s3_key: str,
    reference_vocal_id: Optional[str],
    scores: dict,
    coaching_tips: list[str],
    duration_ms: int,
    xp_earned: int,
    isolated_vocal_url: Optional[str] = None,
    original_recording_url: Optional[str] = None,
) -> str:
    """Insert a VocalPracticeSession row and return its id.

    When *isolated_vocal_url* is provided it is embedded in the
    ``sectionScores`` JSON column as a wrapper object so the frontend
    can retrieve the playback URL:

        {"sections": [...], "isolatedVocalUrl": "https://..."}
    """
    session_id = str(uuid.uuid4())

    # Build the sectionScores JSON — always use wrapper format to include
    # noteComparison and isolatedVocalUrl alongside the sections array.
    raw_sections = scores.get("sectionScores", [])
    note_comparison = scores.get("noteComparison", [])
    wrapper: dict = {"sections": raw_sections, "noteComparison": note_comparison}
    if isolated_vocal_url:
        wrapper["isolatedVocalUrl"] = isolated_vocal_url
    if original_recording_url:
        wrapper["originalRecordingUrl"] = original_recording_url
    section_scores_json = json.dumps(wrapper, ensure_ascii=False)

    conn = _get_db_conn()
    try:
        with conn.cursor() as cur:
            now = datetime.now(timezone.utc)
            cur.execute(
                """
                INSERT INTO "VocalPracticeSession" (
                    id, "userId", "songId", "voicePart", "recordingS3Key",
                    "referenceVocalId", "overallScore", "pitchScore",
                    "timingScore", "dynamicsScore", "sectionScores",
                    "problemAreas", "coachingTips", "xpEarned", "durationMs",
                    "createdAt"
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    %s
                )
                """,
                (
                    session_id,
                    user_id,
                    song_id,
                    voice_part,
                    recording_s3_key,
                    reference_vocal_id,
                    scores["overallScore"],
                    scores["pitchScore"],
                    scores["timingScore"],
                    scores["dynamicsScore"],
                    section_scores_json,
                    json.dumps(scores.get("problemAreas", []), ensure_ascii=False),
                    json.dumps(coaching_tips, ensure_ascii=False),
                    xp_earned,
                    duration_ms,
                    now,
                ),
            )
        conn.commit()
    finally:
        conn.close()

    return session_id


def _refund_quota(user_id: str, duration_ms: int):
    """Refund vocal quota seconds on processing failure."""
    refund_s = max(1, duration_ms // 1000)
    conn = _get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE "UserVocalQuota"
                SET "freeSecondsUsed" = GREATEST(0, "freeSecondsUsed" - %s),
                    "updatedAt" = %s
                WHERE "userId" = %s
                """,
                (refund_s, datetime.now(timezone.utc), user_id),
            )
        conn.commit()
        logger.info("Refunded %ds quota for user %s", refund_s, user_id)
    finally:
        conn.close()


def _award_xp(user_id: str, xp: int):
    """Add XP to user record."""
    conn = _get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE "User"
                SET xp = xp + %s,
                    "updatedAt" = %s
                WHERE id = %s
                """,
                (xp, datetime.now(timezone.utc), user_id),
            )
        conn.commit()
    finally:
        conn.close()


def _get_reference_features_url(ref_id: str) -> Optional[str]:
    """Fetch the featuresFileUrl for a ReferenceVocal."""
    conn = _get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT "featuresFileUrl" FROM "ReferenceVocal"
                WHERE id = %s AND status = 'READY'
                """,
                (ref_id,),
            )
            row = cur.fetchone()
            return row[0] if row else None
    finally:
        conn.close()


def _find_reference_for_song(song_id: str, voice_part: str) -> Optional[str]:
    """Find a ReferenceVocal with features for the given song + voice part.

    Prefers READY references, but also returns features from PENDING/PROCESSING
    if available (e.g. from a prior run that populated featuresFileUrl).
    """
    conn = _get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT "featuresFileUrl" FROM "ReferenceVocal"
                WHERE "songId" = %s AND "voicePart" = %s
                  AND "featuresFileUrl" IS NOT NULL
                ORDER BY
                    CASE status WHEN 'READY' THEN 0 ELSE 1 END,
                    "createdAt" DESC
                LIMIT 1
                """,
                (song_id, voice_part),
            )
            row = cur.fetchone()
            return row[0] if row else None
    finally:
        conn.close()


def _get_song_title(song_id: str, conn=None) -> Optional[str]:
    """Fetch song title for coaching context."""
    own_conn = conn is None
    if own_conn:
        conn = _get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT title FROM "Song" WHERE id = %s',
                (song_id,),
            )
            row = cur.fetchone()
            return row[0] if row else None
    finally:
        if own_conn:
            conn.close()


def _auto_create_reference(song_id: str, voice_part: str) -> Optional[dict]:
    """Auto-create a reference vocal from the song's audio tracks.

    Looks up the AudioTrack table for the song, downloads the audio,
    runs Demucs vocal isolation, extracts features, uploads results to S3,
    and creates a ReferenceVocal DB record with status=READY.

    Returns a dict with 'features' and 'referenceVocalId', or None if
    no audio tracks exist for this song.
    """
    conn = _get_db_conn()
    try:
        with conn.cursor() as cur:
            # Prefer matching voice part, fall back to 'full' or 'mix'
            cur.execute(
                '''
                SELECT id, "voicePart", "fileUrl" FROM "AudioTrack"
                WHERE "songId" = %s
                ORDER BY
                    CASE "voicePart"
                        WHEN %s THEN 0
                        WHEN 'full' THEN 1
                        WHEN 'mix' THEN 2
                        ELSE 3
                    END
                LIMIT 1
                ''',
                (song_id, voice_part),
            )
            row = cur.fetchone()
            if not row:
                logger.info("No audio tracks found for song %s", song_id)
                return None
            track_id, track_voice_part, file_url = row
    finally:
        conn.close()

    logger.info(
        "Auto-creating reference from track %s (%s)", track_id, track_voice_part
    )

    # Download the audio track
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        src_path = tmp.name
    _download_url_from_s3(file_url, src_path)

    with open(src_path, "rb") as f:
        audio_bytes = f.read()
    os.unlink(src_path)

    # Run Demucs to isolate vocals
    demucs_result = run_demucs_isolation.remote(audio_bytes, "auto_reference.wav")
    vocal_bytes = demucs_result["vocals"]

    # Extract features
    features = run_feature_extraction.remote(vocal_bytes, "auto_reference_vocal.wav")

    # Upload to S3
    ref_id = str(uuid.uuid4())
    s3_prefix = f"reference-vocals/{song_id}/{voice_part}"

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(vocal_bytes)
        tmp_vocal_path = tmp.name
    try:
        isolated_url = _upload_to_s3(
            tmp_vocal_path,
            f"{s3_prefix}/{ref_id}_isolated.wav",
            content_type="audio/wav",
        )
    finally:
        os.unlink(tmp_vocal_path)

    features_url = _upload_json_to_s3(
        features,
        f"{s3_prefix}/{ref_id}_features.json",
    )

    duration_ms = int(features["duration_s"] * 1000)

    # Create or update ReferenceVocal record (handle duplicate from backfill)
    conn = _get_db_conn()
    try:
        with conn.cursor() as cur:
            now = datetime.now(timezone.utc)
            cur.execute(
                '''
                INSERT INTO "ReferenceVocal" (
                    id, "songId", "voicePart", "sourceTrackId",
                    "isolatedFileUrl", "featuresFileUrl", "durationMs",
                    "demucsModel", status, "createdAt", "updatedAt"
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT ("songId", "voicePart", "sourceTrackId")
                DO UPDATE SET
                    "isolatedFileUrl" = EXCLUDED."isolatedFileUrl",
                    "featuresFileUrl" = EXCLUDED."featuresFileUrl",
                    "durationMs" = EXCLUDED."durationMs",
                    status = 'READY',
                    "updatedAt" = EXCLUDED."updatedAt"
                RETURNING id
                ''',
                (
                    ref_id, song_id, voice_part, track_id,
                    isolated_url, features_url, duration_ms,
                    "htdemucs_ft", "READY", now, now,
                ),
            )
            row = cur.fetchone()
            actual_id = row[0] if row else ref_id
        conn.commit()
    finally:
        conn.close()

    logger.info(
        "Auto-created/updated reference %s for song %s part %s",
        actual_id, song_id, voice_part,
    )
    return {"features": features, "referenceVocalId": actual_id}


# ---------------------------------------------------------------------------
# S3 helpers
# ---------------------------------------------------------------------------


def _get_s3_client():
    """Create a boto3 S3 client from env vars."""
    import boto3

    return boto3.client(
        "s3",
        region_name=os.environ.get("AWS_REGION", "eu-west-1"),
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )


def _convert_to_wav(audio_bytes: bytes) -> bytes:
    """Convert any audio format (webm, opus, mp3, etc.) to WAV using ffmpeg.

    ffmpeg is much faster than librosa for simple format conversion
    (no Python-level decoding/resampling needed).
    """
    import subprocess

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_in:
        tmp_in.write(audio_bytes)
        tmp_in_path = tmp_in.name

    tmp_out_path = tmp_in_path.replace(".webm", ".wav")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_in_path,
             "-ar", "44100", "-ac", "1", "-acodec", "pcm_s16le", tmp_out_path],
            check=True, capture_output=True, timeout=30,
        )
        with open(tmp_out_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(tmp_in_path):
            os.unlink(tmp_in_path)
        if os.path.exists(tmp_out_path):
            os.unlink(tmp_out_path)


def _download_from_s3(s3_key: str, local_path: str):
    """Download an object from S3 to a local path."""
    bucket = os.environ["AWS_S3_BUCKET"]
    s3 = _get_s3_client()
    logger.info("Downloading s3://%s/%s -> %s", bucket, s3_key, local_path)
    s3.download_file(bucket, s3_key, local_path)


def _download_url_from_s3(url: str, local_path: str):
    """Download a file given its full S3 URL or just the key."""
    # Handle both https://bucket.s3.region.amazonaws.com/key and bare keys
    if url.startswith("http"):
        # Extract key from URL
        from urllib.parse import urlparse

        parsed = urlparse(url)
        s3_key = parsed.path.lstrip("/")
    else:
        s3_key = url
    _download_from_s3(s3_key, local_path)


def _upload_to_s3(local_path: str, s3_key: str, content_type: str = "application/octet-stream") -> str:
    """Upload a local file to S3. Returns the S3 URL."""
    bucket = os.environ["AWS_S3_BUCKET"]
    region = os.environ.get("AWS_REGION", "eu-west-1")
    s3 = _get_s3_client()
    logger.info("Uploading %s -> s3://%s/%s", local_path, bucket, s3_key)
    s3.upload_file(
        local_path,
        bucket,
        s3_key,
        ExtraArgs={"ContentType": content_type},
    )
    return f"https://{bucket}.s3.{region}.amazonaws.com/{s3_key}"


def _upload_json_to_s3(data: dict, s3_key: str) -> str:
    """Serialise a dict to JSON and upload to S3. Returns the S3 URL."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        tmp_path = f.name
    try:
        return _upload_to_s3(tmp_path, s3_key, content_type="application/json")
    finally:
        os.unlink(tmp_path)


def _download_json_from_s3(url_or_key: str) -> dict:
    """Download and parse a JSON file from S3."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f:
        tmp_path = f.name
    try:
        _download_url_from_s3(url_or_key, tmp_path)
        with open(tmp_path, "r") as f:
            return json.load(f)
    finally:
        os.unlink(tmp_path)


# ---------------------------------------------------------------------------
# XP calculation
# ---------------------------------------------------------------------------


def _compute_xp(overall_score: float) -> int:
    """Compute XP reward based on overall score."""
    if overall_score >= 90:
        return 50
    elif overall_score >= 75:
        return 35
    elif overall_score >= 60:
        return 25
    elif overall_score >= 40:
        return 15
    else:
        return 10


# ---------------------------------------------------------------------------
# GPU function: Demucs vocal isolation
# ---------------------------------------------------------------------------


@app.function(gpu="A10G", timeout=600)
def run_demucs_isolation(audio_bytes: bytes, filename: str) -> dict:
    """Run Demucs on GPU to isolate vocals.

    Returns dict with 'vocals' (bytes) and 'accompaniment' (bytes or None).
    """
    from processing import isolate_vocals

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, filename)
        with open(input_path, "wb") as f:
            f.write(audio_bytes)

        output_dir = os.path.join(tmpdir, "output")
        os.makedirs(output_dir, exist_ok=True)

        vocal_path, accompaniment_path = isolate_vocals(input_path, output_dir)

        with open(vocal_path, "rb") as f:
            vocal_bytes = f.read()

        accompaniment_bytes = None
        if accompaniment_path and os.path.isfile(accompaniment_path):
            with open(accompaniment_path, "rb") as f:
                accompaniment_bytes = f.read()

        return {"vocals": vocal_bytes, "accompaniment": accompaniment_bytes}


# ---------------------------------------------------------------------------
# CPU function: Feature extraction
# ---------------------------------------------------------------------------


@app.function(timeout=300)
def run_feature_extraction(audio_bytes: bytes, filename: str) -> dict:
    """Extract pitch, onset, and energy features from audio bytes."""
    return _extract_features_local(audio_bytes, filename)


def _extract_features_local(audio_bytes: bytes, filename: str) -> dict:
    """Extract features in-process (no container spawn overhead)."""
    from processing import extract_features

    with tempfile.NamedTemporaryFile(
        suffix=os.path.splitext(filename)[1], delete=False
    ) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        return extract_features(tmp_path)
    finally:
        os.unlink(tmp_path)


def _score_and_coach_local(
    user_features: dict,
    ref_features: dict | None,
    voice_part: str,
    song_title: str | None = None,
    scoring_level: str = "choir",
) -> dict:
    """Run scoring + coaching in-process (no container spawn overhead)."""
    from processing import align_features
    from scoring import score_recording, score_standalone
    from coaching import generate_coaching_tips

    t0 = time.time()
    if ref_features is not None:
        alignment = align_features(user_features, ref_features)
        logger.info("[PROFILE] align: %.1fs", time.time() - t0)

        t1 = time.time()
        scores = score_recording(user_features, ref_features, alignment, scoring_level=scoring_level)
        logger.info("[PROFILE] score: %.1fs", time.time() - t1)
    else:
        logger.info("No reference available, running standalone analysis")
        scores = score_standalone(user_features)
        logger.info("[PROFILE] standalone_score: %.1fs", time.time() - t0)

    # Coaching tips removed from UI — skip Anthropic API call entirely
    coaching_tips: list[str] = []
    logger.info("[PROFILE] coaching: skipped (tips not displayed)")

    return {"scores": scores, "coachingTips": coaching_tips}


# ---------------------------------------------------------------------------
# CPU function: Scoring + coaching pipeline (kept for backward compat)
# ---------------------------------------------------------------------------


@app.function(timeout=300)
def run_scoring_and_coaching(
    user_features: dict,
    ref_features: dict,
    voice_part: str,
    song_title: Optional[str] = None,
) -> dict:
    """Align, score, and generate coaching tips. Returns combined results."""
    import time as _time
    from processing import align_features
    from scoring import score_recording
    from coaching import generate_coaching_tips

    t0 = _time.time()
    alignment = align_features(user_features, ref_features)
    logger.info("[PROFILE] align: %.1fs", _time.time() - t0)

    t1 = _time.time()
    scores = score_recording(user_features, ref_features, alignment)
    logger.info("[PROFILE] score: %.1fs", _time.time() - t1)

    t1 = _time.time()
    try:
        coaching_tips = generate_coaching_tips(
            scores=scores,
            problem_areas=scores.get("problemAreas", []),
            voice_part=voice_part,
            song_title=song_title,
        )
    except Exception as exc:
        # Fallback: don't let coaching failure kill the whole pipeline
        logger.error("Coaching tips failed: %s — using defaults", exc)
        coaching_tips = [
            "נסה לשמור על יציבות בגובה הצליל לאורך כל הביצוע.",
            "שים לב לתזמון: הקפד להיכנס יחד עם ההפניה.",
            "עבוד על דינמיקה: תנודות בעוצמה חשובות להבעה מוזיקלית.",
        ]
    logger.info("[PROFILE] coaching: %.1fs", _time.time() - t1)

    return {
        "scores": scores,
        "coachingTips": coaching_tips,
    }


@app.function(timeout=300)
def run_standalone_scoring_and_coaching(
    user_features: dict,
    voice_part: str,
    song_title: Optional[str] = None,
) -> dict:
    """Score a recording without reference (standalone analysis)."""
    from scoring import score_standalone
    from coaching import generate_coaching_tips

    scores = score_standalone(user_features)
    try:
        coaching_tips = generate_coaching_tips(
            scores=scores,
            problem_areas=scores.get("problemAreas", []),
            voice_part=voice_part,
            song_title=song_title,
        )
    except Exception as exc:
        logger.error("Coaching tips failed: %s — using defaults", exc)
        coaching_tips = [
            "נסה לשמור על יציבות בגובה הצליל לאורך כל הביצוע.",
            "שים לב לתזמון: הקפד להיכנס יחד עם ההפניה.",
            "עבוד על דינמיקה: תנודות בעוצמה חשובות להבעה מוזיקלית.",
        ]
    return {"scores": scores, "coachingTips": coaching_tips}


# ---------------------------------------------------------------------------
# FastAPI endpoints
# ---------------------------------------------------------------------------


@web_app.get("/api/v1/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "choirmind-vocal-service",
        "version": "2.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@web_app.post("/api/v1/process-vocal-analysis")
async def process_vocal_analysis(req: ProcessVocalRequest):
    """Main vocal analysis endpoint.

    Pipeline:
        1. Update job -> PROCESSING
        2. Download recording from S3
        3. If NOT headphones: Demucs vocal isolation (GPU)
        4. Extract features (pitch, onsets, energy)
        5. Load reference features
        6. DTW alignment + scoring
        7. Claude Haiku coaching tips (Hebrew)
        8. Create VocalPracticeSession in DB
        9. Update job -> COMPLETED
        On error: update job -> FAILED, refund quota
    """
    logger.info(
        "process-vocal-analysis: job=%s user=%s song=%s part=%s headphones=%s",
        req.jobId,
        req.userId,
        req.songId,
        req.voicePart,
        req.useHeadphones,
    )

    try:
        t0 = time.time()
        timings: dict[str, float] = {}

        # Shared DB connection for the pipeline (avoids reconnecting per stage)
        db = _get_db_conn()

        # 1. Mark job as PROCESSING + set initial stage in one DB call
        with db.cursor() as cur:
            cur.execute(
                """UPDATE "VocalAnalysisJob"
                   SET status = 'PROCESSING', stage = 'downloading',
                       "startedAt" = NOW(), attempts = attempts + 1
                   WHERE id = %s""",
                (req.jobId,),
            )
        db.commit()

        # 2. Download recording from S3
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            recording_path = tmp.name
        _download_from_s3(req.recordingS3Key, recording_path)

        with open(recording_path, "rb") as f:
            recording_bytes = f.read()
        os.unlink(recording_path)
        timings["download"] = time.time() - t0
        logger.info("[PROFILE] download: %.1fs (%.1fMB)", timings["download"], len(recording_bytes) / 1e6)

        # 3-5: Isolate/convert + extract features + load reference IN PARALLEL
        # Reference loading is independent of isolation/extraction, so we run
        # them concurrently to save time.
        from concurrent.futures import ThreadPoolExecutor, Future

        def _isolate_and_extract():
            """Steps 3+4: isolate vocals (or convert) then extract features."""
            t1 = time.time()
            if not req.useHeadphones:
                _update_job_stage(req.jobId, "isolating")
                logger.info("Running Demucs vocal isolation (no headphones)")
                demucs_result = run_demucs_isolation.remote(
                    recording_bytes, "recording.wav"
                )
                vb = demucs_result["vocals"]
            else:
                _update_job_stage(req.jobId, "converting")
                logger.info("Headphones used -- skipping vocal isolation, converting to WAV")
                vb = _convert_to_wav(recording_bytes)
            timings["isolate"] = time.time() - t1
            logger.info("[PROFILE] isolate: %.1fs", timings["isolate"])

            # Upload isolated vocal to S3 for frontend playback
            t2 = time.time()
            isolated_s3_key = (
                f"vocal-recordings/{req.userId}/{req.songId}/"
                f"{req.jobId}_isolated.wav"
            )
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(vb)
                tmp_vocal_path = tmp.name
            try:
                iso_url = _upload_to_s3(
                    tmp_vocal_path,
                    isolated_s3_key,
                    content_type="audio/wav",
                )
            finally:
                os.unlink(tmp_vocal_path)
            timings["upload_isolated"] = time.time() - t2
            logger.info("[PROFILE] upload_isolated: %.1fs", timings["upload_isolated"])

            # Extract features
            t3 = time.time()
            _update_job_stage(req.jobId, "extracting")
            feats = _extract_features_local(vb, "vocal.wav")
            timings["extract"] = time.time() - t3
            logger.info("[PROFILE] extract_features: %.1fs", timings["extract"])

            return vb, iso_url, feats

        def _load_reference():
            """Step 5: load reference features (or auto-create)."""
            t1 = time.time()
            ref_feats = None
            ref_id = req.referenceVocalId

            if ref_id:
                features_url = _get_reference_features_url(ref_id)
                if features_url:
                    ref_feats = _download_json_from_s3(features_url)

            if ref_feats is None:
                features_url = _find_reference_for_song(req.songId, req.voicePart)
                if features_url:
                    ref_feats = _download_json_from_s3(features_url)

            if ref_feats is None:
                logger.info(
                    "No reference found, attempting auto-creation from audio tracks"
                )
                ref_result = _auto_create_reference(req.songId, req.voicePart)
                if ref_result:
                    ref_feats = ref_result["features"]
                    ref_id = ref_result["referenceVocalId"]

            timings["load_ref"] = time.time() - t1
            logger.info("[PROFILE] load_reference: %.1fs (found=%s)", timings["load_ref"], ref_feats is not None)
            return ref_feats, ref_id

        # Run both branches in parallel
        with ThreadPoolExecutor(max_workers=2) as pool:
            future_isolate: Future = pool.submit(_isolate_and_extract)
            future_ref: Future = pool.submit(_load_reference)

            vocal_bytes, isolated_vocal_url, user_features = future_isolate.result()
            ref_features, reference_vocal_id = future_ref.result()

        # 6 + 7. Score and generate coaching tips (in-process, no .remote())
        t1 = time.time()
        _update_job_stage(req.jobId, "scoring", conn=db)
        song_title = _get_song_title(req.songId, conn=db)

        result = _score_and_coach_local(
            user_features, ref_features, req.voicePart, song_title,
            scoring_level=req.scoringLevel,
        )
        scores = result["scores"]
        coaching_tips = result["coachingTips"]
        timings["score_coach"] = time.time() - t1
        logger.info("[PROFILE] score+coaching: %.1fs", timings["score_coach"])

        # 8. Compute XP and create VocalPracticeSession
        t1 = time.time()
        _update_job_stage(req.jobId, "saving", conn=db)
        xp_earned = _compute_xp(scores["overallScore"])

        # Construct original recording URL for direct playback (no conversion)
        _bucket = os.environ["AWS_S3_BUCKET"]
        _region = os.environ.get("AWS_REGION", "eu-west-1")
        original_recording_url = f"https://{_bucket}.s3.{_region}.amazonaws.com/{req.recordingS3Key}"

        session_id = _create_vocal_practice_session(
            user_id=req.userId,
            song_id=req.songId,
            voice_part=req.voicePart,
            recording_s3_key=req.recordingS3Key,
            reference_vocal_id=reference_vocal_id,
            scores=scores,
            coaching_tips=coaching_tips,
            duration_ms=req.recordingDurationMs,
            xp_earned=xp_earned,
            isolated_vocal_url=isolated_vocal_url,
            original_recording_url=original_recording_url,
        )
        timings["save"] = time.time() - t1

        # XP awarding is handled by the Next.js side when polling detects COMPLETED

        # 9. Update job to COMPLETED (reuse shared connection)
        now = datetime.now(timezone.utc)
        with db.cursor() as cur:
            cur.execute(
                """UPDATE "VocalAnalysisJob"
                   SET status = 'COMPLETED', "completedAt" = %s,
                       "practiceSessionId" = %s
                   WHERE id = %s""",
                (now, session_id, req.jobId),
            )
        db.commit()
        db.close()

        total_time = time.time() - t0
        logger.info(
            "[PROFILE] Job %s TOTAL: %.1fs | download=%.1f isolate=%.1f upload=%.1f extract=%.1f ref=%.1f score=%.1f save=%.1f | score=%.1f xp=%d",
            req.jobId, total_time,
            timings.get("download", 0), timings.get("isolate", 0),
            timings.get("upload_isolated", 0), timings.get("extract", 0),
            timings.get("load_ref", 0), timings.get("score_coach", 0),
            timings.get("save", 0),
            scores["overallScore"], xp_earned,
        )

        return {
            "success": True,
            "jobId": req.jobId,
            "practiceSessionId": session_id,
            "overallScore": scores["overallScore"],
            "pitchScore": scores["pitchScore"],
            "timingScore": scores["timingScore"],
            "dynamicsScore": scores["dynamicsScore"],
            "coachingTips": coaching_tips,
            "xpEarned": xp_earned,
            "isolatedVocalUrl": isolated_vocal_url,
            "timings": timings,
        }

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.error("Job %s failed: %s\n%s", req.jobId, error_msg, traceback.format_exc())

        try:
            if 'db' in locals() and db and not db.closed:
                db.close()
        except Exception:
            pass

        try:
            _update_job_status(req.jobId, "FAILED", error_message=error_msg[:500])
            _refund_quota(req.userId, req.recordingDurationMs)
        except Exception as inner_exc:
            logger.error("Failed to update job status / refund: %s", inner_exc)

        raise HTTPException(status_code=500, detail=error_msg[:500])


@web_app.post("/api/v1/prepare-reference")
async def prepare_reference(req: PrepareReferenceRequest):
    """Prepare a reference vocal: isolate vocals + extract features.

    Pipeline:
        1. Update reference -> PROCESSING
        2. Download audio from S3
        3. Run Demucs to isolate vocals (always, GPU)
        4. Extract features
        5. Upload isolated WAV and features JSON to S3
        6. Update reference -> READY
        On error: update reference -> FAILED
    """
    logger.info(
        "prepare-reference: ref=%s song=%s part=%s",
        req.referenceVocalId,
        req.songId,
        req.voicePart,
    )

    try:
        # 1. Mark as PROCESSING
        _update_reference_status(req.referenceVocalId, "PROCESSING")

        # 2. Download source audio
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            src_path = tmp.name
        _download_url_from_s3(req.audioFileUrl, src_path)

        with open(src_path, "rb") as f:
            audio_bytes = f.read()
        os.unlink(src_path)

        # 3. Demucs vocal isolation (always for references)
        demucs_result = run_demucs_isolation.remote(audio_bytes, "reference.wav")
        vocal_bytes = demucs_result["vocals"]
        accompaniment_bytes = demucs_result.get("accompaniment")

        # 4. Extract features from isolated vocals
        features = run_feature_extraction.remote(vocal_bytes, "reference_vocal.wav")

        # 5. Upload results to S3
        s3_prefix = f"reference-vocals/{req.songId}/{req.voicePart}"

        # Upload isolated WAV
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(vocal_bytes)
            tmp_vocal_path = tmp.name

        try:
            isolated_url = _upload_to_s3(
                tmp_vocal_path,
                f"{s3_prefix}/{req.referenceVocalId}_isolated.wav",
                content_type="audio/wav",
            )
        finally:
            os.unlink(tmp_vocal_path)

        # Upload accompaniment WAV (music-only / karaoke track)
        accompaniment_url = None
        if accompaniment_bytes:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(accompaniment_bytes)
                tmp_acc_path = tmp.name
            try:
                accompaniment_url = _upload_to_s3(
                    tmp_acc_path,
                    f"{s3_prefix}/{req.referenceVocalId}_accompaniment.wav",
                    content_type="audio/wav",
                )
            finally:
                os.unlink(tmp_acc_path)
            logger.info("Uploaded accompaniment: %s", accompaniment_url)

        # Upload features JSON
        features_url = _upload_json_to_s3(
            features,
            f"{s3_prefix}/{req.referenceVocalId}_features.json",
        )

        # Duration in ms
        duration_ms = int(features["duration_s"] * 1000)

        # 6. Update reference to READY
        _update_reference_status(
            req.referenceVocalId,
            "READY",
            isolated_url=isolated_url,
            features_url=features_url,
            duration_ms=duration_ms,
            accompaniment_url=accompaniment_url,
        )

        logger.info(
            "Reference %s ready: duration=%dms",
            req.referenceVocalId,
            duration_ms,
        )

        return {
            "success": True,
            "referenceVocalId": req.referenceVocalId,
            "isolatedFileUrl": isolated_url,
            "featuresFileUrl": features_url,
            "accompanimentFileUrl": accompaniment_url,
            "durationMs": duration_ms,
        }

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.error(
            "Reference %s failed: %s\n%s",
            req.referenceVocalId,
            error_msg,
            traceback.format_exc(),
        )

        try:
            _update_reference_status(
                req.referenceVocalId,
                "FAILED",
                error_message=error_msg[:500],
            )
        except Exception as inner_exc:
            logger.error("Failed to update reference status: %s", inner_exc)

        raise HTTPException(status_code=500, detail=error_msg[:500])


# ---------------------------------------------------------------------------
# YouTube extraction endpoint
# ---------------------------------------------------------------------------


@web_app.post("/api/v1/youtube-extract")
async def youtube_extract(req: YouTubeExtractRequest):
    """Download audio from YouTube URL and upload to S3.

    Uses yt-dlp to download best audio, converts to WAV,
    uploads to S3, returns the S3 key and duration.
    """
    import subprocess

    logger.info("youtube-extract: url=%s", req.youtube_url)

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            output_template = os.path.join(tmpdir, "audio.%(ext)s")

            # Download best audio with yt-dlp
            result = subprocess.run(
                [
                    "yt-dlp",
                    "--no-playlist",
                    "-x",
                    "--audio-format", "wav",
                    "--audio-quality", "0",
                    "-o", output_template,
                    req.youtube_url,
                ],
                capture_output=True,
                text=True,
                timeout=120,
            )

            if result.returncode != 0:
                logger.error("yt-dlp failed: %s", result.stderr)
                raise HTTPException(status_code=422, detail=f"yt-dlp failed: {result.stderr[:200]}")

            # Find the output file
            wav_path = os.path.join(tmpdir, "audio.wav")
            if not os.path.exists(wav_path):
                # yt-dlp may have created a different extension
                for f in os.listdir(tmpdir):
                    if f.startswith("audio."):
                        # Convert to wav if needed
                        src = os.path.join(tmpdir, f)
                        if not f.endswith(".wav"):
                            subprocess.run(
                                ["ffmpeg", "-y", "-i", src, "-ar", "44100", "-ac", "2", wav_path],
                                check=True, capture_output=True, timeout=60,
                            )
                        else:
                            wav_path = src
                        break

            if not os.path.exists(wav_path):
                raise HTTPException(status_code=500, detail="Failed to extract audio")

            # Get duration
            import soundfile as sf
            info = sf.info(wav_path)
            duration_ms = int(info.duration * 1000)

            # Upload to S3
            s3_key = f"youtube-imports/{uuid.uuid4()}.wav"
            audio_url = _upload_to_s3(wav_path, s3_key, content_type="audio/wav")

            logger.info("youtube-extract: uploaded %s (%dms)", s3_key, duration_ms)

            return {
                "audio_s3_key": s3_key,
                "audio_url": audio_url,
                "duration_ms": duration_ms,
            }

    except HTTPException:
        raise
    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.error("youtube-extract failed: %s", error_msg)
        raise HTTPException(status_code=500, detail=error_msg[:300])


# ---------------------------------------------------------------------------
# Stem separation endpoint
# ---------------------------------------------------------------------------


@web_app.post("/api/v1/separate-stems")
async def separate_stems(req: SeparateStemsRequest):
    """Separate audio into vocals and accompaniment using Demucs.

    Downloads from S3, runs Demucs, uploads results back to S3.
    """
    logger.info("separate-stems: s3_key=%s", req.s3_key)

    try:
        # Download audio from S3
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            src_path = tmp.name
        _download_from_s3(req.s3_key, src_path)

        with open(src_path, "rb") as f:
            audio_bytes = f.read()
        os.unlink(src_path)

        # Run Demucs vocal isolation (GPU)
        demucs_result = run_demucs_isolation.remote(audio_bytes, "separate.wav")
        vocal_bytes = demucs_result["vocals"]
        accompaniment_bytes = demucs_result.get("accompaniment")

        base_key = req.s3_key.rsplit(".", 1)[0]

        # Upload vocals
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(vocal_bytes)
            tmp_vocal_path = tmp.name
        try:
            vocals_key = f"{base_key}_vocals.wav"
            vocals_url = _upload_to_s3(tmp_vocal_path, vocals_key, content_type="audio/wav")
        finally:
            os.unlink(tmp_vocal_path)

        # Upload accompaniment
        accompaniment_url = None
        accompaniment_key = None
        if accompaniment_bytes:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(accompaniment_bytes)
                tmp_acc_path = tmp.name
            try:
                accompaniment_key = f"{base_key}_accompaniment.wav"
                accompaniment_url = _upload_to_s3(tmp_acc_path, accompaniment_key, content_type="audio/wav")
            finally:
                os.unlink(tmp_acc_path)

        # Get duration
        import soundfile as sf
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(vocal_bytes)
            tmp_dur_path = tmp.name
        try:
            info = sf.info(tmp_dur_path)
            duration_ms = int(info.duration * 1000)
        finally:
            os.unlink(tmp_dur_path)

        logger.info("separate-stems: done, vocals=%s, accompaniment=%s", vocals_key, accompaniment_key)

        return {
            "vocals_s3_key": vocals_key,
            "vocals_url": vocals_url,
            "accompaniment_s3_key": accompaniment_key,
            "accompaniment_url": accompaniment_url,
            "duration_ms": duration_ms,
        }

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.error("separate-stems failed: %s", error_msg)
        raise HTTPException(status_code=500, detail=error_msg[:300])


# ---------------------------------------------------------------------------
# Modal ASGI entrypoint
# ---------------------------------------------------------------------------


@app.function(timeout=900)
@modal.concurrent(max_inputs=10)
@modal.asgi_app()
def fastapi_app():
    """Mount the FastAPI application as a Modal web endpoint."""
    return web_app
