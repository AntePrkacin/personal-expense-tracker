import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // This repo has a package-lock.json at the root (repo-wide dev tooling) and one
  // per app, so Turbopack cannot infer the workspace root and falls back to the
  // repo root. That makes it watch and trace backend/ too. Pin the root to this
  // app: there are no npm workspaces, each app has its own node_modules, and the
  // frontend resolves nothing from outside this directory.
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      // `scanReceipt` posts up to 4 compressed images (0.75MB each) or one
      // uncompressed PDF (4MB) as one multipart body. The default is 1MB,
      // which one compressed photo already exceeds. This has to sit under
      // `experimental` rather than at the top level - in the installed Next
      // 16.2.12, `serverActions` is declared on `ExperimentalConfig`, so the
      // top-level spelling fails `npm run build` (this repo's typecheck).
      //
      // 8mb rather than the naive 4 x 1.5MB = 6MB the image path's own caps
      // suggest: that figure is *equal* to multer's per-request ceiling on
      // the backend, not above it, so multipart boundaries and this action's
      // own request overhead would push a request multer would accept past
      // this limit first - trading a clean 413 for an opaque one. The
      // outermost limit must be strictly the largest in the stack, and the
      // one-PDF rule (see `receiptCompression.ts`) is what keeps the PDF
      // path under it too.
      bodySizeLimit: '8mb',
    },
  },
};

export default nextConfig;
