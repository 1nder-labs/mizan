/**
 * Date / time formatters shared across reviewer surfaces. One module
 * means consistent locale + format across header / meta / queue and
 * gives a single seam for future i18n.
 */

const SHORT_DATETIME = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const MEDIUM_DATETIME = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatShortDateTime(epochMs: number): string {
  return SHORT_DATETIME.format(new Date(epochMs));
}

export function formatMediumDateTime(epochMs: number): string {
  return MEDIUM_DATETIME.format(new Date(epochMs));
}
