import imageCompression from 'browser-image-compression';

// Client-side compression for the receipt scanner (PET-59), and the one
// branch that keeps a PDF out of a pipeline built for photos.
//
// Mobile photos run 5MB+, so sending one uncompressed wastes bandwidth and
// slows the extraction down for nothing the model needs - receipt text reads
// fine well under a megabyte. `browser-image-compression` is chosen for three
// things at once: it auto-fixes the sideways-photo EXIF rotation problem
// mobile cameras are notorious for, it offloads the work to a Web Worker so
// the UI thread stays free, and its size-cap API is a couple of options
// rather than a hand-rolled canvas loop.

/** At most 4 images per scan, or exactly one PDF - the size stack's outer count. */
export const MAX_RECEIPT_FILES = 4;

export const RECEIPT_PDF_MIME_TYPE = 'application/pdf';

/**
 * The backend's own per-PDF cap, mirrored here for the same reason
 * `MAX_RECEIPT_FILES` is: this side has to refuse an oversized PDF *before*
 * sending, and it cannot import a backend constant.
 *
 * It is checked on the client for PDFs only, and that asymmetry is the design.
 * An image's size before this module runs says nothing - it is compressed
 * toward `maxSizeMB` first, and a 12MB phone photo is the ordinary case - so
 * the backend's 413 stays the real answer for one that overshoots. A PDF is
 * passed through untouched, which makes it the one file that can arrive at the
 * Server Action bigger than `next.config.ts`'s `bodySizeLimit`, where the call
 * *throws* rather than answering a 413 anything could name a cap from.
 */
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

/**
 * `maxSizeMB` is best-effort - the library iterates toward the target and
 * gives up at its own `maxIteration` - which is answered by the backend's own
 * 413 rather than assumed away here.
 */
const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.75,
  maxWidthOrHeight: 2000,
  // The benefit this buys - the UI thread staying free during compression -
  // is a selection criterion for this library, not its default, so it is
  // passed explicitly rather than relied on silently.
  useWebWorker: true,
};

export type ReceiptCompressionResult =
  | { ok: true; files: File[] }
  | { ok: false; reason: 'unsupportedFormat' };

/**
 * Compresses every image in `files` to the size stack's image cap, and passes
 * a PDF through untouched.
 *
 * **A PDF never enters the compression path, and the branch is explicit
 * rather than incidental.** `browser-image-compression` decodes through
 * `createImageBitmap`/canvas, and a PDF is not an image to a canvas - handing
 * one to the library is the identical rejection a HEIC photo produces, so the
 * type is tested before compressing rather than compressing and catching. It
 * also means a PDF arrives at its original size, which is what the backend's
 * larger 4MB cap (against an image's 1.5MB) exists for.
 *
 * @returns `{ ok: false, reason: 'unsupportedFormat' }` when a file's format
 * cannot be decoded through canvas - HEIC/HEIF from an iPhone not set to
 * "Most Compatible" is the practical case - rather than letting the
 * rejection escape to the caller and leave the loading overlay's promise
 * hanging with nothing to show for it.
 */
export async function compressReceiptFiles(
  files: File[],
): Promise<ReceiptCompressionResult> {
  try {
    const compressed = await Promise.all(
      files.map((file) =>
        file.type === RECEIPT_PDF_MIME_TYPE
          ? file
          : imageCompression(file, COMPRESSION_OPTIONS),
      ),
    );
    return { ok: true, files: compressed };
  } catch {
    return { ok: false, reason: 'unsupportedFormat' };
  }
}
