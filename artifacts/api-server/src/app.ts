import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes/index.js";
import { tenantMiddleware } from "./lib/tenant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, "../uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

declare module "express-session" {
  interface SessionData {
    user: {
      id: number;
      role: string;
      name: string;
      adminSubRole?: string | null;
    };
    userId: number;
    role: string;
    name: string;
    tenantId: number;
    devAuthenticated: boolean;
  }
}

const app: Express = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "m15edutech-secret-2025",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.get("/api/healthz", (_req, res) => res.json({ ok: true }));
app.use("/api/uploads", express.static(UPLOADS_DIR));
app.use("/api", tenantMiddleware);
app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const frontendDist = path.join(__dirname, "../../cpec-u/dist/public");
  app.use(express.static(frontendDist));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
