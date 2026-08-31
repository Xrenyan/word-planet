import { expect, test } from '@playwright/test'

test('loads the complete static curriculum and opens a real word', async ({ page }) => {
  const serverApiRequests: string[] = []
  page.on('request', (request) => { if (new URL(request.url()).pathname.includes('/api/')) serverApiRequests.push(request.url()) })
  await page.goto('./')
  await expect(page.getByText('1175')).toHaveText('1175')
  await expect(page.getByText('英式、美式发音已就绪')).toBeVisible()
  await page.getByRole('button', { name: '播放英式发音' }).click()
  await expect(page.getByText('英式本地发音播放完成')).toBeVisible()
  await page.getByRole('link', { name: '教材' }).click()
  await expect(page.getByRole('heading', { name: '教材' })).toBeVisible()
  await expect(page.getByRole('button', { name: /打开三年级上册，212个词/ })).toBeVisible()
  await page.getByRole('button', { name: /打开三年级上册，212个词/ }).click()
  await expect(page.getByRole('heading', { name: '单元词表' })).toBeVisible()
  await expect(page.locator('.curriculum-book-view__focus h3')).not.toBeEmpty()
  await page.getByRole('button', { name: /^学习 / }).first().click()
  await expect(page.getByLabel(/正在学习单词/)).toBeVisible()
  await expect(page.getByRole('button', { name: '下一个单词' })).toBeEnabled()
  expect(serverApiRequests).toEqual([])
})

test('keeps key tools usable at a phone viewport', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: '工具箱' }).click()
  await expect(page.getByRole('heading', { name: /默写纸/ })).toBeVisible()
  await page.getByRole('button', { name: '生成单元默写纸' }).click()
  await expect(page.getByRole('button', { name: '仅打印题目' })).toBeVisible()
  await expect(page.getByRole('button', { name: '打印题目与答案' })).toBeVisible()
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll')
})
