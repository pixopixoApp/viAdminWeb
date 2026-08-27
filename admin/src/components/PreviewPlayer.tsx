import { PauseCircleFilled, PlayCircleFilled } from '@ant-design/icons'
import { Button } from 'antd'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Gate } from '../types/interaction'
import {
  GESTURE_LABEL,
  isContinuousSwipe,
  isContinuousTap,
  isSustainedPlaybackInteraction,
} from '../types/interaction'
export { GESTURE_LABEL }

type Props = {
  runId: string
  /** Browser-loadable media for a published item that has no Run workspace. */
  videoUrl?: string
  /** When set, play this clip instead of the run's default source.mp4 */
  clipId?: string
  gates: Gate[]
  durationMs?: number
  mode?: 'preview' | 'annotate'
  selectedIndex?: number | null
  onSelectGate?: (index: number) => void
  onPlayheadChange?: (ms: number) => void
  onAddAtPlayhead?: () => void
}

const FRAME_MS = 33
const SECOND_MS = 1000
const SLOW_MEDIA_LOAD_MS = 8_000
const CONTINUOUS_MIN_TRAVEL_DP = 32 * 0.85
const CONTINUOUS_IDLE_TIMEOUT_MS = 500
const CONTINUOUS_JITTER_DP = 3
const CONTINUOUS_REVERSAL_COSINE = -0.5

type ContinuousPointerState = {
  pointerId: number
  phase: 'first_leg' | 'return_leg' | 'driving'
  anchorX: number
  anchorY: number
  directionX: number
  directionY: number
  turnX: number
  turnY: number
  lastAcceptedX: number
  lastAcceptedY: number
}

function actionLabel(gate: Gate) {
  if (gate.custom_action && gate.action_description) return gate.action_description
  if (gate.gesture && GESTURE_LABEL[gate.gesture]) return GESTURE_LABEL[gate.gesture]
  return gate.gesture || '互动'
}

function hintLabel(gate: Gate) {
  return gate.hint || gate.cue || actionLabel(gate)
}

export default function PreviewPlayer({
  runId,
  videoUrl,
  clipId,
  gates,
  durationMs,
  mode = 'preview',
  selectedIndex = null,
  onSelectGate,
  onPlayheadChange,
  onAddAtPlayhead,
}: Props) {
  const annotate = mode === 'annotate'
  const videoRef = useRef<HTMLVideoElement>(null)
  const [index, setIndex] = useState(0)
  const [pausedAtGate, setPausedAtGate] = useState(false)
  const [ended, setEnded] = useState(false)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [mediaDuration, setMediaDuration] = useState(durationMs || 0)
  const [mediaLoading, setMediaLoading] = useState(true)
  const [mediaSlow, setMediaSlow] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [continuousDriving, setContinuousDriving] = useState(false)
  const [continuousTapPulse, setContinuousTapPulse] = useState(0)
  const continuousPointerRef = useRef<ContinuousPointerState | null>(null)
  const continuousIdleTimerRef = useRef<number | null>(null)
  const continuousSessionRef = useRef(0)
  const continuousTapRenewalRef = useRef(0)
  const onSelectGateRef = useRef(onSelectGate)
  onSelectGateRef.current = onSelectGate

  const sorted = useMemo(
    () => [...gates].sort((a, b) => a.gate_at_ms - b.gate_at_ms),
    [gates],
  )
  const active = pausedAtGate ? sorted[index] : null
  const activeSustained = pausedAtGate && isSustainedPlaybackInteraction(active)
  const activeContinuousSwipe = activeSustained && isContinuousSwipe(active)
  const activeContinuousTap = activeSustained && isContinuousTap(active)
  const totalMs =
    mediaDuration || durationMs || (sorted.length ? sorted[sorted.length - 1].gate_at_ms : 1)

  // Remounted video (clip switch) must not keep play/gate state from the previous clip.
  useEffect(() => {
    setIndex(0)
    setPausedAtGate(false)
    setEnded(false)
    setStarted(false)
    setPlaying(false)
    setProgress(0)
    setMediaDuration(durationMs || 0)
    setMediaLoading(true)
    setMediaSlow(false)
    setMediaError(null)
    resetContinuousControl(true)
    // Only reset when the media identity changes; durationMs is seed for the new clip.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: clip/run identity
  }, [clipId, runId])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let slowTimer: number | null = null
    const clearSlowTimer = () => {
      if (slowTimer != null) {
        window.clearTimeout(slowTimer)
        slowTimer = null
      }
    }
    const beginLoading = () => {
      clearSlowTimer()
      setMediaLoading(true)
      setMediaSlow(false)
      setMediaError(null)
      slowTimer = window.setTimeout(() => setMediaSlow(true), SLOW_MEDIA_LOAD_MS)
    }
    const mediaReady = () => {
      clearSlowTimer()
      setMediaLoading(false)
      setMediaSlow(false)
    }
    const mediaFailed = () => {
      clearSlowTimer()
      setMediaLoading(false)
      setMediaSlow(false)
      const code = video.error?.code
      const description = {
        1: '视频加载已取消，请重试。',
        2: '视频资源网络请求失败，请检查网络后重试。',
        3: '视频文件无法解码，请重新上传或转码。',
        4: '当前浏览器无法播放此视频格式。',
      }[code || 0] || '视频资源暂时不可用，请稍后重试。'
      setMediaError(description)
    }
    const markStalled = () => setMediaSlow(true)

    video.addEventListener('loadstart', beginLoading)
    video.addEventListener('waiting', beginLoading)
    video.addEventListener('stalled', markStalled)
    video.addEventListener('canplay', mediaReady)
    video.addEventListener('playing', mediaReady)
    video.addEventListener('error', mediaFailed)
    beginLoading()
    return () => {
      clearSlowTimer()
      video.removeEventListener('loadstart', beginLoading)
      video.removeEventListener('waiting', beginLoading)
      video.removeEventListener('stalled', markStalled)
      video.removeEventListener('canplay', mediaReady)
      video.removeEventListener('playing', mediaReady)
      video.removeEventListener('error', mediaFailed)
    }
  }, [clipId, runId])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onLoaded = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setMediaDuration(Math.round(video.duration * 1000))
      }
    }

    const onTime = () => {
      const ms = video.currentTime * 1000
      setProgress(ms)
      onPlayheadChange?.(Math.round(ms))
      if (pausedAtGate) {
        if (isSustainedPlaybackInteraction(active) && index + 1 < sorted.length) {
          const next = sorted[index + 1]
          if (ms >= next.gate_at_ms) {
            resetContinuousControl(true)
            video.currentTime = next.gate_at_ms / 1000
            setProgress(next.gate_at_ms)
            setIndex(index + 1)
            setPausedAtGate(true)
            if (annotate) onSelectGateRef.current?.(index + 1)
          }
        }
        return
      }
      if (ended || !started) return
      if (index >= sorted.length) return
      const next = sorted[index]
      if (ms >= next.gate_at_ms) {
        video.pause()
        video.currentTime = next.gate_at_ms / 1000
        setProgress(next.gate_at_ms)
        setPausedAtGate(true)
        if (annotate) onSelectGateRef.current?.(index)
      }
    }

    const onEnded = () => {
      resetContinuousControl(false)
      setEnded(true)
      setPausedAtGate(false)
      setPlaying(false)
      setProgress(totalMs)
    }

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)

    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('ended', onEnded)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [active?.gesture, annotate, index, pausedAtGate, ended, started, sorted, totalMs, onPlayheadChange])

  useEffect(() => {
    if (!activeSustained) resetContinuousControl(false)
    return () => {
      if (activeSustained) resetContinuousControl(true)
    }
  }, [active?.gesture, activeSustained, index])

  async function requestPlay(video: HTMLVideoElement) {
    setMediaError(null)
    try {
      await video.play()
    } catch (error) {
      setPlaying(false)
      setMediaLoading(false)
      const detail = error instanceof DOMException && error.name === 'NotAllowedError'
        ? '浏览器阻止了自动播放，请再次点击播放。'
        : '视频暂时无法开始播放，请重试。'
      setMediaError(detail)
    }
  }

  function clearContinuousIdleTimer() {
    if (continuousIdleTimerRef.current != null) {
      window.clearTimeout(continuousIdleTimerRef.current)
      continuousIdleTimerRef.current = null
    }
  }

  function resetContinuousControl(pauseVideo: boolean) {
    clearContinuousIdleTimer()
    continuousSessionRef.current += 1
    continuousTapRenewalRef.current += 1
    continuousPointerRef.current = null
    setContinuousDriving(false)
    if (pauseVideo) videoRef.current?.pause()
  }

  function resetContinuousQualifier(pointer: ContinuousPointerState) {
    pointer.phase = 'first_leg'
    pointer.anchorX = pointer.lastAcceptedX
    pointer.anchorY = pointer.lastAcceptedY
    pointer.directionX = 0
    pointer.directionY = 0
    pointer.turnX = pointer.lastAcceptedX
    pointer.turnY = pointer.lastAcceptedY
  }

  function armContinuousIdleTimer(pointer: ContinuousPointerState) {
    clearContinuousIdleTimer()
    continuousIdleTimerRef.current = window.setTimeout(() => {
      continuousIdleTimerRef.current = null
      if (continuousPointerRef.current !== pointer || pointer.phase !== 'driving') return
      videoRef.current?.pause()
      setContinuousDriving(false)
      resetContinuousQualifier(pointer)
    }, CONTINUOUS_IDLE_TIMEOUT_MS)
  }

  async function requestContinuousPlay(pointer: ContinuousPointerState) {
    const video = videoRef.current
    if (!video) return
    setMediaError(null)
    try {
      await video.play()
      if (continuousPointerRef.current !== pointer || pointer.phase !== 'driving') {
        video.pause()
      }
    } catch {
      if (continuousPointerRef.current === pointer) {
        video.pause()
        setContinuousDriving(false)
        resetContinuousQualifier(pointer)
        setMediaError('视频暂时无法开始播放，请重新往复滑动。')
      }
    }
  }

  function handleContinuousPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activeContinuousSwipe || !event.isPrimary || continuousPointerRef.current) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    videoRef.current?.pause()
    setContinuousDriving(false)
    continuousPointerRef.current = {
      pointerId: event.pointerId,
      phase: 'first_leg',
      anchorX: event.clientX,
      anchorY: event.clientY,
      directionX: 0,
      directionY: 0,
      turnX: event.clientX,
      turnY: event.clientY,
      lastAcceptedX: event.clientX,
      lastAcceptedY: event.clientY,
    }
  }

  function handleContinuousPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = continuousPointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const stepX = event.clientX - pointer.lastAcceptedX
    const stepY = event.clientY - pointer.lastAcceptedY
    if (Math.hypot(stepX, stepY) < CONTINUOUS_JITTER_DP) return
    pointer.lastAcceptedX = event.clientX
    pointer.lastAcceptedY = event.clientY

    if (pointer.phase === 'driving') {
      armContinuousIdleTimer(pointer)
      return
    }
    if (pointer.phase === 'first_leg') {
      const deltaX = event.clientX - pointer.anchorX
      const deltaY = event.clientY - pointer.anchorY
      const distance = Math.hypot(deltaX, deltaY)
      if (distance < CONTINUOUS_MIN_TRAVEL_DP) return
      pointer.directionX = deltaX / distance
      pointer.directionY = deltaY / distance
      pointer.turnX = event.clientX
      pointer.turnY = event.clientY
      pointer.phase = 'return_leg'
      return
    }

    const returnX = event.clientX - pointer.turnX
    const returnY = event.clientY - pointer.turnY
    const projection = returnX * pointer.directionX + returnY * pointer.directionY
    if (projection > 0) {
      pointer.turnX = event.clientX
      pointer.turnY = event.clientY
      return
    }
    const returnDistance = Math.hypot(returnX, returnY)
    if (returnDistance < CONTINUOUS_MIN_TRAVEL_DP) return
    const cosine = projection / returnDistance
    if (cosine > CONTINUOUS_REVERSAL_COSINE) return
    pointer.phase = 'driving'
    setContinuousDriving(true)
    armContinuousIdleTimer(pointer)
    void requestContinuousPlay(pointer)
  }

  function handleContinuousPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = continuousPointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    resetContinuousControl(true)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  async function requestContinuousTapPlay(session: number) {
    const video = videoRef.current
    if (!video) return
    setMediaError(null)
    try {
      await video.play()
      if (continuousSessionRef.current !== session) video.pause()
    } catch {
      if (continuousSessionRef.current === session) {
        video.pause()
        setContinuousDriving(false)
        setMediaError('视频暂时无法开始播放，请再次点击。')
      }
    }
  }

  function renewContinuousTap() {
    const video = videoRef.current
    if (!video || !activeContinuousTap) return
    setStarted(true)
    setEnded(false)
    setContinuousDriving(true)
    setContinuousTapPulse((value) => value + 1)
    const session = continuousSessionRef.current
    const renewal = continuousTapRenewalRef.current + 1
    continuousTapRenewalRef.current = renewal
    clearContinuousIdleTimer()
    continuousIdleTimerRef.current = window.setTimeout(() => {
      continuousIdleTimerRef.current = null
      if (
        continuousSessionRef.current !== session ||
        continuousTapRenewalRef.current !== renewal
      ) return
      continuousSessionRef.current += 1
      video.pause()
      setContinuousDriving(false)
    }, CONTINUOUS_IDLE_TIMEOUT_MS)
    void requestContinuousTapPlay(session)
  }

  function handleContinuousTapPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.stopPropagation()
    renewContinuousTap()
  }

  function handleContinuousTapKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    renewContinuousTap()
  }

  function start() {
    const video = videoRef.current
    if (!video) return
    setStarted(true)
    setEnded(false)
    const startsWithGate = sorted[0]?.gate_at_ms === 0
    setPausedAtGate(startsWithGate)
    setIndex(0)
    setProgress(0)
    video.currentTime = 0
    if (startsWithGate) video.pause()
    else void requestPlay(video)
  }

  function advance() {
    const video = videoRef.current
    if (!video) return
    if (!started || ended) {
      start()
      return
    }
    if (!pausedAtGate) return
    if (activeSustained) return
    setPausedAtGate(false)
    setIndex((value) => value + 1)
    void requestPlay(video)
  }

  function resumePlay() {
    const video = videoRef.current
    if (!video) return
    if (ended) {
      start()
      return
    }
    if (activeSustained) return
    if (pausedAtGate) {
      setPausedAtGate(false)
      setIndex((value) => value + 1)
      setStarted(true)
      void requestPlay(video)
      return
    }
    setStarted(true)
    setEnded(false)
    void requestPlay(video)
  }

  function pausePlay() {
    videoRef.current?.pause()
  }

  function togglePlay() {
    if (activeSustained) return
    const video = videoRef.current
    // Prefer element state: rapid play/pause can leave React `playing` out of sync.
    if (video && !video.paused) pausePlay()
    else resumePlay()
  }

  function seekToMs(ms: number, { play = true }: { play?: boolean } = {}) {
    const video = videoRef.current
    if (!video || totalMs <= 0) return
    const clamped = Math.max(0, Math.min(ms, totalMs))
    const continuousIndex = sorted.findIndex((gate, gateIndex) => {
      if (!isSustainedPlaybackInteraction(gate)) return false
      const end = sorted[gateIndex + 1]?.gate_at_ms ?? totalMs
      return clamped >= gate.gate_at_ms && clamped < end
    })
    const nextIndex = sorted.findIndex((gate) => gate.gate_at_ms > clamped + 1)
    setStarted(true)
    setEnded(clamped >= totalMs - 40)
    setPausedAtGate(continuousIndex >= 0)
    setIndex(continuousIndex >= 0 ? continuousIndex : (nextIndex === -1 ? sorted.length : nextIndex))
    video.currentTime = clamped / 1000
    setProgress(clamped)
    onPlayheadChange?.(Math.round(clamped))
    if (continuousIndex >= 0) video.pause()
    else if (play && clamped < totalMs - 40) void requestPlay(video)
    else video.pause()
  }

  function seekToGate(gateIndex: number, event: MouseEvent) {
    event.stopPropagation()
    const video = videoRef.current
    const gate = sorted[gateIndex]
    if (!video || !gate) return
    setStarted(true)
    setEnded(false)
    setIndex(gateIndex)
    setPausedAtGate(true)
    resetContinuousControl(true)
    video.pause()
    video.currentTime = gate.gate_at_ms / 1000
    setProgress(gate.gate_at_ms)
    onPlayheadChange?.(gate.gate_at_ms)
    if (annotate) onSelectGate?.(gateIndex)
  }

  function msFromRailEvent(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(rect.width, 1)))
    return ratio * totalMs
  }

  function onRailPointerDown(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation()
    event.preventDefault()
    const rail = event.currentTarget
    seekToMs(msFromRailEvent(event), { play: false })

    const onMove = (moveEvent: PointerEvent) => {
      const rect = rail.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (moveEvent.clientX - rect.left) / Math.max(rect.width, 1)))
      seekToMs(ratio * totalMs, { play: false })
    }
    const onUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const rect = rail.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (upEvent.clientX - rect.left) / Math.max(rect.width, 1)))
      seekToMs(ratio * totalMs, { play: false })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function stepBy(deltaMs: number) {
    seekToMs(progress + deltaMs, { play: false })
  }

  function nodeState(gateIndex: number) {
    if (annotate && selectedIndex === gateIndex) return 'selected'
    if (gateIndex < index) return 'done'
    if (pausedAtGate && gateIndex === index) return 'active'
    return 'todo'
  }

  function rowState(gateIndex: number) {
    if (annotate && selectedIndex === gateIndex) return 'active'
    if (gateIndex < index) return 'done'
    if (pausedAtGate && gateIndex === index) return 'active'
    return 'todo'
  }

  return (
    <div className="preview-wrap">
      <div className="preview-stage" onClick={togglePlay} role="button" tabIndex={0}>
        <div className="preview-phone">
          <video
            ref={videoRef}
            className="preview-video"
            src={
              videoUrl || (clipId
                ? `/api/v1/stories/${runId}/clips/${clipId}/video`
                : `/api/v1/runs/${runId}/media/video`)
            }
            key={clipId || 'default'}
            playsInline
            preload="metadata"
            controls={false}
            controlsList="nodownload noplaybackrate noremoteplayback"
            disablePictureInPicture
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
          />
          {mediaError ? (
            <div className="preview-media-status is-error" role="alert" onClick={(e) => e.stopPropagation()}>
              <strong>视频无法播放</strong>
              <span>{mediaError}</span>
              <Button size="small" onClick={() => {
                setMediaError(null)
                videoRef.current?.load()
              }}>
                重新加载
              </Button>
            </div>
          ) : null}
          {mediaLoading && !mediaError ? (
            <div className="preview-media-status" role="status" aria-live="polite">
              <span className="preview-media-spinner" aria-hidden="true" />
              <span>{mediaSlow ? '视频资源响应较慢，仍在加载…' : '正在加载视频…'}</span>
            </div>
          ) : null}
          {activeSustained && active ? (
            <div
              className={`preview-continuous-surface${continuousDriving ? ' is-driving' : ''}${activeContinuousTap ? ' is-tap' : ''}`}
              role={activeContinuousTap ? 'button' : 'application'}
              tabIndex={activeContinuousTap ? 0 : undefined}
              aria-label={
                activeContinuousTap
                  ? '在画面任意位置持续点击以播放，停止点击 500 毫秒后暂停'
                  : '在画面任意位置持续往复滑动以播放'
              }
              onClick={(event) => event.stopPropagation()}
              onKeyDown={activeContinuousTap ? handleContinuousTapKeyDown : undefined}
              onPointerDown={
                activeContinuousTap
                  ? handleContinuousTapPointerDown
                  : handleContinuousPointerDown
              }
              onPointerMove={activeContinuousSwipe ? handleContinuousPointerMove : undefined}
              onPointerUp={activeContinuousSwipe ? handleContinuousPointerEnd : undefined}
              onPointerCancel={activeContinuousSwipe ? handleContinuousPointerEnd : undefined}
            >
              <div className="preview-continuous-indicator" aria-hidden="true">
                <span key={activeContinuousTap ? continuousTapPulse : undefined}>
                  {activeContinuousTap ? '●' : '↔'}
                </span>
              </div>
              <div className="preview-gate preview-gate-continuous">
                <span className="preview-gate-index">{String(index + 1).padStart(2, '0')}</span>
                <div className="preview-gate-body">
                  <div className="preview-gate-action">动作：{actionLabel(active)}</div>
                  <strong className="preview-gate-hint">{hintLabel(active)}</strong>
                  <div className="preview-gate-sub">
                    {activeContinuousTap
                      ? continuousDriving
                        ? '点击已续期 · 视频播放中，停止 500ms 后暂停'
                        : '点击画面开始播放，并持续点击以续播'
                      : continuousDriving
                        ? '正在滑动 · 视频播放中，抬手即暂停'
                        : '在画面任意位置完成一次往复滑动'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div
                className={`preview-overlay${playing ? ' preview-overlay-playing' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  togglePlay()
                }}
              >
                <button
                  type="button"
                  className="preview-transport-btn"
                  aria-label={playing ? '暂停' : '播放'}
                  onClick={(e) => {
                    e.stopPropagation()
                    togglePlay()
                  }}
                >
                  {playing ? <PauseCircleFilled /> : <PlayCircleFilled />}
                </button>
              </div>
              {pausedAtGate && active ? (
                <div className="preview-gate" onClick={(e) => e.stopPropagation()}>
                  <span className="preview-gate-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="preview-gate-body">
                    <div className="preview-gate-action">动作：{actionLabel(active)}</div>
                    <strong className="preview-gate-hint">{hintLabel(active)}</strong>
                    <div className="preview-gate-sub">点击画面任意处继续</div>
                  </div>
                  <Button type="primary" size="small" onClick={advance}>继续</Button>
                </div>
              ) : null}
            </>
          )}
        </div>
        {annotate ? (
          <div
            className="preview-annotate-bar"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Button size="small" onClick={() => stepBy(-SECOND_MS)}>
              -1s
            </Button>
            <Button size="small" onClick={() => stepBy(-FRAME_MS)}>
              -1帧
            </Button>
            <Button
              size="small"
              type="primary"
              icon={playing ? <PauseCircleFilled /> : <PlayCircleFilled />}
              onClick={togglePlay}
              disabled={activeSustained}
              aria-label={playing ? '暂停' : '播放'}
            >
              {playing ? '暂停' : '播放'}
            </Button>
            <Button size="small" onClick={() => stepBy(FRAME_MS)}>
              +1帧
            </Button>
            <Button size="small" onClick={() => stepBy(SECOND_MS)}>
              +1s
            </Button>
            {onAddAtPlayhead ? (
              <Button size="small" type="primary" onClick={onAddAtPlayhead}>
                在当前时刻加点
              </Button>
            ) : null}
            <span className="preview-annotate-time">{(progress / 1000).toFixed(2)}s</span>
          </div>
        ) : null}
      </div>

      <div className="preview-timeline" onClick={(e) => e.stopPropagation()}>
        <div className="preview-timeline-head">
          <span>时间轴 · {sorted.length} 个节点</span>
          <span>
            {(progress / 1000).toFixed(2)}s
            {started
              ? ` · ${Math.min(index + (pausedAtGate ? 1 : 0), sorted.length)} / ${sorted.length}`
              : ' · 未开始'}
          </span>
        </div>
        <div
          className="preview-rail"
          onPointerDown={onRailPointerDown}
          role="slider"
          aria-label="播放进度"
          aria-valuemin={0}
          aria-valuemax={totalMs}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className="preview-rail-fill"
            style={{ width: `${Math.min(100, (progress / Math.max(totalMs, 1)) * 100)}%` }}
          />
          {sorted.map((gate, gateIndex) => {
            if (!isSustainedPlaybackInteraction(gate)) return null
            const endMs = sorted[gateIndex + 1]?.gate_at_ms ?? totalMs
            const left = (gate.gate_at_ms / Math.max(totalMs, 1)) * 100
            const right = (endMs / Math.max(totalMs, 1)) * 100
            return (
              <div
                key={`continuous-range-${gate.gate_at_ms}-${gateIndex}`}
                className="preview-continuous-range"
                style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
                title={`${actionLabel(gate)}作用区间 · ${(gate.gate_at_ms / 1000).toFixed(2)}s → ${(endMs / 1000).toFixed(2)}s`}
              />
            )
          })}
          {sorted.map((gate, gateIndex) => {
            const left = `${Math.min(100, (gate.gate_at_ms / Math.max(totalMs, 1)) * 100)}%`
            const state = nodeState(gateIndex)
            return (
              <button
                key={`${gate.gate_at_ms}-${gateIndex}`}
                type="button"
                className={`preview-node preview-node-${state}`}
                style={{ left }}
                title={`${actionLabel(gate)} · ${(gate.gate_at_ms / 1000).toFixed(2)}s`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => seekToGate(gateIndex, event)}
              />
            )
          })}
        </div>
        {annotate && sorted.length > 0 ? (
          <div className="preview-node-list-head" aria-hidden="true">
            <span>编号</span>
            <span>互动动作</span>
            <span>播放器提示</span>
            <span>时刻</span>
          </div>
        ) : null}
        <ol className="preview-node-list">
          {sorted.map((gate, gateIndex) => {
            const state = rowState(gateIndex)
            const explicitHint = gate.hint || gate.cue
            return (
              <li key={`row-${gateIndex}`} className={`preview-node-row preview-node-row-${state}`}>
                <button type="button" onClick={(event) => seekToGate(gateIndex, event)}>
                  <span className="preview-node-no">{String(gateIndex + 1).padStart(2, '0')}</span>
                  <span className="preview-node-action">{actionLabel(gate)}</span>
                  <span
                    className={`preview-node-hint ${annotate && !explicitHint ? 'is-empty' : ''}`}
                  >
                    {annotate ? explicitHint || '未填写' : hintLabel(gate)}
                  </span>
                  <span className="preview-node-time">{(gate.gate_at_ms / 1000).toFixed(2)}s</span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
