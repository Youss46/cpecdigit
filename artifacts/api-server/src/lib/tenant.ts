import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { tenantsTable } from "@workspace/db";

declare global {
  namespace Express {
    interface Request {
      tenantId?: number;
      tenant?: typeof tenantsTable.$inferSelect;
    }
  }
}

export async function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  const sessionTenantId = (req.session as any)?.tenantId as number | undefined;

  if (sessionTenantId) {
    req.tenantId = sessionTenantId;
    next();
    return;
  }

  // Allow login/logout/me routes to proceed without a session tenant
  const authRoutes = ["/api/auth/login", "/api/auth/logout", "/api/auth/webauthn"];
  const isAuthRoute = authRoutes.some(r => req.path.startsWith(r.replace("/api", "")));
  if (isAuthRoute) {
    next();
    return;
  }

  // Public routes (healthz handled before middleware, uploads too)
  next();
}

export function clearTenantCache() {
  // No-op — no cache needed in session-based approach
}
