import { expect, test } from '@playwright/test'

const registerAdmin = async ({ page, email, name }) => {
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('/')
  await page.getByRole('button', { name: 'Регистрация' }).click()
  await page.getByPlaceholder('Ваше имя').fill(name)
  await page.getByPlaceholder('name@company.com').fill(email)
  await page.getByPlaceholder('Минимум 6 символов').fill('strong-password')
  const initialDataLoaded = page.waitForResponse(
    (response) => response.url().includes('/api/products') && response.ok(),
  )
  await page.getByRole('button', { name: 'Создать аккаунт' }).click()
  await initialDataLoaded

  return pageErrors
}

test('admin can create a shift from the viewport-bound editor', async ({ page }, testInfo) => {
  const email = `e2e-${testInfo.project.name}@example.test`
  const [startTime, endTime] = ({
    'mobile-chromium': ['10:11', '10:22'],
    'desktop-chromium': ['10:31', '10:42'],
    'mobile-webkit': ['10:51', '11:02'],
  })[testInfo.project.name]
  const pageErrors = await registerAdmin({ page, email, name: 'E2E Admin' })

  await expect(page.locator('nav.app-bottom-nav')).toBeVisible()
  await page.getByRole('button', { name: 'График' }).click()
  await expect(page.getByRole('heading', { name: 'График' })).toBeVisible()
  await page.getByRole('button', { name: 'Смена', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Новая смена' })).toBeVisible()
  await expect(page.locator('input[type="date"]')).toHaveCount(1)
  await expect(page.locator('input[type="time"]')).toHaveCount(2)
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')

  await page.locator('input[type="time"]').nth(0).fill(startTime)
  await page.locator('input[type="time"]').nth(1).fill(endTime)
  const shiftSaved = page.waitForResponse(
    (response) => response.url().includes('/api/shifts/bulk-save') && response.ok(),
  )
  await page.getByRole('button', { name: 'Добавить в черновик' }).click()
  await shiftSaved
  await expect(page.getByRole('heading', { name: 'Новая смена' })).toBeHidden()
  const savedShift = page.getByText(new RegExp(`${startTime}.*${endTime}`))
  await expect(savedShift).toHaveCount(1)
  await expect(savedShift).toBeVisible()

  await page.getByRole('button', { name: 'Профиль' }).click()
  await expect(page.getByText('E2E Admin')).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('admin can use the archive scenarios without horizontal overflow', async ({ page }, testInfo) => {
  const email = `archive-${testInfo.project.name}@example.test`
  const pageErrors = await registerAdmin({ page, email, name: 'Archive Admin' })

  await page.getByRole('button', { name: 'Архив' }).click()
  await expect(page.getByText('Последние отчеты')).toBeVisible()

  await page.getByRole('button', { name: /По дням/ }).click()
  await expect(page.getByText('Архив по дням')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Предыдущий месяц' })).toBeVisible()
  await page.getByRole('button', { name: 'Назад' }).click()

  await page.getByRole('button', { name: /Сотрудники/ }).click()
  await expect(page.getByPlaceholder('Найти сотрудника')).toBeVisible()
  await page.getByRole('button', { name: 'Назад' }).click()

  await page.getByRole('button', { name: /Период/ }).click()
  await expect(page.getByText('Итоги периода')).toBeVisible()
  await expect(page.locator('input[type="date"]')).toHaveCount(2)

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport)
  expect(pageErrors).toEqual([])
})
