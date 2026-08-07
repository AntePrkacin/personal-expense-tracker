# PET-59 — AI Receipt Scanning

[PET-59](https://decode.atlassian.net/browse/PET-59) — `[FE/BE] Build AI Receipt Scanning via Mobile Camera`

Base branch is `main`.

## Why

Typing out transactions manually is tedious, especially on mobile. Modern Vision models can reliably extract the merchant, amount, category, and notes from a simple photo of a receipt. This feature allows users to tap a "Scan Receipt" button in the Add Transaction modal, take a photo with their phone camera, and have the transaction form automatically populated. This dramatically reduces friction and creates a "wow" factor for the application.

## Decisions

**Do not persist images.** Storing receipts would require significant infrastructure (S3/R2) and introduce data privacy and retention complexities. The image will be processed entirely in-memory, sent to the AI for extraction, and then immediately discarded.

**Personalized Category Matching via Prompt.** The database requires a strict ID for `categoryId`. The AI cannot guess this ID. The backend must fetch the user's categories and inject them into the prompt (e.g., `[{"id": "...", "name": "Food"}]`). Additionally, to improve accuracy and enable fuzzy matching, the prompt will include an array of the user's merchants from the past year. Each merchant object will list the categories associated with it and the transaction counts for each category. This allows the AI to correctly map generic or misspelled receipt names (e.g., "WM SUPERCENTER") to the user's specific habits.

**One scan produces one transaction, and "multiple images" means multiple pages of one receipt.** The modal writes a single `POST /transactions`, so every image in a scan request is treated as pages of the *same* purchase and synthesized into one extraction. Selecting photos of two different shops is therefore a user error the feature does not detect, and the copy must say "pages of one receipt" rather than "receipts" so nobody expects a batch import. Scanning several distinct receipts into several transactions is a genuinely different feature - it needs a review queue, N draft rows and a bulk write, none of which the modal can express - and it goes to `docs/TODO.md` rather than being smuggled in behind a `multiple` attribute. **This resolves a contradiction in the previous revision of this plan**, which offered to "select multiple receipts at once" while every other line described one form and one submit.

**A model that returns the same id it was given, or none.** The backend validates the returned `categoryId` against the user's live categories and **drops** an id that matches none, reporting the field as missing. It deliberately does not fall back to `Uncategorized`: that would render as a confident categorization and quietly mis-file the expense, where a missing field asks the user to pick. Left unvalidated, a hallucinated id reaches the modal's `<select value={values.categoryId}>`, matches no option so the control shows nothing, and submission then fails as a 404 mapped to `categoryMissing` - a failure whose cause is invisible from the screen.

**Privacy and Free Tier Implications.** By default, the free tier of Google AI Studio may log prompts (which will include merchant history and receipt data) to improve their models. Since financial data can be sensitive, this must be documented clearly for the user. As a future enhancement or for privacy-conscious users, the app may need a toggle to disable the AI scanning feature entirely, or the app may eventually need to migrate to the paid API tier where data training is disabled by default.

**The disclosure is on-screen copy in V1, not a setting, and that is a scope decision rather than a preference.** The honest version of the paragraph above has to be visible at the moment of action, because the first scan sends both the photo and a year of the user's merchant names to a training-enabled endpoint. A real opt-in belongs in Settings, and Settings' `<main>` is not built - so a toggle would mean a new profile column, a migration, an `api:sync` and a screen to host it, all before the feature works at all. V1 therefore renders a short line beside the scan buttons naming what leaves the device (the images, and a year of merchant names for matching) and what is not kept (the images). The toggle goes to `docs/TODO.md`, blocked on the Settings screen.

**Multi-Image and Iterative Scanning.** For a long or multi-page receipt, the user can pick several images at once (`multiple`), which are sent in one request and synthesized into one extraction. The camera button takes one photo at a time, so a second capture merges into the form rather than replacing it: the frontend extracts what it can, names what is still missing, and a following scan fills only the gaps.

**The merge tracks which fields the user has touched, not which are empty.** An emptiness test cannot work here, because `AddTransactionModal` initialises `date: todayIsoDate()` - so date is never empty, and a scan carrying the receipt's real date would be refused in favour of today's, with the missing-fields note never flagging it either. The form therefore records a per-field "dirty" set: a scan may overwrite any field the user has not typed into, the pre-filled default date counts as untouched, and anything the user did type is left alone. This is also what makes a second scan safe on a partially typed form.

**Client-side compression.** Mobile phones take large photos (5MB+). Sending these directly wastes bandwidth and slows down extraction. The frontend will compress the image in the browser using the `browser-image-compression` library before POSTing to the backend. This library is chosen because it auto-fixes mobile EXIF rotations (preventing sideways receipt uploads), offloads processing to a Web Worker (keeping the UI smooth), and provides an incredibly simple API for enforcing maximum file sizes.

**Four size limits, layered smallest-innermost, because three of them default to something that breaks this feature.** At most **4** images per scan. Each is compressed to `maxSizeMB: 0.75` with `maxWidthOrHeight: 2000`, which is ample for receipt text. Multer caps `files: 4` and `fileSize: 1.5MB`, so a client that skips compression gets a clean 413 rather than a slow success. And `next.config.ts` must set `serverActions.bodySizeLimit: '6mb'`: the default is **1MB**, which one compressed photo already exceeds once multipart framing is added, and the failure is an opaque server error the modal cannot interpret.

**`multipart/form-data`, not base64 JSON, and the difference is not cosmetic.** `main.ts` calls `NestFactory.create` with no body-parser options, so Express's default JSON limit of **100kb** applies and any base64 image over roughly 75KB is a 413 before the controller runs. Raising that limit would raise it for *every* endpoint to suit one, weakening the whole API's posture; multer's limits are per-route. Multipart also avoids base64's 33% inflation, which matters when four images share one request. The costs are accepted and both are real: `@types/multer` has to be added (`backend/package.json` has express, jest, node and supertest types and no multer, and `npm run build` is the typecheck, so this is a build failure rather than a warning), and the request body has to be described to Swagger by hand with `@ApiConsumes`, since the plugin cannot infer a file field.

**The browser never calls the backend; a Server Action does.** The session is an httpOnly cookie on the *frontend* origin, and `authorizedPost` lifts it into an `Authorization: Bearer` header server-side - so a direct `fetch` from the browser to `POST /api/transactions/scan` gets a 401, whatever the CORS origin says. The scan is a submit from a page the user stays on, which is exactly the split `docs/agents/api-contract.md` draws for a Server Action over a route handler, and it matches `lib/createTransaction.ts`. `lib/session.ts` needs a `authorizedPostFormData` beside `authorizedPost`, since the existing helper serializes JSON.

**`gemini-3.5-flash`, via `@google/genai`.** Both names in the previous revision were retired: `gemini-1.5-flash` no longer appears in the model list and is unavailable to a fresh key, and `@google/generative-ai` is the legacy SDK, end-of-life since 31 August 2025 and deprecated since 30 November 2025, with a different structured-output API than the maintained `@google/genai`. `gemini-3.5-flash` is stable, accepts image input, supports structured output, and has a free tier. `gemini-3.5-flash-lite` is the documented fallback if the quota bites, which is why the id lives in **one** exported constant rather than inline at the call site.

**The key is optional, so the endpoint must have a defined keyless answer.** `env.validation.ts` states the contract: "Every variable has a default or is optional on purpose: the backend must still start with no .env at all", which is how CI and the e2e suite run. A `.required()` key would break boot everywhere. `GEMINI_API_KEY` is therefore optional and unpaired, and `/scan` answers **503** when it is absent. The buttons stay visible rather than being hidden behind a capability flag: hiding them would need a new field on a read the modal already makes, and the only environments without a key are CI and e2e, which have no browser. The 503 surfaces as its own message, not as the generic failure.

**`/scan` carries a rate limiter, and it is the first route outside `auth/` that needs one.** `TransactionsController` documents why it has none - "the budget an abuser would burn is their own" - and that reasoning stops holding exactly here, because the budget burned is the project's shared Gemini quota, so one user in a loop denies scanning to everyone. `@nestjs/throttler` is already a dependency, but `ThrottlerModule` is registered inside `AuthModule` rather than globally, so `TransactionsModule` needs its own `forRootAsync` with a **named** throttler keyed on the session user id - not on IP, since the quota is per-account and a NAT would share a bucket. `SessionGuard` is a global `APP_GUARD` and Nest runs global guards before controller-scoped ones, so the principal is on the request by the time the tracker reads it. **The name is load-bearing**: this repo has already been bitten by a bare `@SkipThrottle()` meaning `{ default: true }` against throttlers named something else and therefore silently skipping nothing. Limit and window are configuration for the reason `AuthModule` gives - so a spec can trip them without waiting out the window.

**The call is bounded, and the modal can always get out.** A hung or quota-throttled Gemini call would otherwise leave the loading overlay up forever, which is the failure PET-56 was an entire ticket about. The request carries an abort signal with an explicit timeout, a timed-out scan reports as its own outcome rather than the generic failure, and the overlay is dismissible while a scan is in flight.

## Shape

**The Frontend:**
- Two inputs inside the `AddTransactionModal`, both routed through one handler:
  - "Scan receipt" (camera): `<input type="file" accept="image/*" capture="environment">`.
  - "Add pages" (gallery): `<input type="file" accept="image/*" multiple>`, for a receipt too long for one photo. At most 4 images.
- A short disclosure line beside them naming what leaves the device and what is not kept.
- A loading state that overlays the modal while the extraction runs (typically 3-5 seconds), dismissible, with a timeout behind it.
- Once the extraction API responds, the returned fields are merged into form state for every field the user has not typed into, the default date included.
- A note naming any field the extraction did not fill, `date` and a dropped `categoryId` among them, encouraging another photo to fill the gaps.
- Distinct copy for four outcomes: nothing extracted, timed out, scanning unavailable (503), and rate-limited (429).

**The Backend:**
- `POST /api/transactions/scan`, on `TransactionsController`, above `@Get(':id')` - which now has a literal sibling, so the route-order note in that class comment becomes a real constraint rather than a warning.
- Accepts `multipart/form-data` with 1-4 image parts. No base64 branch.
- A `ScanReceiptResponseDto`: `merchant`, `amount`, `date`, `categoryId` and `note`, each null when not extracted, plus a `missing` array naming the fields that are.
- Uses the **Google Gemini API (via Google AI Studio)** on `gemini-3.5-flash` through `@google/genai`, with structured output enforcing the response schema.
- Constructs an efficient SQL query to fetch the user's categories along with a 1-year history of merchants, their associated categories, and transaction counts. This contextual data is injected into the AI prompt to maximize categorization accuracy.
- Validates the returned `categoryId` against those categories and drops an unknown one.
- 503 with no API key, 429 over the per-user limit, 400 on a rejected upload.

## Tasks

- [x] Commit this plan alone (local branch for now).
- [ ] Revise this plan against the pre-implementation review: transport, size limits, model and SDK, the merge rule, the rate limiter, the keyless answer, and the multiple-receipts contradiction.
- [ ] Add `GEMINI_API_KEY`, `SCAN_RATE_LIMIT` and `SCAN_RATE_TTL_S` in all four places the environment lives: `env.validation.ts` (optional, unpaired), `backend/.env.example`, the `single-source: backend-env` table in `docs/guides/configuration.md`, and `env.validation.spec.ts`. `scripts/docs-check.sh` diffs the template against that table and the spec asserts the schema matches it, so missing one fails a gate.
- [ ] Add `@types/multer` to `backend/package.json`.
- [ ] Implement backend `POST /api/transactions/scan`: multipart with a 4-file/1.5MB cap, `@ApiConsumes` body schema, `ScanReceiptResponseDto`, 503 without a key.
- [ ] Register a named, user-keyed throttler in `TransactionsModule` and apply it to `/scan` only.
- [ ] Integrate `@google/genai` on `gemini-3.5-flash` behind one exported model-id constant, with the structured JSON schema, the category and merchant-history prompt, `categoryId` validation, and an abort-backed timeout.
- [ ] Backend specs: the extraction service against a mocked SDK (including a hallucinated `categoryId` and a timeout), the keyless 503, and an e2e case tripping the scan limiter.
- [ ] Run `npm run api:sync` from the repo root and commit `backend/openapi.json` and `frontend/src/types/api.d.ts`. CI regenerates both and fails on a non-empty diff.
- [ ] Install `browser-image-compression` and add a client-side compression utility (`maxSizeMB: 0.75`, `maxWidthOrHeight: 2000`).
- [ ] Set `serverActions.bodySizeLimit: '6mb'` in `frontend/next.config.ts`.
- [ ] Add `authorizedPostFormData` to `frontend/src/lib/session.ts` and a `scanReceipt` Server Action beside `lib/createTransaction.ts`.
- [ ] Update `AddTransactionModal`: the two inputs, the disclosure line, the dismissible loading overlay, per-field dirty tracking for the merge, the missing-fields note, and the four outcome messages.
- [ ] Frontend specs for the merge rule (a scan must overwrite the default date, and must not overwrite a typed field) and the outcome messages.
- [ ] Set the key on the deployed backend with `fly secrets set GEMINI_API_KEY=...`. `backend/fly.toml` carries no secrets by design, so without this the feature works locally and fails in production.
- [ ] Update docs: root `CLAUDE.md`'s "What this is", `backend/CLAUDE.md` (a receipt-scanning section, the `TransactionsController` comment's now-false "no throttler" and "no literal sibling today" notes, and its `## Not built here`), `frontend/src/app/CLAUDE.md`'s modal notes, and `docs/TODO.md` for the deferred opt-in toggle and the multi-receipt batch import.

## Verification

From `backend/`: `npm run lint`, `npm test`, `npm run test:e2e` and `npm run build`. From `frontend/`: `npm run lint`, `npm test` and `npm run build`. From the repo root: `npm run docs:check` and `npm run api:sync` (which must leave no diff).

Then the app itself. Steps 2 and 5 are the only ones that need a real phone: `capture="environment"` does nothing in desktop Chrome, so the ticket's actual subject goes unverified there.

1. Open the "Add Transaction" modal on a phone.
2. Tap "Scan receipt", photograph a receipt, and verify the camera opens rather than a file picker.
3. Verify the loading state appears and can be dismissed.
4. Verify Merchant, Amount, Category, Date and Note populate, and that Date is the receipt's date rather than today's.
5. Type a merchant by hand, scan again, and verify the typed merchant survives while the untouched fields update.
6. Photograph only the top half, verify the note names the missing fields, then photograph the bottom half and verify they fill in without clearing the form.
7. Select two pages of one long receipt together and verify they are synthesized into one extraction.
8. Submit the transaction and verify it saves.
9. Scan past `SCAN_RATE_LIMIT` within the window and verify the 429 renders its own message.
10. Restart the backend with `GEMINI_API_KEY` unset and verify the 503 renders its own message rather than the generic failure.
