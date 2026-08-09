import { BadRequestException } from '@nestjs/common';
// `MulterOptions` itself is not re-exported from the package root - only this
// alias is, via `multer/interfaces/files-upload-module.interface` - so this is
// the public spelling of the same shape `FilesInterceptor`'s third parameter
// takes.
import type { MulterModuleOptions } from '@nestjs/platform-express';
import type { Request } from 'express';
import {
  MAX_PDF_BYTES,
  MAX_RECEIPT_FILES,
  RECEIPT_MIME_TYPES,
  RECEIPT_PDF_MIME_TYPE,
  type ReceiptMimeType,
} from './receipt-scan.constants';

/**
 * Multer calls `fileFilter` once per part, synchronously, in the order the
 * multipart body streams them - so a request's siblings are seen one at a
 * time and the only place to remember "what came before" is the request
 * object itself. That is what this tracks, so a PDF sent beside anything
 * else is a 400 rather than a silently accepted mix multer's own `limits`
 * cannot express (it counts files and bytes, never kinds).
 */
interface ReceiptUploadRequest extends Request {
  receiptFileKinds?: string[];
}

function isReceiptMimeType(value: string): value is ReceiptMimeType {
  return (RECEIPT_MIME_TYPES as readonly string[]).includes(value);
}

function receiptFileFilter(
  req: ReceiptUploadRequest,
  file: { mimetype: string },
  callback: (error: Error | null, acceptFile: boolean) => void,
): void {
  if (!isReceiptMimeType(file.mimetype)) {
    callback(
      new BadRequestException(
        `Unsupported file type "${file.mimetype}". Send a photo (PNG, JPEG, WEBP, HEIC or HEIF) or a single PDF.`,
      ),
      false,
    );
    return;
  }

  const kinds = req.receiptFileKinds ?? (req.receiptFileKinds = []);
  const isPdf = file.mimetype === RECEIPT_PDF_MIME_TYPE;
  const mixedWithPdf = isPdf
    ? kinds.length > 0
    : kinds.includes(RECEIPT_PDF_MIME_TYPE);

  if (mixedWithPdf) {
    callback(
      new BadRequestException(
        'A PDF must be the only file in a scan request - send photos, or a single PDF, not both.',
      ),
      false,
    );
    return;
  }

  kinds.push(file.mimetype);
  callback(null, true);
}

/**
 * `limits.fileSize` is the larger of the two per-kind caps (4MB, a PDF's),
 * because multer applies one number to every file regardless of kind. The
 * smaller cap (1.5MB, an image's) is checked after upload in
 * `ReceiptScanService`, which is what lets the 413 name which cap was
 * actually passed. `limits.files` is the outer count; a lone PDF is
 * `receiptFileFilter`'s job above, not something a count can express.
 */
export const receiptUploadOptions: MulterModuleOptions = {
  limits: { files: MAX_RECEIPT_FILES, fileSize: MAX_PDF_BYTES },
  fileFilter: receiptFileFilter,
};
