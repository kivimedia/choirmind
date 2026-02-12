import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Update ChoirMember role to director
  const updated = await prisma.choirMember.updateMany({
    where: { userId: '46aa54ce-2cc5-48e4-84f7-40d624c3f6b9' },
    data: { role: 'director' },
  })
  console.log('Updated choir memberships:', updated.count)

  // Also update User role for consistency
  const user = await prisma.user.update({
    where: { id: '46aa54ce-2cc5-48e4-84f7-40d624c3f6b9' },
    data: { role: 'director' },
  })
  console.log('Updated user role to:', user.role)

  await prisma.$disconnect()
}

main()
