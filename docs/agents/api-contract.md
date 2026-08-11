# The one HTTP contract

The backend is the source of truth for every request and response shape, and nothing restates
it. This file is the authority for that pipeline, because it is the one topic that spans both
apps: the backend generates `backend/openapi.json`, the frontend generates
`frontend/src/types/api.d.ts` from it, and CI fails if either drifts.

Read this before changing a DTO, a response shape, or how a page fetches. Four separate
mistakes in this pipeline still produce a spec; they just describe your response as `{}`.

## The prefix, and how the frontend reaches the backend

**The `/api` prefix lives in one place.** `backend/src/main.ts` sets a global `api`
prefix, so a controller mapped to `health` is served at `GET /api/health`. Note the
consequence: `GET http://localhost:3000/` returns 404, which is normal, not a broken
server. The e2e test re-applies the same prefix manually to match production, so if you
change the prefix you must change it in both places.

**Frontend to backend data flow: server-side, and reads exist now.** PET-19
deleted the scaffold greeting page, which had been the only caller, and PET-11 restored the wire
from the other end. PET-12 added the second endpoint, so `frontend/src` calls
`POST /api/auth/register` and `POST /api/auth/login-link`, both through one helper in
`frontend/src/lib/backend.ts`. That helper exists because both answer 202 with an empty body and
differ only in path and body type, which is also why it is generalised over those two and not over
PET-52's verify: that one returns a body and reads a 409.

PET-52 ended the no-reads era with three more calls: `POST /api/auth/verify` from the route
handler at `app/auth/verify/route.ts`, and `GET /api/auth/session` and `GET /api/profile` from
`lib/session.ts` and `lib/profile.ts`. All three take the shape this document had already fixed
for the first read - an **async Server Component** or a route handler, fetching at request time
with `cache: 'no-store'`, so the credential never leaves the server and no CORS is involved - and
the two reads add the detail that only mattered once a session existed: the cookie is never
forwarded as a cookie, because the backend reads none, so its value is lifted into an
`Authorization: Bearer <token>` header server-side. CORS is enabled on the backend anyway
(`main.ts`), for the case of genuinely client-side fetches, allowing origin `FRONTEND_URL`.

**A write from a form is a Server Action**, which is the shape PET-11 established in
`frontend/src/app/setup/register/actions.ts`. The rule above names a Server Component or a route
handler because it was written about reads, and neither fits a POST that a client-side form fires
and then branches on: a Server Component cannot be invoked by an event, and a route handler would
publish an endpoint on the frontend's own origin that only its own form should ever reach. What
the two shapes share is the part that matters - the request leaves the server, so `BACKEND_URL`
and any cookie stay there, and `cache: 'no-store'` is set explicitly, because a POST Next decided
to cache would silently swallow a second attempt. A route handler is still the right answer when
the browser has to navigate *to* the call rather than fire it, which is why PET-52's verify page
uses one - `app/auth/verify/route.ts`, the repo's first, and the shape to copy for the second.

**What forces that handler is the navigation, not the cookie**, and the distinction is worth
keeping straight now that something depends on it. A Server Action sets a cookie perfectly well:
PET-12's register and login actions both call `cookies().set()` to stash the address screen 24
interpolates, and `frontend/src/lib/pendingEmail.ts` records the one constraint, which is that the
write is legal only inside an action or a handler and nothing but a runtime throw will tell you.
Verify needs a handler because the browser arrives at it by following a link, and an action cannot
answer a GET navigation. PET-52's handler sets its two cookies on the `NextResponse` it is already
building rather than through `cookies()`, which both work: it keeps the header write and the
redirect in one object, and makes the whole thing assertable with no request scope to fake.

**An action returns a result rather than throwing.** An unhandled rejection inside a Server
Action reaches the client as an opaque digest with nothing a screen can render, so the caller
would have no way to tell a validation rejection from an unreachable backend. `registerAccount`
answers a discriminated `{ ok: true } | { ok: false; status? }`, and the absent status is what
"the request never completed" looks like.

**PET-30 lifted the cookie-to-bearer read into one helper, and PET-31 added its write half.**
`authorizedGet` and `authorizedPost` both live in `frontend/src/lib/session.ts` - not beside
`postAccepted` in `lib/backend.ts` - and the split is **by credential, not by HTTP verb**: they
need `SESSION_COOKIE`, which lives in that file, so putting them in `backend.ts` would point its
dependency back and make a cycle. `lib/backend.ts` keeps the two pre-session writes, which send no
credential at all. Do not inline a fresh copy of either; there were three copies of the read before
PET-30 collapsed them.

**The two helpers classify failure differently, and that is the design rather than an
inconsistency.** `authorizedGet` answers `unauthenticated` for a 401 or a missing cookie and
`unavailable` for everything else, because a caller that could not get its data has one thing to
say about it. A write cannot afford that: `POST /api/transactions` answers 400 when the body is
rejected, 404 when the `categoryId` names no category of the caller's, and 401 when the session
died with the form open, and those want three different messages - one of which must not say "try
again", because a body the DTO rejects will be rejected again forever. So `authorizedPost` passes
the status through and the calling action maps it, which is what `lib/createTransaction.ts` does.

**PET-34 gave the read helper a third answer, and it is the one exception to the paragraph
above.** `authorizedGet` now reports a **404** as `missing` rather than folding it into
`unavailable`. That is not the write helper's "let the caller see the status" policy arriving by
the back door: it is one named outcome, because "the thing is not there" and "I could not ask" are
a 404 page and an error page respectively, and collapsing them puts Next's error boundary over a
transaction the user merely deleted. It stays a closed union rather than a status for the reason
the read policy exists at all - every other non-401 really does have one thing to say. Only
`GET /api/transactions/:id` can produce it, whose own OpenAPI description says a 404 there always
means the id in the URL, so the other four reads never see the arm and keep throwing on anything
that is not `unauthenticated`. `lib/transactionDetail.ts` is the worked example: redirect,
`notFound()`, throw.

**A write must not be told apart from its own success by a parse error.** `authorizedPost`
deliberately does **not** read the response body: `POST /api/transactions` answers 201 with the
created row, and returning it looked obviously right until the failure mode showed up - a 2xx
arriving with a body that will not parse means the transaction *exists*, so a result saying
otherwise sends the user to press the button again and create a second one. A 2xx is success on the
status alone. Parse the body when something actually reads it.

**A fourth shape exists as of PET-31: a route handler the client fetches.** `app/api/categories/
route.ts` serves the Add transaction modal's Category options from the frontend's own origin,
because the caller is an already-open modal - which an action cannot serve as a read and a Server
Component cannot serve at all. Two things make it worth the endpoint. It costs nothing on a page
nobody opens the modal from, where a `page.tsx` read would pay on every load; and it narrows a
response built for a whole screen down to the two fields a `<select>` needs, so the month stats and
the caps never reach the browser. The module behind it, `lib/categories.ts`, deliberately does
**not** `redirect()` on a dead session, unlike `lib/transactions.ts` beside it: a redirect from a
handler answering a `fetch()` would hand the modal an HTML login page with a 200 on it, so the
failure has to stay data.

**That shape has a second consumer as of PET-42-43-44, and the two agree on everything except the
projection.** `app/api/insights/route.ts` serves the AI Insights page's poll: the read behind it
uses `cookies()` and the server-only `BACKEND_URL`, so a browser timer has nowhere else to call,
which is the same "the caller is already on screen" test the categories handler passes. It copies
the no-store at both hops, the 401 travelling through unchanged and the 503 for an unreachable
backend, and its module refuses to redirect internally for the identical reason. Where it differs
is that it **passes the response straight through**: every field is drawn by the page, so a
projection would be a second place for the shape to drift rather than a narrowing that keeps
anything out of the browser. That module is also the first to export both a plain
`AuthorizedResult` read and a redirecting wrapper over it, because its two callers answer a dead
session differently - which is what the categories one solved by leaving the policy to every call
site. The same branch narrows `InsightCardDto`'s tone enum, so it is a DTO change and a route
handler in one, and both halves went through `npm run api:sync`.

**And PET-73 gives that shape a third reason to exist, which the two above did not cover.** The
categories handler exists for a **read a modal makes while it is open**, and the insights one for a
**browser timer's poll**; `app/api/assistant/messages/route.ts` is neither. It is a **cancellable
long write** - the first handler the browser POSTs to - and the reason it is not a Server Action is
that a client component calling one has **no `AbortController` to reach**: the RPC is opaque and
takes no `signal`, which is why the receipt scan settled for a generation-counter ref that discards
a late result while the request runs to completion server-side. At roughly 40k input tokens and tens
of seconds per turn, that was the wrong trade. A route handler makes the send an ordinary `fetch`,
and an ordinary `fetch` takes a `signal` - which this handler passes through as `request.signal`,
the second of three hops that end at the Gemini call. Everything else it shares with the other two:
no-store at both hops, the 401 travelling through unchanged rather than becoming a redirect, and a
module (`lib/assistant.ts`) exporting both redirecting reads for the two `page.tsx` callers and a
non-redirecting send for this one. `docs/explainers/cancelling-an-ai-request.md` is the
plain-language account.

**There are six verbs in `lib/session.ts` now**: `authorizedGet`, `authorizedPost`,
PET-33's `authorizedDelete`, PET-32's `authorizedPatch`, PET-59's `authorizedPostFormData` and
PET-73's `authorizedPostJson`. **Four of them discard the response body and share
`AuthorizedWriteResult`**; the two whose body *is* the point - the receipt scan's extracted fields
and the assistant's reply - share `AuthorizedBodyResult`, which was `AuthorizedFormDataResult` until
PET-73 gave it a second, JSON-bodied caller and the name stopped describing what the type means.
Each new verb is a handful of lines because the cookie-to-bearer lift, `cache: 'no-store'` and the
status-passing convention are already settled. `authorizedPostJson` alone takes an optional
`signal`, threaded into its `fetch` and nothing else, so the widening costs the other five nothing.
None of them may become a Server Action: they take a `path`, and `'use server'` would publish an
endpoint accepting an arbitrary one.

**A status can be ambiguous, and the caller narrows it from the request rather than from the error
prose.** `PATCH /api/transactions/:id` is the first place this bites: it answers 404 both for a
transaction it cannot find and for a `categoryId` it cannot find, and distinguishes them only in the
message string. `lib/updateTransaction.ts` splits them on whether the body it built carried a
`categoryId` - a fact the caller already has - and publishes two reasons over one status. Matching
the backend's message text was the alternative and is the thing not to do: nothing pins those
strings across the two applications, so a reword there would silently pick the wrong message with
every gate green. **A caller reads the contract's types, and error prose is not one of them.**

**A partial write says what changed and nothing else.** `UpdateTransactionDto` is a real patch -
absent leaves a field alone, `null` clears a nullable one - so `(app)/transactionForm.ts`'s
`toUpdateTransactionBody` diffs the form against the row it opened on. Two consequences for any
future patch endpoint. `JSON.stringify` drops `undefined` and keeps `null`, which is what makes the
tri-state expressible at all, so a helper must never strip falsy values on the way out. And an empty
diff is a legitimate outcome meaning "nothing changed": the endpoint answers 400 to a body with no
keys, so the *caller* has to treat it as nothing to ask rather than something to send.

## One contract, generated, and the frontend types come out of it

The backend is the source of truth and nothing restates it. `nest build` runs `@nestjs/swagger`'s CLI
plugin, `npm run api:spec` writes `backend/openapi.json` from the app's own routes, and
`npm run api:types` turns that into `frontend/src/types/api.d.ts`; `npm run api:sync` at
the root does both. A caller reads its response type out of `paths[<route>][<method>]` rather
than declaring one - the scaffold `page.tsx` demonstrated that until PET-19 deleted it, so the
first real read re-establishes the pattern. Both artifacts are **generated but committed**, for the same reason
`backend/drizzle/` and `.agents/skills/` are: everyone needs byte-identical copies and a
fresh clone must work with no extra step. It also keeps `cd frontend && npm run build`
working with no backend running, which is what lets the two CI jobs stay independent.

Four things about that pipeline that are easy to get wrong, all of which fail **quietly**:

- **Response shapes must be classes in `.dto.ts` files.** An interface erases at compile
  time, leaving nothing to hang metadata on, and the plugin only introspects files
  matching its `dtoFileNameSuffix` (default `['.dto.ts', '.entity.ts']`). Break either and
  the spec still generates - the response is just described as `{}`.
- **The generator runs against `dist/`, never `ts-node`.** The plugin is a compile-time
  transformer wired through `nest build`. `test/openapi.e2e-spec.ts` therefore asserts
  against the committed JSON rather than building a document in-process.
- **`setGlobalPrefix` must run before the document is built**, or every path loses its
  `/api` and the generated types point at URLs that 404. `API_PREFIX` in
  `src/common/api-prefix.ts` is shared by `main.ts`, `src/openapi.ts` and the e2e suite.
- **Generating the spec boots the real `AppModule`**, persistence and all.
  `src/openapi.env.ts` scrubs `TURSO_*` and sets `OPENAPI_EMIT`, which makes `AppModule`
  skip `backend/.env` - without the second half dotenv puts every scrubbed variable
  straight back, and writing a JSON file would sync against live Turso.

## Drift is a CI failure, in two halves

The backend job regenerates the spec and fails on a diff; the frontend job does the same for
`api.d.ts`. Together they prove the spec matches the code and the types match the spec. A
committed generated artifact rots silently otherwise, which is the exact failure this pipeline
exists to kill. Both steps regenerate a committed artifact and fail on a non-empty `git diff`.
Note where each one lives: the
frontend half runs in the frontend job because `openapi-typescript` only reads the
committed JSON and needs no `backend/node_modules`.

## What the document declares, and what it deliberately does not

**No operation documents a 500.** Every route can answer 500 through the global filter, so
documenting it per operation restates one non-actionable fact everywhere and widens every
generated response union; the document description in `src/openapi.document.ts` says it once
instead, and `test/openapi.e2e-spec.ts` pins that nothing declares it. Bearer auth is
declared with `addSecurity('bearer', ...)` rather than the `addBearerAuth()` helper, which
cannot be talked out of publishing `bearerFormat: 'JWT'` - these are opaque tokens, so that
would be a lie. The declaration and a bare `@ApiBearerAuth()` are two halves that fail
silently apart: miss either and the guarded operation looks public in both the spec and the
generated types.

Swagger UI is served at `http://localhost:3000/api/docs` from the same document.

**A request body that is a collection must be a wrapper object, and this is a hard trap rather
than a style rule.** PET-70's `PATCH /api/categories` is the repo's first array-body request, and
`ValidationPipe.toValidate` returns false when the reflected metatype is one of `String`,
`Boolean`, `Number`, `Array`, `Object`, `Buffer` or `Date` - so `@Body() items: CategoryCapDto[]`
arrives with the global pipe **skipped entirely**: no `whitelist`, no `forbidNonWhitelisted`, and
not one decorator on the item class ever runs. It fails in the direction this file warns about
throughout, silently and downstream: SQLite's INTEGER affinity stores a string where an integer
column was expected, and the row then serialises as a shape its own response DTO says is
impossible. A bare array cannot carry `@ApiProperty` either, so its schema would have to be
hand-written with `@ApiBody`. Wrap it in a class with one array field, and give that field
`@ValidateNested({ each: true })` **and** `@Type(() => Item)` - neither works without the other.

Two smaller notes from the same endpoint. `@ArrayNotEmpty` and `@ArrayMaxSize` publish nothing on
their own, so `minItems` and `maxItems` go in `@ApiProperty` explicitly, while `@ArrayUnique` does
publish `uniqueItems: true` - which is weaker than uniqueness by one field, so state the real rule
in prose. And a **bulk write's 404 names the whole payload rather than one resource**: the
statement behind it is all-or-nothing, so the status means "nothing was written" and the client may
retry the identical body once it has refreshed - the opposite of the ambiguous 404 this file
discusses for `PATCH /api/transactions/{id}`. Its 200 carries the whole screen, and
`authorizedPatch` discards write bodies by an existing decision, so consuming it is a choice rather
than an obligation.

**A published `maxItems` reaches no generated type, and a caller that has to respect one therefore
restates it.** This is the narrowest exception to the rule at the top of this file, and a review of
PET-70 is what forced it into writing. `openapi-typescript` emits `number[]`-shaped types and drops
every JSON Schema constraint, so a client cannot read a bound off `types/api.d.ts` the way
`app/setup/starterCategories.ts` once read an `enum` out of it. A client that ignores the bound is not
neutral about it: a payload one row over `@ArrayMaxSize` comes back 400, indistinguishable from a
malformed body, so the caller's copy tells the user to fix values that are all valid. Two literals
exist for this and both name their DTO in a comment - `app/setup/draft.ts`'s
`MAX_PICKED_CATEGORIES` against `RegisterDto`, and
`app/(app)/transactions/categories/allocateForm.ts`'s `MAX_CAP_ROWS` against
`UpdateCategoryCapsDto` - each with a case in its own suite asserting the number, so the pair has one
place that fails when the backend's changes. Do not generalise this to a
bound the caller can simply let the server enforce; it earns the duplication only where the resulting
400 would produce advice that cannot work.

## Regenerating it

From the repo root, `npm run api:sync` runs both halves in the right order. That is the
command to use after touching anything a response or request body is made of; the two
per-app scripts exist for CI, which has already built one side or the other.
