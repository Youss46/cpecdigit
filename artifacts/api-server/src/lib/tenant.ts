import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      tenantId?: number;
      tenant?: typeof tenantsTable.$inferSelect;
    }
  }
}

const KNOWN_BASE_DOMAINS = [
  "m15edutech.ci",
  "m15edutech.com",
  "replit.dev",
  "repl.co",
  "replit.app",
];

function extractSubdomain(hostname: string): string | undefined {
  const host = hostname.split(":")[0];
  for (const base of KNOWN_BASE_DOMAINS) {
    if (host.endsWith(`.${base}`)) {
      const sub = host.slice(0, host.length - base.length - 1);
      if (sub && !sub.includes(".")) return sub;
    }
  }
  return undefined;
}

let _defaultTenantCache: (typeof tenantsTable.$inferSelect) | null = null;
const _tenantCache = new Map<string, typeof tenantsTable.$inferSelect>();

async function findTenantBySubdomain(subdomain: string) {
  const cached = _tenantCache.get(subdomain);
  if (cached) return cached;

  const rows = await db.select().from(tenantsTable)
    .where(eq(tenantsTable.subdomain, subdomain))
    .limit(1);

  if (rows[0]) {
    _tenantCache.set(subdomain, rows[0]);
    return rows[0];
  }
  return null;
}

async function getDefaultTenant() {
  if (_defaultTenantCache) return _defaultTenantCache;
  const rows = await db.select().from(tenantsTable)
    .where(eq(tenantsTable.subdomain, "cpec"))
    .limit(1);
  if (rows[0]) {
    _defaultTenantCache = rows[0];
    return rows[0];
  }
  const any = await db.select().from(tenantsTable).limit(1);
  if (any[0]) {
    _defaultTenantCache = any[0];
    return any[0];
  }
  return null;
}

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    let subdomain: string | undefined;

    subdomain = extractSubdomain(req.hostname);

    if (!subdomain || subdomain === "www") {
      const headerSubdomain = req.headers["x-tenant-subdomain"] as string | undefined;
      const querySubdomain = req.query.tenant as string | undefined;
      subdomain = headerSubdomain || querySubdomain;
    }

    let tenant: typeof tenantsTable.$inferSelect | null = null;

    if (subdomain) {
      tenant = await findTenantBySubdomain(subdomain);
    }

    if (!tenant) {
      tenant = await getDefaultTenant();
    }

    if (!tenant) {
      res.status(503).json({ error: "Service Unavailable", message: "No tenant configured" });
      return;
    }

    if (!tenant.active) {
      res.status(403).json({ error: "Forbidden", message: "This school's subscription is inactive" });
      return;
    }

    req.tenantId = tenant.id;
    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}

export function clearTenantCache() {
  _tenantCache.clear();
  _defaultTenantCache = null;
}
