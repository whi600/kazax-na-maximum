import fs from 'node:fs'
import path from 'node:path'

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

const noCacheFiles = new Set([
  'index.html',
  'sw.js',
  'app-version.json',
  'manifest.webmanifest',
])

const getCacheControl = (outputPath) => {
  const fileName = path.basename(outputPath)
  return noCacheFiles.has(fileName) ? 'no-cache' : 'public, max-age=31536000, immutable'
}

export const createStaticFileServer = ({ distDir, json }) => {
  const hasDist = fs.existsSync(distDir)

  return (req, res, pathname) => {
    if (!hasDist) {
      json(res, 404, {
        error:
          'Фронтенд не собран. Запустите `npm run dev` для разработки или `npm run build` для прод-режима.',
      })
      return
    }

    const requestedPath = pathname === '/' ? '/index.html' : pathname
    const safePath = path.normalize(requestedPath).replace(/^\.\.(?:\/|\\|$)+/, '')
    const absolutePath = path.join(distDir, safePath)
    const insideDist = absolutePath.startsWith(distDir)
    const filePath = insideDist && fs.existsSync(absolutePath) ? absolutePath : null
    const outputPath = filePath || path.join(distDir, 'index.html')
    const data = fs.readFileSync(outputPath)

    res.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(outputPath)] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': getCacheControl(outputPath),
    })
    res.end(data)
  }
}
