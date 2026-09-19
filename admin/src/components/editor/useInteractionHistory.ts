import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Interaction } from '../../types/interaction'

const HISTORY_LIMIT = 50

function sameRows(left: Interaction[], right: Interaction[]) {
  return left === right || JSON.stringify(left) === JSON.stringify(right)
}

export default function useInteractionHistory(
  setRows: Dispatch<SetStateAction<Interaction[]>>,
  onRestore?: (rows: Interaction[]) => void,
) {
  const undoStack = useRef<Interaction[][]>([])
  const redoStack = useRef<Interaction[][]>([])
  const [, setRevision] = useState(0)

  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  const commitRows = useCallback((
    updater: Interaction[] | ((previous: Interaction[]) => Interaction[]),
  ) => {
    setRows((previous) => {
      const next = typeof updater === 'function' ? updater(previous) : updater
      if (sameRows(previous, next)) return previous
      undoStack.current.push(previous)
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift()
      redoStack.current = []
      refresh()
      return next
    })
  }, [refresh, setRows])

  const undo = useCallback(() => {
    setRows((current) => {
      const previous = undoStack.current.pop()
      if (!previous) return current
      redoStack.current.push(current)
      refresh()
      queueMicrotask(() => onRestore?.(previous))
      return previous
    })
  }, [onRestore, refresh, setRows])

  const redo = useCallback(() => {
    setRows((current) => {
      const next = redoStack.current.pop()
      if (!next) return current
      undoStack.current.push(current)
      refresh()
      queueMicrotask(() => onRestore?.(next))
      return next
    })
  }, [onRestore, refresh, setRows])

  const resetHistory = useCallback(() => {
    undoStack.current = []
    redoStack.current = []
    refresh()
  }, [refresh])

  return {
    commitRows,
    undo,
    redo,
    resetHistory,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  }
}
