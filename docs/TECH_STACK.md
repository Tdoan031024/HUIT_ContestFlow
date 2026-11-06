# HUIT ContestFlow technology direction

## Deployment shape

Use one full-stack Next.js application, matching the existing HUIT project deployment model. There is one Node.js application to install and start; Next.js serves both the responsive UI and backend Route Handlers. MySQL is a separate database service. The API is not a second NestJS application.

```text
Browser ── HTTPS ──> Next.js (one Node.js app)
                       ├── UI: src/app/**
                       ├── API: src/app/api/**
                       └── Prisma ORM ──> MySQL
```

## Stack

| Layer | Choice | Responsibility |
|---|---|---|
| Web and server | Next.js App Router, React, TypeScript | Admin and judge screens plus server API routes |
| Styling | Global CSS and design tokens | Responsive web UI and shared component styles |
| Database | MySQL 8.4 | Users, competitions, rounds, entries, rubrics, score sheets, results, and audit history |
| Data access | Prisma ORM 7 + MySQL/MariaDB driver adapter | Typed queries, schema generation, and versioned migrations |
| Local database | Docker Compose | Reproducible local MySQL service |

## Security and data integrity

- Use server-managed `HttpOnly`, `Secure`, `SameSite` session cookies in production.
- Keep role and competition-assignment checks in server-side route handlers and domain functions. Hiding an action in the UI never grants permission.
- Tie each score sheet to a competition entry, judge, and immutable rubric version. A database unique constraint allows one score sheet per judge and entry.
- Calculate scores on the server using the saved competition formula and decimal values.
- Save each score sheet and its audit event in one database transaction.
- Keep MySQL as the source of truth. Persist the live contestant state and reload it after client reconnects.
- Store a result snapshot when an Admin locks or publishes results.

## Live updates with one app

Use periodic API refresh for the judge workspace and live-control screen. This keeps the deployment on a single Next.js Node.js app and avoids a second websocket server. If the hosting environment supports long-lived WebSocket connections, a single-process Socket.IO integration can be evaluated later; otherwise use a managed realtime provider.

## First implementation sequence

1. Install dependencies and apply the committed MySQL migration.
2. Configure the one-time Admin bootstrap key and create the first account.
3. Manage competitions, rounds, contestants, Judge assignments, and rubric versions.
4. Coordinate the current entry and collect independent Judge score sheets.
5. Aggregate scores, lock and publish result snapshots, export CSV, and inspect audit history.
6. Build and release the single Node.js application with an external MySQL service.

Do not introduce a separate API deployment, Redis, or microservices in the first implementation slice.
