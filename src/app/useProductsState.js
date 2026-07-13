import { ref } from 'vue'
import { ApiError, recordsApi } from '../api'
import { createOperationId } from '../utils/operationId'

const emptyProductForm = () => ({ name: '', category: 'other', unit: 'шт' })

export const useProductsState = ({ canManageProducts, onProductRemoved }) => {
  const products = ref([])
  const assortmentRevision = ref(0)
  const productSaveBusy = ref(false)
  const editingProductId = ref(null)
  const productForm = ref(emptyProductForm())
  const productConflict = ref(null)

  const resetProductForm = () => {
    editingProductId.value = null
    productForm.value = emptyProductForm()
    productConflict.value = null
  }

  const updateProductFormField = (field, value) => {
    productForm.value = { ...productForm.value, [field]: value }
  }

  const loadProducts = async () => {
    const response = await recordsApi.products()
    products.value = response.products || []
    assortmentRevision.value = Number(response.revision || 0)
  }

  const startEditProduct = (product) => {
    editingProductId.value = product.id
    productForm.value = {
      name: product.name || '',
      category: product.category || 'other',
      unit: product.unit || 'шт',
    }
    productConflict.value = null
  }

  const productPayload = () => ({
    name: String(productForm.value.name || '').trim(),
    category: productForm.value.category || 'other',
    unit: String(productForm.value.unit || '').trim() || 'шт',
  })

  const runMutation = async (mutation, { force = false, baseRevision } = {}) => {
    const response = await mutation({
      operationId: createOperationId(),
      baseRevision: baseRevision ?? assortmentRevision.value,
      force,
    })
    assortmentRevision.value = Number(response.revision || assortmentRevision.value + 1)
    return response
  }

  const handleConflict = (error, retry) => {
    if (!(error instanceof ApiError) || error.code !== 'REVISION_CONFLICT') return false
    productConflict.value = {
      title: 'Ассортимент изменен на другом устройстве',
      message: 'Загрузите актуальный вариант или сохраните свои изменения поверх него.',
      baseRevision: assortmentRevision.value,
      currentRevision: Number(error.details?.currentRevision || 0),
      retry,
    }
    return true
  }

  const saveProduct = async ({ force = false, baseRevision } = {}) => {
    if (!canManageProducts.value) return
    const payload = productPayload()
    if (!payload.name) {
      alert('Введите название товара')
      return
    }

    productSaveBusy.value = true
    try {
      const productId = editingProductId.value
      await runMutation(
        (meta) => productId
          ? recordsApi.updateProduct(productId, payload, meta)
          : recordsApi.createProduct(payload, meta),
        { force, baseRevision },
      )
      await loadProducts()
      resetProductForm()
    } catch (error) {
      if (!handleConflict(error, (options) => saveProduct(options))) {
        alert(error?.message || 'Не удалось сохранить товар')
      }
    } finally {
      productSaveBusy.value = false
    }
  }

  const removeProduct = async (product, { force = false, baseRevision } = {}) => {
    if (!canManageProducts.value) return
    if (!force && !window.confirm(`Удалить товар "${product.name}"?`)) return

    productSaveBusy.value = true
    try {
      await runMutation(
        (meta) => recordsApi.deleteProduct(product.id, meta),
        { force, baseRevision },
      )
      onProductRemoved(product.id)
      await loadProducts()
      if (editingProductId.value === product.id) resetProductForm()
    } catch (error) {
      if (!handleConflict(error, (options) => removeProduct(product, options))) {
        alert(error?.message || 'Не удалось удалить товар')
      }
    } finally {
      productSaveBusy.value = false
    }
  }

  const reloadProductConflict = async () => {
    await loadProducts()
    productConflict.value = null
    resetProductForm()
  }

  const forceProductConflict = async () => {
    const conflict = productConflict.value
    if (!conflict) return
    productConflict.value = null
    await conflict.retry({ force: true, baseRevision: conflict.baseRevision })
  }

  const clearProductsState = () => {
    products.value = []
    assortmentRevision.value = 0
    resetProductForm()
  }

  return {
    products,
    productSaveBusy,
    editingProductId,
    productForm,
    productConflict,
    resetProductForm,
    updateProductFormField,
    loadProducts,
    startEditProduct,
    saveProduct,
    removeProduct,
    reloadProductConflict,
    forceProductConflict,
    clearProductsState,
  }
}
