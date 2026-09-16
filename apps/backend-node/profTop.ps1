const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const ps = await p.profesor.findMany({ orderBy: { id: "asc" }, select: { id: true, nombre: true, seccionBaseId: true } });
  const l = ps.filter((x) => x.nombre.toLowerCase().includes("ligia"));
  console.log(JSON.stringify(l, null, 1));
  console.log("total profesores:", ps.length);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
