const stripCodeFence = (value) => {
  const trimmed = value.trim()
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1].trim() : trimmed
}

const extractJsonObject = (value) => {
  for (let start = 0; start < value.length; start += 1) {
    if (value[start] !== '{') continue

    let depth = 0
    let inString = false
    let escaped = false
    for (let index = start; index < value.length; index += 1) {
      const character = value[index]
      if (inString) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === '"') inString = false
        continue
      }
      if (character === '"') {
        inString = true
        continue
      }
      if (character === '{') depth += 1
      else if (character === '}') {
        depth -= 1
        if (depth === 0) {
          try {
            return JSON.parse(value.slice(start, index + 1))
          } catch {
            break
          }
        }
      }
    }
  }
  return null
}

export const parseAssistantJsonContent = (content) => {
  if (typeof content !== 'string') return null
  const normalized = content.replace(/^\uFEFF/, '').trim()
  if (!normalized) return null

  for (const candidate of [normalized, stripCodeFence(normalized)]) {
    try {
      return JSON.parse(candidate)
    } catch {
      // Совместимые модели иногда добавляют пояснение вокруг JSON.
    }
  }

  return extractJsonObject(normalized)
}
