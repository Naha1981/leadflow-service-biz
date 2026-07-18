/**
 * Keyword-based intent classifier. Same deliberate MVP choice as the
 * previous FastAPI version: zero cost, zero latency, "good enough to
 * route" rather than perfect. Upgrade path (documented, not built):
 * swap the body of `classify()` for a call through the AI provider
 * abstraction (architecture standard §3) — keep the signature identical
 * so callers never need to change.
 */

const GREETINGS = ["hi", "hello", "hey", "start", "menu", "sawubona", "dumela"];
const BOOK_WORDS = ["book", "booking", "appointment", "schedule"];
const CALLBACK_WORDS = ["call me", "call back", "phone me", "ring me"];
const PRICING_WORDS = ["prices", "pricing", "rates", "packages"];
const QUOTE_WORDS = ["quote", "price", "how much", "cost", "estimate"];

export type Intent = "greeting" | "booking" | "callback" | "pricing" | "quote" | "other";

export function classifyIntent(text: string): Intent {
  const t = (text ?? "").trim().toLowerCase();

  if (GREETINGS.some((g) => t === g || t.startsWith(g))) return "greeting";
  if (BOOK_WORDS.some((w) => t.includes(w))) return "booking";
  if (CALLBACK_WORDS.some((w) => t.includes(w))) return "callback";
  if (PRICING_WORDS.some((w) => t.includes(w))) return "pricing";
  if (QUOTE_WORDS.some((w) => t.includes(w))) return "quote";
  return "other";
}

export const REPLIES: Record<Intent, string> = {
  greeting: "Hi! Reply with one of these:\n1) Quote\n2) Book\n3) Prices\n4) Call back",
  quote: "Great — send us: service needed, suburb, and preferred time. We'll quote you today.",
  booking: "Let's get you booked. What day and time works best, and what's the job?",
  pricing: "Our starting rates depend on the job — tell us what you need and we'll send exact pricing.",
  callback: "Got it — we'll call you back shortly. What's the best time to reach you?",
  other: "Thanks for your message! Reply MENU to see options.",
};
