const normalize = (value) => String(value || '')
  .toLocaleLowerCase('ru-RU')
  .replace(/ё/g, 'е')
  .replace(/[^\p{L}\p{N}.,]+/gu, ' ')
  .trim()

const numberWords = new Map([
  ['ноль', 0], ['один', 1], ['одна', 1], ['два', 2], ['две', 2], ['три', 3],
  ['четыре', 4], ['пять', 5], ['шесть', 6], ['семь', 7], ['восемь', 8],
  ['девять', 9], ['десять', 10], ['одиннадцать', 11], ['двенадцать', 12],
  ['тринадцать', 13], ['четырнадцать', 14], ['пятнадцать', 15], ['шестнадцать', 16],
  ['семнадцать', 17], ['восемнадцать', 18], ['девятнадцать', 19], ['двадцать', 20],
])

const mutationPattern = /(остат|остал|постав|запиш|укаж|внес|обнов|налич|количеств|есть)/i
const numberPattern = /\d+(?:[.,]\d+)?|ноль|один|одна|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать|тринадцать|четырнадцать|пятнадцать|шестнадцать|семнадцать|восемнадцать|девятнадцать|двадцать/gi

const parseQuantity = (value) => {
  const normalized = String(value).toLocaleLowerCase('ru-RU').replace(',', '.')
  if (numberWords.has(normalized)) return numberWords.get(normalized)
  const number = Number(normalized)
  return Number.isFinite(number) && number >= 0 ? number : null
}

const findProductPosition = (text, name) => {
  const exact = text.indexOf(name)
  if (exact >= 0) return exact
  if (name.length < 5) return -1
  return text.indexOf(name.slice(0, -1))
}

export const parseInventoryCommand = ({ command, products }) => {
  const text = normalize(command)
  if (!text || !mutationPattern.test(text)) return null

  const numbers = Array.from(text.matchAll(numberPattern)).map((match) => ({
    index: match.index,
    value: parseQuantity(match[0]),
  })).filter((item) => item.value !== null)
  if (!numbers.length) return null

  const productPositions = products
    .map((product) => ({
      product,
      name: normalize(product.name),
      index: findProductPosition(text, normalize(product.name)),
    }))
    .filter((item) => item.index >= 0)
    .sort((left, right) => left.index - right.index)
  if (!productPositions.length) return null

  const usedNumbers = new Set()
  const actions = []
  for (const item of productPositions) {
    const candidates = numbers
      .map((number, index) => ({ ...number, numberIndex: index, distance: Math.abs(number.index - item.index) }))
      .filter((number) => !usedNumbers.has(number.numberIndex) && number.distance <= 32)
      .sort((left, right) => left.distance - right.distance)
    const match = candidates[0]
    if (!match) continue
    usedNumbers.add(match.numberIndex)
    actions.push({ type: 'set_remainder', productId: Number(item.product.id), remainder: match.value })
  }

  if (!actions.length) return null
  return {
    reply: `Записал остатки: ${actions.length}.`,
    actions,
  }
}
