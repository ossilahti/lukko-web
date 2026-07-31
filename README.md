# Lukko Web

Lukko is a Finnish-first focus product for students, office workers, and
families. The web MVP is intentionally simple: one focus timer, a short list
of website blocks, and a small local history.

The interface uses a restrained 2015-style web layout: system sans-serif type,
white and grey surfaces, thin borders, blue links, and very little decoration.
The same straightforward brand can carry into a future Lukko iOS app.

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

- Focus settings, block lists, theme, and session history stay in browser
  `localStorage` under the `lukko-web-mvp-state` key.
- The extension receives only a timer state and validated domain names. It does
  not collect browsing history, page content, credentials, or analytics.
- The Sites worker adds baseline security headers including frame, referrer,
  permissions, opener, and content-type protections.
- Stripe secrets are server-only runtime values. They are never put in the
  browser bundle or stored in localStorage.
- The production dependency audit for non-development packages should report
  zero high-severity vulnerabilities.
- This project is independent from the mobile app at `C:\coding\lukko`.

## Freemium and Stripe

Free visitors see one clearly labelled Lukko house-ad placement. Pro visitors
do not. This keeps the first version honest while leaving a safe place for a
future consent-based ad network.

The Pro flow is implemented in the server-only Cloudflare Worker:

1. Create a Stripe product with a recurring monthly price.
2. Set the values in `stripe.env.example` as private Sites runtime variables.
3. The browser posts only an email address to `/api/checkout`.
4. The Worker creates a subscription-mode Stripe Checkout Session; card data
   never touches Lukko.
5. After Checkout, the Worker verifies the returned session against a signed,
   HttpOnly browser cookie and checks the live Stripe subscription status.
6. `/api/portal` opens Stripe's hosted customer portal for cancellations and
   billing changes.
7. `/api/stripe/webhook` verifies Stripe's HMAC signature. The live entitlement
   check remains the source of truth rather than localStorage.

No Stripe credentials are committed. To activate real payments, configure the
private runtime variables in `stripe.env.example`, create a Stripe webhook for
`/api/stripe/webhook`, and point it at the deployed site. Do not send secret
keys in chat or put them in the repository.
