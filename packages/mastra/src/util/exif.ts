import type { ExifSummary } from "@mizan/shared";

/**
 * Parses real EXIF capture metadata from raw image bytes. EXIF lives in a JPEG's
 * APP1 segment, so this is JPEG-only; PNGs, PDFs, screenshots, re-saved /
 * scrubbed photos, and AI-generated images carry no EXIF and honestly return
 * `has_capture_metadata: false` rather than inventing data. Reads IFD0
 * Make/Model/DateTime, the Exif sub-IFD's DateTimeOriginal, and the presence of
 * the GPS sub-IFD. All byte access goes through `DataView` (no
 * `noUncheckedIndexedAccess` undefined holes).
 */
const EMPTY_EXIF: ExifSummary = {
  has_capture_metadata: false,
  camera_make: null,
  camera_model: null,
  captured_at: null,
  has_gps: false,
};

const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TYPE_ASCII = 2;

/** Position of an IFD entry's 4-byte value field + its declared type/count. */
interface IfdEntry {
  readonly type: number;
  readonly count: number;
  readonly fieldPos: number;
}

export function parseExif(bytes: Uint8Array): ExifSummary {
  const tiff = findExifTiff(bytes);
  return tiff ? readTiff(tiff) : EMPTY_EXIF;
}

/** Locates the TIFF block inside a JPEG's Exif APP1 segment; null when absent / not JPEG. */
function findExifTiff(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let i = 2;
  while (i + 4 <= view.byteLength) {
    if (view.getUint8(i) !== 0xff) return null;
    const marker = view.getUint8(i + 1);
    if (marker === 0xda || marker === 0xd9) return null;
    const len = view.getUint16(i + 2);
    if (len < 2) return null;
    if (
      marker === 0xe1 &&
      i + 10 <= view.byteLength &&
      view.getUint32(i + 4) === 0x45786966 &&
      view.getUint16(i + 8) === 0x0000
    ) {
      return bytes.subarray(i + 10, i + 2 + len);
    }
    i += 2 + len;
  }
  return null;
}

/** Reads the EXIF fields of interest out of a TIFF block. */
function readTiff(tiff: Uint8Array): ExifSummary {
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  if (view.byteLength < 8) return EMPTY_EXIF;
  const bom = view.getUint16(0);
  const little = bom === 0x4949;
  if (!little && bom !== 0x4d4d) return EMPTY_EXIF;
  const ifd0 = readIfd(view, view.getUint32(4, little), little);
  if (!ifd0) return EMPTY_EXIF;
  const make = readAscii(view, ifd0.get(TAG_MAKE), little);
  const model = readAscii(view, ifd0.get(TAG_MODEL), little);
  const captured = readCapturedAt(view, ifd0, little);
  const hasGps = ifd0.has(TAG_GPS_IFD);
  return {
    has_capture_metadata: make !== null || model !== null || captured !== null || hasGps,
    camera_make: make,
    camera_model: model,
    captured_at: captured,
    has_gps: hasGps,
  };
}

/** Prefers the Exif sub-IFD's DateTimeOriginal, falling back to IFD0 DateTime. */
function readCapturedAt(
  view: DataView,
  ifd0: Map<number, IfdEntry>,
  little: boolean,
): string | null {
  const exifPtr = ifd0.get(TAG_EXIF_IFD);
  if (exifPtr) {
    const exifIfd = readIfd(view, view.getUint32(exifPtr.fieldPos, little), little);
    const original = exifIfd ? readAscii(view, exifIfd.get(TAG_DATETIME_ORIGINAL), little) : null;
    if (original !== null) return original;
  }
  return readAscii(view, ifd0.get(TAG_DATETIME), little);
}

/** Reads one IFD's entries into a tag→entry map; null on a malformed/out-of-range offset. */
function readIfd(view: DataView, offset: number, little: boolean): Map<number, IfdEntry> | null {
  if (offset <= 0 || offset + 2 > view.byteLength) return null;
  const count = view.getUint16(offset, little);
  const entries = new Map<number, IfdEntry>();
  let pos = offset + 2;
  for (let n = 0; n < count; n += 1) {
    if (pos + 12 > view.byteLength) break;
    const tag = view.getUint16(pos, little);
    entries.set(tag, {
      type: view.getUint16(pos + 2, little),
      count: view.getUint32(pos + 4, little),
      fieldPos: pos + 8,
    });
    pos += 12;
  }
  return entries;
}

/** Reads an ASCII tag value (inline when ≤4 bytes, else at the offset in the value field). */
function readAscii(view: DataView, entry: IfdEntry | undefined, little: boolean): string | null {
  if (!entry || entry.type !== TYPE_ASCII || entry.count === 0) return null;
  const start = entry.count <= 4 ? entry.fieldPos : view.getUint32(entry.fieldPos, little);
  if (start + entry.count > view.byteLength) return null;
  let out = "";
  for (let k = 0; k < entry.count; k += 1) {
    const code = view.getUint8(start + k);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  const trimmed = out.trim();
  return trimmed.length > 0 ? trimmed : null;
}
