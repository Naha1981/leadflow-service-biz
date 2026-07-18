import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  jsonb,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------
// TENANTS — paying client businesses (plumbers, salons, etc.)
// ---------------------------------------------------------
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessName: text("business_name").notNull(),
  niche: text("niche"),
  ownerName: text("owner_name"),
  ownerEmail: text("owner_email"),
  ownerPhone: text("owner_phone"),
  evolutionInstanceName: text("evolution_instance_name").unique(),
  status: text("status").notNull().default("trial"), // trial | active | paused | churned | pending_connect
  plan: text("plan").notNull().default("starter"),
  monthlyFee: numeric("monthly_fee").notNull().default("700"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------
// LEADS — one row per customer conversation, per tenant
// ---------------------------------------------------------
export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  phone: text("phone").notNull(),
  name: text("name"),
  suburb: text("suburb"),
  serviceRequested: text("service_requested"),
  intent: text("intent"), // quote | booking | pricing | callback | greeting | other
  status: text("status").notNull().default("new"), // new | contacted | quoted | booked | won | lost
  lastMessage: text("last_message"),
  reopenedAt: timestamp("reopened_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------
// MESSAGES — raw log, every inbound/outbound WhatsApp message
// ---------------------------------------------------------
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  direction: text("direction").notNull(), // inbound | outbound
  body: text("body"),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------
// QUOTES
// ---------------------------------------------------------
export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  amount: numeric("amount"),
  description: text("description"),
  pdfUrl: text("pdf_url"),
  status: text("status").notNull().default("draft"), // draft | sent | accepted | rejected
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------
// EVENTS — domain event log (§6 of the architecture standard).
// Every significant business action gets one row here. This is
// what powers idempotency, audit trail, and later analytics —
// and it's the seam along which a module could be extracted later.
// ---------------------------------------------------------
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // e.g. "MessageReceived", "TenantOnboarded", "LeadStatusChanged"
  providerEventId: text("provider_event_id"), // dedupe key for webhook idempotency
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
