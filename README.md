# Lukko Web

Lukko is a Finnish-first focus product for students, office workers, and
families. The web MVP pairs a calm Apple-inspired focus timer with local
history, protected-app choices, and a real Chromium website-blocking companion.

The visual system uses SF-style system typography, generous whitespace,
monochrome surfaces, and a restrained blue accent. The same brand language is
intended to carry into a future Lukko iOS app.

## Run locally

Use Node.js `>=22.13.0`:

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev --audit-level=high
```

## Website blocking

The `extension/` folder contains a Chromium Manifest V3 companion. Install it
from the browser's extensions page using **Load unpacked**, then start a focus
session in Lukko. The extension uses local `declarativeNetRequest` rules to
block the normalized domains in the blocker list until the session pauses,
resets, or finishes.

The web page cannot block iPhone apps or arbitrary websites by itself. iOS app
blocking belongs in a native app using Apple's Screen Time / FamilyControls
capabilities. The UI states this boundary explicitly.

## Local data and security

- Focus settings, block lists, theme, app choices, and session history stay in
  browser `localStorage` under the `lukko-web-mvp-state` key.
- The extension receives only a timer state and validated domain names. It does
  not collect browsing history, page content, credentials, or analytics.
- The Sites worker adds baseline security headers including frame, referrer,
  permissions, opener, and content-type protections.
- There are no secrets or environment variables required by the MVP.
- The production dependency audit for non-development packages reports zero
  vulnerabilities.
- This project is independent from the mobile app at `C:\coding\lukko`.

## Monetization path

The page includes a Pro pricing surface, but this MVP does not collect money or
store payment details. The secure activation path is Stripe-hosted Checkout:

1. Create a Stripe product and recurring price.
2. Store the Stripe secret only in Sites runtime environment variables.
3. Create the Checkout Session from a server-side Worker route.
4. Use Stripe webhooks to verify subscription state server-side.
5. Keep only an entitlement record in durable storage; never trust a local
   storage flag as proof of payment.

No Stripe credentials are present in this repository. Connecting a real price
requires the owner's Stripe account and product/price IDs.
