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

test.describe('chakkar cubes', () => {
  test('cube stream canvas lines up exactly with the drawn board', async ({ page }) => {
    await seedPlayer(page)
    await page.goto('/games/loop-sort')
    await page.getByRole('button', { name: /^Level \d+$/ }).click()
    const fit = await page.evaluate(() => {
      const svg = document.querySelector('svg[aria-label="Chakkar Cubes board"]') as SVGSVGElement
      const canvas = document.querySelector('[data-testid="cube-stream"]') as HTMLCanvasElement
      const r = svg.getBoundingClientRect()
      const c = canvas.getBoundingClientRect()
      const vb = svg.viewBox.baseVal
      const k = Math.min(r.width / vb.width, r.height / vb.height)
      return {
        dx: Math.abs(c.left - (r.left + (r.width - vb.width * k) / 2)),
        dy: Math.abs(c.top - (r.top + (r.height - vb.height * k) / 2)),
        dw: Math.abs(c.width - vb.width * k),
        dh: Math.abs(c.height - vb.height * k),
      }
    })
    for (const v of Object.values(fit)) expect(v).toBeLessThan(1.5)
  })

  test('four abilities (no Hint), conveyor never exceeds capacity, Out of Space -> Continue -> Give Up', async ({ page }) => {
    await seedPlayer(page)
    await page.goto('/games/loop-sort')
    await expect(page.getByRole('heading', { name: 'Chakkar Cubes' }).first()).toBeVisible()
    await page.getByRole('button', { name: /^Level \d+$/ }).click()
    for (const name of ['Undo', 'Shuffle', 'Extra Truck', '+1 Slot']) await expect(page.getByRole('button', { name: `${name}, 2 left`, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Hint/ })).toHaveCount(0)
    // gear menu holds sound, restart and home; nothing started yet so restart is free
    await page.getByRole('button', { name: 'Game menu' }).click()
    const menu = page.getByRole('dialog', { name: 'Game menu' })
    await expect(menu.getByRole('button', { name: /^Sound (on|off)$/ })).toBeVisible()
    await menu.getByRole('button', { name: 'Restart level' }).click()
    await expect(menu).toBeHidden()
    await expectNoHorizontalOverflow(page)
    const trucks = page.locator('svg[aria-label="Chakkar Cubes board"] g[role=button]')
    const counter = page.getByTestId('conveyor-count')
    const outOfSpace = page.getByRole('dialog', { name: 'Out of Space' })
    const won = page.getByRole('dialog', { name: 'Level complete' })
    let sawOutOfSpace = false
    for (let i = 0; i < 80; i += 1) {
      const n = await trucks.count()
      await trucks.nth((i * 3) % n).dispatchEvent('click')
      const [used, cap] = (await counter.innerText()).trim().split('/').map(Number)
      expect(used).toBeLessThanOrEqual(cap)
      if (await outOfSpace.isVisible()) {
        sawOutOfSpace = true
        break
      }
      if (await won.isVisible()) break
    }
    if (sawOutOfSpace) {
      await outOfSpace.getByRole('button', { name: /^Continue/ }).click()
      await expect(outOfSpace).toBeHidden()
      // a second Out of Space offers no free continue; give up ends the attempt
      for (let i = 0; i < 120 && !(await outOfSpace.isVisible()) && !(await won.isVisible()); i += 1) {
        await trucks.nth((i * 5) % (await trucks.count())).dispatchEvent('click')
      }
      if (await outOfSpace.isVisible()) {
        await expect(outOfSpace.getByRole('button', { name: /^Continue/ })).toHaveCount(0)
        await outOfSpace.getByRole('button', { name: /^Give Up/ }).click()
        await expect(page.getByRole('dialog', { name: 'Attempt over' })).toBeVisible()
        await expect(page.getByText('You lost a life. 4 left.')).toBeVisible()
      }
    }
    await expectNoHorizontalOverflow(page)
  })
})
