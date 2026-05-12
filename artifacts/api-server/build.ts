import path from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { rm, readFile, cp } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times without risking some
// packages that are not bundle compatible
const allowlist = [
  "@google/generative-ai",
  "@simplewebauthn/server",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");
  await rm(distDir, { recursive: true, force: true });

  console.log("building server...");
  const pkgPath = path.resolve(__dirname, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter(
    (dep) =>
      !allowlist.includes(dep) &&
      !(pkg.dependencies?.[dep]?.startsWith("workspace:")),
  );

  await esbuild({
    entryPoints: [path.resolve(__dirname, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: path.resolve(distDir, "index.mjs"),
    banner: {
      // createRequire: enables require() in ESM bundles (needed by some deps).
      // webcrypto polyfill: @simplewebauthn/server needs globalThis.crypto which
      // is only auto-set on Node.js 19+. On Node.js 18 (Railway default) we must
      // inject it manually from node:crypto.webcrypto before any module code runs.
      // __dirname/__filename: ESM bundles lose these CJS globals; re-derive them
      // from import.meta.url at the top of the bundle so all bundled code can use
      // them without each module needing its own fileURLToPath definition.
      js: `import { createRequire } from 'module'; import { fileURLToPath as __fup } from 'module'; const require = createRequire(import.meta.url); const { webcrypto: __wc } = require('node:crypto'); if (!globalThis.crypto) globalThis.crypto = __wc; const __filename = __fup(import.meta.url); const __dirname = require('path').dirname(__filename);`,
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  console.log("copying drizzle migrations...");
  const drizzleSrc = path.resolve(__dirname, "../../lib/db/drizzle");
  const drizzleDest = path.resolve(distDir, "drizzle");
  await cp(drizzleSrc, drizzleDest, { recursive: true });
  const { readdir } = await import("fs/promises");
  const copied = await readdir(drizzleDest);
  console.log("drizzle files in dist:", copied.join(", "));
  console.log("done.");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
