import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const coaches = [
    { name: "עומר לוי", location: "תל אביב", minLevel: 1, maxLevel: 2.5 },
    { name: "מיה כהן", location: "תל אביב", minLevel: 2.5, maxLevel: 4.5 },
    { name: "יואב פרץ", location: "חיפה", minLevel: 1.5, maxLevel: 3.5 },
    { name: "דניאל אברהם", location: "ירושלים", minLevel: 3, maxLevel: 5 }
  ];

  for (const c of coaches) {
    await prisma.coach.upsert({
      where: { name_location: { name: c.name, location: c.location } },
      update: { minLevel: c.minLevel, maxLevel: c.maxLevel },
      create: c
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
