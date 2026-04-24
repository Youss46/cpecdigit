import { Router } from "express";
import { db } from "@workspace/db";
import { roomsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const router = Router();

function requirePlanificateur(req: any, res: any, next: any) {
  if (req.session?.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const subRole = req.session.user.adminSubRole;
  if (subRole !== "planificateur" && subRole !== "directeur") {
    return res.status(403).json({ error: "Réservé au Planificateur ou au Directeur" });
  }
  next();
}

router.get("/", requireRole("admin"), async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const rooms = await db.select().from(roomsTable)
      .where(eq(roomsTable.tenantId, tenantId))
      .orderBy(roomsTable.name);
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePlanificateur, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const { name, capacity, type, description } = req.body;
    if (!name || !capacity || !type) {
      return res.status(400).json({ error: "name, capacity et type sont requis" });
    }
    const [room] = await db.insert(roomsTable).values({ tenantId, name, capacity, type, description }).returning();
    res.status(201).json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:roomId", requirePlanificateur, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const roomId = parseInt(req.params.roomId);
    const { name, capacity, type, description } = req.body;
    const [room] = await db
      .update(roomsTable)
      .set({ name, capacity, type, description })
      .where(and(eq(roomsTable.id, roomId), eq(roomsTable.tenantId, tenantId)))
      .returning();
    if (!room) return res.status(404).json({ error: "Salle non trouvée" });
    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:roomId", requirePlanificateur, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const roomId = parseInt(req.params.roomId);
    await db.delete(roomsTable).where(and(eq(roomsTable.id, roomId), eq(roomsTable.tenantId, tenantId)));
    res.json({ message: "Salle supprimée" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
