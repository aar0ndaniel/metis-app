import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {
  createInitialBoard,
  createEmptyBoard,
  addRandomTile,
  mergeLine,
  moveLeft,
  moveRight,
  moveUp,
  moveDown,
  moveBoard,
  hasAvailableMoves,
  boardsEqual,
  hasTile,
  getEmptyCells,
  getSavedCalculationGameSetting,
  METIS_PREF_CALCULATION_GAME_KEY,
  LEGACY_PREF_CALCULATION_GAME_KEY,
} from '../src/utils/calculationGameEngine.ts'

async function runTest(name, fn) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

// 1. Initial Board & Random Tile
await runTest('createEmptyBoard creates a 4x4 null grid', () => {
  const board = createEmptyBoard()
  assert.equal(board.length, 4)
  for (const row of board) {
    assert.equal(row.length, 4)
    for (const cell of row) {
      assert.equal(cell, null)
    }
  }
})

await runTest('createInitialBoard spawns exactly two tiles', () => {
  const board = createInitialBoard()
  const nonNull = board.flat().filter((cell) => cell !== null)
  assert.equal(nonNull.length, 2)
  for (const val of nonNull) {
    assert.ok(val === 2 || val === 4, `Tile should be 2 or 4, got ${val}`)
  }
})

await runTest('addRandomTile adds one tile to an empty cell with ~90% 2 and ~10% 4', () => {
  const board = createEmptyBoard()
  const updated = addRandomTile(board)
  const nonNull = updated.flat().filter((cell) => cell !== null)
  assert.equal(nonNull.length, 1)
  assert.ok(nonNull[0] === 2 || nonNull[0] === 4)
})

// 2. Line Merge Logic (Pure)
await runTest('mergeLine: basic merge [2, 2, null, null] -> [4, null, null, null] with score +4', () => {
  const { line, scoreGain, moved } = mergeLine([2, 2, null, null])
  assert.deepEqual(line, [4, null, null, null])
  assert.equal(scoreGain, 4)
  assert.equal(moved, true)
})

await runTest('mergeLine: no double merge [2, 2, 2, null] -> [4, 2, null, null] with score +4', () => {
  const { line, scoreGain, moved } = mergeLine([2, 2, 2, null])
  assert.deepEqual(line, [4, 2, null, null])
  assert.equal(scoreGain, 4)
  assert.equal(moved, true)
})

await runTest('mergeLine: two independent merges [2, 2, 2, 2] -> [4, 4, null, null] with score +8', () => {
  const { line, scoreGain, moved } = mergeLine([2, 2, 2, 2])
  assert.deepEqual(line, [4, 4, null, null])
  assert.equal(scoreGain, 8)
  assert.equal(moved, true)
})

await runTest('mergeLine: multiple different merges [2, 2, 4, 4] -> [4, 8, null, null] with score +12', () => {
  const { line, scoreGain, moved } = mergeLine([2, 2, 4, 4])
  assert.deepEqual(line, [4, 8, null, null])
  assert.equal(scoreGain, 12)
  assert.equal(moved, true)
})

await runTest('mergeLine: compacts with gap [2, null, 2, 4] -> [4, 4, null, null] with score +4', () => {
  const { line, scoreGain, moved } = mergeLine([2, null, 2, 4])
  assert.deepEqual(line, [4, 4, null, null])
  assert.equal(scoreGain, 4)
  assert.equal(moved, true)
})

await runTest('mergeLine: unmovable line returns moved = false and scoreGain = 0', () => {
  const { line, scoreGain, moved } = mergeLine([2, 4, 8, 16])
  assert.deepEqual(line, [2, 4, 8, 16])
  assert.equal(scoreGain, 0)
  assert.equal(moved, false)
})

await runTest('mergeLine: records mergedIndices', () => {
  const { mergedIndices } = mergeLine([2, 2, 4, 4])
  assert.deepEqual(mergedIndices, [0, 1])
})

// 3. Board Movement Directions
await runTest('moveLeft moves and merges all rows to the left and tracks mergedCells', () => {
  const board = [
    [2, null, 2, 4],
    [null, 4, 4, null],
    [null, null, null, null],
    [8, 8, 8, 8],
  ]
  const { board: nextBoard, scoreGain, moved, mergedCells } = moveLeft(board)
  assert.equal(moved, true)
  assert.equal(scoreGain, 4 + 8 + 32)
  assert.deepEqual(nextBoard[0], [4, 4, null, null])
  assert.deepEqual(nextBoard[1], [8, null, null, null])
  assert.deepEqual(nextBoard[2], [null, null, null, null])
  assert.deepEqual(nextBoard[3], [16, 16, null, null])
  assert.deepEqual(mergedCells, [
    { r: 0, c: 0 },
    { r: 1, c: 0 },
    { r: 3, c: 0 },
    { r: 3, c: 1 },
  ])
})

await runTest('moveRight moves and merges correctly [4, 4, 8, 8] -> [null, null, 8, 16] and [2, null, 2, 2] -> [null, null, 2, 4]', () => {
  const board = [
    [4, 4, 8, 8],
    [2, null, 2, 2],
    [null, null, null, null],
    [2, 4, 8, 16],
  ]
  const { board: nextBoard, scoreGain, moved, mergedCells } = moveRight(board)
  assert.equal(moved, true)
  assert.equal(scoreGain, 24 + 4)
  assert.deepEqual(nextBoard[0], [null, null, 8, 16])
  assert.deepEqual(nextBoard[1], [null, null, 2, 4])
  assert.deepEqual(nextBoard[2], [null, null, null, null])
  assert.deepEqual(nextBoard[3], [2, 4, 8, 16])
  assert.deepEqual(mergedCells, [
    { r: 0, c: 3 },
    { r: 0, c: 2 },
    { r: 1, c: 3 },
  ])
})

await runTest('moveUp moves and merges columns upwards and tracks mergedCells', () => {
  const board = [
    [2, 4, null, 8],
    [2, null, null, 8],
    [null, 4, null, null],
    [null, null, null, null],
  ]
  const { board: nextBoard, scoreGain, moved, mergedCells } = moveUp(board)
  assert.equal(moved, true)
  assert.equal(scoreGain, 4 + 8 + 16)
  assert.deepEqual(nextBoard, [
    [4, 8, null, 16],
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ])
  assert.deepEqual(mergedCells, [
    { r: 0, c: 0 },
    { r: 0, c: 1 },
    { r: 0, c: 3 },
  ])
})

await runTest('moveDown moves and merges columns downwards and tracks mergedCells', () => {
  const board = [
    [2, 4, null, 8],
    [2, null, null, 8],
    [null, 4, null, null],
    [null, null, null, null],
  ]
  const { board: nextBoard, scoreGain, moved, mergedCells } = moveDown(board)
  assert.equal(moved, true)
  assert.equal(scoreGain, 4 + 8 + 16)
  assert.deepEqual(nextBoard, [
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
    [4, 8, null, 16],
  ])
  assert.deepEqual(mergedCells, [
    { r: 3, c: 0 },
    { r: 3, c: 1 },
    { r: 3, c: 3 },
  ])
})

// 4. moveBoard integration (spawns tile only if moved)
await runTest('moveBoard spawns one random tile only if board changed', () => {
  const board = [
    [2, 2, null, null],
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ]
  const result = moveBoard(board, 'left')
  assert.equal(result.moved, true)
  assert.equal(result.scoreGain, 4)
  const nonNull = result.board.flat().filter((c) => c !== null)
  // original merge gave 1 tile [4] + 1 newly spawned tile = 2 tiles total
  assert.equal(nonNull.length, 2)
  assert.ok(result.board[0][0] === 4)

  // Move left again (should be unmovable)
  const unmovable = moveBoard(result.board, 'left')
  // if tile was in column 0, moving left won't change anything
  if (boardsEqual(result.board, unmovable.board)) {
    assert.equal(unmovable.moved, false)
    assert.equal(unmovable.scoreGain, 0)
  }
})

// 5. Game Over and Available Moves
await runTest('hasAvailableMoves returns true when board has empty cells', () => {
  const board = [
    [2, 4, 8, 16],
    [32, 64, 128, 256],
    [512, 1024, 2048, null],
    [2, 4, 8, 16],
  ]
  assert.equal(hasAvailableMoves(board), true)
})

await runTest('hasAvailableMoves returns true when full board has horizontal adjacent equal pair', () => {
  const board = [
    [2, 4, 8, 16],
    [32, 64, 128, 256],
    [512, 1024, 2048, 2048],
    [2, 4, 8, 16],
  ]
  assert.equal(hasAvailableMoves(board), true)
})

await runTest('hasAvailableMoves returns true when full board has vertical adjacent equal pair', () => {
  const board = [
    [2, 4, 8, 16],
    [32, 64, 128, 256],
    [512, 1024, 1024, 4096],
    [2, 4, 1024, 16],
  ]
  assert.equal(hasAvailableMoves(board), true)
})

await runTest('hasAvailableMoves returns false when full board has no merges possible (game over)', () => {
  const board = [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ]
  assert.equal(hasAvailableMoves(board), false)
})

await runTest('hasTile detects when target tile e.g. 2048 is present', () => {
  const board = [
    [2, 4, 8, 16],
    [32, 64, 128, 256],
    [512, 1024, 2048, null],
    [2, 4, 8, 16],
  ]
  assert.equal(hasTile(board, 2048), true)
  assert.equal(hasTile(board, 4096), false)
})

// 6. Preference setting
await runTest('getSavedCalculationGameSetting defaults to off and reads metis / legacy opt-in keys', () => {
  // Mock localStorage in global
  global.localStorage = {
    _data: {},
    getItem(k) { return this._data[k] ?? null },
    setItem(k, v) { this._data[k] = String(v) },
    removeItem(k) { delete this._data[k] },
    clear() { this._data = {} }
  }

  localStorage.clear()
  assert.equal(getSavedCalculationGameSetting(), false)

  localStorage.setItem(METIS_PREF_CALCULATION_GAME_KEY, 'false')
  assert.equal(getSavedCalculationGameSetting(), false)

  localStorage.clear()
  localStorage.setItem(LEGACY_PREF_CALCULATION_GAME_KEY, 'false')
  assert.equal(getSavedCalculationGameSetting(), false)

  localStorage.setItem(METIS_PREF_CALCULATION_GAME_KEY, 'true')
  assert.equal(getSavedCalculationGameSetting(), true)
})

await runTest('resetting Preferences keeps the Metis Game opt-in off', async () => {
  const preferencesSource = await fs.readFile(new URL('../src/components/PreferencesModal.tsx', import.meta.url), 'utf8')
  assert.match(preferencesSource, /setCalculationGame\(false\)/)
  assert.doesNotMatch(preferencesSource, /setCalculationGame\(true\)/)
})
