---
name: Multi-tenancy scoping audit pattern
description: How to find and fix tenant-isolation gaps in the M15 EduTech API server (missing tenantId checks on joins/raw SQL/route params).
---

Recurring gap shape: a route accepts an id from `req.params` (studentId, teacherId, classId, sessionId, resourceId, quizId, paymentId, etc.) and queries/mutates by that id alone, without verifying the referenced row belongs to `req.tenantId`. This lets one tenant read or modify another tenant's data by guessing/incrementing ids.

**Why:** many core tables (payments, installments, teacher assignments, subject approvals, student profiles, quizzes, honoraires) don't carry their own `tenantId` column — tenancy is only enforced by joining to a table that does (`users`, `classes`, `library_resources`). It's easy to write a query that filters on the foreign id but forgets the join+tenant filter, especially in aggregate/stats endpoints and raw `sql` template queries.

**How to apply:**
- When auditing a route file, grep for `params.` id usage feeding directly into `db.select/update/delete` `where(eq(...))` without an accompanying tenant check.
- Fix pattern: `const tenantId = req.tenantId!;` then either add `eq(table.tenantId, tenantId)` directly (if the table has the column), or add a join to the owning table (usersTable/classesTable/libraryResourcesTable) and filter on that table's tenantId, or do a pre-check `SELECT` verifying ownership before the mutation and return 404 if not found.
- Aggregate/stats endpoints (e.g. "total honoraires across all teachers") are an easy place to miss scoping — they must pre-filter the id list (e.g. tenant's teacher ids) before aggregating, not aggregate globally.
- Raw `db.execute(sql\`...\`)` queries are just as exploitable as Drizzle query builder calls — audit both.
- Routes scoped to `req.session.userId` alone (the caller's own resource) or that verify a parent-child link (e.g. parent→student via `getLinkedStudentIds`) are safe as-is; only cross-entity lookups by arbitrary id need the tenant check.
