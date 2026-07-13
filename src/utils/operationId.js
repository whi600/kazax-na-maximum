export const createOperationId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `op-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
