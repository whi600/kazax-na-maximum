import { expect, test } from '@playwright/test'

test('admin can navigate and open a viewport-bound shift editor', async ({ page }, testInfo) => {
  const email = `e2e-${testInfo.project.name}@example.test`

  await page.goto('/')
  await page.getByRole('button', { name: 'Регистрация' }).click()
  await page.getByPlaceholder('Ваше имя').fill('E2E Admin')
  await page.getByPlaceholder('name@company.com').fill(email)
  await page.getByPlaceholder('Минимум 6 символов').fill('strong-password')
  await page.getByRole('button', { name: 'Создать аккаунт' }).click()

  await expect(page.locator('nav.app-bottom-nav')).toBeVisible()
  await page.getByRole('button', { name: 'График' }).click()
  await expect(page.getByRole('heading', { name: 'График' })).toBeVisible()
  await page.getByRole('button', { name: 'Смена', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Новая смена' })).toBeVisible()
  await expect(page.locator('input[type="date"]')).toHaveCount(1)
  await expect(page.locator('input[type="time"]')).toHaveCount(2)
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')

  await page.getByRole('button', { name: 'Отмена' }).click()
  await page.getByRole('button', { name: 'Профиль' }).click()
  await expect(page.getByText('E2E Admin')).toBeVisible()
})

test('admin can use the archive scenarios without horizontal overflow', async ({ page }, testInfo) => {
  const email = `archive-${testInfo.project.name}@example.test`

  await page.goto('/')
  await page.getByRole('button', { name: 'Регистрация' }).click()
  await page.getByPlaceholder('Ваше имя').fill('Archive Admin')
  await page.getByPlaceholder('name@company.com').fill(email)
  await page.getByPlaceholder('Минимум 6 символов').fill('strong-password')
  await page.getByRole('button', { name: 'Создать аккаунт' }).click()

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
})
