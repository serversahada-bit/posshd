const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.scalev_sync_queue.create({
    data: {
      scalev_order_id: '260728EHSDARY',
      target_status: 'pending'
    }
  });
  console.log('Inserted dummy queue');
}
main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
