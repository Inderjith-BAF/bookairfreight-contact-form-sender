# BookAirfreight Contact Form Sender

Private BookAirfreight workspace for automated contact-form research and submission.

## Workflow

1. Paste contact-form URLs or import a TXT/CSV.
2. Enter sender details.
3. Use Preview mode first. It opens a real Chromium browser, detects forms, maps fields, and fills them without submitting.
4. Switch to Live dispatch when the mappings look correct.
5. Each target returns a status and is stored in Supabase when credentials are configured.

CAPTCHA and anti-bot challenges are detected and stopped for manual handling. They are not bypassed.

## Local setup

Node.js 20.9+ is required.

Run npm install, copy .env.example to .env.local, set PUPPETEER_EXECUTABLE_PATH to the installed Chrome/Chromium executable, then run npm run dev.

## Vercel

The production API uses @sparticuz/chromium and puppeteer-core. The Vercel function is configured for a 60 second maximum where the selected Vercel plan permits it.

Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel. Never expose the service-role key to the browser.