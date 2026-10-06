# Lifeline Tap-Band

App-less, battery-free NFC emergency profile and private digital vault prototype.

## MVP

- NFC tag opens a band URL in any phone browser.
- First-time activation flow.
- Emergency profile with medical information and emergency contacts.
- Owner-controlled location visibility.
- PIN-protected Personal Vault.
- Cloudflare Workers + D1-ready backend structure.
- Uses dummy/test information for development. Do not upload real identity documents to this prototype.

## Architecture

NFC tag → `/b/<band-id>` → Worker → D1 → Emergency Dashboard / Personal Vault

## Security note

This is a prototype, not a certified medical or identity system. Real Aadhaar/PAN/passport data should only be introduced after appropriate security, privacy, legal and compliance review.
