import { PauseCircleFilled, PlayCircleFilled } from '@ant-design/icons'
import { Button } from 'antd'
import {
  useCallback,
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
  cameraContinuousTargetCopy,
  GESTURE_LABEL,
  isCameraContinuous,
  isContinuousBlow,
  isContinuousVoice,
  isContinuousSwipe,
  isContinuousTap,
  isContinuousHold,
  isMultiTap,
  isSustainedPlaybackInteraction,
  sustainedPlaybackEndMs,
  isPinch,
  pinchDirectionCopy,
} from '../types/interaction'
import { adminGestureLabel } from './editor/interactionCopy'
import ClientRuntimePreview, {
  type ClientRuntimePreviewHandle,
  type ClientSimulationState,
} from './editor/ClientRuntimePreview'
import { EDITOR_FRAME_MS, snapToEditorFrame } from './editor/timelineUtils'
export { GESTURE_LABEL }

type GatePatch = Omit<Partial<Gate>, 'gate_end_ms'> & {
  gate_end_ms?: number | null
}

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
  workspace?: boolean
  onAddInteractionAt?: (gestureValue: string, ms: number) => void
  onUpdateGate?: (index: number, patch: GatePatch) => void
}

const SECOND_MS = 1000
const SLOW_MEDIA_LOAD_MS = 8_000
const CONTINUOUS_MIN_TRAVEL_DP = 32 * 0.85
const CONTINUOUS_IDLE_TIMEOUT_MS = 500
const CAMERA_CONTINUOUS_IDLE_TIMEOUT_MS = 1100
const CONTINUOUS_MICROPHONE_IDLE_TIMEOUT_MS = 450
const CONTINUOUS_JITTER_DP = 3
const CONTINUOUS_REVERSAL_COSINE = -0.5
const LOCAL_EDITOR_DEMO_RUN_ID = '00000000-0000-4000-8000-000000000018'
const LOCAL_EDITOR_DEMO_VIDEO_REVISION = 'provided-27s-463e845'

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
  if (isPinch(gate)) {
    return `${adminGestureLabel(gate.gesture)} · ${pinchDirectionCopy(gate.pinch_direction).hint}`
  }
  return adminGestureLabel(gate.gesture)
}

function hintLabel(gate: Gate) {
  if (isPinch(gate) && (!gate.hint || gate.hint === 'Pinch' || gate.hint === '双指捏合')) return pinchDirectionCopy(gate.pinch_direction).hint
  return gate.hint || gate.cue || actionLabel(gate)
}

const GESTURE_INSTRUCTION_ZH: Record<string, string> = {
  tap: '点按画面一次',
  double_tap: '快速点按画面两次',
  multi_tap: '按设定次数连续点击画面',
  rapid_tap: '快速连续点击画面',
  hold: '按住画面完成互动',
  hold_charge: '按住画面完成蓄力',
  swipe_left: '向左滑动',
  swipe_right: '向右滑动',
  swipe_up: '向上滑动',
  swipe_down: '向下滑动',
  drag_left: '按住并向左拖动',
  drag_right: '按住并向右拖动',
  drag_up: '按住并向上拖动',
  drag_down: '按住并向下拖动',
  scrub_left: '向左反复擦动',
  scrub_right: '向右反复擦动',
  scrub_up: '向上反复擦动',
  scrub_down: '向下反复擦动',
  continuous_swipe: '持续往复滑动以播放',
  continuous_tap: '持续点击画面以播放',
  continuous_hold: '按住画面以播放',
  pinch: '按指定方向完成双指捏合',
  draw_circle: '在画面上画圆',
  erase: '擦除指定区域',
  tilt_left: '向左倾斜设备',
  tilt_right: '向右倾斜设备',
  tilt_forward: '向前倾斜设备',
  tilt_backward: '向后倾斜设备',
  shake: '摇动设备',
  rotate: '按指定方向旋转设备',
  hold_still: '保持设备静止',
  camera_motion: '在镜头前完成指定动作',
  camera_continuous: '持续完成镜头动作以播放',
  mic_level: '声音达到目标条件',
  mic_blow: '对麦克风吹气',
  mic_clap: '拍手触发互动',
  mic_quiet: '保持环境安静',
  mic_blow_continuous: '持续吹气以播放',
  mic_level_continuous: '持续发声以播放',
}

function gestureEnumLabel(gate: Gate) {
  if (gate.custom_action) return 'CUSTOM_ACTION'
  return String(gate.gesture || 'interaction').toUpperCase()
}

function compactInstruction(gate: Gate) {
  if (gate.custom_action) {
    return gate.action_description || gate.hint || gate.cue || '完成自定义动作'
  }
  if (isPinch(gate)) return pinchDirectionCopy(gate.pinch_direction).hint
  return gate.hint || gate.cue || GESTURE_INSTRUCTION_ZH[gate.gesture || ''] || '完成当前互动'
}

function formatFrameTime(ms: number) {
  const totalSeconds = Math.max(0, ms) / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const millis = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
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
  workspace = false,
  onAddInteractionAt,
  onUpdateGate,
}: Props) {
  const annotate = mode === 'annotate'
  const videoRef = useRef<HTMLVideoElement>(null)
  const clientRuntimeRef = useRef<ClientRuntimePreviewHandle>(null)
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
  const [multiTapProgress, setMultiTapProgress] = useState(0)
  const [timelineZoom, setTimelineZoom] = useState(1)
  const [timelineScrubbing, setTimelineScrubbing] = useState(false)
  const [videoScrubbing, setVideoScrubbing] = useState(false)
  const clientInteractionEnabled = true
  const [clientSimulation, setClientSimulation] = useState<ClientSimulationState | null>(null)
  const [clientSimulationPending, setClientSimulationPending] = useState(false)
  const [timelineDraft, setTimelineDraft] = useState<{
    index: number
    gate_at_ms: number
    gate_end_ms?: number
  } | null>(null)
  const continuousPointerRef = useRef<ContinuousPointerState | null>(null)
  const continuousIdleTimerRef = useRef<number | null>(null)
  const continuousSessionRef = useRef(0)
  const continuousTapRenewalRef = useRef(0)
  const continuousMicrophonePointerRef = useRef<number | null>(null)
  const continuousMicrophoneKeyboardRef = useRef(false)
  const suppressPreviewClickRef = useRef(false)
  const onSelectGateRef = useRef(onSelectGate)
  onSelectGateRef.current = onSelectGate

  const sorted = useMemo(
    () => [...gates].sort((a, b) => a.gate_at_ms - b.gate_at_ms),
    [gates],
  )
  const timelineRows = useMemo(
    () => sorted.map((gate, gateIndex) => (
      timelineDraft?.index === gateIndex
        ? {
            ...gate,
            gate_at_ms: timelineDraft.gate_at_ms,
            ...(timelineDraft.gate_end_ms === undefined
              ? { gate_end_ms: undefined }
              : { gate_end_ms: timelineDraft.gate_end_ms }),
          }
        : gate
    )),
    [sorted, timelineDraft],
  )
  const active = pausedAtGate ? sorted[index] : null
  const activeSustained = pausedAtGate && isSustainedPlaybackInteraction(active)
  const activeContinuousSwipe = activeSustained && isContinuousSwipe(active)
  const activeContinuousTap = activeSustained && isContinuousTap(active)
  const activeContinuousHold = activeSustained && isContinuousHold(active)
  const activeMultiTap = pausedAtGate && isMultiTap(active)
  const activeCameraContinuous = activeSustained && isCameraContinuous(active)
  const activeContinuousBlow = activeSustained && isContinuousBlow(active)
  const activeContinuousVoice = activeSustained && isContinuousVoice(active)
  const activeContinuousMicrophone = activeContinuousBlow || activeContinuousVoice
  const activeCameraCopy = cameraContinuousTargetCopy(active?.vision?.target)
  const activeOverlayInstruction = active
    ? activeSustained
      ? activeCameraContinuous
        ? continuousDriving ? `${activeCameraCopy.detected} · 播放中` : activeCameraCopy.idlePrompt
        : activeContinuousTap
          ? continuousDriving ? '持续点击中 · 播放中' : compactInstruction(active)
          : activeContinuousBlow
            ? continuousDriving ? '吹气识别中 · 播放中' : compactInstruction(active)
            : activeContinuousVoice
              ? continuousDriving ? '发声识别中 · 播放中' : compactInstruction(active)
              : activeContinuousHold
                ? continuousDriving ? '按住播放中 · 松开暂停' : compactInstruction(active)
                : continuousDriving ? '滑动控制中 · 抬手暂停' : compactInstruction(active)
      : activeMultiTap
        ? `点击进度 ${multiTapProgress} / ${Math.min(99, Math.max(1, Math.round(Number(active.tap_count) || 3)))}`
        : compactInstruction(active)
    : ''
  const totalMs =
    mediaDuration || durationMs || (sorted.length ? sorted[sorted.length - 1].gate_at_ms : 1)
  const selectedGateAtMs = selectedIndex == null ? undefined : sorted[selectedIndex]?.gate_at_ms
  const baseMediaUrl = videoUrl || (clipId
    ? `/api/v1/stories/${runId}/clips/${clipId}/video`
    : `/api/v1/runs/${runId}/media/video`)
  const mediaUrl = import.meta.env.DEV && runId === LOCAL_EDITOR_DEMO_RUN_ID
    ? `${baseMediaUrl}${baseMediaUrl.includes('?') ? '&' : '?'}asset=${LOCAL_EDITOR_DEMO_VIDEO_REVISION}`
    : baseMediaUrl

  const handleClientProgress = useCallback((positionMs: number, measuredDurationMs: number, isPlaying: boolean) => {
    setProgress(workspace && !isPlaying ? snapToEditorFrame(positionMs, measuredDurationMs) : positionMs)
    if (measuredDurationMs > 0) setMediaDuration(Math.round(measuredDurationMs))
    setPlaying(isPlaying)
    setMediaLoading(false)
    setStarted(true)
    setEnded(measuredDurationMs > 0 && positionMs >= measuredDurationMs - 40)
    onPlayheadChange?.(Math.round(positionMs))
  }, [onPlayheadChange, workspace])

  const handleClientGateOpened = useCallback((sourceIndex: number) => {
    setIndex(sourceIndex)
    setPausedAtGate(true)
    // Playback may open a gate while the operator is scrubbing. Keep the
    // inspector selection stable; clicking the timeline node selects it explicitly.
  }, [])

  const handleClientError = useCallback((message: string | null) => {
    setMediaError(message)
    if (message) setMediaLoading(false)
  }, [])

  useEffect(() => {
    if (!workspace || selectedIndex == null || selectedGateAtMs == null) return
    if (clientRuntimeRef.current) {
      resetContinuousControl(true)
      setStarted(true)
      setEnded(false)
      setIndex(selectedIndex)
      setPausedAtGate(true)
      setProgress(selectedGateAtMs)
      onPlayheadChange?.(selectedGateAtMs)
      void clientRuntimeRef.current.seek(selectedGateAtMs, selectedIndex)
      return
    }
    const video = videoRef.current
    if (!video) return
    const gate = sorted[selectedIndex]
    if (!gate) return
    resetContinuousControl(true)
    setStarted(true)
    setEnded(false)
    setIndex(selectedIndex)
    setPausedAtGate(true)
    video.currentTime = gate.gate_at_ms / 1000
    setProgress(gate.gate_at_ms)
    onPlayheadChange?.(gate.gate_at_ms)
    // Selecting a row is an explicit editor navigation action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, selectedIndex, selectedGateAtMs])

  useEffect(() => {
    if (!workspace) return
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if ((event.code === 'Space' || event.key === ' ') && !event.repeat) {
        event.preventDefault()
        event.stopPropagation()
        togglePlay()
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const direction = event.key === 'ArrowLeft' ? -1 : 1
        stepBy(direction * (event.shiftKey ? SECOND_MS : EDITOR_FRAME_MS))
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.code !== 'Space' && event.key !== ' ') return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
    }
    // Playback helpers are function declarations bound to the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, progress, playing, activeSustained])

  useEffect(() => {
    setMultiTapProgress(0)
  }, [index, pausedAtGate, active?.gesture])

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
      const displayMs = workspace && video.paused
        ? snapToEditorFrame(ms, totalMs)
        : ms
      setProgress(displayMs)
      onPlayheadChange?.(Math.round(displayMs))
      if (pausedAtGate) {
        if (active && isSustainedPlaybackInteraction(active)) {
          const next = sorted[index + 1]
          const boundary = sustainedPlaybackEndMs(active, next?.gate_at_ms, totalMs)
          if (typeof boundary === 'number' && ms >= boundary) {
            resetContinuousControl(true)
            video.currentTime = boundary / 1000
            setProgress(boundary)
            const handsOffToNext = next && boundary === next.gate_at_ms
            setIndex(index + 1)
            setPausedAtGate(Boolean(handsOffToNext))
            if (handsOffToNext) {
              if (annotate) onSelectGateRef.current?.(index + 1)
            } else if (boundary < totalMs) {
              void requestPlay(video)
            }
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
  }, [active?.gesture, annotate, index, pausedAtGate, ended, started, sorted, totalMs, onPlayheadChange, workspace])

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
    continuousMicrophonePointerRef.current = null
    continuousMicrophoneKeyboardRef.current = false
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

  async function requestContinuousPulsePlay(session: number) {
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
        setMediaError(
          activeCameraContinuous
            ? `视频暂时无法开始播放，${activeCameraCopy.retry}。`
            : activeContinuousBlow
              ? '视频暂时无法开始播放，请再次按住吹气模拟区。'
            : activeContinuousVoice
              ? '视频暂时无法开始播放，请再次按住发声模拟区。'
            : activeContinuousHold
              ? '视频暂时无法开始播放，请再次按住画面。'
            : '视频暂时无法开始播放，请再次点击。',
        )
      }
    }
  }

  function renewContinuousPulse() {
    const video = videoRef.current
    if (!video || (!activeContinuousTap && !activeCameraContinuous)) return
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
    }, activeCameraContinuous
      ? CAMERA_CONTINUOUS_IDLE_TIMEOUT_MS
      : CONTINUOUS_IDLE_TIMEOUT_MS)
    void requestContinuousPulsePlay(session)
  }

  function handleContinuousTapPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.stopPropagation()
    renewContinuousPulse()
  }

  function handleContinuousTapKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    renewContinuousPulse()
  }

  function startContinuousMicrophone(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activeContinuousMicrophone || !event.isPrimary || continuousMicrophonePointerRef.current != null) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    clearContinuousIdleTimer()
    continuousMicrophonePointerRef.current = event.pointerId
    setStarted(true)
    setEnded(false)
    setContinuousDriving(true)
    void requestContinuousPulsePlay(continuousSessionRef.current)
  }

  function stopContinuousMicrophone(event: ReactPointerEvent<HTMLDivElement>) {
    if (continuousMicrophonePointerRef.current !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    continuousMicrophonePointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const session = continuousSessionRef.current
    clearContinuousIdleTimer()
    continuousIdleTimerRef.current = window.setTimeout(() => {
      continuousIdleTimerRef.current = null
      if (continuousSessionRef.current !== session || continuousMicrophonePointerRef.current != null) return
      videoRef.current?.pause()
      setContinuousDriving(false)
    }, CONTINUOUS_MICROPHONE_IDLE_TIMEOUT_MS)
  }

  function handleContinuousMicrophoneKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return
    event.preventDefault()
    event.stopPropagation()
    continuousMicrophoneKeyboardRef.current = true
    clearContinuousIdleTimer()
    setStarted(true)
    setEnded(false)
    setContinuousDriving(true)
    void requestContinuousPulsePlay(continuousSessionRef.current)
  }

  function handleContinuousMicrophoneKeyUp(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.key !== 'Enter' && event.key !== ' ') || !continuousMicrophoneKeyboardRef.current) return
    event.preventDefault()
    event.stopPropagation()
    continuousMicrophoneKeyboardRef.current = false
    const session = continuousSessionRef.current
    clearContinuousIdleTimer()
    continuousIdleTimerRef.current = window.setTimeout(() => {
      continuousIdleTimerRef.current = null
      if (continuousSessionRef.current !== session || continuousMicrophoneKeyboardRef.current) return
      videoRef.current?.pause()
      setContinuousDriving(false)
    }, CONTINUOUS_MICROPHONE_IDLE_TIMEOUT_MS)
  }

  function startContinuousHold(event: ReactPointerEvent<HTMLDivElement>) {
    if (!activeContinuousHold || !event.isPrimary || continuousMicrophonePointerRef.current != null) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    continuousMicrophonePointerRef.current = event.pointerId
    clearContinuousIdleTimer()
    setStarted(true)
    setEnded(false)
    setContinuousDriving(true)
    void requestContinuousPulsePlay(continuousSessionRef.current)
  }

  function stopContinuousHold(event: ReactPointerEvent<HTMLDivElement>) {
    if (continuousMicrophonePointerRef.current !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    continuousMicrophonePointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    videoRef.current?.pause()
    setContinuousDriving(false)
  }

  function handleContinuousHoldKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return
    event.preventDefault()
    event.stopPropagation()
    continuousMicrophoneKeyboardRef.current = true
    setStarted(true)
    setEnded(false)
    setContinuousDriving(true)
    void requestContinuousPulsePlay(continuousSessionRef.current)
  }

  function handleContinuousHoldKeyUp(event: ReactKeyboardEvent<HTMLDivElement>) {
    if ((event.key !== 'Enter' && event.key !== ' ') || !continuousMicrophoneKeyboardRef.current) return
    event.preventDefault()
    event.stopPropagation()
    continuousMicrophoneKeyboardRef.current = false
    videoRef.current?.pause()
    setContinuousDriving(false)
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
    if (activeMultiTap) {
      const required = Math.min(99, Math.max(1, Math.round(Number(active?.tap_count) || 3)))
      const nextCount = multiTapProgress + 1
      setMultiTapProgress(nextCount)
      if (nextCount < required) return
    }
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
      advance()
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
    if (workspace && clientRuntimeRef.current) {
      void clientRuntimeRef.current.togglePlay()
      return
    }
    if (activeSustained) return
    const video = videoRef.current
    // Prefer element state: rapid play/pause can leave React `playing` out of sync.
    if (video && !video.paused) pausePlay()
    else resumePlay()
  }

  function handlePreviewClick(event?: MouseEvent<HTMLElement>) {
    if (suppressPreviewClickRef.current) {
      suppressPreviewClickRef.current = false
      event?.preventDefault()
      event?.stopPropagation()
      return
    }
    togglePlay()
  }

  function seekToMs(ms: number, { play = true }: { play?: boolean } = {}) {
    if (totalMs <= 0) return
    const clamped = Math.max(0, Math.min(ms, totalMs))
    const continuousIndex = sorted.findIndex((gate, gateIndex) => {
      if (!isSustainedPlaybackInteraction(gate)) return false
      const end = sustainedPlaybackEndMs(
        gate,
        sorted[gateIndex + 1]?.gate_at_ms,
        totalMs,
      ) ?? totalMs
      return clamped >= gate.gate_at_ms && clamped < end
    })
    const nextIndex = sorted.findIndex((gate) => gate.gate_at_ms > clamped + 1)
    setStarted(true)
    setEnded(clamped >= totalMs - 40)
    setPausedAtGate(continuousIndex >= 0)
    setIndex(continuousIndex >= 0 ? continuousIndex : (nextIndex === -1 ? sorted.length : nextIndex))
    setProgress(clamped)
    onPlayheadChange?.(Math.round(clamped))
    if (workspace && clientRuntimeRef.current) {
      setPlaying(false)
      void clientRuntimeRef.current.seek(clamped)
      return
    }
    const video = videoRef.current
    if (!video) return
    video.currentTime = clamped / 1000
    if (continuousIndex >= 0) video.pause()
    else if (play && clamped < totalMs - 40) void requestPlay(video)
    else video.pause()
  }

  function previewPositionAtMs(ms: number) {
    const clamped = Math.max(0, Math.min(ms, totalMs))
    setProgress(clamped)
    setPlaying(false)
    onPlayheadChange?.(Math.round(clamped))
    if (workspace && clientRuntimeRef.current) {
      clientRuntimeRef.current.previewPosition(clamped)
      return
    }
    seekToMs(clamped, { play: false })
  }

  function selectGate(gateIndex: number) {
    const gate = sorted[gateIndex]
    if (!gate) return
    setStarted(true)
    setEnded(false)
    setIndex(gateIndex)
    setPausedAtGate(true)
    resetContinuousControl(true)
    if (workspace && clientRuntimeRef.current) {
      setPlaying(false)
      setProgress(gate.gate_at_ms)
      onPlayheadChange?.(gate.gate_at_ms)
      if (annotate) onSelectGate?.(gateIndex)
      if (selectedIndex === gateIndex) {
        void clientRuntimeRef.current.seek(gate.gate_at_ms, gateIndex)
      }
      return
    }
    const video = videoRef.current
    if (!video) return
    video.pause()
    video.currentTime = gate.gate_at_ms / 1000
    setProgress(gate.gate_at_ms)
    onPlayheadChange?.(gate.gate_at_ms)
    if (annotate) onSelectGate?.(gateIndex)
  }

  function seekToGate(gateIndex: number, event: MouseEvent) {
    event.stopPropagation()
    selectGate(gateIndex)
  }

  function timelineMsFromClient(clientX: number, rail: HTMLElement) {
    const rect = rail.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(rect.width, 1)))
    return ratio * totalMs
  }

  function snapTimelineMs(
    rawMs: number,
    rail: HTMLElement,
    gateIndex: number,
    disableSnap: boolean,
  ) {
    const clamped = Math.max(0, Math.min(totalMs, rawMs))
    if (disableSnap) return Math.round(clamped)
    const threshold = (totalMs / Math.max(rail.getBoundingClientRect().width, 1)) * 7
    const candidates = [0, totalMs, progress]
    timelineRows.forEach((gate, index) => {
      if (index !== gateIndex) candidates.push(gate.gate_at_ms)
      if (index !== gateIndex && typeof gate.gate_end_ms === 'number') {
        candidates.push(gate.gate_end_ms)
      }
    })
    const nearest = candidates.reduce((best, candidate) => (
      Math.abs(candidate - clamped) < Math.abs(best - clamped) ? candidate : best
    ), candidates[0] ?? clamped)
    if (Math.abs(nearest - clamped) <= threshold) return Math.round(nearest)
    return snapToEditorFrame(clamped, totalMs)
  }

  function beginGateDrag(
    event: ReactPointerEvent<HTMLElement>,
    gateIndex: number,
    kind: 'start' | 'end' | 'body',
  ) {
    if (!workspace || !onUpdateGate || event.button !== 0) return
    const rail = event.currentTarget.closest('.preview-rail') as HTMLElement | null
    const gate = timelineRows[gateIndex]
    if (!rail || !gate) return
    event.preventDefault()
    event.stopPropagation()
    if (annotate) onSelectGate?.(gateIndex)

    const sustained = isSustainedPlaybackInteraction(gate)
    if (kind === 'end' && !sustained) return
    const minimumSpan = sustained ? 1 : 0
    const automaticEnd = sustainedPlaybackEndMs(
      gate,
      timelineRows[gateIndex + 1]?.gate_at_ms,
      totalMs,
    ) ?? totalMs
    const originalStart = gate.gate_at_ms
    const originalExplicitEnd = gate.gate_end_ms
    const visualEnd = originalExplicitEnd ?? automaticEnd
    const pointerStartMs = timelineMsFromClient(event.clientX, rail)

    setTimelineDraft({
      index: gateIndex,
      gate_at_ms: originalStart,
      ...(originalExplicitEnd === undefined ? {} : { gate_end_ms: originalExplicitEnd }),
    })

    let finalStart = originalStart
    let finalEnd = originalExplicitEnd

    const onMove = (moveEvent: PointerEvent) => {
      const pointerMs = snapTimelineMs(
        timelineMsFromClient(moveEvent.clientX, rail),
        rail,
        gateIndex,
        moveEvent.altKey,
      )
      if (kind === 'start') {
        const maximum = (originalExplicitEnd ?? visualEnd) - minimumSpan
        finalStart = Math.max(0, Math.min(maximum, pointerMs))
        finalEnd = originalExplicitEnd
      } else if (kind === 'end') {
        finalStart = originalStart
        finalEnd = Math.max(originalStart + minimumSpan, Math.min(totalMs, pointerMs))
      } else {
        const delta = pointerMs - pointerStartMs
        const span = originalExplicitEnd == null ? 0 : originalExplicitEnd - originalStart
        finalStart = Math.max(0, Math.min(totalMs - span, originalStart + delta))
        finalEnd = originalExplicitEnd == null ? undefined : finalStart + span
      }
      setTimelineDraft({
        index: gateIndex,
        gate_at_ms: Math.round(finalStart),
        ...(finalEnd === undefined ? {} : { gate_end_ms: Math.round(finalEnd) }),
      })
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const conflicts = sorted.some((candidate, index) => (
        index !== gateIndex && candidate.gate_at_ms === Math.round(finalStart)
      ))
      setTimelineDraft(null)
      if (conflicts) return
      onUpdateGate(gateIndex, {
        gate_at_ms: Math.round(finalStart),
        ...(kind === 'end' || originalExplicitEnd !== undefined
          ? { gate_end_ms: finalEnd == null ? null : Math.round(finalEnd) }
          : {}),
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function onRailPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.stopPropagation()
    event.preventDefault()
    const rail = event.currentTarget
    const seekFromClient = (clientX: number, commit: boolean) => {
      const raw = timelineMsFromClient(clientX, rail)
      const target = workspace ? snapToEditorFrame(raw, totalMs) : raw
      if (!commit) {
        previewPositionAtMs(target)
        return
      }
      const gateIndex = sorted.findIndex((gate) => (
        Math.round(gate.gate_at_ms / EDITOR_FRAME_MS)
          === Math.round(target / EDITOR_FRAME_MS)
      ))
      if (gateIndex >= 0) selectGate(gateIndex)
      else seekToMs(target, { play: false })
    }
    setTimelineScrubbing(true)
    seekFromClient(event.clientX, false)

    const onMove = (moveEvent: PointerEvent) => {
      seekFromClient(moveEvent.clientX, false)
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      setTimelineScrubbing(false)
    }
    const onUp = (upEvent: PointerEvent) => {
      seekFromClient(upEvent.clientX, true)
      cleanup()
    }
    const onCancel = () => cleanup()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  function beginVideoScrub(event: ReactPointerEvent<HTMLDivElement>) {
    if (!workspace || (activeSustained && clientInteractionEnabled) || event.button !== 0 || totalMs <= 0) return
    const target = event.target as HTMLElement
    if (target.closest('button, .preview-gate, .preview-media-status')) return
    event.preventDefault()
    event.stopPropagation()
    const surface = event.currentTarget
    surface.setPointerCapture(event.pointerId)

    const startX = event.clientX
    const startMs = progress
    let moved = false
    let finalMs = startMs

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      if (!moved && Math.abs(deltaX) < 4) return
      moveEvent.preventDefault()
      moveEvent.stopPropagation()
      moved = true
      suppressPreviewClickRef.current = true
      setVideoScrubbing(true)
      setTimelineScrubbing(true)
      const frameDelta = Math.round(deltaX / 3) * EDITOR_FRAME_MS
      finalMs = snapToEditorFrame(startMs + frameDelta, totalMs)
      previewPositionAtMs(finalMs)
    }

    const cleanup = (pointerId: number, cancelled = false) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      if (surface.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId)
      setVideoScrubbing(false)
      setTimelineScrubbing(false)
      if (cancelled) suppressPreviewClickRef.current = false
      else if (moved) {
        window.setTimeout(() => {
          suppressPreviewClickRef.current = false
        }, 0)
      }
    }
    const onUp = (upEvent: PointerEvent) => {
      upEvent.preventDefault()
      upEvent.stopPropagation()
      if (moved) seekToMs(finalMs, { play: false })
      cleanup(upEvent.pointerId)
    }
    const onCancel = (cancelEvent: PointerEvent) => cleanup(cancelEvent.pointerId, true)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
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
    <div className={`preview-wrap${workspace ? ' preview-wrap-workspace' : ''}`}>
      <div
        className="preview-stage"
        onClick={workspace ? undefined : handlePreviewClick}
        role={workspace ? undefined : 'button'}
        tabIndex={workspace ? undefined : 0}
      >
        <div
          className={`preview-phone${videoScrubbing ? ' is-frame-scrubbing' : ''}`}
          onPointerDown={workspace && clientInteractionEnabled ? undefined : beginVideoScrub}
        >
          {workspace ? (
            <ClientRuntimePreview
              ref={clientRuntimeRef}
              runId={runId}
              clipId={clipId}
              mediaUrl={mediaUrl}
              durationMs={durationMs}
              gates={sorted}
              selectedSourceIndex={selectedIndex}
              interactionEnabled={clientInteractionEnabled}
              scrubbing={timelineScrubbing || videoScrubbing}
              onProgress={handleClientProgress}
              onGateOpened={handleClientGateOpened}
              onSimulationChange={setClientSimulation}
              onError={handleClientError}
            />
          ) : (
          <>
          <video
            ref={videoRef}
            className="preview-video"
            src={mediaUrl}
            key={clipId || 'default'}
            playsInline
            preload="metadata"
            controls={false}
            controlsList="nodownload noplaybackrate noremoteplayback"
            disablePictureInPicture
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
          />
          {videoScrubbing ? (
            <div className="preview-video-scrub-time" aria-live="polite">
              {formatFrameTime(progress)}
            </div>
          ) : null}
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
              className={`preview-continuous-surface${continuousDriving ? ' is-driving' : ''}${activeContinuousTap ? ' is-tap' : ''}${activeCameraContinuous ? ' is-camera' : ''}`}
              role={activeContinuousTap || activeContinuousHold || activeCameraContinuous || activeContinuousMicrophone ? 'button' : 'application'}
              tabIndex={activeContinuousTap || activeContinuousHold || activeCameraContinuous || activeContinuousMicrophone ? 0 : undefined}
              aria-label={
                activeCameraContinuous
                  ? activeCameraCopy.ariaLabel
                  : activeContinuousBlow
                  ? '按住画面模拟持续吹动，松开 450 毫秒后暂停'
                  : activeContinuousVoice
                  ? '按住画面模拟持续发声，松开 450 毫秒后暂停'
                  : activeContinuousTap
                  ? '在画面任意位置持续点击以播放，停止点击 500 毫秒后暂停'
                  : activeContinuousHold
                  ? '按住画面时播放，松开立即暂停'
                  : '在画面任意位置持续往复滑动以播放'
              }
              onClick={(event) => event.stopPropagation()}
              onKeyDown={activeContinuousHold
                ? handleContinuousHoldKeyDown
                : activeContinuousMicrophone
                ? handleContinuousMicrophoneKeyDown
                : (activeContinuousTap || activeCameraContinuous
                  ? handleContinuousTapKeyDown
                  : undefined)}
              onKeyUp={activeContinuousHold
                ? handleContinuousHoldKeyUp
                : activeContinuousMicrophone ? handleContinuousMicrophoneKeyUp : undefined}
              onPointerDown={
                activeContinuousHold
                  ? startContinuousHold
                  : activeContinuousMicrophone
                  ? startContinuousMicrophone
                  : activeContinuousTap || activeCameraContinuous
                  ? handleContinuousTapPointerDown
                  : handleContinuousPointerDown
              }
              onPointerMove={activeContinuousSwipe ? handleContinuousPointerMove : undefined}
              onPointerUp={activeContinuousHold
                ? stopContinuousHold
                : activeContinuousMicrophone
                ? stopContinuousMicrophone
                : (activeContinuousSwipe ? handleContinuousPointerEnd : undefined)}
              onPointerCancel={activeContinuousHold
                ? stopContinuousHold
                : activeContinuousMicrophone
                ? stopContinuousMicrophone
                : (activeContinuousSwipe ? handleContinuousPointerEnd : undefined)}
            >
              <div className="preview-continuous-indicator" aria-hidden="true">
                <span key={activeContinuousTap || activeCameraContinuous ? continuousTapPulse : undefined}>
                  {activeCameraContinuous
                    ? '✦'
                    : activeContinuousBlow
                      ? '≈'
                      : activeContinuousVoice
                        ? '◉'
                      : activeContinuousHold
                        ? '●'
                      : activeContinuousTap ? '●' : '↔'}
                </span>
              </div>
              <div className="preview-gate preview-gate-continuous">
                <span className="preview-gate-index">{String(index + 1).padStart(2, '0')}</span>
                <div className="preview-gate-body">
                  <strong className="preview-gate-enum">{gestureEnumLabel(active)}</strong>
                  <small className="preview-gate-description">{activeOverlayInstruction}</small>
                  {activeCameraContinuous ? (
                    <Button
                      type="primary"
                      size="small"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        renewContinuousPulse()
                      }}
                    >
                      {activeCameraCopy.simulate}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div
                className={`preview-overlay${playing ? ' preview-overlay-playing' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  handlePreviewClick(e)
                }}
              >
                <button
                  type="button"
                  className="preview-transport-btn"
                  aria-label={playing ? '暂停' : '播放'}
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePreviewClick(e)
                  }}
                >
                  {playing ? <PauseCircleFilled /> : <PlayCircleFilled />}
                </button>
              </div>
              {pausedAtGate && active ? (
                <div className="preview-gate" onClick={(e) => e.stopPropagation()}>
                  <span className="preview-gate-index">{String(index + 1).padStart(2, '0')}</span>
                  <div className="preview-gate-body">
                    <strong className="preview-gate-enum">{gestureEnumLabel(active)}</strong>
                    <small className="preview-gate-description">{activeOverlayInstruction}</small>
                  </div>
                  <Button type="primary" size="small" onClick={advance}>
                    {activeMultiTap
                      ? `点击 (${multiTapProgress}/${Math.min(99, Math.max(1, Math.round(Number(active.tap_count) || 3)))})`
                      : isPinch(active) ? `模拟${pinchDirectionCopy(active.pinch_direction).hint}` : '继续'}
                  </Button>
                </div>
              ) : null}
            </>
          )}
          </>
          )}
          {workspace && videoScrubbing ? (
            <div className="preview-video-scrub-time" aria-live="polite">
              {formatFrameTime(progress)}
            </div>
          ) : null}
          {workspace && mediaError ? (
            <div className="preview-media-status is-error" role="alert">
              <strong>客户端预览暂时不可用</strong>
              <span>{mediaError}</span>
              <Button size="small" onClick={() => {
                setMediaError(null)
                void clientRuntimeRef.current?.seek(progress, selectedIndex ?? undefined)
              }}>
                重新加载
              </Button>
            </div>
          ) : null}
        </div>
        {workspace && clientInteractionEnabled && clientSimulation ? (
          <aside
            className={`client-simulation-card${clientSimulation.status === 'running' ? ' is-running' : ''}`}
            aria-live="polite"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="client-simulation-kicker">
              <span className="client-simulation-indicator" aria-hidden="true" />
              桌面端模拟
            </span>
            <strong>
              {clientSimulation.status === 'running' ? '正在模拟持续触发' : '当前电脑无法真实触发'}
            </strong>
            <small>
              {clientSimulation.status === 'running'
                ? '将按真实互动区间继续播放'
                : '客户端引导已按真实效果显示'}
            </small>
            <button
              type="button"
              disabled={clientSimulationPending || clientSimulation.status === 'running'}
              onClick={async () => {
                setClientSimulationPending(true)
                const simulated = await clientRuntimeRef.current?.simulateInteraction()
                if (!simulated) setClientSimulationPending(false)
                else if (clientSimulation.status !== 'running') setClientSimulationPending(false)
              }}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M7 4.8v10.4l8-5.2-8-5.2Z" />
              </svg>
              {clientSimulationPending ? '正在触发…' : '点击模拟触发'}
            </button>
          </aside>
        ) : null}
        {annotate && !workspace ? (
          <div
            className="preview-annotate-bar"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Button size="small" onClick={() => stepBy(-SECOND_MS)}>
              -1s
            </Button>
            {!workspace ? (
              <Button size="small" onClick={() => stepBy(-EDITOR_FRAME_MS)}>-1帧</Button>
            ) : null}
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
            {!workspace ? (
              <Button size="small" onClick={() => stepBy(EDITOR_FRAME_MS)}>+1帧</Button>
            ) : null}
            <Button size="small" onClick={() => stepBy(SECOND_MS)}>
              +1s
            </Button>
            {onAddAtPlayhead ? (
              <Button size="small" type="primary" onClick={onAddAtPlayhead}>
                在当前时刻加点
              </Button>
            ) : null}
            <span className="preview-annotate-time">{(progress / 1000).toFixed(2)}s</span>
            {workspace ? (
              <span className="preview-frame-hint" title="拖动画面或方向键逐帧，Shift + 方向键跳转 1 秒">
                拖动画面 / ←→ 逐帧
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {workspace ? (
        <div className="preview-timeline preview-timeline-workspace" onClick={(e) => e.stopPropagation()}>
          <div className="editor-timeline-toolbar">
            <div>
              <strong>时间轴</strong>
              <span>单击定位 · 拖动时间轴或画面逐帧</span>
            </div>
            <div className="editor-timeline-zoom">
              <span>适应</span>
              <input
                type="range"
                aria-label="时间轴缩放"
                min={1}
                max={4}
                step={0.25}
                value={timelineZoom}
                onChange={(event) => setTimelineZoom(Number(event.target.value))}
              />
              <span>{Math.round(timelineZoom * 100)}%</span>
            </div>
          </div>
          <div className="editor-timeline-scroll">
            <div className="editor-timeline-canvas" style={{ width: `${timelineZoom * 100}%` }}>
              <div
                className={`editor-time-ruler${timelineScrubbing ? ' is-scrubbing' : ''}`}
                onPointerDown={onRailPointerDown}
                role="slider"
                tabIndex={0}
                aria-label="时间刻度，点击定位，按住并左右拖动逐帧预览"
                aria-valuemin={0}
                aria-valuemax={totalMs}
                aria-valuenow={Math.round(progress)}
              >
                {Array.from({ length: Math.max(10, Math.ceil(timelineZoom * 10)) + 1 }, (_, tick) => {
                  const count = Math.max(10, Math.ceil(timelineZoom * 10))
                  const tickMs = totalMs * (tick / count)
                  return (
                    <span key={tick} style={{ left: `${(tick / count) * 100}%` }}>
                      {(tickMs / 1000).toFixed(timelineZoom >= 2 ? 1 : 0)}s
                    </span>
                  )
                })}
              </div>
              <div className="editor-video-track">
                <span className="editor-track-label">视频</span>
                <div className="editor-video-clip">
                  <span>{clipId ? '当前片段' : '主视频'}</span>
                  <small>{(totalMs / 1000).toFixed(2)}s</small>
                </div>
              </div>
              <div
                className={`preview-rail editor-interaction-track${timelineScrubbing ? ' is-scrubbing' : ''}`}
                onPointerDown={onRailPointerDown}
                onDragOver={(event) => {
                  if (!onAddInteractionAt) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'copy'
                }}
                onDrop={(event) => {
                  if (!onAddInteractionAt) return
                  event.preventDefault()
                  event.stopPropagation()
                  const gestureValue = event.dataTransfer.getData('application/x-pixo-interaction')
                    || event.dataTransfer.getData('text/plain')
                  if (!gestureValue) return
                  const raw = timelineMsFromClient(event.clientX, event.currentTarget)
                  onAddInteractionAt(
                    gestureValue,
                    snapTimelineMs(raw, event.currentTarget, -1, event.altKey),
                  )
                }}
                role="slider"
                aria-label="互动时间轴与播放进度"
                aria-valuemin={0}
                aria-valuemax={totalMs}
                aria-valuenow={Math.round(progress)}
              >
                <span className="editor-track-label">互动</span>
                <div
                  className="editor-playhead"
                  style={{ left: `${Math.min(100, (progress / Math.max(totalMs, 1)) * 100)}%` }}
                  aria-hidden="true"
                >
                  {timelineScrubbing ? (
                    <span className="editor-playhead-time">{formatFrameTime(progress)}</span>
                  ) : null}
                </div>
                {timelineRows.map((gate, gateIndex) => {
                  const sustained = isSustainedPlaybackInteraction(gate)
                  if (!sustained) return null
                  const effectiveEnd = sustainedPlaybackEndMs(
                    gate,
                    timelineRows[gateIndex + 1]?.gate_at_ms,
                    totalMs,
                  ) ?? totalMs
                  if (typeof effectiveEnd !== 'number' || effectiveEnd <= gate.gate_at_ms) return null
                  const left = (gate.gate_at_ms / Math.max(totalMs, 1)) * 100
                  const right = (Math.min(totalMs, effectiveEnd) / Math.max(totalMs, 1)) * 100
                  const selected = selectedIndex === gateIndex
                  const automatic = sustained && typeof gate.gate_end_ms !== 'number'
                  return (
                    <div
                      key={`editor-range-${gate.gate_at_ms}-${gateIndex}`}
                      className={`editor-interaction-range is-sustained${automatic ? ' is-automatic' : ''}${selected ? ' is-selected' : ''}`}
                      style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
                      title={`${actionLabel(gate)} · ${(gate.gate_at_ms / 1000).toFixed(3)}s → ${(effectiveEnd / 1000).toFixed(3)}s`}
                      onPointerDown={(event) => beginGateDrag(event, gateIndex, 'body')}
                      onClick={(event) => {
                        event.stopPropagation()
                        selectGate(gateIndex)
                      }}
                    >
                      <span>{actionLabel(gate)}</span>
                      {automatic ? <small>自动</small> : null}
                      {selected ? (
                        <>
                          <button
                            type="button"
                            className="editor-range-handle is-start"
                            aria-label="拖动互动开始时间"
                            onPointerDown={(event) => beginGateDrag(event, gateIndex, 'start')}
                          />
                          <button
                            type="button"
                            className="editor-range-handle is-end"
                            aria-label="拖动互动结束时间"
                            onPointerDown={(event) => beginGateDrag(event, gateIndex, 'end')}
                          />
                        </>
                      ) : null}
                    </div>
                  )
                })}
                {timelineRows.map((gate, gateIndex) => {
                  if (!isSustainedPlaybackInteraction(gate)) return null
                  const effectiveEnd = sustainedPlaybackEndMs(
                    gate,
                    timelineRows[gateIndex + 1]?.gate_at_ms,
                    totalMs,
                  ) ?? totalMs
                  if (typeof gate.gate_end_ms !== 'number' || gate.gate_end_ms <= effectiveEnd) return null
                  const left = (effectiveEnd / Math.max(totalMs, 1)) * 100
                  const right = (Math.min(totalMs, gate.gate_end_ms) / Math.max(totalMs, 1)) * 100
                  if (right <= left) return null
                  return (
                    <div
                      key={`editor-overflow-${gate.gate_at_ms}-${gateIndex}`}
                      className="editor-interaction-overflow"
                      style={{ left: `${left}%`, width: `${right - left}%` }}
                      title={`期望结束 ${(gate.gate_end_ms / 1000).toFixed(3)}s，实际在 ${(effectiveEnd / 1000).toFixed(3)}s 截断`}
                    >
                      <span>已截断</span>
                    </div>
                  )
                })}
                {timelineRows.map((gate, gateIndex) => {
                  const left = `${Math.min(100, (gate.gate_at_ms / Math.max(totalMs, 1)) * 100)}%`
                  const state = nodeState(gateIndex)
                  return (
                    <span
                      key={`editor-node-${gate.gate_at_ms}-${gateIndex}`}
                      className="editor-node-anchor"
                      style={{ left }}
                    >
                      <button
                        type="button"
                        className={`preview-node editor-interaction-node preview-node-${state}`}
                        title={`${actionLabel(gate)} · ${(gate.gate_at_ms / 1000).toFixed(3)}s`}
                        onPointerDown={(event) => beginGateDrag(event, gateIndex, 'start')}
                        onClick={(event) => seekToGate(gateIndex, event)}
                      >
                        <span>{String(gateIndex + 1).padStart(2, '0')}</span>
                      </button>
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="editor-timeline-legend">
            <span><i className="is-sustained" />持续区间</span>
            <span><i className="is-overflow" />超出但不生效</span>
            <span>拖动时按 Alt 关闭吸附</span>
          </div>
        </div>
      ) : (
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
            const endMs = sustainedPlaybackEndMs(
              gate,
              sorted[gateIndex + 1]?.gate_at_ms,
              totalMs,
            ) ?? totalMs
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
      )}
    </div>
  )
}
