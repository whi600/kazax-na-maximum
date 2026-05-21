export const normalizePersonName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
