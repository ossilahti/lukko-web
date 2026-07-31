# Lukko Focus Blocker

This is the real desktop website-blocking companion for the Lukko web MVP.
It targets Chromium browsers (Chrome, Edge, Brave, and similar) using
Manifest V3 `declarativeNetRequest` rules.

## Install locally

1. Open `chrome://extensions` (or the equivalent extensions page).
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select this `extension` folder.
4. Open the Lukko site and start a focus session.
5. Add domains such as `tiktok.com` or `reddit.com` to the blocker list.

The website sends only the focus state and normalized domain list to the
extension through the page content script. The service worker creates local
dynamic blocking rules and removes them when the timer pauses, resets, or
finishes. No browsing history, page content, or credentials are collected.

## Scope

This blocks selected website domains in Chromium while a Lukko session is
active. It does not block iPhone apps; that requires the separate native iOS
product and Apple Screen Time / FamilyControls capabilities.
