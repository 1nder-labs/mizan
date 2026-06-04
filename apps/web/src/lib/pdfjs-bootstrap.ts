/**
 * Configures the PDF.js Web Worker source once at app import.
 *
 * The worker MUST match the pdfjs API version react-pdf bundles, or pdfjs
 * rejects every document ("API version X does not match Worker version Y").
 * Resolving the worker via Vite's `import.meta.url` picks the app's own
 * `pdfjs-dist`, which can drift from react-pdf's pinned copy — so it is loaded
 * from the CDN at `pdfjs.version` (react-pdf's exact version), mirroring how the
 * cmap + standard-font assets already resolve in `pdf-viewer.tsx`.
 *
 * Lives in its own module so `apps/web/src/main.tsx` runs the side-effect
 * exactly once (subsequent re-imports are no-ops) and tests can mock it.
 */
import { pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
