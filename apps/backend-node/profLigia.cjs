const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const ps = await p.profesor.findMany({
    orderBy: { id: "asc" },
    select: { id: true, nombre: true, seccionBaseId: true },
  });
  console.log("total profesores:", ps.length);
  const lig = ps.filter((x) => x.nombre.toLowerCase().includes("ligia"));
  console.log(JSON.stringify(lig, null, 1));
  await p.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
