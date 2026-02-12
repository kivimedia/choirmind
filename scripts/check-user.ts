import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'ravivziv@gmail.com' },
    select: { id: true, role: true, name: true, email: true },
  })
  console.log('User:', user)
  if (user) {
    const memberships = await prisma.choirMember.findMany({
      where: { userId: user.id },
      select: { choirId: true, role: true },
    })
    console.log('Memberships:', memberships)
  }
  await prisma.$disconnect()
}

main()
