import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '../../src/app/App'
import { routes } from '../../src/app/router'
import { GAMES } from '../../src/games/registry'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  )
  return router
}

function seedPlayer() {
  localStorage.setItem('bhhy:player', JSON.stringify({ id: 'p-1', nickname: 'Tester', createdAt: new Date().toISOString(), registered: false }))
}

beforeEach(() => {
  localStorage.clear()
})

describe('player onboarding', () => {
  it('asks for a nickname on first visit and remembers it across reloads', async () => {
    renderAt('/')
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nickname'), { target: { value: '  Chintu  Gamer ' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: "Let's play" })))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const stored = JSON.parse(localStorage.getItem('bhhy:player')!)
    expect(stored.nickname).toBe('Chintu Gamer')
    expect(stored.registered).toBe(false)
  })

  it('rejects invalid nicknames', async () => {
    renderAt('/')
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Nickname'), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: "Let's play" }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/2-20/)
  })
})

describe('navigation', () => {
  beforeEach(seedPlayer)

  it('home lists all 15 games with working links', async () => {
    renderAt('/')
    const grid = await screen.findByTestId('game-grid')
    const links = within(grid).getAllByRole('link')
    expect(links).toHaveLength(15)
    expect(GAMES).toHaveLength(15)
    for (const g of GAMES) expect(within(grid).getByRole('link', { name: `Play ${g.name}` })).toHaveAttribute('href', `/games/${g.id}`)
  })

  it('search and category filters narrow the grid', async () => {
    renderAt('/games')
    const search = await screen.findByLabelText('Search games by name')
    fireEvent.change(search, { target: { value: 'tetris' } })
    expect(within(screen.getByTestId('game-grid')).getAllByRole('link')).toHaveLength(1)
    fireEvent.change(search, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Puzzle' }))
    const puzzle = GAMES.filter((g) => g.category === 'Puzzle').length
    expect(within(screen.getByTestId('game-grid')).getAllByRole('link')).toHaveLength(puzzle)
    fireEvent.change(search, { target: { value: 'zzzz' } })
    expect(screen.getByText('Koi game nahi mila')).toBeInTheDocument()
  })

  it.each(GAMES.map((g) => [g.id, g.name]))('game route /games/%s loads %s', async (id, name) => {
    renderAt(`/games/${id}`)
    expect(await screen.findByRole('heading', { level: 1, name: new RegExp(name) })).toBeInTheDocument()
    // the lazily loaded game renders its own UI (start screen, level map or home)
    await waitFor(() => expect(screen.queryByText(/^Loading /)).toBeNull(), { timeout: 15000 })
    expect(screen.getAllByRole('button').length).toBeGreaterThan(1)
  })

  it('every leaderboard page renders without a backend (honest local-only notice)', async () => {
    for (const g of GAMES.filter((x) => x.leaderboard)) {
      const { unmount } = render(
        <Providers>
          <RouterProvider router={createMemoryRouter(routes, { initialEntries: [`/leaderboards/${g.id}`] })} />
        </Providers>,
      )
      expect(await screen.findByText('Online leaderboard not configured')).toBeInTheDocument()
      unmount()
    }
  })

  it('shows not-found pages for unknown routes and games', async () => {
    renderAt('/nope')
    expect(await screen.findByText('404')).toBeInTheDocument()
  })

  it('unknown game id shows not found', async () => {
    renderAt('/games/not-a-game')
    expect(await screen.findByText(/game toh exist hi nahi karta/)).toBeInTheDocument()
  })

  it('profile, settings and recover pages render', async () => {
    renderAt('/profile')
    expect(await screen.findByRole('heading', { name: 'Tester' })).toBeInTheDocument()
    cleanup()
    renderAt('/settings')
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    cleanup()
    renderAt('/recover')
    expect(await screen.findByText('Recovery needs the online backend')).toBeInTheDocument()
  })
})

describe('memory match flow', () => {
  beforeEach(seedPlayer)

  it('plays a full solo game to the end and stores the result locally', async () => {
    renderAt('/games/memory-match')
    fireEvent.click(await screen.findByRole('button', { name: /Start/ }, { timeout: 15000 }))
    expect(await screen.findAllByRole('gridcell')).toHaveLength(14)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] })
    try {
      const cells = () => screen.getAllByRole('gridcell')
      const label = (i: number) => cells()[i].getAttribute('aria-label')!
      const flip = async (i: number) => {
        await act(async () => {
          fireEvent.click(cells()[i])
        })
      }
      const settle = async () => {
        await act(async () => {
          vi.advanceTimersByTime(2000)
        })
      }
      // learn the layout two cards at a time
      const emoji: string[] = []
      for (let i = 0; i < 14; i += 2) {
        await flip(i)
        await flip(i + 1)
        emoji[i] = label(i).split(': ')[1].split(',')[0]
        emoji[i + 1] = label(i + 1).split(': ')[1].split(',')[0]
        // a third card cannot be opened while two are face-up
        if (i + 2 < 14) {
          await flip(i + 2)
          expect(label(i + 2)).toMatch(/face down/)
        }
        await settle()
      }
      // now match every remaining pair
      for (let i = 0; i < 14; i += 1) {
        if (/matched/.test(label(i))) continue
        const j = emoji.findIndex((e, k) => k !== i && e === emoji[i] && !/matched/.test(label(k)))
        await flip(i)
        await flip(j)
        await settle()
      }
      await settle()
    } finally {
      vi.useRealTimers()
    }
    expect(await screen.findByText(/Sab yaad tha/)).toBeInTheDocument()
    const results = JSON.parse(localStorage.getItem('bhhy:results') ?? '[]')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ gameId: 'memory-match', board: 'easy', status: 'local-only' })
    expect(results[0].metrics.pairs).toBe(7)
    expect(results[0].metrics.moves).toBeGreaterThanOrEqual(7)
  })
})
