# BookAirfreight Contact Form Sender

Private BookAirfreight workspace for automated contact-form research and authorized submission.

## Workflow

1. Paste authorized contact-form URLs or import a TXT/CSV.
2. Enter sender details.
3. Use Preview mode first. It opens a real Chromium browser, detects forms, maps fields, and fills them without submitting.
4. Switch to Live dispatch when the mappings look correct.
5. Each target returns a status and is stored in Supabase when credentials are configured.
6. CAPTCHA and anti-bot challenges are detected, skipped, and added to the CAPTCHA queue. They are never bypassed.

## Safety

- Only use targets you are authorized to test or contact.
- CAPTCHA/anti-bot challenges are intentionally skipped; the app does not attempt to solve or bypass them.
- Target URLs are restricted to HTTP/HTTPS and public network destinations. Localhost, private/reserved IPs, embedded credentials, and non-standard ports are rejected.
- Keep the Supabase service-role key server-side and never expose it to the browser.
- Before exposing the app publicly, protect the workspace with authentication/access control and configure Vercel rate limiting for /api/submit.

## Local setup

Node.js 20.9+ is required.

Run npm install, copy .env.example to .env.local, set PUPPETEER_EXECUTABLE_PATH to the installed Chrome/Chromium executable, then run npm run dev.

## Vercel

The production API uses @sparticuz/chromium and puppeteer-core. The Vercel function is configured for a 60 second maximum where the selected Vercel plan permits it.

Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel. Never expose the service-role key to the browser.

For public deployment, also configure access control and a rate-limit rule for /api/submit. Vercel supports rate limiting through its Firewall/WAF.