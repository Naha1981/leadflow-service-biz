-- ============================================================
-- LeadFlow (WhatsApp Lead-to-Quote SaaS) — Supabase schema
-- Multi-tenant: one row per client business ("tenant")
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------
-- TENANTS (your paying customers — plumbers, salons, etc.)
-- ---------------------------------------------------------
create table if not exists tenants (
  id uuid primary key default uuid_generate_v4(),
  business_name text not null,
  niche text,                          -- e.g. 'plumber', 'salon', 'electrician'
  owner_name text,
  owner_email text,
  owner_phone text,
  evolution_instance_name text unique, -- Evolution API instance id for this tenant
  evolution_api_key text,              -- per-instance key if you issue one
  status text default 'trial',         -- trial | active | paused | churned
  plan text default 'starter',         -- starter | pro
  monthly_fee numeric default 700,
  business_hours jsonb,                -- {"open": "08:00", "close": "17:00", "timezone": "Africa/Johannesburg"}
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- LEADS (every inbound WhatsApp conversation)
-- ---------------------------------------------------------
create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  phone text not null,
  name text,
  suburb text,
  service_requested text,
  intent text,                         -- quote | booking | pricing | callback | other
  status text default 'new',           -- new | contacted | quoted | booked | won | lost
  last_message text,
  reopened_at timestamptz,             -- set when a won/lost lead messages again
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------
-- MESSAGES (raw log, useful for debugging + audit/POPIA)
-- ---------------------------------------------------------
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  direction text not null,             -- inbound | outbound
  body text,
  raw_payload jsonb,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- QUOTES
-- ---------------------------------------------------------
create table if not exists quotes (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  amount numeric,
  description text,
  pdf_url text,
  status text default 'draft',         -- draft | sent | accepted | rejected
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- REPLY_TEMPLATES (per-tenant or per-niche canned replies)
-- ---------------------------------------------------------
create table if not exists reply_templates (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  intent text not null,                -- greeting | quote | booking | pricing | callback | other
  body text not null,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- ORDERS (PayFast payment tracking)
-- ---------------------------------------------------------
create table if not exists orders (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  amount numeric not null,
  description text,
  business_name text,
  status text default 'pending',       -- pending | paid | cancelled | failed
  pf_payment_id text,
  payment_data jsonb,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table tenants enable row level security;
alter table leads enable row level security;
alter table messages enable row level security;
alter table quotes enable row level security;

-- Service-role (your backend) bypasses RLS automatically.
-- These policies are for a future tenant-facing dashboard login (Supabase JWT).
create policy "tenant reads own leads" on leads
  for select using (tenant_id::text = auth.jwt() ->> 'tenant_id');

create policy "tenant reads own quotes" on quotes
  for select using (tenant_id::text = auth.jwt() ->> 'tenant_id');

create policy "tenant reads own messages" on messages
  for select using (tenant_id::text = auth.jwt() ->> 'tenant_id');

create policy "tenant reads own orders" on orders
  for select using (tenant_id::text = auth.jwt() ->> 'tenant_id');

create policy "tenant reads own reply_templates" on reply_templates
  for select using (tenant_id::text = auth.jwt() ->> 'tenant_id');

-- ---------------------------------------------------------
-- Helpful indexes
-- ---------------------------------------------------------
create index if not exists idx_leads_tenant on leads(tenant_id);
create index if not exists idx_messages_tenant on messages(tenant_id);
create index if not exists idx_quotes_tenant on quotes(tenant_id);
create index if not exists idx_orders_tenant on orders(tenant_id);
create index if not exists idx_reply_templates_tenant on reply_templates(tenant_id);
create index if not exists idx_tenants_evo_instance on tenants(evolution_instance_name);
