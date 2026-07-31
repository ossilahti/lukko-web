import assert from "node:assert/strict";
import test from "node:test";

const stripeUrl = new URL("../worker/stripe.ts", import.meta.url);
const { getStripeConfig, getEntitlement, verifyWebhook } = await import(stripeUrl.href);

test("Stripe configuration requires server-only secrets", () => {
  assert.equal(getStripeConfig({ STRIPE_PRICE_ID: "price_test" }), null);
  assert.ok(getStripeConfig({ STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_ID: "price_test", LUKKO_SESSION_SECRET: "local-secret" }));
});

test("free entitlement is returned without exposing payment configuration", async () => {
  const response = await getEntitlement(new Request("https://lukko.example/api/entitlement"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { pro: false, configured: false });
});

test("Stripe webhooks reject missing signatures", async () => {
  const response = await verifyWebhook(new Request("https://lukko.example/api/stripe/webhook", { method: "POST", body: "{}" }), { STRIPE_WEBHOOK_SECRET: "whsec_test" });
  assert.equal(response.status, 400);
});
