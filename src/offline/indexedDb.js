const DATABASE_NAME = 'kofeteriy-offline'
const DATABASE_VERSION = 1
const REPORT_STORE = 'reportOperations'

let databasePromise = null

const requestResult = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const transactionDone = (transaction) =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })

export const openOfflineDatabase = () => {
  if (databasePromise) return databasePromise
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable'))
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(REPORT_STORE)) {
        const store = database.createObjectStore(REPORT_STORE, { keyPath: 'key' })
        store.createIndex('userId', 'userId')
        store.createIndex('updatedAt', 'updatedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      databasePromise = null
      reject(request.error)
    }
  })

  return databasePromise
}

const withStore = async (mode, action) => {
  const database = await openOfflineDatabase()
  const transaction = database.transaction(REPORT_STORE, mode)
  const done = transactionDone(transaction)
  const store = transaction.objectStore(REPORT_STORE)
  const result = await action(store)
  await done
  return result
}

export const getOfflineRecord = (key) =>
  withStore('readonly', (store) => requestResult(store.get(key)))

export const getAllOfflineRecords = () =>
  withStore('readonly', (store) => requestResult(store.getAll()))

export const putOfflineRecord = (record) =>
  withStore('readwrite', (store) => requestResult(store.put(record)))

export const deleteOfflineRecord = (key) =>
  withStore('readwrite', (store) => requestResult(store.delete(key)))

export const deleteOfflineRecordIf = async (key, predicate) =>
  withStore('readwrite', async (store) => {
    const current = await requestResult(store.get(key))
    if (!current || !predicate(current)) return false
    await requestResult(store.delete(key))
    return true
  })

export const resetOfflineDatabaseForTests = async () => {
  const database = await databasePromise?.catch(() => null)
  database?.close()
  databasePromise = null
  if (typeof indexedDB === 'undefined') return
  await requestResult(indexedDB.deleteDatabase(DATABASE_NAME))
}
