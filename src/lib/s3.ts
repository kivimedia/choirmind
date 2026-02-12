import { S3Client } from '@aws-sdk/client-s3'

const globalForS3 = globalThis as unknown as {
  s3: S3Client | undefined
}

export const s3 = globalForS3.s3 ?? new S3Client({
  region: process.env.AWS_REGION ?? 'eu-west-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },
})

if (process.env.NODE_ENV !== 'production') globalForS3.s3 = s3

export const S3_BUCKET = process.env.AWS_S3_BUCKET ?? ''
