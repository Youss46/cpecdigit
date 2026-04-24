import { Router } from "express";
import { db } from "@workspace/db";
import { roomsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
    const rooms = await db.select().from(roomsTable).orderBy(roomsTable.name);
    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePlanificateur, async (req, res) => {
  try {
    const { name, capacity, type, description } = req.body;
    if (!name || !capacity || !type) {
      return res.status(400).json({ error: "name, capacity et type sont requis" });
    }
    const [room] = await db.insert(roomsTable).values({ name, capacity, type, description }).returning();
    res.status(201).json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:roomId", requirePlanificateur, async (req, res) => {
  try {
    const roomId = parseInt(req.params.roomId);
    const { name, capacity, type, description } = req.body;
    const [room] = await db
      .update(roomsTable)
      .set({ name, capacity, type, description })
      .where(eq(roomsTable.id, roomId))
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
    const roomId = parseInt(req.params.roomId);
    await db.delete(roomsTable).where(eq(roomsTable.id, roomId));
    res.json({ message: "Salle supprimée" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
