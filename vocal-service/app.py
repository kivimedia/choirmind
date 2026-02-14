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
        "anthropic",
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
    )
    .env({"TORCHAUDIO_BACKEND": "soundfile"})
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


class PrepareReferenceRequest(BaseModel):
    referenceVocalId: str
    songId: str
    voicePart: str
    sourceTrackId: str
    audioFileUrl: str


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


def _update_reference_status(
    ref_id: str,
    status: str,
    isolated_url: Optional[str] = None,
    features_url: Optional[str] = None,
    duration_ms: Optional[int] = None,
    error_message: Optional[str] = None,
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
                        "updatedAt" = %s
                    WHERE id = %s
                    """,
                    (status, isolated_url, features_url, duration_ms, now, ref_id),
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
) -> str:
    """Insert a VocalPracticeSession row and return its id.

    When *isolated_vocal_url* is provided it is embedded in the
    ``sectionScores`` JSON column as a wrapper object so the frontend
    can retrieve the playback URL:

        {"sections": [...], "isolatedVocalUrl": "https://..."}
    """
    session_id = str(uuid.uuid4())

    # Build the sectionScores JSON, optionally wrapping with isolatedVocalUrl
    raw_sections = scores.get("sectionScores", [])
    if isolated_vocal_url:
        section_scores_json = json.dumps(
            {"sections": raw_sections, "isolatedVocalUrl": isolated_vocal_url},
            ensure_ascii=False,
        )
    else:
        section_scores_json = json.dumps(raw_sections, ensure_ascii=False)

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
    """Find a READY ReferenceVocal for the given song + voice part."""
    conn = _get_db_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT "featuresFileUrl" FROM "ReferenceVocal"
                WHERE "songId" = %s AND "voicePart" = %s AND status = 'READY'
                ORDER BY "createdAt" DESC
                LIMIT 1
                """,
                (song_id, voice_part),
            )
            row = cur.fetchone()
            return row[0] if row else None
    finally:
        conn.close()


def _get_song_title(song_id: str) -> Optional[str]:
    """Fetch song title for coaching context."""
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
    vocal_bytes = run_demucs_isolation.remote(audio_bytes, "auto_reference.wav")

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

    # Create ReferenceVocal record
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
                ''',
                (
                    ref_id, song_id, voice_part, track_id,
                    isolated_url, features_url, duration_ms,
                    "htdemucs_ft", "READY", now, now,
                ),
            )
        conn.commit()
    finally:
        conn.close()

    logger.info(
        "Auto-created reference %s for song %s part %s",
        ref_id, song_id, voice_part,
    )
    return {"features": features, "referenceVocalId": ref_id}


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
def run_demucs_isolation(audio_bytes: bytes, filename: str) -> bytes:
    """Run Demucs on GPU to isolate vocals. Returns WAV bytes of the vocal track."""
    from processing import isolate_vocals

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, filename)
        with open(input_path, "wb") as f:
            f.write(audio_bytes)

        output_dir = os.path.join(tmpdir, "output")
        os.makedirs(output_dir, exist_ok=True)

        vocal_path = isolate_vocals(input_path, output_dir)

        with open(vocal_path, "rb") as f:
            return f.read()


# ---------------------------------------------------------------------------
# CPU function: Feature extraction
# ---------------------------------------------------------------------------


@app.function(timeout=300)
def run_feature_extraction(audio_bytes: bytes, filename: str) -> dict:
    """Extract pitch, onset, and energy features from audio bytes."""
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


# ---------------------------------------------------------------------------
# CPU function: Scoring + coaching pipeline
# ---------------------------------------------------------------------------


@app.function(timeout=120)
def run_scoring_and_coaching(
    user_features: dict,
    ref_features: dict,
    voice_part: str,
    song_title: Optional[str] = None,
) -> dict:
    """Align, score, and generate coaching tips. Returns combined results."""
    from processing import align_features
    from scoring import score_recording
    from coaching import generate_coaching_tips

    alignment = align_features(user_features, ref_features)
    scores = score_recording(user_features, ref_features, alignment)
    coaching_tips = generate_coaching_tips(
        scores=scores,
        problem_areas=scores.get("problemAreas", []),
        voice_part=voice_part,
        song_title=song_title,
    )

    return {
        "scores": scores,
        "coachingTips": coaching_tips,
    }


@app.function(timeout=120)
def run_standalone_scoring_and_coaching(
    user_features: dict,
    voice_part: str,
    song_title: Optional[str] = None,
) -> dict:
    """Score a recording without reference (standalone analysis)."""
    from scoring import score_standalone
    from coaching import generate_coaching_tips

    scores = score_standalone(user_features)
    coaching_tips = generate_coaching_tips(
        scores=scores,
        problem_areas=scores.get("problemAreas", []),
        voice_part=voice_part,
        song_title=song_title,
    )
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
        "version": "1.0.0",
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
        # 1. Mark job as PROCESSING
        _update_job_status(req.jobId, "PROCESSING")

        # 2. Download recording from S3
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            recording_path = tmp.name
        _download_from_s3(req.recordingS3Key, recording_path)

        with open(recording_path, "rb") as f:
            recording_bytes = f.read()
        os.unlink(recording_path)

        # 3. Vocal isolation if needed
        if not req.useHeadphones:
            logger.info("Running Demucs vocal isolation (no headphones)")
            vocal_bytes = run_demucs_isolation.remote(
                recording_bytes, "recording.wav"
            )
        else:
            logger.info("Headphones used -- skipping vocal isolation")
            vocal_bytes = recording_bytes

        # 3b. Upload isolated vocal to S3 for frontend playback
        isolated_s3_key = (
            f"vocal-recordings/{req.userId}/{req.songId}/"
            f"{req.jobId}_isolated.wav"
        )
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(vocal_bytes)
            tmp_vocal_path = tmp.name
        try:
            isolated_vocal_url = _upload_to_s3(
                tmp_vocal_path,
                isolated_s3_key,
                content_type="audio/wav",
            )
        finally:
            os.unlink(tmp_vocal_path)
        logger.info("Uploaded isolated vocal: %s", isolated_s3_key)

        # 4. Extract user features
        user_features = run_feature_extraction.remote(vocal_bytes, "vocal.wav")

        # 5. Load reference features (or auto-create)
        ref_features = None
        reference_vocal_id = req.referenceVocalId

        if reference_vocal_id:
            features_url = _get_reference_features_url(reference_vocal_id)
            if features_url:
                ref_features = _download_json_from_s3(features_url)

        if ref_features is None:
            features_url = _find_reference_for_song(req.songId, req.voicePart)
            if features_url:
                ref_features = _download_json_from_s3(features_url)

        if ref_features is None:
            # Try to auto-create reference from song's audio tracks
            logger.info(
                "No reference found, attempting auto-creation from audio tracks"
            )
            ref_result = _auto_create_reference(req.songId, req.voicePart)
            if ref_result:
                ref_features = ref_result["features"]
                reference_vocal_id = ref_result["referenceVocalId"]

        # 6 + 7. Score and generate coaching tips
        song_title = _get_song_title(req.songId)

        if ref_features is not None:
            # Normal comparison against reference
            result = run_scoring_and_coaching.remote(
                user_features, ref_features, req.voicePart, song_title
            )
        else:
            # No reference available at all -- do standalone analysis
            logger.info("No reference available, running standalone analysis")
            result = run_standalone_scoring_and_coaching.remote(
                user_features, req.voicePart, song_title
            )

        scores = result["scores"]
        coaching_tips = result["coachingTips"]

        # 8. Compute XP and create VocalPracticeSession
        xp_earned = _compute_xp(scores["overallScore"])

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
        )

        # XP awarding is handled by the Next.js side when polling detects COMPLETED

        # 9. Update job to COMPLETED
        _update_job_status(req.jobId, "COMPLETED", practice_session_id=session_id)

        logger.info(
            "Job %s completed: session=%s score=%.1f xp=%d",
            req.jobId,
            session_id,
            scores["overallScore"],
            xp_earned,
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
        }

    except Exception as exc:
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.error("Job %s failed: %s\n%s", req.jobId, error_msg, traceback.format_exc())

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
        vocal_bytes = run_demucs_isolation.remote(audio_bytes, "reference.wav")

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
# Modal ASGI entrypoint
# ---------------------------------------------------------------------------


@app.function(timeout=900)
@modal.concurrent(max_inputs=10)
@modal.asgi_app()
def fastapi_app():
    """Mount the FastAPI application as a Modal web endpoint."""
    return web_app
