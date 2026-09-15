# Email

How the login link is delivered, why the deployed app delivers it to nobody, and how to put a mail
provider back. This is the single home for the mail story; other documents point here.

## The current state: no mail provider is configured

Access to the app is passwordless: you submit an email address and the backend sends a
single-use login link. **The deployed backend sends nothing.** The domain the links used to come
from and the mail service behind it are gone, and nothing has replaced them. With no mail
credentials configured the backend logs the link instead of sending it, so on Cloud Run every login
link is written to the service's log and delivered to nobody.

That is why `/demo` exists: it hands a visitor a pre-seeded account with no email involved, and it
is the only working way into the deployed app for anyone, including its owners. See
[Demo accounts](demo-accounts.md).

**For local development there is nothing to set up.** With `MAILPACE_API_TOKEN` unset, a
registration prints something like this in the backend terminal and you open the link yourself:

```text
[LogMailer] Email not sent (no MAILPACE_API_TOKEN): to=marko@email.com subject="Your Spendifico login link"
[LogMailer] Link: http://localhost:4200/auth/verify?token=...
```

That is also what CI and the e2e suite use, so no test can send mail to a real person.

The mail code is intact. `backend/src/mail/` keeps the mailer seam, the logging fallback and a
MailPace implementation, so re-enabling real email is configuration plus a domain, not a rewrite.

## Re-enabling real email (MailPace)

The implementation talks to [MailPace](https://mailpace.com). Any other HTTP mail API would be a
new class behind the same `MAILER` token; this section is for the one that exists.

**This warning is shorter than it was, because both halves of it were fixed rather than left as a
pre-flight check.** It used to say that the seeded accounts sit on `spendifico.eu`, a domain nobody
here holds, so configuring a provider would send working login links for eleven live accounts to
whoever registers it - and that the logging fallback prints the full tokenised link, so anyone with
log access on the project can sign in to any account that asks for one. The seed identities are on
`example.com` now, which RFC 2606 reserves and nobody can register; `POST /api/auth/login-link`
issues nothing at all for a pooled account, answering the same empty 202 an unknown address gets;
and the fallback withholds the link in production, logging the recipient and a token prefix.

What is left for you to check before turning sends on is the ordinary thing: **any account you
seeded by hand with `--email=` is yours to look at.** The pool and the showcase account are
handled.

1. **Own a domain and authorize it.** Add the domain in MailPace and complete the DKIM
   authorization it walks you through. Until that is done every send is rejected. The spam
   incident recorded in `docs/TODO.md` (2026-08-05) showed that DKIM alone is not the whole story:
   an SPF record that includes MailPace and a DMARC record on the domain are what keep a
   low-volume sender out of the spam folder.
2. **Create a server and copy its API token.**
3. **Set both variables**, in `backend/.env` locally or on the Cloud Run service in production:

   ```text
   MAILPACE_API_TOKEN=your-server-token
   MAIL_FROM=login@<your-domain>
   MAIL_FROM_NAME=Spendifico
   ```

`MAIL_FROM` has to be an address on the domain you authorized. Set both or neither: a half-filled
pair fails at boot, on purpose, because the alternative is a login email that silently never
leaves. That is also why both lines stay commented in `.env.example`, which `cp .env.example .env`
copies verbatim - uncommenting only `MAIL_FROM` would leave a fresh clone unable to start.

`MAIL_FROM_NAME` is optional and gives the sender a display name, so the email arrives from
`Spendifico <login@your-domain>` rather than a bare address. It is a separate variable so
`MAIL_FROM` stays a plain address: the `Name <addr>` form fails the schema's `.email()` check, and
keeping it bare is what makes "must be on the DKIM-authorized domain" something you can verify at
a glance.

On Cloud Run, set new configuration on the service **before** merging code that depends on it, per
[Deployment](deployment.md). `FRONTEND_URL` also matters here: it is the base of every emailed
link, so a wrong value produces links that point at the wrong host.

### Why HTTPS rather than SMTP

MailPace is called over plain HTTPS rather than SMTP, and with `fetch` rather than their SDK.
Outbound SMTP is blocked or throttled by most hosts: Google Cloud blocks port 25 outright and does
not guarantee 587 or 465 either, while HTTPS on 443 always works. See
`backend/src/mail/mailpace.mailer.ts`, which is short.

### Smoke-testing a real send

**Send to `spendifico@gmail.com`.** That is the project's official inbox and the address every
mail smoke test has been run against. Do not use a personal address: the messages are the point of
the test, so they have to land somewhere anyone on the project can check.

Run the backend against a throwaway database rather than your normal one, so a test registration
never lands in the real user directory. `NODE_ENV=test` makes `AppModule` ignore `backend/.env`
entirely, which is why the credentials are passed in explicitly here:

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
  -d '{"fullName":"Marko Kovac","email":"spendifico@gmail.com","monthlyBudget":2000,"monthStartDay":1,"categories":["Groceries"]}'
```

Expect `202` with an empty body, and one email within a few seconds. Send the same request again
and a second link arrives while the first stops working: that is "Resend link" (VER-2), and only
the newest link is ever valid - clicking the older one's token now answers `409` rather than a flat
rejection, which is what lets a frontend say "open the most recent email". Finish the round trip by
verifying the newest token against port 3111 as under [Database](database.md); the throwaway
`DATABASE_DIR` gets the user's database, so the real one stays untouched.

Worth doing at least once whenever this path changes, because it catches what a mocked spec
cannot. The `Accept: application/json` header is the standing example - Node's `fetch` defaults to
`*/*` and MailPace answers that with a `406` blaming the body and the Content-Type, both of which
are fine.
