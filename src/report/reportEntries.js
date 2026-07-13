export const reportFields = ['arrival', 'remainder', 'write_off']

export const reportFieldLabels = {
  arrival: 'Приход',
  remainder: 'Остаток',
  write_off: 'Списание',
}

const normalizeNumber = (value, fallback = null) => {
  if (value === null || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export const normalizeReportEntries = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      product_id: Number(entry.product_id),
      name: entry.name || '',
      category: entry.category || 'other',
      unit: entry.unit || 'шт',
      arrival: normalizeNumber(entry.arrival),
      remainder: normalizeNumber(entry.remainder),
      write_off: normalizeNumber(entry.write_off),
    }))
    .filter((entry) => Number.isFinite(entry.product_id))

export const buildReportPayload = (entries) =>
  normalizeReportEntries(entries)
    .map((entry) => ({
      product_id: entry.product_id,
      arrival: normalizeNumber(entry.arrival, 0),
      remainder: normalizeNumber(entry.remainder, 0),
      write_off: normalizeNumber(entry.write_off, 0),
    }))
    .filter((entry) => reportFields.some((field) => entry[field] !== 0))

const entryMap = (entries) =>
  new Map(normalizeReportEntries(entries).map((entry) => [entry.product_id, entry]))

const fieldValue = (entry, field) => normalizeNumber(entry?.[field], 0)

export const mergeReportVersions = ({ baseEntries, localEntries, serverEntries }) => {
  const base = entryMap(baseEntries)
  const local = entryMap(localEntries)
  const server = entryMap(serverEntries)
  const productIds = new Set([...base.keys(), ...local.keys(), ...server.keys()])
  const entries = []
  const conflicts = []

  for (const productId of productIds) {
    const baseEntry = base.get(productId)
    const localEntry = local.get(productId)
    const serverEntry = server.get(productId)
    const source = localEntry || serverEntry || baseEntry
    const merged = {
      product_id: productId,
      name: source?.name || '',
      category: source?.category || 'other',
      unit: source?.unit || 'шт',
    }

    for (const field of reportFields) {
      const baseValue = fieldValue(baseEntry, field)
      const localValue = fieldValue(localEntry, field)
      const serverValue = fieldValue(serverEntry, field)

      if (localValue === serverValue || serverValue === baseValue) {
        merged[field] = localValue
      } else if (localValue === baseValue) {
        merged[field] = serverValue
      } else {
        merged[field] = localValue
        conflicts.push({
          key: `${productId}:${field}`,
          productId,
          productName: source?.name || `Товар #${productId}`,
          field,
          baseValue,
          localValue,
          serverValue,
        })
      }
    }

    if (localEntry || serverEntry || reportFields.some((field) => merged[field] !== 0)) {
      entries.push(merged)
    }
  }

  return { entries, conflicts }
}

export const applyReportConflictChoices = ({ entries, conflicts }, choices = {}) => {
  const conflictByKey = new Map(conflicts.map((conflict) => [conflict.key, conflict]))

  return entries.map((entry) => {
    const resolved = { ...entry }
    for (const field of reportFields) {
      const key = `${entry.product_id}:${field}`
      const conflict = conflictByKey.get(key)
      if (!conflict) continue
      resolved[field] = choices[key] === 'server'
        ? conflict.serverValue
        : conflict.localValue
    }
    return resolved
  })
}
