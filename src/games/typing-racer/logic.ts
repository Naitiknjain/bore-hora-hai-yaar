import { wpmFrom } from '../../lib/scoring'
import type { Rng } from '../../lib/random'
import type { Difficulty } from '../../types'

/** Original sentences written for this game. */
export const SENTENCES: Record<Difficulty, string[]> = {
  easy: [
    'the cat sat on the warm mat',
    'we play games after dinner',
    'my friend likes hot chai',
    'the bus is late again today',
    'rain is good for the plants',
    'she ran fast to win the race',
    'pass the ball to me now',
    'the sun is out so let us go',
    'mom made rice and dal for lunch',
    'he keeps his room very clean',
    'birds sing in the big tree',
    'we lost the match but had fun',
  ],
  medium: [
    'Bore ho raha tha, so we started a quick game of Ludo.',
    'The train was crowded, but the samosas were worth it.',
    'Please send the notes before the exam starts tomorrow.',
    'My phone battery died right before the final level.',
    'We ordered pizza, then argued about the toppings.',
    'The cricket match went to the very last ball tonight.',
    'Keep calm, drink water, and finish your homework first.',
    'Grandma tells the best stories when the lights go out.',
    'The new cafe near college has really strong coffee.',
    'He forgot his umbrella, so obviously it started to rain.',
  ],
  hard: [
    'At 6:45 a.m., Riya caught the 07:10 local, still half-asleep and holding two cups of cutting chai.',
    'The recipe needs 250 g flour, 2 eggs, 1/2 cup milk, and exactly 15 minutes at 180 degrees.',
    'Wait - who scheduled a "quick" meeting at 9 p.m. on a Friday? Nobody is joining that call!',
    'Our group chat has 37 unread messages, 12 memes, and zero answers to the actual question.',
    'Order #4821 shipped on 03/11; tracking says "out for delivery" but the courier is clearly lost.',
    'If you can type this sentence without a single mistake, you deserve a plate of jalebis (or three).',
    'The quiz asked: "Which planet has 95 known moons?" Half the class guessed Jupiter; it was Saturn.',
    'Her password manager suggested "k7#Qm!2v" - strong, yes, but impossible to type on a crowded bus.',
  ],
}

export interface Rival {
  name: string
  color: string
  wpm: number
}

const RIVAL_NAMES = ['Turbo Tinku', 'Speedy Sweety', 'Rocket Raju', 'Zoom Zoya']
const RIVAL_COLORS = ['#ff5d8f', '#3ee08f', '#a77dff', '#ff8a3d']
export const RIVAL_WPM: Record<Difficulty, [number, number]> = { easy: [16, 28], medium: [30, 46], hard: [48, 72] }

export function makeRivals(difficulty: Difficulty, rng: Rng, count = 3): Rival[] {
  const [lo, hi] = RIVAL_WPM[difficulty]
  return Array.from({ length: count }, (_, i) => ({
    name: RIVAL_NAMES[i],
    color: RIVAL_COLORS[i],
    // spread rivals across the range so the field feels varied
    wpm: Math.round(lo + ((hi - lo) * (i + rng())) / count),
  }))
}

export function pickSentence(difficulty: Difficulty, rng: Rng, avoid?: string): string {
  const list = SENTENCES[difficulty].filter((s) => s !== avoid)
  return list[Math.floor(rng() * list.length)]
}

/**
 * Rival progress (0-1). A small wobble makes cars surge and slow, but it vanishes at the start
 * and at the finish, so a rival crosses the line exactly at rivalFinishMs.
 */
export function rivalProgress(r: Rival, elapsedMs: number, textLength: number, phase: number): number {
  const base = Math.min(1, (r.wpm * 5 * (elapsedMs / 60000)) / textLength)
  return base + 0.35 * Math.sin(elapsedMs / 900 + phase) * base * (1 - base)
}

/** Time (ms) the rival needs to finish. */
export const rivalFinishMs = (r: Rival, textLength: number) => (textLength / (r.wpm * 5)) * 60000

/** Length of the prefix of `typed` that matches `text`. */
export function correctPrefix(text: string, typed: string): number {
  let i = 0
  while (i < typed.length && i < text.length && typed[i] === text[i]) i += 1
  return i
}

export interface TypingStats {
  wpm: number
  accuracy: number
}

/** WPM uses the standard 5-characters-per-word convention on correctly typed characters. */
export function stats(correctChars: number, keystrokes: number, errors: number, elapsedMs: number): TypingStats {
  const accuracy = keystrokes ? Math.max(0, Math.round(((keystrokes - errors) / keystrokes) * 1000) / 10) : 100
  return { wpm: wpmFrom(correctChars, elapsedMs), accuracy }
}

/** Final race position: 1 + rivals that finished strictly before the player. */
export function finalPosition(rivals: Rival[], textLength: number, playerMs: number): number {
  return 1 + rivals.filter((r) => rivalFinishMs(r, textLength) < playerMs).length
}
