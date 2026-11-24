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
with Node.js/npm installed and permission to deploy to the connected project:

```sh
npx supabase@2 login
npx supabase@2 functions deploy make-server-a728503c --project-ref YOUR_PROJECT_REF --use-api
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
`supabase/functions/server/index.tsx` and its sibling `domain.ts`, `chat.ts`,
and `rules.ts` modules,
and turn off the gateway's **Verify JWT with legacy secret** toggle for this
function. Do not remove the function's own `auth.getUser` validation.

## 4. Verify

Replace `YOUR_PROJECT_REF` in this command:

```sh
curl -i "https://YOUR_PROJECT_REF.supabase.co/functions/v1/make-server-a728503c/health"
```

Expected: HTTP **200** with `status: "ok"` and **`apiVersion: 2`**. The version
confirms this deployment includes messaging. Then:

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

## Messaging upgrade

Redeploy the function after pulling the latest code, even if login and bucket
lists already work. The frontend build alone does not update the server.
No new SQL tables, secrets, or changes to Auth signup/invite settings are
needed for messaging if the original setup is complete. Existing KV records
are upgraded automatically on their first authenticated request. Existing
families get empty family threads; no example messages are seeded.

### Display names

- Supabase Auth `user_metadata.display_name` is the canonical display name.
  Existing Auth `full_name` or `name` values are recognized as fallbacks.
- The profile form writes `display_name` and `full_name` to Auth. Clearing it
  restores email display. An old app alias that a user deliberately edited is
  migrated into their Auth profile once; the old default "Memory maker" is not.
- Display order is **email fallback → Auth display name → family-chat alias**.
  The family-chat alias overrides only inside its family conversation.
- Email fallback is intentional, so conversation participants can see an email
  when the account has no display name. There is no public user directory.

### Enforced chat policies

- Private messages are opened with a recipient's exact account email. The
  server resolves the account through Supabase Auth without exposing an email
  search directory. New-chat attempts are rate-limited.
- Family chats are one-to-many. The creator can assign or clear chat-only
  member aliases. Aliases remain in the family thread across leave/rejoin.
- Every sender (creator or member) may edit **their own** message within
  **150 seconds of the original send**, only if no other participant has
  sent a newer message in that thread. Sending another message yourself does
  not count as a reply. Editing does not restart the clock.
- Both conditions and the expected message revision are checked server-side
  inside each atomic compare-and-swap attempt. An opened edit form does not
  reserve the right to edit; expired, answered, or stale saves are rejected.
- Edits retain the original and each accepted version. Participants can open
  edit history from the edited tag.
- Leaving stores a closed membership window. A former member can read only
  messages and edits visible during their membership, never later messages or
  later edits. Sending/editing is disabled. These keepsake threads cannot be
  deleted.
- **1.5 months is implemented as 45 × 24 hours.** Both invite-code joins and
  direct thread rejoins enforce the 45-day cooldown. Eligible voluntary leavers
  can rejoin from the old thread without an invite code if not in another family.
- Removed members also wait 45 days and then need a fresh invitation code;
  the thread's rejoin button cannot bypass a creator's removal.
- Rejoining opens a new membership window. The member keeps their old history
  and sees new messages after returning, but not messages sent while absent.
- A member must leave their current family before joining another. A creator
  must explicitly disband instead of leaving. Disbanded family threads remain
  read-only and cannot be rejoined.
- Avatar order uses the most recent **visible** message, then original join
  time. Four member avatars are shown, followed by an ellipsis when needed.
- Chat polls every five seconds while visible and refreshes on window focus.
  This is polling, not a realtime subscription or an email notification service.
- "Private" means authenticated conversation access control, not end-to-end
  encryption. Figma Make is not intended for sensitive personal information.

## Other behavior

- Profiles are keyed by verified Supabase Auth user ID.
- Each account owns its wishes. A solo account sees only its wishes; family
  members see wishes owned by current family members.
- Only a wish’s owner can edit, delete, or complete it.
- One current family membership and one family creation per account. The
  creation allowance is not reset by leaving or disbanding a family.
- A creator must disband their family to join another; this archives its chat
  instead of deleting it, and does not delete other users or their wishes.
- Only a creator can remove another member. Removal rotates the invite code.
- Invalid join attempts are limited to eight per ten minutes per account.
- Onboarding and the group welcome acknowledgement are persisted.
- Account deletion requires the current password and an explicit confirmation.
  It removes the user’s wishes, sent messages, and family aliases, disbands any owned family, and deletes their
  Auth identity. Other members keep their own wishes. A non-personal deletion
  tombstone blocks already-in-flight requests from recreating removed data.
- The existing Make KV store uses one versioned workspace document with atomic
  compare-and-swap updates. This is suited to a small app; move to indexed
  relational tables and database transactions before large-scale usage.
- Clients refresh bucket-list state every 20 seconds and chat every five
  seconds while visible, plus on window focus.

## Checks

```sh
node --experimental-strip-types --test src/lib/invite.test.ts src/lib/workspace-errors.test.ts supabase/functions/server/domain.test.ts supabase/functions/server/chat.test.ts
pnpm exec tsc --noEmit
pnpm dlx deno check --no-config --no-lock supabase/functions/server/index.tsx
pnpm build
```

For live acceptance testing, use two test accounts to verify create/join,
shared visibility, owner-only edits/removal, leaving, and password-confirmed
account deletion. Never use a real account to test irreversible deletion.
Also verify private-message isolation, family aliases, edit rejection after
a reply, and a former member's frozen history using separate browsers.
The deterministic domain tests cover the 150-second and 45-day boundaries
without waiting or changing real users' membership timestamps.
