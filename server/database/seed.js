const defaultProducts = [
  { name: 'Хлеб белый', category: 'bakery', unit: 'шт' },
  { name: 'Багет', category: 'bakery', unit: 'шт' },
  { name: 'Круассан', category: 'pastry', unit: 'шт' },
  { name: 'Эклер', category: 'pastry', unit: 'шт' },
  { name: 'Чизкейк порция', category: 'pastry', unit: 'порц' },
  { name: 'Слойка с ветчиной', category: 'bakery', unit: 'шт' },
]

export const seedDefaultProducts = async (database, env = process.env) => {
  if (env.SKIP_DEFAULT_PRODUCTS === '1') return

  const countRow = await database.prepare('SELECT COUNT(*)::int AS count FROM products').get()
  if (countRow.count !== 0) return

  const insert = database.prepare(
    'INSERT INTO products(name, category, unit) VALUES (?, ?, ?)',
  )
  await database.transaction(async (client) => {
    for (const product of defaultProducts) {
      await insert.runOn(client, product.name, product.category, product.unit)
    }
  })
}
