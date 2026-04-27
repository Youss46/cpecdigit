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

// CORS: in production use the CORS_ORIGINS env var (comma-separated list of
// allowed origins). Falls back to allowing all origins in dev so local / Replit
// tooling continues to work without extra config.
const isProd = process.env.NODE_ENV === "production";
const rawOrigins = process.env.CORS_ORIGINS ?? "";
const allowedOrigins = rawOrigins
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server calls (no Origin header) and non-prod envs.
      if (!isProd || !origin || allowedOrigins.length === 0) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Trust Railway's / Vercel's reverse-proxy so req.secure is reliable
if (isProd) app.set("trust proxy", 1);

app.use(
  session({
    secret: process.env.SESSION_SECRET || "m15edutech-secret-2025",
    resave: false,
    saveUninitialized: false,
    cookie: {
      // Require HTTPS in production (Railway + Vercel both serve over HTTPS)
      secure: isProd,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      // "none" allows cookies to be sent in cross-origin requests
      // (e.g. browser on www.m15-edutech.ci → api.m15-edutech.ci).
      // SameSite=None requires Secure=true which is already set in prod.
      // In dev we use "lax" to avoid requiring HTTPS locally.
      sameSite: isProd ? "none" : "lax",
    },
  }),
);

// Mount the same handlers on both /api and /srv. Replit's external load
// balancer blocks /api/* with 502, so the frontend rewrites all calls to
// /srv/*. Keeping /api as well preserves backward compatibility for any
// non-Replit deployment, server-to-server callers, or older clients.
app.get(["/api/healthz", "/srv/healthz"], (_req, res) => res.json({ ok: true }));
app.use(["/api/uploads", "/srv/uploads"], express.static(UPLOADS_DIR));
app.use(["/api", "/srv"], tenantMiddleware);
app.use(["/api", "/srv"], router);

// Serve the bundled frontend only when it was co-built alongside the backend
// (monolithic / self-hosted deploy). On Railway the frontend lives on Vercel,
// so the dist directory won't be present — skip silently in that case.
if (isProd) {
  const frontendDist = path.join(__dirname, "../../cpec-u/dist/public");
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }
}

export default app;
