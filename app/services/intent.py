"""
Intent classification for inbound WhatsApp messages.

MVP: fast, free, zero-latency keyword matching — good enough for the
core intents these businesses actually need.

UPGRADE PATH (post-revenue, when volume/nuance justifies the cost):
swap `classify()` internals to call the Anthropic API with a small
prompt like:
    "Classify this message from a customer of a {niche} business into
     one of: quote, booking, pricing, callback, complaint, other.
     Message: {text}. Respond with just the label."
Keep the function signature identical so nothing else in the app changes.
"""

GREETINGS = {"hi", "hello", "hey", "start", "menu", "sawubona", "dumela", "lumela", "thobela"}
QUOTE_WORDS = {"quote", "price", "how much", "cost", "estimate"}
BOOK_WORDS = {"book", "booking", "appointment", "schedule", "when can you", "reserve"}
CALLBACK_WORDS = {"call me", "call back", "phone me", "ring me", "call"}
PRICING_WORDS = {"prices", "pricing", "rates", "packages", "how much does it cost"}
NEGATION = {"don't", "do not", "no need", "not needed", "not interested", "just checking"}


def classify(text: str) -> str:
    t = (text or "").strip().lower()

    if any(t == g or t.startswith(g) for g in GREETINGS):
        return "greeting"
    if any(n in t for n in NEGATION):
        return "other"
    if any(w in t for w in BOOK_WORDS):
        return "booking"
    if any(w in t for w in CALLBACK_WORDS):
        return "callback"
    if any(w in t for w in PRICING_WORDS):
        return "pricing"
    if any(w in t for w in QUOTE_WORDS):
        return "quote"
    return "other"
