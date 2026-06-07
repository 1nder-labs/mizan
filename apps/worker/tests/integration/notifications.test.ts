/**
 * Integration: per-user notifications. Covers the targeting forks that the
 * route seams depend on — notify the campaign's client, notify only an ASSIGNED
 * reviewer (unassigned cases write no row), never notify the actor of their own
 * action — plus the list + mark-read lifecycle.
 *
 * Run via `bun --filter @mizan/worker test:integration`.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { makeDb } from "@mizan/db";
import type { ViewerContext } from "@mizan/shared";
import { beforeAll, describe, expect, it, inject } from "vitest";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notifyCaseClient,
  notifyCaseReviewer,
  notifyInternalNote,
} from "../../src/lib/notifications.ts";
import { REVIEW_ORG_ID } from "./portal-helpers.ts";

const CLIENT_ID = "notif-client";
const REVIEWER_ID = "notif-reviewer";
const ADMIN_ID = "notif-admin";

function viewer(userId: string): ViewerContext {
  return {
    userId,
    role: userId === CLIENT_ID ? "client" : "reviewer",
    organizationId: REVIEW_ORG_ID,
  };
}

async function seedUser(id: string): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, email_verified, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
  )
    .bind(id, id, `${id}@test.local`, Date.now(), Date.now())
    .run();
}

async function seedOrg(): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO organizations (id, name, slug, created_at) VALUES (?, 'Review', ?, ?)`,
  )
    .bind(REVIEW_ORG_ID, `review-${Date.now()}`, Date.now())
    .run();
}

async function seedMember(userId: string, role: string): Promise<void> {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO members (id, user_id, organization_id, role, created_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), userId, REVIEW_ORG_ID, role, Date.now())
    .run();
}

async function insertCase(assignedTo: string | null): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO cases (id, status, category, geography, claimed_zakat_category, brief_partial_json, created_by, assigned_to, organization_id, created_at, updated_at)
     VALUES (?, 'DRAFT', 'orphan', 'US', NULL, NULL, ?, ?, ?, ?, ?)`,
  )
    .bind(id, CLIENT_ID, assignedTo, REVIEW_ORG_ID, Date.now(), Date.now())
    .run();
  return id;
}

const NOTICE = { type: "message", title: "t", body: "b" } as const;

describe("notifications targeting + lifecycle", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, inject("migrations"));
    await seedOrg();
    await seedUser(CLIENT_ID);
    await seedUser(REVIEWER_ID);
    await seedUser(ADMIN_ID);
    await seedMember(ADMIN_ID, "admin");
    await seedMember(REVIEWER_ID, "reviewer");
  });

  it("notifies the client and never the actor (reviewer)", async () => {
    const db = makeDb(env.DB);
    const caseId = await insertCase(REVIEWER_ID);
    await notifyCaseClient(db, caseId, REVIEWER_ID, NOTICE);
    const client = await listNotifications(db, viewer(CLIENT_ID));
    expect(client.notifications.some((n) => n.caseId === caseId)).toBe(true);
    expect(client.unread).toBeGreaterThan(0);
    const self = await listNotifications(db, viewer(REVIEWER_ID));
    expect(self.notifications.some((n) => n.caseId === caseId)).toBe(false);
  });

  it("notifies an assigned reviewer but writes nothing when unassigned", async () => {
    const db = makeDb(env.DB);
    const assigned = await insertCase(REVIEWER_ID);
    await notifyCaseReviewer(db, assigned, CLIENT_ID, NOTICE);
    const unassigned = await insertCase(null);
    await notifyCaseReviewer(db, unassigned, CLIENT_ID, NOTICE);
    const rev = await listNotifications(db, viewer(REVIEWER_ID));
    expect(rev.notifications.some((n) => n.caseId === assigned)).toBe(true);
    expect(rev.notifications.some((n) => n.caseId === unassigned)).toBe(false);
  });

  it("relays an internal note to admins + assigned reviewer, never the author or client", async () => {
    const db = makeDb(env.DB);
    const caseId = await insertCase(REVIEWER_ID);
    await notifyInternalNote(db, caseId, viewer(REVIEWER_ID), "internal only");
    const admin = await listNotifications(db, viewer(ADMIN_ID));
    expect(admin.notifications.some((n) => n.caseId === caseId)).toBe(true);
    const author = await listNotifications(db, viewer(REVIEWER_ID));
    expect(author.notifications.some((n) => n.caseId === caseId)).toBe(false);
    const client = await listNotifications(db, viewer(CLIENT_ID));
    expect(client.notifications.some((n) => n.caseId === caseId)).toBe(false);
  });

  it("mark-read clears unread", async () => {
    const db = makeDb(env.DB);
    const caseId = await insertCase(REVIEWER_ID);
    await notifyCaseClient(db, caseId, REVIEWER_ID, NOTICE);
    const before = await listNotifications(db, viewer(CLIENT_ID));
    const target = before.notifications.find((n) => n.caseId === caseId && !n.read);
    expect(target).toBeDefined();
    if (target) await markNotificationRead(db, viewer(CLIENT_ID), target.id);
    const remaining = await markAllNotificationsRead(db, viewer(CLIENT_ID));
    expect(remaining).toBe(0);
    const after = await listNotifications(db, viewer(CLIENT_ID));
    expect(after.unread).toBe(0);
  });
});
