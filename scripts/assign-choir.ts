import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const choirId = '56f4eea4-618d-4271-9d75-a27edd6a0790'

  const result = await prisma.song.updateMany({
    where: { source: 'mila', choirId: null },
    data: { choirId },
  })

  console.log(`Updated ${result.count} MILA songs → choir ${choirId}`)

  const total = await prisma.song.count({ where: { choirId } })
  console.log(`Total songs in choir: ${total}`)

  await prisma.$disconnect()
}

main()
