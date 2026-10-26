import { expect, test, type Page } from '@playwright/test'

const GAME_IDS = [
  'ludo', 'snake-battle', 'tic-tac-toe', '2048', 'dino-run', 'brick-breaker', 'flappy-style', 'pong',
  'memory-match', 'tetris', 'sudoku', 'skater-boy', 'typing-racer', 'loop-sort', 'arrow-go',
]
const PAGES = ['/', '/games', '/leaderboards', '/profile', '/settings', '/recover', '/leaderboards/memory-match', '/does-not-exist']

async function seedPlayer(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('bhhy:player')) {
      localStorage.setItem('bhhy:player', JSON.stringify({ id: 'e2e-player', nickname: 'E2E', createdAt: new Date().toISOString(), registered: false }))
    }
  })
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe('site', () => {
  test('first visit onboarding persists across reloads', async ({ page }) => {
    await page.goto('/')
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Nickname').fill('Pappu')
    await dialog.getByRole('button', { name: "Let's play" }).click()
    await expect(dialog).toBeHidden()
    await page.reload()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByText('Pappu').filter({ visible: true }).first()).toBeVisible()
  })

  for (const path of PAGES) {
    test(`page ${path} renders without horizontal overflow`, async ({ page }) => {
      await seedPlayer(page)
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      await expectNoHorizontalOverflow(page)
    })
  }

  for (const id of GAME_IDS) {
    test(`deep link /games/${id} loads directly and starts`, async ({ page }) => {
      await seedPlayer(page)
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.goto(`/games/${id}`) // direct load = SPA fallback
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText(/^Loading /)).toHaveCount(0, { timeout: 20000 })
      await expectNoHorizontalOverflow(page)
      // press the primary start control where the game has one
      const start = page.getByRole('button', { name: /^(Start|New puzzle|Start race|Level \d+)$/ }).first()
      if (await start.count()) {
        await start.click()
        await page.waitForTimeout(600)
        await expectNoHorizontalOverflow(page)
      }
      // game pages are exactly one screen: the page itself never scrolls, and fullscreen is one tap away
      const vertical = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
      expect(vertical).toBeLessThanOrEqual(1)
      await expect(page.getByRole('button', { name: 'Fullscreen' })).toBeVisible()
      expect(errors).toEqual([])
    })
  }

  test('search filters the game grid', async ({ page }) => {
    await seedPlayer(page)
    await page.goto('/games')
    await page.getByLabel('Search games by name').fill('sudoku')
    await expect(page.getByTestId('game-grid').getByRole('link')).toHaveCount(1)
    await page.getByLabel('Search games by name').fill('')
    await page.getByRole('button', { name: 'Arcade' }).click()
    // Snake Battle, Dino Run, Brick Breaker, Udta Panchi
    await expect(page.getByTestId('game-grid').getByRole('link')).toHaveCount(4)
    await page.reload() // filter is kept in the URL
    await expect(page.getByTestId('game-grid').getByRole('link')).toHaveCount(4)
  })

  test('tic-tac-toe: play a local two-player game to a win', async ({ page }) => {
    await seedPlayer(page)
    await page.goto('/games/tic-tac-toe')
    await page.getByRole('radio', { name: '2 Players' }).click()
    await page.getByRole('button', { name: 'Start' }).click()
    for (const cell of [1, 4, 2, 5, 3]) await page.getByRole('gridcell', { name: new RegExp(`^Cell ${cell}:`) }).click()
    await expect(page.getByText('Player X wins!')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Player X wins!' })).toBeVisible({ timeout: 3000 })
  })

  test('leaving an unfinished memory game asks for confirmation', async ({ page }) => {
    await seedPlayer(page)
    await page.goto('/games/memory-match')
    await page.getByRole('button', { name: 'Start' }).click()
    await page.getByRole('gridcell').first().click()
    await page.getByRole('link', { name: 'Back to all games' }).click()
    await expect(page.getByRole('dialog', { name: 'Leave this game?' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page).toHaveURL(/memory-match/)
  })
})
