# leads module

**Purpose**: track every customer conversation per tenant — one row per
unique (tenant, phone) pair, updated in place on repeat contact.

**Public service API** (`service.ts`):
- `findOrCreateLead(params)`
- `listLeadsForTenant(tenantId)`

**Events emitted**: `LeadCreated`

**Known gap**: no automatic status transitions (new → contacted → quoted
→ booked → won/lost) — all transitions beyond `new` require manual update.
No UI for this yet either. Deferred, not forgotten.
