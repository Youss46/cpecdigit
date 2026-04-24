import { Router } from "express";
import { db } from "@workspace/db";
import { bulletinTokensTable, bulletinVerificationLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/verify/bulletin/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const [record] = await db
      .select()
      .from(bulletinTokensTable)
      .where(eq(bulletinTokensTable.token, token))
      .limit(1);

    if (!record) {
      res.json({
        valid: false,
        reason: "Ce bulletin ne peut pas être vérifié. Il est peut-être falsifié ou n'existe pas dans notre système.",
      });
      return;
    }

    if (record.invalidatedAt !== null) {
      res.json({
        valid: false,
        reason: "Ce bulletin a été remplacé par une version mise à jour. Veuillez utiliser le QR code du bulletin le plus récent.",
      });
      return;
    }

    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      null;

    await db.insert(bulletinVerificationLogsTable).values({
      tokenId: record.id,
      ipAddress: ip,
    });

    const snap = record.snapshot as Record<string, unknown>;

    res.json({
      valid: true,
      studentName: snap.studentName,
      matricule: snap.matricule,
      className: snap.className,
      filiere: snap.filiere,
      academicYear: snap.academicYear,
      semesterName: snap.semesterName,
      average: snap.average,
      averageNette: snap.averageNette,
      decision: snap.decision,
      deliveredAt: record.generatedAt,
    });
  } catch (err) {
    console.error("[verify/bulletin]", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
