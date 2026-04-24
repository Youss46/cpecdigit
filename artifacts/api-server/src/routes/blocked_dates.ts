import { Router } from "express";
import { db } from "@workspace/db";
import { blockedDatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole } from "../lib/auth.js";

const router = Router();

function requirePlanificateur(req: any, res: any, next: any) {
  if (req.session?.user?.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const subRole = req.session.user.adminSubRole;
  if (subRole !== "planificateur" && subRole !== "directeur") {
    return res.status(403).json({ error: "Réservé au Responsable pédagogique ou au Directeur" });
  }
  next();
}

router.get("/", requireRole("admin", "teacher", "student"), async (_req, res) => {
  try {
    const rows = await db.select().from(blockedDatesTable).orderBy(blockedDatesTable.date);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePlanificateur, async (req, res) => {
  try {
    const { date, dateEnd, reason, type } = req.body;
    if (!date || !reason) return res.status(400).json({ error: "Date et raison requis" });
    // Validate that dateEnd >= date when provided
    if (dateEnd && dateEnd < date) {
      return res.status(400).json({ error: "La date de fin doit être après la date de début" });
    }
    const [row] = await db
      .insert(blockedDatesTable)
      .values({ date, dateEnd: dateEnd ?? null, reason, type: type ?? "autre" })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", requirePlanificateur, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { date, dateEnd, reason, type } = req.body;
    if (dateEnd && date && dateEnd < date) {
      return res.status(400).json({ error: "La date de fin doit être après la date de début" });
    }
    const [row] = await db
      .update(blockedDatesTable)
      .set({ date, dateEnd: dateEnd ?? null, reason, type })
      .where(eq(blockedDatesTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not Found" });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", requirePlanificateur, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(blockedDatesTable).where(eq(blockedDatesTable.id, id));
    res.json({ message: "Date supprimée" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
