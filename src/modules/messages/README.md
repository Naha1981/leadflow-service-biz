# messages module

**Purpose**: intent classification and message logging.

**Public service API**:
- `classifyIntent(text)` (`intent.ts`) — keyword-based MVP classifier.
  Upgrade path: swap internals for an AI-provider call (architecture
  standard §3) without changing the signature.
- `logMessage(params)` (`service.ts`) — logs inbound/outbound messages

**Known gaps** (see whatsapp-logic-workflows doc for full detail):
- No Sesotho/code-switched keyword coverage
- No media message handling
- No debounce for rapid-fire messages
- No niche-specific reply templates (currently global `REPLIES`)
