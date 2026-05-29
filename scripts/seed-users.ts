/**
 * Dev-only seed for Mizan reviewer + admin users in a shared org.
 *
 * Runs against a live local worker (default `http://localhost:8787`).
 * Idempotent: duplicate sign-up returns 422 (treated as success).
 */
const BASE = process.env["MIZAN_BASE_URL"] ?? "http://localhost:8787";

interface SeedUser {
  readonly email: string;
  readonly password: string;
  readonly name: string;
}

const REVIEWER_PASSWORD = process.env["MIZAN_SEED_REVIEWER_PASSWORD"] ?? "reviewer-dev-only-12345";
const ADMIN_PASSWORD = process.env["MIZAN_SEED_ADMIN_PASSWORD"] ?? "admin-dev-only-12345";

const ADMIN: SeedUser = {
  email: "admin@mizan.test",
  password: ADMIN_PASSWORD,
  name: "Mizan Admin",
};

const REVIEWER: SeedUser = {
  email: "reviewer@mizan.test",
  password: REVIEWER_PASSWORD,
  name: "Mizan Reviewer",
};

async function signUp(user: SeedUser): Promise<void> {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password, name: user.name }),
  });
  if (!res.ok && res.status !== 422) {
    const body = await res.text();
    throw new Error(`signup failed for ${user.email}: ${res.status} — ${body}`);
  }
}

async function signIn(user: SeedUser): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`sign-in failed for ${user.email}: ${res.status} — ${body}`);
  }
  const cookies = res.headers.getSetCookie?.() ?? [];
  return cookies.join("; ");
}

async function inviteReviewer(adminCookie: string): Promise<void> {
  const res = await fetch(`${BASE}/api/team/invitations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminCookie,
    },
    body: JSON.stringify({ email: REVIEWER.email, role: "reviewer" }),
  });
  if (!res.ok && res.status !== 409) {
    const body = await res.text();
    throw new Error(`invite failed: ${res.status} — ${body}`);
  }
}

await signUp(ADMIN);
const adminCookie = await signIn(ADMIN);
await inviteReviewer(adminCookie);
await signUp(REVIEWER);
console.log(`seeded ${ADMIN.email} (admin org owner)`);
console.log(`seeded ${REVIEWER.email} (reviewer via invite)`);
