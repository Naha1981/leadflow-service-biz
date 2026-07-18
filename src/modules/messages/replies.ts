import type { Intent } from "./intent";

export const GLOBAL_REPLIES: Record<Intent, string> = {
  greeting: "Hi! Reply with one of these:\n1) Quote\n2) Book\n3) Prices\n4) Call back",
  quote: "Great — send us: service needed, suburb, and preferred time. We'll quote you today.",
  booking: "Let's get you booked. What day and time works best, and what's the job?",
  pricing: "Our starting rates depend on the job — tell us what you need and we'll send exact pricing.",
  callback: "Got it — we'll call you back shortly. What's the best time to reach you?",
  other: "Thanks for your message! Reply MENU to see options.",
};

export const NICHE_REPLIES: Record<string, Partial<Record<Intent, string>>> = {
  plumber: {
    quote: "For a plumbing quote, tell us: suburb, the issue (burst pipe / geyser / drain), and when you need it.",
    booking: "We'll dispatch a plumber. What suburb are you in and is this an emergency?",
    pricing: "Plumbing call-outs start at a standard rate — send your suburb and issue for an exact quote.",
  },
  salon: {
    quote: "For pricing, tell us the service (haircut / colour / wash & blow) and preferred stylist.",
    booking: "Which service, which day, and preferred time?",
    pricing: "Prices depend on service and length — tell us what you need and we'll confirm rates.",
  },
  cleaner: {
    quote: "Tell us: property type, number of rooms, and preferred day for a deep-clean quote.",
    booking: "Which day works for you, and is this a once-off or regular clean?",
    pricing: "Rates vary by size and frequency — send details and we'll price it.",
  },
  electrician: {
    quote: "Tell us: suburb, the electrical issue, and when you need it. We'll quote within the hour.",
    booking: "Is this an emergency or planned work? Tell us suburb and job type.",
    pricing: "Electrical call-out rates depend on the job — send suburb + issue for an exact quote.",
  },
  aircon: {
    quote: "Tell us: type of unit (split / cassette / ducted), suburb, and service needed.",
    booking: "Which day suits you? We service all major brands.",
    pricing: "Send your AC type and suburb for an instant quote.",
  },
};

/**
 * Three-tier reply resolution, same precedence as the FastAPI version:
 *   1. Tenant-specific override (customTemplates, from the reply_templates table)
 *   2. Niche default (NICHE_REPLIES)
 *   3. Global default (GLOBAL_REPLIES)
 */
export function resolveReply(params: {
  niche: string | null;
  intent: Intent;
  customTemplates: Record<string, string>; // intent -> body, from DB
}): string {
  const { niche, intent, customTemplates } = params;

  if (customTemplates[intent]) return customTemplates[intent];

  const nicheKey = (niche ?? "").toLowerCase();
  const nicheReply = NICHE_REPLIES[nicheKey]?.[intent];
  if (nicheReply) return nicheReply;

  return GLOBAL_REPLIES[intent] ?? GLOBAL_REPLIES.other;
}
