# tenants module

**Purpose**: onboard and manage paying client businesses (the plumbers,
salons, electricians who pay for LeadFlow).

**Public service API** (`service.ts`):
- `onboardTenant(input)` — creates DB record + Evolution instance + webhook
- `listTenants()`
- `getTenantById(id)`
- `getTenantByInstanceName(instanceName)` — used by the webhook to route
  inbound messages to the right tenant

**Events emitted**: `TenantOnboarded`

**Depends on**: `lib/integrations/evolution` (instance creation, webhook setup)
