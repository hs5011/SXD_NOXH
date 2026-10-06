/**
 * Maps a stored project location onto the ward catalog.
 *
 * Imported projects store the location as free text such as "Phường Bình Tân, TP.HCM", while the
 * catalog (departments of "UBND cấp xã, phường") holds "Phường Bình Tân". Without this mapping the
 * edit form shows an empty "Địa điểm" and the required-field check blocks saving.
 *
 * Returns the catalog value when the location or its first comma-separated part matches a ward
 * (case-insensitive); otherwise returns the location unchanged.
 */
export function matchWardLocation(location: string, wards: string[]): string {
  const raw = String(location ?? '').trim();
  if (!raw) return '';
  const norm = (s: string) => s.trim().toLowerCase();
  const exact = wards.find(w => norm(w) === norm(raw));
  if (exact) return exact;
  const firstPart = raw.split(',')[0];
  const byPrefix = wards.find(w => norm(w) === norm(firstPart));
  return byPrefix || raw;
}
