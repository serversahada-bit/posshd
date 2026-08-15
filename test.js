const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const w = await prisma.warehouses.findFirst();
  console.log(w);
}
main();
