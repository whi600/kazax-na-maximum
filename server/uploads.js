import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { readBufferBody } from './http.js'

const allowedAttachmentMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

const allowedAttachmentExtensions = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.pdf',
  '.txt',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
])

const parseContentDisposition = (value) => {
  const result = {}
  String(value || '')
    .split(';')
    .map((part) => part.trim())
    .forEach((part) => {
      const [key, ...rest] = part.split('=')
      if (!key || rest.length === 0) return
      result[key.toLowerCase()] = rest.join('=').replace(/^"|"$/g, '')
    })
  return result
}

export const parseMultipartBody = async (req, maxUploadBodySize) => {
  const contentType = String(req.headers['content-type'] || '')
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2]
  if (!boundary) throw new Error('Missing multipart boundary')

  const body = await readBufferBody(req, maxUploadBodySize)
  const boundaryBuffer = Buffer.from(`--${boundary}`)
  const fieldMap = {}
  const files = []
  let cursor = body.indexOf(boundaryBuffer)

  while (cursor >= 0) {
    cursor += boundaryBuffer.length
    const marker = body.subarray(cursor, cursor + 2).toString('utf8')
    if (marker === '--') break
    if (marker === '\r\n') cursor += 2

    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), cursor)
    if (headerEnd < 0) break

    const rawHeaders = body.subarray(cursor, headerEnd).toString('utf8')
    const headers = rawHeaders.split('\r\n').reduce((acc, line) => {
      const separator = line.indexOf(':')
      if (separator < 0) return acc
      acc[line.slice(0, separator).trim().toLowerCase()] = line
        .slice(separator + 1)
        .trim()
      return acc
    }, {})

    const nextBoundary = body.indexOf(boundaryBuffer, headerEnd + 4)
    if (nextBoundary < 0) break

    let content = body.subarray(headerEnd + 4, nextBoundary)
    if (content.length >= 2 && content.subarray(content.length - 2).toString('utf8') === '\r\n') {
      content = content.subarray(0, content.length - 2)
    }

    const disposition = parseContentDisposition(headers['content-disposition'])
    if (disposition.filename) {
      files.push({
        fieldName: disposition.name || 'attachment',
        originalName: disposition.filename,
        mimeType: headers['content-type'] || 'application/octet-stream',
        buffer: content,
      })
    } else if (disposition.name) {
      fieldMap[disposition.name] = content.toString('utf8')
    }

    cursor = nextBoundary
  }

  return { fields: fieldMap, files }
}

export const sanitizeUploadName = (value) => {
  const fallback = 'file'
  return (
    path
      .basename(String(value || fallback))
      .replace(/[^\w.\-а-яА-ЯёЁ ]/g, '_')
      .trim() || fallback
  )
}

const extensionForMimeType = (mimeType) => {
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'image/gif') return '.gif'
  if (mimeType === 'application/pdf') return '.pdf'
  if (mimeType === 'text/plain') return '.txt'
  if (mimeType.includes('wordprocessingml')) return '.docx'
  if (mimeType.includes('spreadsheetml')) return '.xlsx'
  if (mimeType === 'application/msword') return '.doc'
  if (mimeType === 'application/vnd.ms-excel') return '.xls'
  return ''
}

const mimeTypeForExtension = (extension) => {
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.gif') return 'image/gif'
  if (extension === '.pdf') return 'application/pdf'
  if (extension === '.txt') return 'text/plain'
  if (extension === '.doc') return 'application/msword'
  if (extension === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (extension === '.xls') return 'application/vnd.ms-excel'
  if (extension === '.xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  return ''
}

export const prepareAttachmentUpload = (file, maxAttachmentSize) => {
  if (!file || file.buffer.length === 0) return null
  if (file.buffer.length > maxAttachmentSize) {
    throw new Error('Файл больше 10 МБ')
  }

  const originalName = sanitizeUploadName(file.originalName)
  const originalExt = path.extname(originalName).toLowerCase().slice(0, 12)
  const rawMimeType = String(file.mimeType || '').toLowerCase()
  const mimeType = rawMimeType || 'application/octet-stream'
  const genericMimeType = mimeType === 'application/octet-stream'
  const allowedByMime = allowedAttachmentMimeTypes.has(mimeType)
  const allowedByExtension =
    genericMimeType && allowedAttachmentExtensions.has(originalExt)

  if (!allowedByMime && !allowedByExtension) {
    throw new Error('Этот тип файла пока нельзя отправить')
  }

  const normalizedMimeType = allowedByMime
    ? mimeType
    : mimeTypeForExtension(originalExt) || 'application/octet-stream'
  const safeOriginalExt = allowedAttachmentExtensions.has(originalExt) ? originalExt : ''
  const extension = safeOriginalExt || extensionForMimeType(normalizedMimeType)
  const storedName = `${randomBytes(16).toString('hex')}${extension}`
  const storagePath = storedName

  return {
    originalName,
    storedName,
    mimeType: normalizedMimeType,
    size: file.buffer.length,
    storagePath,
    buffer: file.buffer,
  }
}
