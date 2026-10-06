// Ward-scoped accounts (UBND cấp xã, phường – agencyId '6') only see projects located in their own ward.
// Shared by server.ts and the client so both sides decide identically.
//
// Project location looks like "Phường Tân Phú, TP.HCM" or "12 Đường A, Phường Tân Phú, TP.HCM";
// the account's department is the ward name, e.g. "Phường Tân Phú" or "Xã Bình Hưng".
// Matching is exact per comma-separated segment: substring matching wrongly let "Phường 1" match
// "Phường 12" and "Xã Bình Hưng" match "Phường Bình Hưng Hòa".

export const normalizeWardName = (value: string | undefined | null): string => {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    // Abbreviation "P. Tân Phú" → "phường tân phú"
    .replace(/^p\.\s*/, 'phường ')
    // Collapse a duplicated unit prefix, e.g. "Phường Phường An Nhơn" → "phường an nhơn"
    .replace(/^(phường|xã)\s+\1\s+/, '$1 ');
};

const UNIT_PREFIX = /^(phường|xã)\s+/;

export const isProjectInWard = (location: string | undefined | null, department: string | undefined | null): boolean => {
  const ward = normalizeWardName(department);
  // An account without a ward sees nothing, never everything
  if (!ward) return false;
  const wardBareName = ward.replace(UNIT_PREFIX, '');
  return String(location || '')
    .split(',')
    .map(normalizeWardName)
    .some(segment =>
      segment === ward ||
      // Location written without the unit word ("Tân Phú, TP.HCM") still matches by exact name
      (!UNIT_PREFIX.test(segment) && segment === wardBareName)
    );
};
