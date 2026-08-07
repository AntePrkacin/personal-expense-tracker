# PET-59 — AI Receipt Scanning

[PET-59](https://decode.atlassian.net/browse/PET-59) — `[FE/BE] Build AI Receipt Scanning via Mobile Camera`

Base branch is `main`.

## Why

Typing out transactions manually is tedious, especially on mobile. Modern Vision models can reliably extract the merchant, amount, category, and notes from a simple photo of a receipt. This feature allows users to tap a "Scan Receipt" button in the Add Transaction modal, take a photo with their phone camera, and have the transaction form automatically populated. This dramatically reduces friction and creates a "wow" factor for the application.

## Decisions

**Do not persist images.** Storing receipts would require significant infrastructure (S3/R2) and introduce data privacy and retention complexities. The image will be processed entirely in-memory, sent to the AI for extraction, and then immediately discarded.

**Personalized Category Matching via Prompt.** The database requires a strict ID for `categoryId`. The AI cannot guess this ID. The backend must fetch the user's categories and inject them into the prompt (e.g., `[{"id": "...", "name": "Food"}]`). Additionally, to improve accuracy and enable fuzzy matching, the prompt will include an array of the user's merchants from the past year. Each merchant object will list the categories associated with it and the transaction counts for each category. This allows the AI to correctly map generic or misspelled receipt names (e.g., "WM SUPERCENTER") to the user's specific habits.

**Privacy and Free Tier Implications.** By default, the free tier of Google AI Studio may log prompts (which will include merchant history and receipt data) to improve their models. Since financial data can be sensitive, this must be documented clearly for the user. As a future enhancement or for privacy-conscious users, the app may need a toggle to disable the AI scanning feature entirely, or the app may eventually need to migrate to the paid API tier where data training is disabled by default.

**Multi-Image and Iterative Scanning.** For long receipts or multi-page receipts, the user can select multiple receipts at once from their device gallery (`multiple` attribute), allowing Gemini to synthesize them all in a single request. Alternatively, if using the direct camera button (which typically takes a single photo), the frontend will extract partial data, display what's missing, and allow the user to seamlessly capture and merge additional receipts without clearing the form.

**Client-side compression.** Mobile phones take large photos (5MB+). Sending these directly wastes bandwidth and slows down extraction. The frontend will compress the image in the browser using the `browser-image-compression` library before POSTing to the backend. This library is chosen because it auto-fixes mobile EXIF rotations (preventing sideways receipt uploads), offloads processing to a Web Worker (keeping the UI smooth), and provides an incredibly simple API for enforcing maximum file sizes.

## Shape

**The Frontend:**
- Two buttons inside the `AddTransactionModal`:
  - "Scan Receipt" (Camera): Uses `<input type="file" accept="image/*" capture="environment">` to trigger the camera natively.
  - "Upload Receipts" (Gallery): Uses `<input type="file" accept="image/*" multiple>` to allow selecting multiple receipts from the device storage at once.
- A loading state that overlays the modal while the extraction runs (typically 3-5 seconds).
- Once the extraction API responds, the data (`amount`, `merchant`, `categoryId`, `date`, `note`) is merged into the existing form state.
- If the AI fails to extract certain fields (e.g., blurry photo or partial receipt), the UI displays a warning/toast noting what is missing and encourages the user to take another photo to fill in the blanks.

**The Backend:**
- `POST /api/transactions/scan` endpoint.
- Accepts `multipart/form-data` (supporting multiple files) or an array of base64 encoded images.
- Uses the **Google Gemini API (via Google AI Studio)** specifically to leverage the **free tier of Gemini 1.5 Flash**. This model natively supports structured output to enforce our strict JSON schema.
- Constructs an efficient SQL query to fetch the user's categories along with a 1-year history of merchants, their associated categories, and transaction counts. This contextual data is injected into the AI prompt to maximize categorization accuracy.

## Tasks

- [ ] Commit this plan alone (local branch for now).
- [ ] Implement backend `POST /api/transactions/scan` route accepting images.
- [ ] Add `GEMINI_API_KEY` to backend environment validation (`env.validation.ts` and `.env.example`).
- [ ] Integrate AI SDK (e.g., `@google/generative-ai`) with structured JSON prompt and category mapping.
- [ ] Install `browser-image-compression` and add a client-side image compression utility in the frontend.
- [ ] Update `AddTransactionModal` to include the "Scan Receipt" (camera) and "Upload Receipts" (multiple files) buttons.
- [ ] Connect both frontend buttons to the new API (handling arrays of images) and handle loading/population states.
- [ ] Update docs and `CLAUDE.md` to reflect the new AI capability.

## Verification

From `frontend/`: `npm run lint`, `npm test`, `npm run build` and `npx tsc --noEmit`. From the repo root: `npm run docs:check`.

Then the app itself in **Chrome**:
1. Open the "Add Transaction" modal.
2. Click the "Scan Receipt" button and provide a test receipt image. Also test the "Upload Receipts" button by selecting multiple receipt images at once.
3. Verify the loading state appears.
4. Verify the form fields (Merchant, Amount, Category, Date, Note) populate correctly with the extracted data.
5. Provide a partial receipt image and verify that the UI flags missing fields and successfully merges a subsequent scan without losing data.
6. Submit the transaction and verify it saves successfully.
