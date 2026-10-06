// Vietnamese-friendly text search shared by the list screens.
// "Thu Duc", "thủ đức" and "THỦ ĐỨC" all match "Phường Thủ Đức"; null/undefined fields never throw.
// Kept separate from projectUtils so component tests that mock projectUtils are unaffected.

export const normalizeSearchText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

// True when the search term is empty or appears (accent-insensitively) in any of the fields
export const matchesSearch = (term: unknown, ...fields: unknown[]): boolean => {
  const needle = normalizeSearchText(term);
  if (!needle) return true;
  return fields.some(field => normalizeSearchText(field).includes(needle));
};
