import { eq, desc } from "drizzle-orm";
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
