import { PauseCircleFilled, PlayCircleFilled } from '@ant-design/icons'
import { Button } from 'antd'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'

type Gate = {
  gate_at_ms: number
  gesture?: string
  hint?: string
  cue?: string
  custom_action?: boolean
  action_description?: string
}

type Props = {
  runId: string
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

export const GESTURE_LABEL: Record<string, string> = {
  tap: '点击',
  double_tap: '双击',
  hold: '长按',
  swipe_left: '左滑',
  swipe_right: '右滑',
  swipe_up: '上滑',
  swipe_down: '下滑',
  drag_left: '左拖',
  drag_right: '右拖',
  drag_up: '上拖',
  drag_down: '下拖',
  camera_motion: '镜头动作',
  tilt_left: '左倾',
  tilt_right: '右倾',
  shake: '摇一摇',
  mic_level: '出声',
  mic_blow: '吹气',
  mic_clap: '拍手',
  mic_quiet: '安静',
  rapid_tap: '连点',
  erase: '擦除',
  hold_charge: '蓄力',
  pinch: '捏合',
  draw_circle: '画圈',
  hold_still: '静止',
  rotate: '转动',
  scrub_left: '左推进',
  scrub_right: '右推进',
  scrub_up: '上推进',
  scrub_down: '下推进',
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
  const onSelectGateRef = useRef(onSelectGate)
  onSelectGateRef.current = onSelectGate

  const sorted = useMemo(
    () => [...gates].sort((a, b) => a.gate_at_ms - b.gate_at_ms),
    [gates],
  )
  const active = pausedAtGate ? sorted[index] : null
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
    // Only reset when the media identity changes; durationMs is seed for the new clip.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: clip/run identity
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
      if (pausedAtGate || ended || !started) return
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
  }, [annotate, index, pausedAtGate, ended, started, sorted, totalMs, onPlayheadChange])

  function start() {
    const video = videoRef.current
    if (!video) return
    setStarted(true)
    setEnded(false)
    setPausedAtGate(false)
    setIndex(0)
    setProgress(0)
    video.currentTime = 0
    void video.play()
  }

  function advance() {
    const video = videoRef.current
    if (!video) return
    if (!started || ended) {
      start()
      return
    }
    if (!pausedAtGate) return
    setPausedAtGate(false)
    setIndex((value) => value + 1)
    void video.play()
  }

  function resumePlay() {
    const video = videoRef.current
    if (!video) return
    if (ended) {
      start()
      return
    }
    if (pausedAtGate) {
      setPausedAtGate(false)
      setIndex((value) => value + 1)
      setStarted(true)
      void video.play()
      return
    }
    setStarted(true)
    setEnded(false)
    void video.play()
  }

  function pausePlay() {
    videoRef.current?.pause()
  }

  function togglePlay() {
    const video = videoRef.current
    // Prefer element state: rapid play/pause can leave React `playing` out of sync.
    if (video && !video.paused) pausePlay()
    else resumePlay()
  }

  function seekToMs(ms: number, { play = true }: { play?: boolean } = {}) {
    const video = videoRef.current
    if (!video || totalMs <= 0) return
    const clamped = Math.max(0, Math.min(ms, totalMs))
    const nextIndex = sorted.findIndex((gate) => gate.gate_at_ms > clamped + 1)
    setStarted(true)
    setEnded(clamped >= totalMs - 40)
    setPausedAtGate(false)
    setIndex(nextIndex === -1 ? sorted.length : nextIndex)
    video.currentTime = clamped / 1000
    setProgress(clamped)
    onPlayheadChange?.(Math.round(clamped))
    if (play && clamped < totalMs - 40) void video.play()
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
              clipId
                ? `/api/v1/stories/${runId}/clips/${clipId}/video`
                : `/api/v1/runs/${runId}/media/video`
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
            <Button size="small" type="primary" onClick={() => onAddAtPlayhead?.()}>
              在当前时刻加点
            </Button>
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
