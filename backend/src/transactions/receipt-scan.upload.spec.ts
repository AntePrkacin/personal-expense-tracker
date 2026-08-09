import { BadRequestException } from '@nestjs/common';
import { receiptUploadOptions } from './receipt-scan.upload';

/**
 * `test/transactions.e2e-spec.ts` proves this wired into a real multipart
 * request; this is the fast path over every branch, including the two
 * ordering directions of "a PDF must be the only file" that an e2e would
 * need two separate uploads to cover.
 */
describe('receiptUploadOptions.fileFilter', () => {
  // Called through the options object on every use, never extracted to a bare reference: the
  // function does not read `this`, but `@typescript-eslint/unbound-method` cannot know that.
  const run = (req: object, mimetype: string) =>
    new Promise<{ error: Error | null; accepted: boolean }>((resolve) => {
      receiptUploadOptions.fileFilter!(
        req,
        { mimetype } as never,
        (error, accepted) => resolve({ error, accepted: Boolean(accepted) }),
      );
    });

  it('accepts every documented MIME type', async () => {
    const req = {};
    for (const mimetype of [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/heic',
      'image/heif',
    ]) {
      const { error, accepted } = await run(req, mimetype);
      expect(error).toBeNull();
      expect(accepted).toBe(true);
    }
  });

  it('rejects an unsupported type with a 400', async () => {
    const { error, accepted } = await run({}, 'application/pdf-fake');
    expect(error).toBeInstanceOf(BadRequestException);
    expect(accepted).toBe(false);
  });

  it('rejects a spreadsheet renamed with an image extension by its real MIME type', async () => {
    const { error } = await run(
      {},
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(error).toBeInstanceOf(BadRequestException);
  });

  it('accepts a single PDF on its own', async () => {
    const req = {};
    const { error, accepted } = await run(req, 'application/pdf');
    expect(error).toBeNull();
    expect(accepted).toBe(true);
  });

  it('rejects an image sent after a PDF, on the same request', async () => {
    const req = {};
    await run(req, 'application/pdf');

    const { error, accepted } = await run(req, 'image/png');
    expect(error).toBeInstanceOf(BadRequestException);
    expect(accepted).toBe(false);
  });

  it('rejects a PDF sent after an image, the other ordering', async () => {
    const req = {};
    await run(req, 'image/png');

    const { error, accepted } = await run(req, 'application/pdf');
    expect(error).toBeInstanceOf(BadRequestException);
    expect(accepted).toBe(false);
  });

  it('accepts several images together, with no PDF in the mix', async () => {
    const req = {};
    await run(req, 'image/png');
    await run(req, 'image/jpeg');
    const { error, accepted } = await run(req, 'image/webp');

    expect(error).toBeNull();
    expect(accepted).toBe(true);
  });
});
