"""
Backfill accompaniment tracks for READY ReferenceVocals that don't have one yet.

Strategy: Download original audio + isolated vocal, subtract vocal from original
using numpy to produce accompaniment, upload to S3, update DB.

No GPU needed — runs purely on CPU.
"""

import io
import os
import sys
import time
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
import psycopg2
import boto3
import soundfile as sf
import librosa

DATABASE_URL = os.environ.get("DATABASE_URL")
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
AWS_S3_BUCKET = os.environ.get("AWS_S3_BUCKET", "choirmind-audio")
MAX_WORKERS = 3


def get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION,
    )


def get_ready_without_accompaniment():
    """Fetch READY references that have isolated vocals but no accompaniment."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT rv.id, rv."songId", rv."voicePart", rv."isolatedFileUrl",
                       at."fileUrl" AS "originalUrl"
                FROM "ReferenceVocal" rv
                JOIN "AudioTrack" at ON at.id = rv."sourceTrackId"
                WHERE rv.status = 'READY'
                  AND rv."isolatedFileUrl" IS NOT NULL
                  AND rv."accompanimentFileUrl" IS NULL
                ORDER BY rv."createdAt" ASC
            """)
            rows = cur.fetchall()
            return [
                {
                    "id": r[0],
                    "songId": r[1],
                    "voicePart": r[2],
                    "isolatedFileUrl": r[3],
                    "originalUrl": r[4],
                }
                for r in rows
            ]
    finally:
        conn.close()


def download_audio(url: str) -> tuple[np.ndarray, int]:
    """Download audio from URL and return (samples, sample_rate)."""
    import urllib.request
    with urllib.request.urlopen(url, timeout=120) as resp:
        data = resp.read()

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(data)
        tmp_path = f.name

    try:
        audio, sr = librosa.load(tmp_path, sr=None, mono=False)
        return audio, sr
    finally:
        os.unlink(tmp_path)


def process_one(idx: int, total: int, ref: dict) -> bool:
    """Create accompaniment for one reference vocal."""
    label = f"[{idx+1}/{total}] {ref['voicePart']} song={ref['songId'][:8]}"
    try:
        # Download original and vocal
        original, sr_orig = download_audio(ref["originalUrl"])
        vocal, sr_vocal = download_audio(ref["isolatedFileUrl"])

        # Ensure same sample rate
        if sr_vocal != sr_orig:
            vocal = librosa.resample(vocal, orig_sr=sr_vocal, target_sr=sr_orig)
            sr_vocal = sr_orig

        # Ensure same shape (mono vs stereo)
        if original.ndim == 1:
            original = original.reshape(1, -1)
        if vocal.ndim == 1:
            vocal = vocal.reshape(1, -1)

        # Match channels
        if original.shape[0] != vocal.shape[0]:
            if original.shape[0] == 1:
                original = np.repeat(original, vocal.shape[0], axis=0)
            else:
                vocal = np.mean(vocal, axis=0, keepdims=True)
                vocal = np.repeat(vocal, original.shape[0], axis=0)

        # Match length
        min_len = min(original.shape[1], vocal.shape[1])
        original = original[:, :min_len]
        vocal = vocal[:, :min_len]

        # Subtract
        accompaniment = original - vocal

        # Normalize to prevent clipping
        peak = np.max(np.abs(accompaniment))
        if peak > 1.0:
            accompaniment = accompaniment / peak

        # Convert to mono if single channel
        if accompaniment.shape[0] == 1:
            accompaniment = accompaniment[0]
        else:
            accompaniment = accompaniment.T  # soundfile expects (samples, channels)

        # Write to buffer
        buf = io.BytesIO()
        sf.write(buf, accompaniment, sr_orig, format="WAV")
        buf.seek(0)

        # Upload to S3
        s3_key = f"reference-vocals/{ref['songId']}/{ref['voicePart']}/{ref['id']}_accompaniment.wav"
        s3 = get_s3_client()
        s3.upload_fileobj(
            buf,
            AWS_S3_BUCKET,
            s3_key,
            ExtraArgs={"ContentType": "audio/wav"},
        )
        s3_url = f"https://{AWS_S3_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"

        # Update DB
        conn = psycopg2.connect(DATABASE_URL)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    'UPDATE "ReferenceVocal" SET "accompanimentFileUrl" = %s WHERE id = %s',
                    (s3_url, ref["id"]),
                )
            conn.commit()
        finally:
            conn.close()

        print(f"  OK   {label}", flush=True)
        return True
    except Exception as e:
        print(f"  FAIL {label} -> {e}", flush=True)
        return False


def main():
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)
    if not AWS_ACCESS_KEY_ID:
        print("ERROR: AWS credentials not set")
        sys.exit(1)

    refs = get_ready_without_accompaniment()
    total = len(refs)
    print(f"Found {total} READY references without accompaniment")
    print(f"Using {MAX_WORKERS} concurrent workers")

    if total == 0:
        print("Nothing to do!")
        return

    success = 0
    failed = 0
    start = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(process_one, i, total, ref): ref
            for i, ref in enumerate(refs)
        }
        for future in as_completed(futures):
            if future.result():
                success += 1
            else:
                failed += 1

    elapsed = time.time() - start
    print(f"\n{'='*60}")
    print(f"ACCOMPANIMENT BACKFILL COMPLETE in {elapsed:.0f}s")
    print(f"  {success} succeeded, {failed} failed out of {total}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
