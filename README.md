# Lukko Web MVP

Lukko Web is a small Finnish-first focus-session demo inspired by the Lukko
iPhone app. It helps a visitor choose a focus duration, simulate protected
apps, and record completed sessions locally in the browser.

This is deliberately a local MVP. The browser demo does not block real apps,
websites, or device activity. Real app protection remains an iOS capability.

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
```

The site uses the Sites-compatible vinext starter and keeps optional D1/R2
bindings disabled in `.openai/hosting.json`. No hosting or backend setup is
needed for the MVP.

## Local data and security

- Focus settings, mock app selections, and session history stay in browser
  `localStorage` under the `lukko-web-mvp-state` key.
- There is no authentication, database, payment flow, analytics, or network
  API in the product surface.
- The UI renders fixed local data and does not use `dangerouslySetInnerHTML`.
- There are no secrets or environment variables required by the app.
- The worker adds baseline security headers when the Sites worker is used.
- This project is independent from the mobile app at `C:\coding\lukko`.
