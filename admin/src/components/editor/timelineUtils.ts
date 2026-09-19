import type { Interaction } from '../../types/interaction'

export const EDITOR_FRAME_MS = 33

export function snapToEditorFrame(ms: number, durationMs?: number) {
  const maximum = typeof durationMs === 'number' && durationMs > 0
    ? durationMs
    : Number.POSITIVE_INFINITY
  const clamped = Math.max(0, Math.min(Number(ms) || 0, maximum))
  return Math.min(maximum, Math.round(clamped / EDITOR_FRAME_MS) * EDITOR_FRAME_MS)
}

export function nearestAvailableInteractionFrame(
  rows: Interaction[],
  requestedMs: number,
  durationMs?: number,
) {
  const requested = snapToEditorFrame(requestedMs, durationMs)
  const occupiedFrames = new Set(
    rows.map((row) => Math.round(row.gate_at_ms / EDITOR_FRAME_MS)),
  )
  const requestedFrame = Math.round(requested / EDITOR_FRAME_MS)
  if (!occupiedFrames.has(requestedFrame)) {
    return { requestedMs: requested, resolvedMs: requested, shiftFrames: 0 }
  }

  const maximumFrame = typeof durationMs === 'number' && durationMs > 0
    ? Math.floor(durationMs / EDITOR_FRAME_MS)
    : requestedFrame + rows.length + 1
  const searchDistance = rows.length + 1

  for (let distance = 1; distance <= searchDistance; distance += 1) {
    const forward = requestedFrame + distance
    if (forward <= maximumFrame && !occupiedFrames.has(forward)) {
      return {
        requestedMs: requested,
        resolvedMs: forward * EDITOR_FRAME_MS,
        shiftFrames: distance,
      }
    }
    const backward = requestedFrame - distance
    if (backward >= 0 && !occupiedFrames.has(backward)) {
      return {
        requestedMs: requested,
        resolvedMs: backward * EDITOR_FRAME_MS,
        shiftFrames: -distance,
      }
    }
  }

  return null
}
