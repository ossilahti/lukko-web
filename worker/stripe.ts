export type StripeConfig = {
  secretKey: string;
  priceId: string;
  sessionSecret: string;
  webhookSecret?: string;
};

type StripeObject = Record<string, unknown>;

export function getStripeConfig(env: Record<string, unknown>): StripeConfig | null {
  const secretKey = typeof env.STRIPE_SECRET_KEY === "string" ? env.STRIPE_SECRET_KEY : "";
  const priceId = typeof env.STRIPE_PRICE_ID === "string" ? env.STRIPE_PRICE_ID : "";
  const sessionSecret = typeof env.LUKKO_SESSION_SECRET === "string" ? env.LUKKO_SESSION_SECRET : "";
  const webhookSecret = typeof env.STRIPE_WEBHOOK_SECRET === "string" ? env.STRIPE_WEBHOOK_SECRET : undefined;
  return secretKey && priceId && sessionSecret ? { secretKey, priceId, sessionSecret, webhookSecret } : null;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function sameValue(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

export function parseCookies(header: string | null) {
  const cookies: Record<string, string> = {};
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    cookies[key] = decodeURIComponent(part.slice(separator + 1).trim());
  }
  return cookies;
}

function serializeCookie(name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Secure`;
}

async function signedSessionValue(sessionId: string, secret: string) {
  const payload = `${sessionId}.${Date.now()}`;
  return `${payload}.${base64Url(await hmac(payload, secret))}`;
}

async function verifySessionValue(value: string | undefined, secret: string) {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [sessionId, createdAt, signature] = parts;
  if (!sessionId || !/^\d+$/.test(createdAt)) return null;
  const expected = base64Url(await hmac(`${sessionId}.${createdAt}`, secret));
  return sameValue(signature, expected) ? sessionId : null;
}

async function stripeRequest(path: string, config: StripeConfig, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Basic ${btoa(`${config.secretKey}:`)}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/x-www-form-urlencoded");
  const response = await fetch(`https://api.stripe.com/v1${path}`, { ...init, headers });
  const data = await response.json() as StripeObject;
  return { response, data };
}

function json(data: StripeObject, status = 200, headers?: HeadersInit) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function errorMessage(status: number, message: string) {
  return json({ error: message }, status);
}

function validEmail(value: unknown) {
  return typeof value === "string" && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function appOrigin(request: Request, env: Record<string, unknown>) {
  const configured = typeof env.APP_URL === "string" ? env.APP_URL : new URL(request.url).origin;
  return configured.replace(/\/$/, "");
}

async function retrieveSession(sessionId: string, config: StripeConfig) {
  const result = await stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`, config);
  if (!result.response.ok) return null;
  return result.data;
}

function hasActiveSubscription(session: StripeObject) {
  const subscription = session.subscription as StripeObject | null | undefined;
  const status = typeof subscription?.status === "string" ? subscription.status : "";
  return session.mode === "subscription" && session.status === "complete" && ["paid", "no_payment_required"].includes(String(session.payment_status)) && ["active", "trialing"].includes(status);
}

export async function createCheckout(request: Request, env: Record<string, unknown>) {
  const config = getStripeConfig(env);
  if (!config) return errorMessage(503, "Stripe-maksaminen ei ole vielä määritetty tässä ympäristössä.");

  let body: { email?: unknown } = {};
  try { body = await request.json() as { email?: unknown }; } catch { return errorMessage(400, "Virheellinen pyyntö."); }
  if (body.email && !validEmail(body.email)) return errorMessage(400, "Tarkista sähköpostiosoite.");

  const nonce = randomToken();
  const origin = appOrigin(request, env);
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": config.priceId,
    "line_items[0][quantity]": "1",
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=canceled`,
    client_reference_id: nonce,
    "metadata[checkout_nonce]": nonce,
    "subscription_data[metadata][checkout_nonce]": nonce,
    customer_creation: "always",
    allow_promotion_codes: "true",
  });
  if (body.email) form.set("customer_email", String(body.email));

  try {
    const result = await stripeRequest("/checkout/sessions", config, { method: "POST", body: form.toString() });
    if (!result.response.ok || typeof result.data.url !== "string") return errorMessage(502, "Stripe ei voinut aloittaa maksua.");
    return new Response(JSON.stringify({ url: result.data.url }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "Set-Cookie": serializeCookie("lukko_checkout_nonce", nonce, 3600) } });
  } catch {
    return errorMessage(502, "Stripeen ei saatu yhteyttä.");
  }
}

export async function getEntitlement(request: Request, env: Record<string, unknown>) {
  const config = getStripeConfig(env);
  if (!config) return json({ pro: false, configured: false });
  const cookies = parseCookies(request.headers.get("cookie"));
  const url = new URL(request.url);
  const checkoutSessionId = url.searchParams.get("session_id");
  let sessionId = checkoutSessionId ? null : await verifySessionValue(cookies.lukko_pro_session, config.sessionSecret);
  const headers = new Headers();

  if (checkoutSessionId) {
    const nonce = cookies.lukko_checkout_nonce;
    const session = await retrieveSession(checkoutSessionId, config);
    if (!session || !nonce || session.client_reference_id !== nonce || !hasActiveSubscription(session)) return errorMessage(403, "Maksua ei voitu vahvistaa.");
    sessionId = checkoutSessionId;
    headers.append("Set-Cookie", serializeCookie("lukko_pro_session", await signedSessionValue(sessionId, config.sessionSecret), 31536000));
    headers.append("Set-Cookie", serializeCookie("lukko_checkout_nonce", "", 0));
  }

  if (!sessionId) return json({ pro: false, configured: true });
  const session = await retrieveSession(sessionId, config);
  if (!session || !hasActiveSubscription(session)) {
    headers.set("Set-Cookie", serializeCookie("lukko_pro_session", "", 0));
    return json({ pro: false, configured: true }, 200, headers);
  }
  return json({ pro: true, configured: true }, 200, headers);
}

export async function createPortal(request: Request, env: Record<string, unknown>) {
  const config = getStripeConfig(env);
  if (!config) return errorMessage(503, "Stripe-maksaminen ei ole vielä määritetty tässä ympäristössä.");
  const cookies = parseCookies(request.headers.get("cookie"));
  const sessionId = await verifySessionValue(cookies.lukko_pro_session, config.sessionSecret);
  if (!sessionId) return errorMessage(401, "Kirjaudu ensin Stripe-tilauksellasi.");
  const session = await retrieveSession(sessionId, config);
  const customer = typeof session?.customer === "string" ? session.customer : "";
  if (!session || !customer || !hasActiveSubscription(session)) return errorMessage(403, "Aktiivista tilausta ei löytynyt.");
  const form = new URLSearchParams({ customer, return_url: `${appOrigin(request, env)}/` });
  try {
    const result = await stripeRequest("/billing_portal/sessions", config, { method: "POST", body: form.toString() });
    if (!result.response.ok || typeof result.data.url !== "string") return errorMessage(502, "Tilaussivua ei voitu avata.");
    return json({ url: result.data.url });
  } catch {
    return errorMessage(502, "Stripeen ei saatu yhteyttä.");
  }
}

export async function verifyWebhook(request: Request, env: Record<string, unknown>) {
  const secret = typeof env.STRIPE_WEBHOOK_SECRET === "string" ? env.STRIPE_WEBHOOK_SECRET : "";
  const signature = request.headers.get("stripe-signature") ?? "";
  if (!secret || !signature) return errorMessage(400, "Webhook-allekirjoitus puuttuu.");
  const rawBody = await request.text();
  const parts = Object.fromEntries(signature.split(",").map((part) => part.split("=", 2))) as Record<string, string>;
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300 || !parts.v1) return errorMessage(400, "Webhook-allekirjoitus ei kelpaa.");
  const expected = hex(await hmac(`${parts.t}.${rawBody}`, secret));
  if (!sameValue(parts.v1, expected)) return errorMessage(400, "Webhook-allekirjoitus ei kelpaa.");
  try { JSON.parse(rawBody); } catch { return errorMessage(400, "Webhookin sisältö ei kelpaa."); }
  return json({ received: true });
}
