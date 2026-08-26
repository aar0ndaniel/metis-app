import React, { useCallback, useEffect, useId, useState } from 'react'
import { ArrowClockwise } from '@phosphor-icons/react'
import {
  createInitialBoard,
  moveBoard,
  hasAvailableMoves,
  hasTile,
  type GameBoard,
} from '@/utils/calculationGameEngine'

interface Props {
  className?: string
}

function getTileStyles(value: number | null, isMerged: boolean): React.CSSProperties {
  if (value === null) {
    return {
      background: 'rgb(var(--color-text-secondary-rgb, 150 150 150) / 0.06)',
      border: '1px solid rgb(var(--color-text-secondary-rgb, 150 150 150) / 0.10)',
      color: 'transparent',
    }
  }

  // Base tile style depending on numeric tier
  let baseStyle: React.CSSProperties
  switch (value) {
    case 2:
      baseStyle = {
        background: 'var(--color-panel-control)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-primary)',
      }
      break
    case 4:
      baseStyle = {
        background: 'rgb(var(--color-text-primary-rgb, 240 240 240) / 0.09)',
        border: '1px solid rgb(var(--color-text-primary-rgb, 240 240 240) / 0.16)',
        color: 'var(--color-text-primary)',
      }
      break
    case 8:
      baseStyle = {
        background: 'rgba(230, 140, 30, 0.22)',
        border: '1px solid rgba(230, 140, 30, 0.45)',
        color: 'var(--color-text-primary)',
      }
      break
    case 16:
      baseStyle = {
        background: 'rgba(240, 100, 35, 0.26)',
        border: '1px solid rgba(240, 100, 35, 0.50)',
        color: 'var(--color-text-primary)',
      }
      break
    case 32:
      baseStyle = {
        background: 'rgba(235, 70, 50, 0.30)',
        border: '1px solid rgba(235, 70, 50, 0.55)',
        color: 'var(--color-text-primary)',
      }
      break
    case 64:
      baseStyle = {
        background: 'rgba(230, 45, 80, 0.35)',
        border: '1px solid rgba(230, 45, 80, 0.60)',
        color: 'var(--color-text-primary)',
      }
      break
    case 128:
      baseStyle = {
        background: 'rgb(var(--color-calculation-accent-rgb, 59 130 246) / 0.25)',
        border: '1px solid rgb(var(--color-calculation-accent-rgb, 59 130 246) / 0.50)',
        color: 'var(--color-text-primary)',
      }
      break
    case 256:
      baseStyle = {
        background: 'rgb(var(--color-calculation-accent-rgb, 59 130 246) / 0.35)',
        border: '1px solid rgb(var(--color-calculation-accent-rgb, 59 130 246) / 0.65)',
        color: 'var(--color-text-primary)',
      }
      break
    case 512:
      baseStyle = {
        background: 'rgb(var(--color-calculation-accent-rgb, 59 130 246) / 0.45)',
        border: '1.5px solid var(--color-calculation-accent, var(--color-accent))',
        color: 'var(--color-text-primary)',
      }
      break
    case 1024:
      baseStyle = {
        background: 'rgb(var(--color-calculation-accent-rgb, 59 130 246) / 0.55)',
        border: '1.5px solid var(--color-calculation-accent, var(--color-accent))',
        color: 'var(--color-text-primary)',
        boxShadow: '0 0 10px rgb(var(--color-calculation-accent-rgb, 59 130 246) / 0.35)',
      }
      break
    case 2048:
    default:
      baseStyle = {
        background: 'rgb(var(--color-calculation-accent-rgb, 59 130 246) / 0.65)',
        border: '1.5px solid var(--color-calculation-accent, var(--color-accent))',
        color: 'var(--color-text-primary)',
        boxShadow: '0 0 14px rgb(var(--color-calculation-accent-rgb, 59 130 246) / 0.50)',
      }
      break
  }

  // When newly merged, pop with the app theme accent color
  if (isMerged) {
    return {
      ...baseStyle,
      background: 'rgb(var(--color-calculation-accent-rgb, 59 130 246) / 0.40)',
      borderColor: 'var(--color-calculation-accent, var(--color-accent))',
      boxShadow: '0 0 12px 2px rgb(var(--color-calculation-accent-rgb, 59 130 246) / 0.70)',
      transform: 'scale(1.10)',
      zIndex: 5,
    }
  }

  return baseStyle
}

function getFontSize(val: number | null): number {
  if (!val) return 14
  if (val < 100) return 14
  if (val < 1000) return 11.5
  return 9.5
}

export default function Calculation2048Game({ className = '' }: Props) {
  const [board, setBoard] = useState<GameBoard>(() => createInitialBoard())
  const [score, setScore] = useState<number>(0)
  const [mergedKeys, setMergedKeys] = useState<Set<string>>(() => new Set())
  const boardId = useId()

  const gameOver = !hasAvailableMoves(board)
  const reached2048 = hasTile(board, 2048)

  const handleMove = useCallback((direction: 'left' | 'right' | 'up' | 'down') => {
    setBoard((currentBoard) => {
      const result = moveBoard(currentBoard, direction)
      if (result.moved) {
        setScore((prevScore) => prevScore + result.scoreGain)
        if (result.mergedCells.length > 0) {
          const keys = new Set(result.mergedCells.map(({ r, c }) => `${r}-${c}`))
          setMergedKeys(keys)
          setTimeout(() => {
            setMergedKeys(new Set())
          }, 300)
        }
        return result.board
      }
      return currentBoard
    })
  }, [])

  const handleRestart = useCallback(() => {
    setBoard(createInitialBoard())
    setScore(0)
    setMergedKeys(new Set())
  }, [])

  // Keyboard handler scoped exclusively to the game lifecycle
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      let direction: 'left' | 'right' | 'up' | 'down' | null = null
      const key = event.key.toLowerCase()
      if (key === 'arrowleft') direction = 'left'
      else if (key === 'arrowright') direction = 'right'
      else if (key === 'arrowup') direction = 'up'
      else if (key === 'arrowdown') direction = 'down'

      if (direction) {
        event.preventDefault()
        event.stopPropagation()
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation()
        }
        handleMove(direction)
      }
    }

    window.addEventListener('keydown', onKeyDown, { capture: true, passive: false })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [handleMove])

  return (
    <div
      role="region"
      tabIndex={0}
      aria-label="2048-style calculation waiting game"
      className={`flex flex-col items-center select-none focus:outline-none ${className}`}
      style={{ fontFamily: 'DM Sans, sans-serif' }}
    >
      {/* Header bar: title & score */}
      <div className="w-full flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
            While you wait
          </span>
          {reached2048 && (
            <span
              className="text-[9px] font-bold px-1 py-0.2 rounded"
              style={{
                background: 'rgb(var(--color-calculation-accent-rgb, 59 130 246) / 0.18)',
                color: 'var(--color-calculation-accent, var(--color-accent))',
                border: '1px solid rgb(var(--color-calculation-accent-rgb, 59 130 246) / 0.35)',
              }}
            >
              2048 reached
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>Score</span>
          <span className="font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
            {score.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Compact 4x4 Game board */}
      <div
        id={boardId}
        className="relative p-1.5 rounded-xl"
        style={{
          background: 'var(--color-surface, rgba(0, 0, 0, 0.2))',
          border: '1px solid var(--color-border)',
        }}
      >
        <div className="grid grid-cols-4 gap-1">
          {board.map((row, r) =>
            row.map((cell, c) => {
              const cellKey = `${r}-${c}`
              const isMerged = mergedKeys.has(cellKey)
              const styles = getTileStyles(cell, isMerged)
              const fontSize = getFontSize(cell)
              return (
                <div
                  key={cellKey}
                  className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg font-bold transition-all duration-150"
                  style={{
                    ...styles,
                    fontSize,
                    lineHeight: 1,
                  }}
                >
                  {cell !== null ? cell : ''}
                </div>
              )
            })
          )}
        </div>

        {/* Game over overlay */}
        {gameOver && (
          <div
            className="absolute inset-0 rounded-xl flex flex-col items-center justify-center p-2 backdrop-blur-[2px]"
            style={{
              background: 'rgb(var(--color-overlay-rgb, 0 0 0) / 0.75)',
              color: 'var(--color-text-primary)',
            }}
          >
            <span className="text-[11px] font-semibold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              No more moves
            </span>
            <button
              type="button"
              onClick={handleRestart}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors hover:brightness-110"
              style={{
                background: 'var(--color-panel-control)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
            >
              <ArrowClockwise size={12} weight="bold" />
              <span>Restart</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
