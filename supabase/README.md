# Family Bucket backend

The app uses the existing Supabase Auth connection and the generated
`kv_store_a728503c` table. Do not recreate the Auth users or the table.

## What is currently blocking the app?

Email/password authentication talks directly to Supabase Auth; it does not
need an Edge Function. The family/profile/wishes feature added a separate
authenticated Edge Function. A successful login followed by a data-service
error is not the same as an invalid email/password.

If both `/health` and `/workspace` return `404` with
`Requested function was not found`, the Edge Function is not deployed in
the connected project. Do not recreate existing Auth users or rotate keys
to fix this. Complete steps 1–3 below.

## 1. Check Auth settings

In the **same Supabase project** used by `utils/supabase/info.tsx`:

1. **Authentication → Sign In / Providers → Email**: enable email sign-in.
   Enable new user signups if self-registration is wanted.
2. **Authentication → URL Configuration → Site URL**: set the published app's
   origin (for example, `https://your-app.figma.site`, not a Supabase URL).
3. Under **Redirect URLs**, allow these exact URLs for that origin:
   - `https://YOUR_APP/login`
   - `https://YOUR_APP/set-password`
   - `https://YOUR_APP/`
   If testing email links in a browser-accessible Make preview, add those
   exact preview URLs too. Preview and published origins may be different.
4. Keep **Confirm email** enabled if email verification is desired. New
   self-registered users must confirm the email before password login.
   Already confirmed users do not need to register again.
5. For dashboard-sent invitations, keep the invite email's default
   `{{ .ConfirmationURL }}` link. It verifies the invitation before redirecting
   to your Site URL; the app detects the invited session and asks for a password.
   Do **not** replace that link with a plain `/set-password` URL.
   If invitations are sent through the Admin API, pass a `redirectTo` matching
   an allowed app URL.
6. For production delivery, configure your own SMTP provider under
   **Authentication → Email / SMTP Settings**. Supabase's default mail sender
   is rate limited and may restrict recipients to project team members.

## 2. Prepare the data table

Open **SQL Editor → New query**, paste the contents of `supabase/setup.sql`,
and run it once. This is safe to rerun: it creates the existing Make KV table
only if missing, enables RLS, and restricts direct access to the server's
service role. It does not delete users or existing bucket records.

Do not add public read/write policies for the browser. Family membership and
wish ownership are enforced by the authenticated Edge Function.

## 3. Deploy the server

The frontend build does not deploy an Edge Function. From the repository root,
with Node.js/pnpm installed and permission to deploy to the connected project:

```sh
pnpm dlx supabase@2 login
pnpm dlx supabase@2 functions deploy make-server-a728503c --project-ref YOUR_PROJECT_REF --use-api
```

Find the project reference in Supabase → Project Settings → General. It is also
the public `projectId` export in `utils/supabase/info.tsx`.
These commands intentionally use CLI v2, whose verified flags include
`--project-ref`. `--use-api` bundles remotely, so Docker is not required.

`supabase/config.toml` maps the existing function name to its source entrypoint.
The gateway JWT check is disabled because the function validates every private
request itself with `auth.getUser(accessToken)`. Only `/health` is public.
Never put the service role key in frontend code.

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` in the hosted Edge Function runtime. No new frontend
secret is required. Check **Edge Functions → make-server-a728503c** exists after
deploying, and consult that function's logs if startup fails.

If deployed through the dashboard instead of this CLI configuration, include
both `supabase/functions/server/index.tsx` and the sibling `domain.ts` module,
and turn off the gateway's **Verify JWT with legacy secret** toggle for this
function. Do not remove the function's own `auth.getUser` validation.

## 4. Verify

Replace `YOUR_PROJECT_REF` in this command:

```sh
curl -i "https://YOUR_PROJECT_REF.supabase.co/functions/v1/make-server-a728503c/health"
```

Expected: HTTP **200** and `{"status":"ok"}`. Then:

```sh
curl -i "https://YOUR_PROJECT_REF.supabase.co/functions/v1/make-server-a728503c/workspace"
```

Expected without a user's access token: HTTP **401**, not 404. This is correct:
the workspace is private. Return to the app and use **I've deployed it. Try
again**, or sign in normally.

### Troubleshooting

| Symptom | What to check |
| --- | --- |
| `Invalid login credentials` on the login form | Existing user's email/password in this same project. No data-service deployment changes the password. |
| `Email not confirmed` | Confirm the signup email first. |
| Invite redirects to localhost or the wrong site | Correct Auth Site URL and send a fresh invite link. |
| Expired invite | Ask the inviter for a fresh usable link. Do not manually append tokens or paste them into chat. |
| `Requested function was not found` / 404 | Deploy the exact function name to the same project the frontend uses. |
| `Invalid JWT` from the function gateway | Deploy using this repo's configuration; the function validates the user's bearer token itself. |
| `/health` is 200 but workspace is 500 | Apply `setup.sql`; check Edge Function logs and the built-in runtime secrets. |
| Signup/invite email never arrives | Check spam, Auth logs, SMTP settings, and email-send rate/recipient limits. |

The setup cannot be completed by changing only Authentication settings:
the Edge Function and the data table are separate requirements.

## Behavior

- Profiles are keyed by verified Supabase Auth user ID. No email is exposed to
  other members.
- Each account owns its wishes. A solo account sees only its wishes; family
  members see wishes owned by current family members.
- Only a wish’s owner can edit, delete, or complete it.
- One current family membership and one family creation per account. The
  creation allowance is not reset by leaving or disbanding a family.
- A creator leaving/disbanding removes the family, not other users or wishes.
- Only a creator can remove another member. Removal rotates the invite code.
- Invalid join attempts are limited to eight per ten minutes per account.
- Onboarding and the group welcome acknowledgement are persisted.
- Account deletion requires the current password and an explicit confirmation.
  It removes the user’s wishes, disbands any owned family, and deletes their
  Auth identity. Other members keep their own wishes. A non-personal deletion
  tombstone blocks already-in-flight requests from recreating removed data.
- The existing Make KV store uses one versioned workspace document with atomic
  compare-and-swap updates. This is suited to a small app; move to indexed
  relational tables and database transactions before large-scale usage.
- Clients refresh shared state every 20 seconds and when the window regains
  focus; this is not a realtime subscription.

## Checks

```sh
node --experimental-strip-types --test src/lib/invite.test.ts src/lib/workspace-errors.test.ts supabase/functions/server/domain.test.ts
pnpm exec tsc --noEmit
pnpm dlx deno check --no-config --no-lock supabase/functions/server/index.tsx
pnpm build
```

For live acceptance testing, use two test accounts to verify create/join,
shared visibility, owner-only edits/removal, leaving, and password-confirmed
account deletion. Never use a real account to test irreversible deletion.
