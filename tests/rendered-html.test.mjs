import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Lukko dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Lukko — yksi asia kerrallaan<\/title>/i);
  assert.match(html, /Yksi asia kerrallaan/);
  assert.match(html, /Sivustot pois tieltä/);
  assert.match(html, /Suojatut sovellukset/);
  assert.match(html, /Stripe-hosted Checkout/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site|react-loading-skeleton/i);
});
