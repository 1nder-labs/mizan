/** 1×1 synthetic PNG bytes for Miniflare R2 uploads in integration tests. */
export const MINIMAL_PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII=",
  ),
  (c) => c.charCodeAt(0),
);
