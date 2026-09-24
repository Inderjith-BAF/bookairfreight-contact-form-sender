# BookAirfreight Outbound OS — first test setup

## 1. Pull the final code
```powershell
git pull origin main
npm install
```

## 2. Apply the new Supabase migrations
The new migrations are:
- 0003_outbound_os.sql
- 0004_outbound_import_fields.sql
- 0005_seed_outbound_sequences.sql

Run:
```powershell
npx supabase db push
```

## 3. Browser Supabase environment
The app needs:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```
Keep the service-role key server-side only.

## 4. Create the first admin login
Create the first user through Supabase Dashboard > Authentication > Users. Do not insert directly into auth.users.

Then, in SQL Editor, provision that Auth user's ID in the outbound profile table:
```sql
insert into public.outbound_profiles (id, full_name, role, active)
select id, 'Inderjith', 'admin', true
from auth.users
where email = 'YOUR_ADMIN_EMAIL'
on conflict (id) do update
set full_name = excluded.full_name, role = 'admin', active = true;
```

After signing in as the admin, use **Team & Access** to create the four employee logins and assign their sending accounts.

## 5. Run the app
```powershell
npm run lint
npm run build
npm run dev
```

Open the local app and test the full flow.

## What to test first
1. Admin login.
2. Create one member login.
3. Member login and confirm only their own workspace is visible.
4. Select a sequence.
5. Paste 10 account emails into Accounts.
6. Paste 10 subjects into Subjects.
7. Paste 10 content values into Content.
8. Confirm row order stays aligned.
9. Enter daily metrics and save.
10. Admin opens Daily Report and sees the consolidated result.
11. Switch Weekly / Monthly and verify date ranges.
12. Upload one historical XLSX and confirm the original activity dates are retained.
13. Test the Contact Forms channel while authenticated.
14. Run the existing CAPTCHA-controlled contact-form tests.
15. Test all four employee accounts before importing the full 3-year history.

Historical imports use the activity date from the source file. The import timestamp is stored separately, so an old record is not re-dated to the current day.
