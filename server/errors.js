export class HttpError extends Error {
  constructor(statusCode, message, code = 'HTTP_ERROR', details = null) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export const isHttpError = (error) => error instanceof HttpError

export const invalidJsonError = () =>
  new HttpError(400, 'Некорректный JSON', 'INVALID_JSON')

export const bodyTooLargeError = () =>
  new HttpError(413, 'Слишком большой запрос', 'BODY_TOO_LARGE')

export const conflictError = (message, code, details = null) =>
  new HttpError(409, message, code, details)
