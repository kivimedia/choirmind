import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'crypto'
import { config } from 'dotenv'

config()

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})
const prisma = new PrismaClient()
const BUCKET = process.env.AWS_S3_BUCKET
const REGION = process.env.AWS_REGION || 'us-east-1'

async function migrate() {
  const tracks = await prisma.audioTrack.findMany({
    where: { NOT: { fileUrl: { contains: 'amazonaws.com' } } },
    select: { id: true, songId: true, voicePart: true, fileUrl: true },
  })

  console.log(`Found ${tracks.length} tracks to migrate`)
  let migrated = 0
  let failed = 0

  for (const track of tracks) {
    try {
      process.stdout.write(`[${migrated + failed + 1}/${tracks.length}] ${track.voicePart} ... `)

      const res = await fetch(track.fileUrl, { signal: AbortSignal.timeout(30000) })
      if (!res.ok) {
        console.log(`DOWNLOAD FAILED (${res.status})`)
        failed++
        continue
      }

      const buf = Buffer.from(await res.arrayBuffer())

      // Determine extension from URL
      const urlPath = new URL(track.fileUrl).pathname
      const urlExt = urlPath.split('.').pop()?.toLowerCase()
      const ext = urlExt && ['mp3', 'wav', 'ogg', 'webm', 'm4a'].includes(urlExt) ? urlExt : 'mp3'

      const key = `audio/${track.songId}/${track.voicePart}-${randomUUID()}.${ext}`
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buf,
        ContentType: ext === 'mp3' ? 'audio/mpeg' : `audio/${ext}`,
      }))

      const newUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`

      await prisma.audioTrack.update({
        where: { id: track.id },
        data: { fileUrl: newUrl, sourceUrl: track.fileUrl },
      })

      console.log(`OK (${(buf.length / 1024 / 1024).toFixed(1)} MB)`)
      migrated++
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
      failed++
    }
  }

  console.log(`\nDone: ${migrated} migrated, ${failed} failed`)
  await prisma.$disconnect()
}

migrate().catch((e) => {
  console.error(e)
  process.exit(1)
})
