/**
 * Dev-only seed for Mizan reviewer + admin users.
 *
 * Runs against a live local worker (default `http://localhost:8788`). The
 * worker must be booted via `bun --filter @mizan/worker dev` before this
 * script runs. Idempotent: better-auth returns 422 on duplicate sign-up
 * (treated as success) and the admin role-escalation UPDATE is a no-op
 * when the row is already admin.
 *
 * The two-step pattern (HTTP sign-up + direct D1 UPDATE for role) is
 * necessary because `additionalFields.role.input` is `false` — the
 * sign-up endpoint will not accept a `role` field from clients. Production
 * seeding lives in a separate Phase 10 flow with `wrangler secret`-sourced
 * credentials; this script is for `.dev.vars`-style local context only.
 */

const BASE = process.env["MIZAN_BASE_URL"] ?? "http://localhost:8788";

type Role = "reviewer" | "admin";

interface SeedUser {
  readonly email: string;
  readonly password: string;
  readonly role: Role;
}

/**
 * Passwords default to documented dev-only literals so a fresh clone runs
 * `bun run db:seed` without setup. Override via environment for any non-local
 * use:
 *
 *   MIZAN_SEED_REVIEWER_PASSWORD=... MIZAN_SEED_ADMIN_PASSWORD=... bun run db:seed
 *
 * Production seeding is owned by the Phase 10 flow with `wrangler
 * secret`-sourced credentials; this script must never be run against a
 * production environment.
 */
const REVIEWER_PASSWORD = process.env["MIZAN_SEED_REVIEWER_PASSWORD"] ?? "reviewer-dev-only-12345";
const ADMIN_PASSWORD = process.env["MIZAN_SEED_ADMIN_PASSWORD"] ?? "admin-dev-only-12345";

const USERS: ReadonlyArray<SeedUser> = [
  { email: "reviewer@mizan.test", password: REVIEWER_PASSWORD, role: "reviewer" },
  { email: "admin@mizan.test", password: ADMIN_PASSWORD, role: "admin" },
];

async function signUp(user: SeedUser): Promise<void> {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password, name: user.email }),
  });
  if (!res.ok && res.status !== 422) {
    const body = await res.text();
    throw new Error(`signup failed for ${user.email}: ${res.status} — ${body}`);
  }
}

async function escalateAdmin(email: string): Promise<void> {
  const escapedEmail = email.replace(/'/g, "''");
  const proc = Bun.spawn(
    [
      "bunx",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      `UPDATE users SET role = 'admin' WHERE email = '${escapedEmail}'`,
    ],
    { cwd: "apps/worker", stdout: "pipe", stderr: "pipe" },
  );
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`role escalation failed for ${email} (exit ${exitCode}): ${err}`);
  }
}

for (const u of USERS) {
  await signUp(u);
  if (u.role === "admin") await escalateAdmin(u.email);
  console.log(`seeded ${u.email} (${u.role})`);
}
