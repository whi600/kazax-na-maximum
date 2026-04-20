import { randomBytes, scryptSync } from 'node:crypto'
import { db, dbPath } from '../server/db.js'

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

const user = db
  .prepare('SELECT id, email, name, role FROM users WHERE email = ?')
  .get(email)

if (!user) {
  console.error(`User not found: ${email}`)
  process.exit(1)
}

const salt = randomBytes(16).toString('hex')
const hash = scryptSync(password, salt, 64).toString('hex')
const passwordHash = `${salt}:${hash}`

db.exec('BEGIN')
try {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
  db.exec('COMMIT')
} catch (error) {
  db.exec('ROLLBACK')
  throw error
}

console.log(`Password reset for ${user.email} (${user.role})`)
console.log(`Database: ${dbPath}`)
console.log('Existing sessions for this user were removed.')
