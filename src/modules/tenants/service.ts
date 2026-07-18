import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { createInstance, setWebhook } from "@/lib/integrations/evolution/client";
import { emitEvent } from "@/lib/events/emitter";
import type { CreateTenantInput } from "./schema";

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug}-${crypto.randomUUID().slice(0, 6)}`;
}

/**
 * Onboard a new paying business: create the DB record, spin up its
 * dedicated Evolution instance, and point that instance's webhook at
 * our shared route. If Evolution setup fails, the tenant row still
 * exists in `pending_connect` status so onboarding can be retried
 * without re-selling or re-explaining anything to the business owner.
 */
export async function onboardTenant(input: CreateTenantInput) {
  const instanceName = slugify(input.businessName);

  const [tenant] = await db
    .insert(tenants)
    .values({
      businessName: input.businessName,
      niche: input.niche,
      ownerName: input.ownerName,
      ownerEmail: input.ownerEmail,
      ownerPhone: input.ownerPhone,
      evolutionInstanceName: instanceName,
      monthlyFee: String(input.monthlyFee),
      status: "trial",
    })
    .returning();

  try {
    await createInstance(instanceName);
    await setWebhook(instanceName);
  } catch (err) {
    await db
      .update(tenants)
      .set({ status: "pending_connect" })
      .where(eq(tenants.id, tenant.id));
    return {
      tenant: { ...tenant, status: "pending_connect" },
      warning: `Evolution setup failed, retry via /qr endpoint: ${(err as Error).message}`,
    };
  }

  await emitEvent({
    tenantId: tenant.id,
    type: "TenantOnboarded",
    payload: { businessName: tenant.businessName, niche: tenant.niche },
  });

  return { tenant };
}

export async function listTenants() {
  return db.select().from(tenants).orderBy(desc(tenants.createdAt));
}

export async function getTenantById(id: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  return tenant ?? null;
}

export async function getTenantByInstanceName(instanceName: string) {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.evolutionInstanceName, instanceName))
    .limit(1);
  return tenant ?? null;
}

export async function updateBusinessHours(
  tenantId: string,
  hours: { open: string; close: string; timezone?: string },
) {
  const [updated] = await db
    .update(tenants)
    .set({ businessHours: hours })
    .where(eq(tenants.id, tenantId))
    .returning();
  return updated ?? null;
}

// ---------------------------------------------------------
// Reply templates — per-tenant overrides of niche/global defaults
// ---------------------------------------------------------
import { replyTemplates } from "@/lib/db/schema";
import { GLOBAL_REPLIES, NICHE_REPLIES } from "@/modules/messages/replies";
import type { Intent } from "@/modules/messages/intent";

export async function listReplyTemplates(tenantId: string) {
  return db.select().from(replyTemplates).where(eq(replyTemplates.tenantId, tenantId));
}

/**
 * Returns a simple { intent: body } map for the webhook to use — this is
 * the shape resolveReply() expects as its `customTemplates` argument.
 */
export async function getReplyTemplateMap(tenantId: string): Promise<Record<string, string>> {
  const rows = await listReplyTemplates(tenantId);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.intent] = row.body;
  return map;
}

export async function upsertReplyTemplate(tenantId: string, intent: string, body: string) {
  const existing = await db
    .select()
    .from(replyTemplates)
    .where(and(eq(replyTemplates.tenantId, tenantId), eq(replyTemplates.intent, intent)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(replyTemplates).set({ body }).where(eq(replyTemplates.id, existing[0].id));
    return { action: "updated" as const };
  }

  await db.insert(replyTemplates).values({ tenantId, intent, body });
  return { action: "created" as const };
}

/**
 * Seeds a tenant's reply_templates with sensible defaults, blending
 * niche-specific copy over the global fallback, so a new tenant doesn't
 * start on generic replies. Still fully editable afterward via
 * upsertReplyTemplate.
 */
export async function seedReplyTemplates(tenantId: string, nicheOverride?: string) {
  const tenant = await getTenantById(tenantId);
  const niche = (nicheOverride || tenant?.niche || "").toLowerCase();

  const defaults: Record<string, string> = { ...GLOBAL_REPLIES };
  const nicheDefaults = NICHE_REPLIES[niche];
  if (nicheDefaults) {
    for (const [intent, body] of Object.entries(nicheDefaults)) {
      if (body) defaults[intent as Intent] = body;
    }
  }

  for (const [intent, body] of Object.entries(defaults)) {
    await upsertReplyTemplate(tenantId, intent, body);
  }

  return Object.keys(defaults);
}
