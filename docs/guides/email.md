# Sending real email

With no mail credentials configured the backend logs the login link to its console, which is a
supported mode: the whole access flow works without ever sending anything. This guide is for
turning real sends on, and for the smoke test that has to be run whenever the mail path changes.

## Sending real email (optional)

Access to the app is passwordless: you submit an email address and the backend sends a
single-use login link. **For local development there is nothing to set up.** With
`MAILPACE_API_TOKEN` unset, the backend logs the email instead of sending it, so a
registration prints something like this in the backend terminal and you open the link
yourself:

```text
[LogMailer] Email not sent (no MAILPACE_API_TOKEN): to=marko@email.com subject="Your Spendifico login link"
[LogMailer] Link: http://localhost:4200/auth/verify?token=...
```

That is also what CI and the e2e suite use, so no test can send mail to a real person.

To send for real, use [MailPace](https://mailpace.com):

1. Add your domain and complete the DKIM authorization it walks you through. Until that
   is done every send is rejected.
2. Create a server and copy its API token.
3. Uncomment both variables in `backend/.env`:

   ```text
   MAILPACE_API_TOKEN=your-server-token
   MAIL_FROM=login@spendifico.eu
   MAIL_FROM_NAME=Spendifico
   ```

`MAIL_FROM_NAME` is optional and gives the sender a display name, so the email arrives from
`Spendifico <login@spendifico.eu>` rather than a bare address. It is a separate variable so
`MAIL_FROM` stays a plain address: the `Name <addr>` form fails the schema's `.email()`
check, and keeping it bare is what makes "must be on the DKIM-authorized domain" something
you can verify at a glance.

`MAIL_FROM` has to be an address on the domain you authorized. Set both or neither: a
half-filled pair fails at boot, on purpose, because the alternative is a login email that
silently never leaves. That is also why both lines stay commented in `.env.example`, which
`cp .env.example .env` copies verbatim - uncommenting only `MAIL_FROM` would leave a fresh
clone unable to start.

It is called over plain HTTPS rather than SMTP, and with `fetch` rather than their SDK.
Outbound SMTP is blocked or throttled by most hosts (port 25 permanently on GCP, and
587/465 are not guaranteed either), while HTTPS on 443 always works. See
`backend/src/mail/mailpace.mailer.ts`, which is short.

### Smoke-testing a real send

**Send to `spendifico@gmail.com`.** That is the project's official inbox and the address
every MailPace smoke has been run against. Do not use a personal address: the messages are
the point of the test, so they have to land somewhere anyone on the project can check.

It is also the other end of the sender. This project's `MAIL_FROM` is
`login@spendifico.eu`, and everything delivered to that address is forwarded to
`spendifico@gmail.com`, so the same inbox holds both what the app sends and anything
replied to it. The sender is recorded (commented out) in `backend/.env.example`.

Run the backend against a throwaway database rather than your normal one, so a test
registration never lands in the real user directory. `NODE_ENV=test` makes `AppModule`
ignore `backend/.env` entirely, which is why the credentials are passed in explicitly
here:

```bash
cd backend && npm run build

NODE_ENV=test DATABASE_DIR=$(mktemp -d) PORT=3111 \
  FRONTEND_URL=http://localhost:4200 \
  MAILPACE_API_TOKEN=... MAIL_FROM=... \
  node dist/main
```

Then, in another terminal:

```bash
curl -i -X POST http://localhost:3111/api/auth/register \
  -H 'content-type: application/json' \
  -d '{"firstName":"Marko","lastName":"Kovac","email":"spendifico@gmail.com","monthlyBudget":2000,"categories":["Groceries"]}'
```

Expect `202` with an empty body, and one email within a few seconds. Send the same request
again and a second link arrives while the first stops working: that is "Resend link"
(VER-2), and only the newest link is ever valid - clicking the older one's token now answers
`409` rather than a flat rejection, which is what lets a frontend say "open the most recent
email". Finish the round trip by verifying the newest token against port 3111 as under
[Database](database.md); the throwaway `DATABASE_DIR` gets the user's database, so the real one
stays untouched.

Worth doing at least once whenever this path changes, because it catches what a mocked
spec cannot. The `Accept: application/json` header is the standing example - Node's `fetch`
defaults to `*/*` and MailPace answers that with a `406` blaming the body and the
Content-Type, both of which are fine.

