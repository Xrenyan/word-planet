import { expect, test } from '@playwright/test'

// Layout is tested against rendered production DOM, not regular expressions in CSS source.
for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1505, height: 1045 }]) {
  test(`navigation and learning controls fit ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.goto('./#textbook')
    await page.getByRole('button', { name: '打开四年级上册，165个词' }).click()
    await page.getByRole('button', { name: '从这里开始学习' }).click()
    await expect(page.getByRole('button', { name: '下一个单词' })).toBeVisible()
    const geometry = await page.evaluate(() => {
      const nav = document.querySelector('.primary-navigation')!.getBoundingClientRect()
      const stage = document.querySelector('.verified-practice__content')!.getBoundingClientRect()
      const next = document.querySelector('.verified-practice__navigation')!.getBoundingClientRect()
      return { overflow: document.documentElement.scrollWidth > innerWidth, navBottom: nav.bottom, stageBottom: stage.bottom, nextTop: next.top }
    })
    expect(geometry.overflow).toBe(false)
    expect(geometry.nextTop).toBeGreaterThanOrEqual(geometry.stageBottom)
    if (size.width <= 800) expect(geometry.navBottom).toBeGreaterThan(size.height - 32)
    await page.getByRole('button', { name: '下一个单词' }).click()
    await expect(page.getByRole('button', { name: '上一个单词' })).toBeEnabled()
  })
}

test('print uses the real worksheet pages and hides application controls', async ({ page }) => {
  await page.goto('./#toolbox')
  await page.getByLabel('教材', { exact: true }).selectOption('fltrp-nse-2022-g4-upper')
  await page.getByLabel('题数', { exact: true }).fill('13')
  await page.getByRole('button', { name: '生成单元默写纸' }).click()
  await expect(page.locator('.worksheet-print-page')).toHaveCount(3)
  await page.emulateMedia({ media: 'print' })
  await expect(page.getByRole('navigation', { name: '主导航' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: '生成单元默写纸' })).not.toBeVisible()
  await expect(page.locator('.worksheet-print-page').last()).toHaveCSS('break-after', 'auto')
  const paper = await page.locator('.worksheet-print-page').first().boundingBox()
  expect(paper!.width).toBeCloseTo(186 * 96 / 25.4, 0)
  await page.emulateMedia({ media: 'screen' })
})
