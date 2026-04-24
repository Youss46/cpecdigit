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

// Routes that don't require an active tenant (login, logout, etc.)
const OPEN_ROUTE_PREFIXES = ["/auth/login", "/auth/logout", "/auth/webauthn"];

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const sessionTenantId = (req.session as any)?.tenantId as number | undefined;
  const sessionUserId = (req.session as any)?.userId as number | undefined;

  if (sessionTenantId) {
    req.tenantId = sessionTenantId;

    // If a user is actively logged in, verify the school is still active.
    // This ensures deactivation takes effect immediately — not just at next login.
    // Open routes (login/logout) are exempt so the user can log out cleanly.
    const isOpenRoute = OPEN_ROUTE_PREFIXES.some(p => req.path.startsWith(p));
    if (sessionUserId && !isOpenRoute) {
      const rows = await db
        .select({ active: tenantsTable.active })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, sessionTenantId));
      if (rows[0] && !rows[0].active) {
        req.session?.destroy(() => {});
        res.status(401).json({
          error: "AccountDisabled",
          message: "Votre compte a été désactivé. Veuillez contacter le développeur.",
        });
        return;
      }
    }

    next();
    return;
  }

  // Allow login/logout/webauthn routes to proceed without a session tenant
  const isOpenRoute = OPEN_ROUTE_PREFIXES.some(p => req.path.startsWith(p));
  if (isOpenRoute) {
    next();
    return;
  }

  // Public routes (healthz handled before middleware, uploads too)
  next();
}

export function clearTenantCache() {
  // No-op — no cache needed in session-based approach
}
