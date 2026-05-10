import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";

const execAsync = promisify(exec);

function makeS3Client(): S3Client | null {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function runBackup(label = "auto"): Promise<{ success: boolean; file?: string; error?: string }> {
  const databaseUrl = process.env.DATABASE_URL;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!databaseUrl) {
    console.error("[Backup] DATABASE_URL non défini — backup annulé");
    return { success: false, error: "DATABASE_URL manquant" };
  }
  if (!bucket) {
    console.error("[Backup] R2_BUCKET_NAME non défini — backup annulé");
    return { success: false, error: "R2_BUCKET_NAME manquant" };
  }

  const s3 = makeS3Client();
  if (!s3) {
    console.error("[Backup] Variables R2 manquantes (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
    return { success: false, error: "Configuration R2 incomplète" };
  }

  const date = new Date();
  const timestamp = date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `backup-${label}-${timestamp}.sql.gz`;
  const localPath = `/tmp/${fileName}`;

  console.log(`[Backup] Début — ${fileName}`);

  try {
    await execAsync(
      `pg_dump "${databaseUrl}" --no-password --format=plain --no-owner --no-acl | gzip > "${localPath}"`
    );
    console.log("[Backup] pg_dump + gzip terminé");

    const content = fs.readFileSync(localPath);
    const sizeMb = (content.byteLength / 1024 / 1024).toFixed(2);

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `backups/${fileName}`,
      Body: content,
      ContentType: "application/gzip",
      ContentEncoding: "gzip",
      Metadata: {
        "created-at": date.toISOString(),
        "label": label,
        "database": "m15-edutech",
      },
    }));
    console.log(`[Backup] Upload R2 réussi : backups/${fileName} (${sizeMb} MB compressé)`);

    fs.unlinkSync(localPath);

    await cleanOldBackups(s3, bucket, 30);

    return { success: true, file: fileName };
  } catch (err: any) {
    console.error("[Backup] Erreur :", err.message);
    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
    return { success: false, error: err.message };
  }
}

async function cleanOldBackups(s3: S3Client, bucket: string, retentionDays: number): Promise<void> {
  try {
    const { Contents } = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "backups/" }));
    if (!Contents?.length) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    for (const obj of Contents) {
      if (obj.LastModified && obj.LastModified < cutoff && obj.Key) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
        console.log(`[Backup] Ancien backup supprimé : ${obj.Key}`);
      }
    }
  } catch (err: any) {
    console.error("[Backup] Erreur nettoyage :", err.message);
  }
}

export async function listBackups(): Promise<Array<{ key: string; sizeMb: string; date: Date }>> {
  const bucket = process.env.R2_BUCKET_NAME;
  const s3 = makeS3Client();
  if (!s3 || !bucket) return [];

  try {
    const { Contents } = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "backups/" }));
    if (!Contents) return [];

    return Contents
      .filter(o => o.Key && o.LastModified)
      .sort((a, b) => (b.LastModified!.getTime()) - (a.LastModified!.getTime()))
      .map(o => ({
        key: o.Key!,
        sizeMb: ((o.Size ?? 0) / 1024 / 1024).toFixed(2),
        date: o.LastModified!,
      }));
  } catch (err: any) {
    console.error("[Backup] Erreur listage :", err.message);
    return [];
  }
}

function scheduleAt(hour: number, minute: number, label: string, jobFn: () => Promise<void>): void {
  const tick = () => {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(hour, minute, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const delay = next.getTime() - now.getTime();
    const inMin = Math.round(delay / 60000);
    console.log(`[Backup] ${label} planifié — prochain run à ${hour.toString().padStart(2, "0")}h${minute.toString().padStart(2, "0")} UTC (dans ${inMin} min)`);
    setTimeout(async () => {
      await jobFn();
      tick();
    }, delay);
  };
  tick();
}

export function startBackupScheduler(): void {
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    console.warn("[Backup] Variables R2 manquantes — scheduler désactivé (configurez R2_* dans les variables d'environnement)");
    return;
  }

  scheduleAt(2, 0, "Backup quotidien", () => runBackup("daily").then(() => {}));

  scheduleAt(3, 0, "Backup hebdomadaire (dim)", async () => {
    if (new Date().getUTCDay() === 0) {
      await runBackup("weekly");
    }
  });

  console.log("[Backup] Scheduler initialisé — quotidien 02h00 UTC, hebdomadaire dim 03h00 UTC");
}
