"""
Backfill script: fires prepare-reference requests for all PENDING ReferenceVocals.
Uses threading for parallel processing (5 concurrent requests).
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL")
SERVICE_URL = "https://kivimedia--choirmind-vocal-service-fastapi-app.modal.run"
MAX_WORKERS = 4


def get_pending_references():
    """Fetch all PENDING reference vocals with their audio track URLs."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT rv.id, rv."songId", rv."voicePart", rv."sourceTrackId", at."fileUrl"
                FROM "ReferenceVocal" rv
                JOIN "AudioTrack" at ON at.id = rv."sourceTrackId"
                WHERE rv.status = 'PENDING'
                ORDER BY rv."createdAt" ASC
            """)
            rows = cur.fetchall()
            return [
                {
                    "referenceVocalId": r[0],
                    "songId": r[1],
                    "voicePart": r[2],
                    "sourceTrackId": r[3],
                    "audioFileUrl": r[4],
                }
                for r in rows
            ]
    finally:
        conn.close()


def fire_request(idx, total, ref):
    """Send a prepare-reference request to the Modal service."""
    label = f"[{idx+1}/{total}] {ref['voicePart']} song={ref['songId'][:8]}"
    url = f"{SERVICE_URL}/api/v1/prepare-reference"
    data = json.dumps(ref).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            print(f"  OK  {label} -> {result.get('durationMs')}ms", flush=True)
            return True
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        print(f"  FAIL {label} -> HTTP {e.code}: {body}", flush=True)
        return False
    except Exception as e:
        print(f"  FAIL {label} -> {e}", flush=True)
        return False


def main():
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL environment variable not set")
        sys.exit(1)

    refs = get_pending_references()
    total = len(refs)
    print(f"Found {total} PENDING reference vocals to process")
    print(f"Using {MAX_WORKERS} concurrent workers")

    if total == 0:
        print("Nothing to do!")
        return

    success = 0
    failed = 0
    start = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(fire_request, i, total, ref): ref
            for i, ref in enumerate(refs)
        }
        for future in as_completed(futures):
            if future.result():
                success += 1
            else:
                failed += 1

    elapsed = time.time() - start
    print(f"\n{'='*60}")
    print(f"BACKFILL COMPLETE in {elapsed:.0f}s")
    print(f"  {success} succeeded, {failed} failed out of {total}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
