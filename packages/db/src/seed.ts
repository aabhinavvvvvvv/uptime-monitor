import { prisma } from "./index.js";

async function main() {
  const monitor = await prisma.monitor.upsert({
    where: { id: "seed-monitor-1" },
    update: {},
    create: {
      id: "seed-monitor-1",
      name: "Example site",
      url: "https://example.com",
      intervalSeconds: 30,
    },
  });

  console.log("Seeded monitor:", monitor);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
