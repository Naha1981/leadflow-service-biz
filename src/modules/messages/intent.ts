/**
 * Keyword-based intent classifier. Same deliberate MVP choice as the
 * previous FastAPI version: zero cost, zero latency, "good enough to
 * route" rather than perfect. Upgrade path (documented, not built):
 * swap the body of `classify()` for a call through the AI provider
 * abstraction (architecture standard §3) — keep the signature identical
 * so callers never need to change.
 */

const GREETINGS = ["hi", "hello", "hey", "start", "menu", "sawubona", "dumela", "lumela", "thobela"];
const BOOK_WORDS = ["book", "booking", "appointment", "schedule", "when can you", "reserve"];
const CALLBACK_WORDS = ["call me", "call back", "phone me", "ring me", "call"];
const PRICING_WORDS = ["prices", "pricing", "rates", "packages", "how much does it cost"];
const QUOTE_WORDS = ["quote", "price", "how much", "cost", "estimate"];
// "don't need a quote, just checking" should fall through to `other`,
// not match `quote` on the word "quote" alone — ported from the FastAPI
// fix for this exact false-positive.
const NEGATION = ["don't", "do not", "no need", "not needed", "not interested", "just checking"];

export type Intent = "greeting" | "booking" | "callback" | "pricing" | "quote" | "other";

export function classifyIntent(text: string): Intent {
  const t = (text ?? "").trim().toLowerCase();

  if (GREETINGS.some((g) => t === g || t.startsWith(g))) return "greeting";
  if (NEGATION.some((n) => t.includes(n))) return "other";
  if (BOOK_WORDS.some((w) => t.includes(w))) return "booking";
  if (CALLBACK_WORDS.some((w) => t.includes(w))) return "callback";
  if (PRICING_WORDS.some((w) => t.includes(w))) return "pricing";
  if (QUOTE_WORDS.some((w) => t.includes(w))) return "quote";
  return "other";
}

/**
 * Still a real gap (same as the FastAPI version): greetings cover
 * Sesotho/Zulu, but booking/pricing/quote keyword matching is English
 * only. A Sesotho customer asking for a quote in Sesotho won't classify
 * correctly. Flagged here rather than silently left unaddressed.
 */

