import imageCompression from 'browser-image-compression';

import { compressReceiptFiles, MAX_RECEIPT_FILES } from './receiptCompression';

// A package specifier, so the `@/` alias trap does not apply.
jest.mock('browser-image-compression', () => jest.fn());

const mockCompress = imageCompression as unknown as jest.Mock;

const image = (name = 'receipt.jpg') => new File(['x'], name, { type: 'image/jpeg' });
const pdf = (name = 'receipt.pdf') => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

beforeEach(() => {
  jest.clearAllMocks();
  mockCompress.mockImplementation(async (file: File) => file);
});

describe('compressReceiptFiles', () => {
  it('compresses every image with the size stack’s cap and dimension', async () => {
    const file = image();

    await compressReceiptFiles([file]);

    expect(mockCompress).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        maxSizeMB: 0.75,
        maxWidthOrHeight: 2000,
        // The benefit this buys - the UI thread staying free - is a selection
        // criterion for the library and not its default, so it must be explicit.
        useWebWorker: true,
      }),
    );
  });

  it('never hands a PDF to the compression library, the identical canvas rejection a HEIC produces', async () => {
    const file = pdf();

    const result = await compressReceiptFiles([file]);

    expect(mockCompress).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, files: [file] });
  });

  it('compresses images and passes a PDF through in the same batch', async () => {
    const photo = image();
    const receipt = pdf();

    const result = await compressReceiptFiles([photo, receipt]);

    expect(mockCompress).toHaveBeenCalledTimes(1);
    expect(mockCompress).toHaveBeenCalledWith(photo, expect.anything());
    expect(result).toEqual({ ok: true, files: [photo, receipt] });
  });

  it('returns the compressed files in the same order they were given', async () => {
    const first = image('a.jpg');
    const second = image('b.jpg');
    const compressedFirst = image('a.jpg');
    const compressedSecond = image('b.jpg');
    mockCompress.mockResolvedValueOnce(compressedFirst).mockResolvedValueOnce(compressedSecond);

    const result = await compressReceiptFiles([first, second]);

    expect(result).toEqual({ ok: true, files: [compressedFirst, compressedSecond] });
  });

  it('reports unsupportedFormat rather than letting the rejection escape, on a HEIC decode failure', async () => {
    // browser-image-compression decodes through createImageBitmap/canvas, which cannot
    // decode HEIC/HEIF in Chrome or Firefox - the practical way this branch is reached.
    mockCompress.mockRejectedValue(new Error('Failed to load the image'));

    const result = await compressReceiptFiles([image('IMG_0001.heic')]);

    expect(result).toEqual({ ok: false, reason: 'unsupportedFormat' });
  });

  it('reports the same failure if any one file in a batch fails to decode', async () => {
    mockCompress
      .mockResolvedValueOnce(image('a.jpg'))
      .mockRejectedValueOnce(new Error('Failed to load the image'));

    const result = await compressReceiptFiles([image('a.jpg'), image('b.heic')]);

    expect(result).toEqual({ ok: false, reason: 'unsupportedFormat' });
  });

  it('exports the outer file-count cap the modal enforces client-side', () => {
    expect(MAX_RECEIPT_FILES).toBe(4);
  });
});
