export const EDITOR_FRAME_MS = 33

export function snapToEditorFrame(ms: number, durationMs?: number) {
  const maximum = typeof durationMs === 'number' && durationMs > 0
    ? durationMs
    : Number.POSITIVE_INFINITY
  const clamped = Math.max(0, Math.min(Number(ms) || 0, maximum))
  return Math.min(maximum, Math.round(clamped / EDITOR_FRAME_MS) * EDITOR_FRAME_MS)
}
