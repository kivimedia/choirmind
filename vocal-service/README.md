# Choirmind Vocal Analysis Service

A GPU-accelerated vocal analysis microservice running on [Modal](https://modal.com).

## Architecture

| Module | Purpose |
|---|---|
| `app.py` | Modal app with FastAPI endpoints |
| `processing.py` | Demucs vocal isolation, feature extraction, DTW alignment |
| `scoring.py` | Pitch / timing / dynamics scoring engine |
| `coaching.py` | Claude Haiku coaching tips generation (Hebrew) |

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/process-vocal-analysis` | Analyse a user recording against a reference |
| `POST` | `/api/v1/prepare-reference` | Prepare a reference vocal (isolate + extract features) |
| `GET`  | `/api/v1/health` | Health check |

## Setup

### 1. Install Modal CLI

```bash
pip install modal
modal token new
```

### 2. Set secrets in Modal dashboard

Create a secret group called **choirmind-vocal** with:

| Key | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AWS_ACCESS_KEY_ID` | AWS key for S3 |
| `AWS_SECRET_ACCESS_KEY` | AWS secret for S3 |
| `AWS_REGION` | AWS region (default: `eu-west-1`) |
| `AWS_S3_BUCKET` | S3 bucket name |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |

### 3. Deploy

```bash
cd vocal-service
modal deploy app.py
```

### 4. Local development

```bash
modal serve app.py
```

## Processing pipeline

1. Download user recording from S3
2. If no headphones: run Demucs vocal isolation (GPU, A10G)
3. Extract features: pitch (Parselmouth), onsets + energy (librosa)
4. Load reference features from S3
5. DTW alignment (FastDTW)
6. Score: pitch 50%, timing 30%, dynamics 20%
7. Generate coaching tips via Claude Haiku (Hebrew)
8. Save VocalPracticeSession to PostgreSQL
9. Update job status to COMPLETED

## Models and GPU

- Demucs `htdemucs_ft` runs on NVIDIA A10G via Modal
- CPU-only tasks (scoring, coaching) run without GPU allocation
