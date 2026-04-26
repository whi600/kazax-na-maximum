import { randomBytes, scryptSync } from 'node:crypto'

const [, , rawEmail, rawPassword] = process.argv
const email = String(rawEmail || '').trim().toLowerCase()
const password = String(rawPassword || '')

const usage = () => {
  console.error('Usage: npm run reset-password -- <email> <new-password>')
  console.error('Example: npm run reset-password -- admin@example.com new-strong-password')
}

if (!email || !email.includes('@') || !password) {
  usage()
  process.exit(1)
}

if (password.length < 6) {
  console.error('Password must be at least 6 characters long.')
  process.exit(1)
}

const { db, dbPath } = await import('../server/db.js')

const user = await db
  .prepare('SELECT id, email, name, role FROM users WHERE email = ?')
  .get(email)

if (!user) {
  console.error(`User not found: ${email}`)
  await db.close()
  process.exit(1)
}

const salt = randomBytes(16).toString('hex')
const hash = scryptSync(password, salt, 64).toString('hex')
const passwordHash = `${salt}:${hash}`

try {
  const updateUserPassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
  const deleteUserSessions = db.prepare('DELETE FROM sessions WHERE user_id = ?')

  await db.transaction(async (client) => {
    await updateUserPassword.runOn(client, passwordHash, user.id)
    await deleteUserSessions.runOn(client, user.id)
  })
} catch (error) {
  await db.close()
  throw error
}

console.log(`Password reset for ${user.email} (${user.role})`)
console.log(`Database: ${dbPath}`)
console.log('Existing sessions for this user were removed.')

await db.close()
