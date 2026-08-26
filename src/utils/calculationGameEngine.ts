export type TileValue = number | null
export type GameBoard = TileValue[][]

export const METIS_PREF_CALCULATION_GAME_KEY = 'metis:prefs:calculationGame'
export const LEGACY_PREF_CALCULATION_GAME_KEY = 'pls:prefs:calculationGame'

export function getSavedCalculationGameSetting(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    const raw = localStorage.getItem(METIS_PREF_CALCULATION_GAME_KEY) ?? localStorage.getItem(LEGACY_PREF_CALCULATION_GAME_KEY)
    if (raw !== null) {
      return raw === 'true'
    }
  } catch {}
  return false
}

export function createEmptyBoard(): GameBoard {
  return [
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ]
}

export function getEmptyCells(board: GameBoard): Array<{ r: number; c: number }> {
  const empty: Array<{ r: number; c: number }> = []
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (board[r][c] === null) {
        empty.push({ r, c })
      }
    }
  }
  return empty
}

export function addRandomTile(board: GameBoard, randomFn = Math.random): GameBoard {
  const empty = getEmptyCells(board)
  if (empty.length === 0) return board
  const chosenIndex = Math.floor(randomFn() * empty.length)
  const { r, c } = empty[chosenIndex]
  const val = randomFn() < 0.9 ? 2 : 4
  const next = board.map((row) => [...row])
  next[r][c] = val
  return next
}

export function createInitialBoard(randomFn = Math.random): GameBoard {
  let board = createEmptyBoard()
  board = addRandomTile(board, randomFn)
  board = addRandomTile(board, randomFn)
  return board
}

export function mergeLine(line: TileValue[]): { line: TileValue[]; scoreGain: number; moved: boolean; mergedIndices: number[] } {
  // 1. Compact non-null values to the left
  const nonNull = line.filter((v): v is number => v !== null)
  const merged: number[] = []
  const mergedIndices: number[] = []
  let scoreGain = 0
  let i = 0

  while (i < nonNull.length) {
    if (i + 1 < nonNull.length && nonNull[i] === nonNull[i + 1]) {
      const mergedVal = nonNull[i] * 2
      mergedIndices.push(merged.length)
      merged.push(mergedVal)
      scoreGain += mergedVal
      i += 2 // skip second tile so it cannot merge a second time during the same move
    } else {
      merged.push(nonNull[i])
      i += 1
    }
  }

  // 2. Pad back to 4 elements with null
  const result: TileValue[] = [null, null, null, null]
  for (let idx = 0; idx < merged.length; idx++) {
    result[idx] = merged[idx]
  }

  // 3. Check if line moved/changed
  const moved = !linesEqual(line, result)
  return { line: result, scoreGain, moved, mergedIndices }
}

function linesEqual(a: TileValue[], b: TileValue[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export function boardsEqual(a: GameBoard, b: GameBoard): boolean {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (a[r][c] !== b[r][c]) return false
    }
  }
  return true
}

export function moveLeft(board: GameBoard): { board: GameBoard; scoreGain: number; moved: boolean; mergedCells: Array<{ r: number; c: number }> } {
  let totalScore = 0
  let anyMoved = false
  const mergedCells: Array<{ r: number; c: number }> = []
  const nextBoard: GameBoard = createEmptyBoard()

  for (let r = 0; r < 4; r++) {
    const { line, scoreGain, moved, mergedIndices } = mergeLine(board[r])
    nextBoard[r] = line
    totalScore += scoreGain
    if (moved) anyMoved = true
    for (const c of mergedIndices) {
      mergedCells.push({ r, c })
    }
  }

  return { board: nextBoard, scoreGain: totalScore, moved: anyMoved, mergedCells }
}

export function moveRight(board: GameBoard): { board: GameBoard; scoreGain: number; moved: boolean; mergedCells: Array<{ r: number; c: number }> } {
  let totalScore = 0
  let anyMoved = false
  const mergedCells: Array<{ r: number; c: number }> = []
  const nextBoard: GameBoard = createEmptyBoard()

  for (let r = 0; r < 4; r++) {
    const reversed = [...board[r]].reverse()
    const { line, scoreGain, moved, mergedIndices } = mergeLine(reversed)
    nextBoard[r] = [...line].reverse()
    totalScore += scoreGain
    if (moved) anyMoved = true
    for (const idx of mergedIndices) {
      mergedCells.push({ r, c: 3 - idx })
    }
  }

  return { board: nextBoard, scoreGain: totalScore, moved: anyMoved, mergedCells }
}

export function moveUp(board: GameBoard): { board: GameBoard; scoreGain: number; moved: boolean; mergedCells: Array<{ r: number; c: number }> } {
  let totalScore = 0
  let anyMoved = false
  const mergedCells: Array<{ r: number; c: number }> = []
  const nextBoard: GameBoard = createEmptyBoard()

  for (let c = 0; c < 4; c++) {
    const col: TileValue[] = [board[0][c], board[1][c], board[2][c], board[3][c]]
    const { line, scoreGain, moved, mergedIndices } = mergeLine(col)
    for (let r = 0; r < 4; r++) {
      nextBoard[r][c] = line[r]
    }
    totalScore += scoreGain
    if (moved) anyMoved = true
    for (const r of mergedIndices) {
      mergedCells.push({ r, c })
    }
  }

  return { board: nextBoard, scoreGain: totalScore, moved: anyMoved, mergedCells }
}

export function moveDown(board: GameBoard): { board: GameBoard; scoreGain: number; moved: boolean; mergedCells: Array<{ r: number; c: number }> } {
  let totalScore = 0
  let anyMoved = false
  const mergedCells: Array<{ r: number; c: number }> = []
  const nextBoard: GameBoard = createEmptyBoard()

  for (let c = 0; c < 4; c++) {
    const colReversed: TileValue[] = [board[3][c], board[2][c], board[1][c], board[0][c]]
    const { line, scoreGain, moved, mergedIndices } = mergeLine(colReversed)
    const col = [...line].reverse()
    for (let r = 0; r < 4; r++) {
      nextBoard[r][c] = col[r]
    }
    totalScore += scoreGain
    if (moved) anyMoved = true
    for (const idx of mergedIndices) {
      mergedCells.push({ r: 3 - idx, c })
    }
  }

  return { board: nextBoard, scoreGain: totalScore, moved: anyMoved, mergedCells }
}

export function moveBoard(
  board: GameBoard,
  direction: 'left' | 'right' | 'up' | 'down',
  randomFn = Math.random,
): { board: GameBoard; scoreGain: number; moved: boolean; mergedCells: Array<{ r: number; c: number }> } {
  let result: { board: GameBoard; scoreGain: number; moved: boolean; mergedCells: Array<{ r: number; c: number }> }
  switch (direction) {
    case 'left':
      result = moveLeft(board)
      break
    case 'right':
      result = moveRight(board)
      break
    case 'up':
      result = moveUp(board)
      break
    case 'down':
      result = moveDown(board)
      break
  }

  if (result.moved) {
    const boardWithSpawn = addRandomTile(result.board, randomFn)
    return {
      board: boardWithSpawn,
      scoreGain: result.scoreGain,
      moved: true,
      mergedCells: result.mergedCells,
    }
  }

  return {
    board,
    scoreGain: 0,
    moved: false,
    mergedCells: [],
  }
}

export function hasAvailableMoves(board: GameBoard): boolean {
  // 1. Check if any cell is empty
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (board[r][c] === null) return true
    }
  }

  // 2. Check horizontally adjacent equal pairs
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      if (board[r][c] !== null && board[r][c] === board[r][c + 1]) return true
    }
  }

  // 3. Check vertically adjacent equal pairs
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 3; r++) {
      if (board[r][c] !== null && board[r][c] === board[r + 1][c]) return true
    }
  }

  return false
}

export function hasTile(board: GameBoard, target: number): boolean {
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (board[r][c] === target) return true
    }
  }
  return false
}

export function getHighestTile(board: GameBoard): number {
  let highest = 0
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const val = board[r][c]
      if (val !== null && val > highest) {
        highest = val
      }
    }
  }
  return highest
}
