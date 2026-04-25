import fs from 'node:fs'
import path from 'node:path'

const publicDir = path.resolve(process.cwd(), 'public')
const versionPath = path.join(publicDir, 'app-version.json')

fs.mkdirSync(publicDir, { recursive: true })
fs.writeFileSync(
  versionPath,
  `${JSON.stringify({ version: String(Date.now()) })}\n`,
)

