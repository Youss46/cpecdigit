import { Request, Response, NextFunction } from "express";

/**
 * In-memory set of user IDs whose sessions must be invalidated on next request.
 * Populated when credentials (email or password) are changed by an admin/dev action.
 * Resets on server restart — acceptable because MemoryStore sessions reset too.
 */
export const invalidatedUsers = new Set<number>();

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Unauthorized", message: "Please log in" });
    return;
  }
  if (invalidatedUsers.has(req.session.userId)) {
    invalidatedUsers.delete(req.session.userId);
    req.session.destroy(() => {});
    res.status(401).json({
      error: "SessionExpired",
      message: "Vos informations de connexion ont été modifiées. Veuillez vous reconnecter.",
    });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: "Unauthorized", message: "Please log in" });
      return;
    }
    if (invalidatedUsers.has(req.session.userId)) {
      invalidatedUsers.delete(req.session.userId);
      req.session.destroy(() => {});
      res.status(401).json({
        error: "SessionExpired",
        message: "Vos informations de connexion ont été modifiées. Veuillez vous reconnecter.",
      });
      return;
    }
    if (!roles.includes(req.session.role)) {
      res.status(403).json({ error: "Forbidden", message: "Insufficient permissions" });
      return;
    }
    next();
  };
}
