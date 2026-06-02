/**
 * Configures the PDF.js Web Worker source once at app import. Vite
 * resolves `pdfjs-dist/build/pdf.worker.min.mjs` via `import.meta.url`
 * and bundles it as a separate worker asset, so the URL string here
 * is rewritten at build time to a content-hashed path.
 *
 * Lives in its own module so `apps/web/src/main.tsx` runs the
 * side-effect exactly once (any subsequent re-imports are no-ops) and
 * tests can mock the bootstrap if needed.
 */
import { pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
