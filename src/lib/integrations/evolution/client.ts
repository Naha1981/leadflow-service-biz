/**
 * Evolution API client — the ONLY place in this app that talks to
 * Evolution directly. Business logic and route handlers call these
 * functions; nobody makes raw fetch() calls to Evolution elsewhere.
 * (See evolution-api-whatsapp skill for the underlying REST contract.)
 */

const EVO_BASE_URL = process.env.EVO_BASE_URL ?? "http://localhost:8080";
const EVO_API_KEY = process.env.EVO_GLOBAL_API_KEY ?? "";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "";

function headers() {
  return {
    apikey: EVO_API_KEY,
    "Content-Type": "application/json",
  };
}

export async function createInstance(instanceName: string) {
  const res = await fetch(`${EVO_BASE_URL}/instance/create`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
  if (!res.ok) throw new Error(`Evolution createInstance failed: ${res.status}`);
  return res.json();
}

export async function setWebhook(instanceName: string) {
  const res = await fetch(`${EVO_BASE_URL}/webhook/set/${instanceName}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      url: `${PUBLIC_BASE_URL}/api/webhooks/evolution/${instanceName}`,
      webhook_by_events: true,
      webhook_base64: false,
      events: ["MESSAGES_UPSERT", "SEND_MESSAGE", "CONNECTION_UPDATE"],
    }),
  });
  if (!res.ok) throw new Error(`Evolution setWebhook failed: ${res.status}`);
  return res.json();
}

export async function getQr(instanceName: string) {
  const res = await fetch(`${EVO_BASE_URL}/instance/connect/${instanceName}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Evolution getQr failed: ${res.status}`);
  return res.json();
}

export async function sendText(instanceName: string, number: string, text: string) {
  const res = await fetch(`${EVO_BASE_URL}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ number, textMessage: { text } }),
  });
  if (!res.ok) throw new Error(`Evolution sendText failed: ${res.status}`);
  return res.json();
}

export async function instanceStatus(instanceName: string) {
  const res = await fetch(`${EVO_BASE_URL}/instance/connectionState/${instanceName}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Evolution instanceStatus failed: ${res.status}`);
  return res.json();
}

/**
 * Raw inbound webhook payload shape from Evolution's MESSAGES_UPSERT event.
 * Kept minimal/loose on purpose — normalization happens at the webhook
 * boundary (see app/api/webhooks/evolution/[instance]/route.ts), not here.
 */
export type EvolutionInboundPayload = {
  event?: string;
  instance?: string;
  data?: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      id?: string;
    };
    message?: {
      conversation?: string;
    };
    messageTimestamp?: number;
  };
};
