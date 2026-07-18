type BusinessHours = {
  open?: string; // "08:00"
  close?: string; // "17:00"
  timezone?: string; // "Africa/Johannesburg"
};

/**
 * Returns true if `now` falls outside the tenant's configured business
 * hours. If no business_hours is set, always returns false (in-hours) —
 * so tenants who haven't configured this see no behavior change, rather
 * than silently telling their customers "after hours" by default.
 *
 * Handles overnight ranges (close earlier than open) correctly, same as
 * the FastAPI version.
 */
export function isAfterHours(businessHours: unknown): boolean {
  const hours = businessHours as BusinessHours | null;
  if (!hours || typeof hours !== "object" || !hours.open || !hours.close) {
    return false;
  }

  const tz = hours.timezone ?? "Africa/Johannesburg";

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const currentStr = formatter.format(now); // "HH:MM"

    const toMinutes = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };

    const current = toMinutes(currentStr);
    const open = toMinutes(hours.open);
    const close = toMinutes(hours.close);

    if (open <= close) {
      return !(current >= open && current <= close);
    }
    // Overnight range, e.g. open 20:00, close 06:00
    return !(current >= open || current <= close);
  } catch {
    return false;
  }
}
