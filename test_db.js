const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const dests = await prisma.tarif_pengiriman.findMany({
    where: {
      nama_tujuan: { contains: 'Tengah' },
    },
    distinct: ['nama_tujuan'],
    select: { nama_tujuan: true },
    take: 10,
  });
  console.log(dests);
}
main().catch(console.error).finally(() => prisma.$disconnect());
