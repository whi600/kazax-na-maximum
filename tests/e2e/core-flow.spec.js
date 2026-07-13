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
