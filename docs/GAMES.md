# Game rules, scoring and design notes

Rules live in each game's `src/games/<id>/logic.ts` (pure TypeScript, unit-tested). UI lives in `index.tsx`.

---

## 1. Ludo

- Four seats always: `1 human + 3 bots`, `2 + 2`, `3 + 1`, or `4 humans`. Humans share the device. There is no online multiplayer.
- 52-square loop, 5-square home column per colour, home in the centre. Positions are relative to each colour's start (`-1` base, `0-50` track, `51-55` home column, `56` home).
- A 6 is needed to leave base. Each roll moves exactly one token by the full value (dice are never split).
- A 6 grants another roll. A **third consecutive six is cancelled** and the turn passes.
- **No legal move** (including on a 6): "No Valid Moves" is shown and the turn passes without an extra roll.
- **Exact roll** required to reach home; overshooting moves are illegal.
- **Capture**: landing on a non-safe square sends every opponent token there back to base and grants **one** extra turn. A six plus a capture still gives only one extra roll.
- **Safe squares**: the four coloured start squares and four ★ squares.
- **No blocking stacks**: same-colour tokens may share a square; any token can pass over or land on stacks (on a non-safe square, landing captures all opponent tokens there).
- **Match end**
  - 1 human: ends as soon as the human finishes (they win if first), or when the human is the only unfinished player left.
  - Several humans: continues until every human has finished; remaining bots are ranked automatically.
  - Unfinished players are ranked by tokens home, then the token closest to home, then total distance travelled.
- **Points**: 1st = 10, 2nd = 5, 3rd/4th = 0. The leaderboard counts only `1 human + 3 bots` matches, one board per bot difficulty.
- **Bots** follow exactly the same rules:
  - Easy: random legal move (sometimes grabs an obvious capture).
  - Medium: weighs progress, captures, leaving base, safe squares and the home column.
  - Hard: strongly prefers captures, finishing and the home column, and estimates danger (opponent tokens 1-6 squares behind a square), so it rescues tokens that have travelled far and avoids exposed squares.

## 2. Snake Battle

20×20 grid, starts at length 3. Each fruit is +1 point and +1 length; speed rises gradually (150 ms → 65 ms per tick). Walls or your own body end the run. Turns are buffered and compared with the last *buffered* direction, so fast inputs can never cause an illegal reversal. Moving into the cell the tail is leaving is allowed. Filling the board wins (max score 397). Controls: arrows/WASD, swipe, on-screen D-pad; P/Esc pauses.

## 3. Tic-Tac-Toe

3×3, X moves first. vs computer: choose your mark. **Easy** plays randomly about 65% of the time; **Medium** wins if it can, blocks, then takes the centre or a corner, with a 12% slip chance; **Hard** is full minimax with depth preference. A test exhaustively verifies Hard never loses. Moves after the game ends are rejected. Leaderboard: games vs the computer, per difficulty (wins, then draws).

## 4. 2048 Challenge

Original rules: slide all tiles, equal neighbours merge once per move, a new 2 (90%) or 4 (10%) appears after every *valid* move, and score = sum of merged tiles. Reaching 2048 shows a win overlay with *Keep going* or *Finish*. The game ends when no move is possible. Arrows, WASD and swipe. **No undo**: it is not part of the original game and would make the leaderboard meaningless. Restart asks for confirmation.

## 5. Dino Run

Original pixel-free art. Auto-run; jump (Space/↑/tap) over cacti; duck (↓/hold) under mid-height birds; low birds must be jumped and high birds can be run under. Ducking in the air fast-falls. Speed rises from 380 to 960 px/s and obstacle gaps scale with speed. Score = distance / 10.

## 6. Brick Breaker

Three walls (the third has 2-hit bricks, outlined), 3 lives. Paddle via mouse, drag, ←/→ or touch buttons; Space/click/Launch serves. The paddle hit position sets the bounce angle (up to 60°). Rallies speed up slightly. Ball physics use sub-steps, so the ball never tunnels through bricks. Score = brick points (higher rows are worth more). Win = all walls cleared.

## 7. Udta Panchi (original flap-and-dodge)

Tap/click/Space to flap through gaps between pillars. 1 point per pillar passed; touching a pillar or the ground ends the run. Original bird, pillars, skyline and synthesised sounds.

## 8. Pong

First to 5/7/11. The hit position on the paddle sets the angle; speed grows 6% per hit (capped). AI: Easy is slow and imprecise, Medium is faster, Hard predicts wall bounces. Local 2P: left player W/S or left-half drag; right player ↑/↓ or right-half drag. Only solo matches count for the leaderboard (wins, then point difference, per difficulty).

## 9. Memory Match

Easy 7 pairs (14 cards), Medium 11 (22), Hard 15 (30). All cards start face-down with no preview. Only two unmatched cards can be face-up at once. Matches stay up; misses flip back after about 0.85 s. One *move* = revealing a pair.
- Solo: leaderboard ranks by completion time, then moves.
- 2 players: starting player randomised; a match earns a pair and another turn; most pairs wins; equal pairs = draw.
- Sound toggle, pause (Resume / Home), restart confirmation, leave confirmation; unfinished games are discarded, never saved.

## 10. Tetris Classic

10×20 field with 2 hidden spawn rows, 7-bag randomiser, rotation with wall kicks, ghost piece, 0.5 s lock delay (max 15 resets), next-piece preview. Scoring: 100/300/500/800 × level for 1-4 lines, +1 per soft-drop cell, +2 per hard-drop cell. Level = lines/10 + 1, with guideline-style gravity. Game over when a piece locks fully above the field or the next piece cannot spawn.

## 11. Sudoku Classic

Each puzzle is generated fresh: random solved grid → cells removed in symmetric pairs **only while the solution stays unique** (verified by a solver that counts up to 2 solutions). Target clues: Easy 40, Medium 32, Hard 26. Givens are bold white, entries blue, wrong digits red (immediately, or on *Check*), row/column/box conflicts tinted red. Notes, erase, undo, restart (confirmed), keyboard and touch input. A mistake is entering a digit that differs from the unique solution. Completion = full grid with no conflicts. Leaderboard: time, then mistakes, per difficulty.

## 12. Skater Boy (inspired by the classic)

An **original** recreation of the genre, not of the original game's assets or exact levels.
- 90 levels: Town 1-30, Forest 31-60, Cemetery 61-90, each with its own palette, parallax scenery and obstacles (cones/bins/benches, logs/rocks/stumps, tombstones/coffins/pumpkins).
- Auto-ride at cruise speed; **Boost** (→/D or hold button) accelerates for long gaps; **Jump** (Space/↑/tap; hold for full height, release early for a short hop); **Trick** (X/↓ in the air) = kickflip, +150 × combo count. Landing while a trick is still spinning is a crash.
- Hazards: gaps, ground obstacles, ramps (automatic launch; jumping on a ramp gives an extra-big pop), raised ledges you must jump onto.
- Level score = coins × 25 + trick points + 10 per clean landing + 500 for finishing. Best score per level is saved; completing a level unlocks the next.
- Levels are plain data (`LevelData`: ground segments, obstacles, coins) produced by a deterministic generator with rising difficulty. A test **autopilot finishes all 90 levels**, proving none is impossible. Hand-made levels can be added in the same format.

## 13. Typing Racer

Type the sentence exactly; correct characters move your car. A wrong key turns red and blocks progress until fixed. Three rival cars per race with WPM ranges by difficulty: Easy 16-28, Medium 30-46, Hard 48-72. Sentence length and punctuation also rise with difficulty. All sentences are original. 3-2-1 countdown; paste disabled.
- WPM = (characters ÷ 5) ÷ minutes over the completed sentence.
- Accuracy = (keystrokes − errors) ÷ keystrokes.
- Errors = wrong characters typed.
- Position = 1 + rivals that crossed the line earlier.

Leaderboard: completed races, per difficulty, WPM then accuracy. The server re-checks that WPM matches the formula.

## 14. Loop Sort (inspired by Voodoo's "Loop Sort")

**What we could verify from the public Play Store listing and screenshots** (the referenced screenshot image itself was not provided to the build environment, so we worked from the public listing):
- Tap a truck to send its cubes onto a looping conveyor; cubes are sorted automatically into trucks; the level clears when everything is sorted.
- Purple trucks with 4 block slots around a looping belt; a header with level and a cube counter (e.g. "3/5"); hidden "?" blocks; curtains that open for a colour; ice blocks; barriers.
- Player reviews mention the track clogging (= losing) and cubes going into "any open slot".

**Our implementation (documented interpretation):**
- Trucks hold a stack (bottom → top) of up to 4 blocks. Tapping unloads the **top run of one colour** onto the belt, just ahead of the truck.
- The belt moves continuously. Each block drops into the **first truck it passes** that has room and is empty or has the same colour on top.
- 4 of one colour completes a truck, which drives away. Clear every block to win.
- The header counter shows blocks on the belt / belt capacity. Taps that would overflow are refused ("Belt is full!").
- **Losing (costs a life):** the belt is settled with blocks nobody can take, and no truck can be tapped (jammed). Leaving or restarting a level after the first tap also counts as a failed attempt (with confirmation).
- Obstacles implemented: **hidden blocks** (from level 6 only the top block is visible) and **curtains** (a truck stays closed until a given colour is completed). Ice blocks and barriers are **not** implemented; we could not determine their exact behaviour from the listing.
- Abilities per attempt (Normal Mode: 1 each; Admin: unlimited): **Undo** last tap, **+2 belt space**, **Hint** (a solver suggests a truck, or tells you the position is lost).
- 60 **original** levels generated offline (`npm run levels:generate`), each verified by a solver and shipped with a winning solution that the tests replay. Colours grow from 2 to 6, belt capacity shrinks from 6 to 4, and hidden blocks and curtains appear later.
- Visuals: purple gradient home screen, chunky multicolour title, a smiling truck drawn in SVG, cube piles on the belt. This is a close interpretation, **not** the original image or assets.

**Lives & modes**
- Normal Mode: 5 lives, +1 every 20 minutes. Both are configurable in `private.settings`. With the backend, lives and regeneration timestamps are computed by Postgres `now()`, so changing the device clock does nothing. With no lives left, levels cannot be started; the next-life countdown is shown.
- Admin Mode: Admin button → PIN modal → server verification → per-device admin session. Unlimited lives and abilities; any level can be opened directly. Opening a level never marks it completed; finishing it does.
- Progress is shared: levels completed in Admin Mode stay completed in Normal Mode. Switching back to Normal resets lives to the maximum and resumes regeneration. Pending results are flushed before the switch, so they are judged in the right mode.
- Separate storage: `loop_sort_progress` (completed levels, current level), `loop_sort_lives` (lives, regeneration anchor), `loop_sort_admin_sessions` (mode per device), `loop_sort_events` (idempotent results).
- Local-only mode (no backend): lives use the device clock (cannot be protected) and Admin Mode is unavailable, because the PIN cannot be verified securely without a server.

## 15. Arrow Go (inspired by "Amaze GO!" / the Arrow Go link)

The link in the brief (`com.oakever.arrows`) currently resolves to **"Amaze GO!" by Oakever Games**. Its listing explains the rules in summary: find an arrow with a free path to the edge and tap to slide it off; a wrong tap costs a heart; a Guidance feature highlights directions; hints are available. The brief's screenshot (dark background, neon winding arrows) was not available to the build environment, so the visuals are our interpretation of that description. The current store screenshots show a light theme.

**Rules implemented:**
- Each arrow is a winding path of cells; the head's direction is its last segment.
- Tapping an arrow removes it only if **every cell from its head to the board edge is free** (other arrows, or its own body curling ahead, block it).
- A blocked tap shakes the arrow, flashes the blocker red and costs a ❤️ (3 per level). At 0 hearts the level fails.
- Removing every arrow completes the level. The completion overlay shows hearts kept and time, with Next / Replay / Levels.
- Guidance toggle draws every arrow's exit lane; 3 hints per level highlight an arrow that can leave now.
- 60 original levels from a deterministic generator with increasing board size, arrow length and ordering depth. A level is solvable iff greedy removal clears it (removal only frees lanes); every level is verified in tests.

**Remaining uncertainty:** the original's exact level data, timer rules and star system are unknown, so ours uses an elapsed-time display and hearts-kept as the per-level score.
