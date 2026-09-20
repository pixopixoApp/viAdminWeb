import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Gate } from '../../types/interaction'

type RuntimeWindow = Window & typeof globalThis & {
  PixoAdminPreview?: {
    loadDraft: (
      draft: ClientPreviewDraft,
      options?: {
        fromPlayhead?: boolean
        seekMs?: number
        selectedSourceIndex?: number
      },
    ) => Promise<unknown>
    seekPosition?: (positionMs: number, selectedSourceIndex?: number) => Promise<unknown>
    previewPosition?: (positionMs: number) => number
    toggleTransport?: () => Promise<boolean>
    simulateActiveInteraction?: () => Promise<{
      status?: 'disabled' | 'unavailable' | 'resolved' | 'driving'
      cueId?: string
    }>
  }
}

type PreviewGate = Gate & {
  sourceIndex: number
  pause_video?: boolean
  rotation_direction?: 'clockwise' | 'counterclockwise'
}

type ClientPreviewDraft = {
  itemId: string
  title: string
  mediaUrl: string
  durationMs?: number
  gates: PreviewGate[]
}

export type ClientRuntimePreviewHandle = {
  seek: (ms: number, selectedSourceIndex?: number) => Promise<void>
  previewPosition: (ms: number) => void
  togglePlay: () => Promise<void>
  simulateInteraction: () => Promise<boolean>
}

export type ClientSimulationState = {
  cueId: string
  interactionType: string
  status: 'available' | 'running'
}

type Props = {
  runId: string
  clipId?: string
  mediaUrl: string
  durationMs?: number
  gates: Gate[]
  selectedSourceIndex?: number | null
  interactionEnabled: boolean
  scrubbing: boolean
  onProgress: (positionMs: number, durationMs: number, playing: boolean) => void
  onGateOpened: (sourceIndex: number) => void
  onSimulationChange: (state: ClientSimulationState | null) => void
  onError: (message: string | null) => void
}

function runtimeWindow(frame: HTMLIFrameElement | null) {
  return frame?.contentWindow as RuntimeWindow | null
}

function visionSignature(gates: Gate[]) {
  return JSON.stringify(gates.flatMap((gate) => (
    gate.gesture === 'camera_motion' || gate.gesture === 'camera_continuous'
      ? [[gate.gesture, gate.vision?.target || '', gate.vision?.camera_facing || 'front']]
      : []
  )))
}

const ClientRuntimePreview = forwardRef<ClientRuntimePreviewHandle, Props>(
  function ClientRuntimePreview({
    runId,
    clipId,
    mediaUrl,
    durationMs,
    gates,
    selectedSourceIndex,
    interactionEnabled,
    scrubbing,
    onProgress,
    onGateOpened,
    onSimulationChange,
    onError,
  }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const scrubVideoRef = useRef<HTMLVideoElement>(null)
    const instanceId = useRef(
      `admin-${runId}-${clipId || 'main'}-${crypto.randomUUID()}`.replace(/[^a-zA-Z0-9-]/g, '-'),
    )
    const [sourceRevision, setSourceRevision] = useState(0)
    const [mounted, setMounted] = useState(false)
    const [frameReadyVersion, setFrameReadyVersion] = useState(0)
    const [preflight, setPreflight] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
    const lastPositionRef = useRef(0)
    const seekingRef = useRef(false)
    const authoringSeekInFlightRef = useRef(false)
    const pendingSeekRef = useRef<Promise<void>>(Promise.resolve())
    const seekGenerationRef = useRef(0)
    const previousVisionSignatureRef = useRef(visionSignature(gates))
    const scrubbingRef = useRef(scrubbing)
    const scrubPositionRef = useRef(0)
    scrubbingRef.current = scrubbing

    const draftSignature = JSON.stringify({
      itemId: `${runId}:${clipId || 'main'}`,
      title: '客户端真实效果预览',
      mediaUrl,
      durationMs,
      gates: gates.map((gate, sourceIndex) => ({ ...gate, sourceIndex })),
    })
    const draft = useMemo<ClientPreviewDraft>(
      () => JSON.parse(draftSignature) as ClientPreviewDraft,
      [draftSignature],
    )
    const draftRef = useRef(draft)
    draftRef.current = draft

    const storageKey = `pixo-admin:draft:${instanceId.current}`
    const frameSource = mounted
      ? `/player/client-runtime/index.html?experience=${encodeURIComponent(instanceId.current)}&revision=${sourceRevision}`
      : undefined

    async function loadAt(ms: number, selectedSourceIndex?: number) {
      const controller = runtimeWindow(iframeRef.current)?.PixoAdminPreview
      if (!controller?.seekPosition) return
      lastPositionRef.current = ms
      seekingRef.current = true
      authoringSeekInFlightRef.current = true
      const generation = ++seekGenerationRef.current
      const operation = pendingSeekRef.current.catch(() => undefined).then(async () => {
        if (generation !== seekGenerationRef.current) return
        try {
          onError(null)
          await controller.seekPosition(ms, selectedSourceIndex)
        } catch (error) {
          authoringSeekInFlightRef.current = false
          onError(error instanceof Error ? error.message : '客户端预览加载失败。')
        } finally {
          if (generation === seekGenerationRef.current) {
            seekingRef.current = false
          }
        }
      })
      pendingSeekRef.current = operation
      await operation
    }

    async function reloadAt(ms: number, selectedSourceIndex?: number) {
      const controller = runtimeWindow(iframeRef.current)?.PixoAdminPreview
      if (!controller) return
      lastPositionRef.current = ms
      seekingRef.current = true
      authoringSeekInFlightRef.current = true
      const generation = ++seekGenerationRef.current
      const operation = pendingSeekRef.current.catch(() => undefined).then(async () => {
        if (generation !== seekGenerationRef.current) return
        try {
          onError(null)
          await controller.loadDraft(draftRef.current, {
            seekMs: ms,
            ...(selectedSourceIndex == null ? {} : { selectedSourceIndex }),
          })
        } catch (error) {
          authoringSeekInFlightRef.current = false
          onError(error instanceof Error ? error.message : '客户端预览加载失败。')
        } finally {
          if (generation === seekGenerationRef.current) {
            seekingRef.current = false
          }
        }
      })
      pendingSeekRef.current = operation
      await operation
    }

    useImperativeHandle(ref, () => ({
      seek: loadAt,
      previewPosition(ms: number) {
        const frameWindow = runtimeWindow(iframeRef.current)
        const video = frameWindow?.document.getElementById('experience-video') as HTMLVideoElement | null
        if (!video) return
        video.pause()
        const maximum = Number.isFinite(video.duration) ? video.duration * 1000 : Infinity
        const clamped = Math.max(0, Math.min(ms, maximum))
        scrubPositionRef.current = clamped
        const scrubVideo = scrubVideoRef.current
        if (scrubVideo) {
          scrubVideo.pause()
          try {
            scrubVideo.currentTime = clamped / 1000
          } catch {
            // Metadata may still be loading; onLoadedMetadata applies the latest scrub position.
          }
        }
        // Scrubbing is rendered by the dedicated video above the Runtime. Moving the
        // Runtime media itself would cross and activate real interaction points.
        lastPositionRef.current = clamped
      },
      async togglePlay() {
        await pendingSeekRef.current
        const frameWindow = runtimeWindow(iframeRef.current)
        const controller = frameWindow?.PixoAdminPreview
        if (controller?.toggleTransport) {
          try {
            await controller.toggleTransport()
            onError(null)
          } catch (error) {
            onError(error instanceof Error ? error.message : '客户端预览播放失败。')
          }
          return
        }
        const playControl = frameWindow?.document
          .getElementById('play-control') as HTMLButtonElement | null
        playControl?.click()
      },
      async simulateInteraction() {
        const controller = runtimeWindow(iframeRef.current)?.PixoAdminPreview
        if (!controller?.simulateActiveInteraction) return false
        try {
          const result = await controller.simulateActiveInteraction()
          onError(null)
          return result?.status === 'resolved' || result?.status === 'driving'
        } catch (error) {
          onError(error instanceof Error ? error.message : '模拟触发失败。')
          return false
        }
      },
    }))

    useEffect(() => {
      sessionStorage.setItem(storageKey, JSON.stringify(draft))
      setMounted(true)
      return () => {
        sessionStorage.removeItem(storageKey)
        sessionStorage.removeItem(`pixo-game:experience:${instanceId.current}`)
      }
      // The initial frame must be created only after its session draft exists.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey])

    useEffect(() => {
      if (!mounted) return
      sessionStorage.setItem(storageKey, JSON.stringify(draft))
      const nextVisionSignature = visionSignature(gates)
      if (nextVisionSignature !== previousVisionSignatureRef.current) {
        previousVisionSignatureRef.current = nextVisionSignature
        setPreflight('idle')
        setSourceRevision((value) => value + 1)
        return
      }
      if (!runtimeWindow(iframeRef.current)?.PixoAdminPreview) return
      const selectedGate = selectedSourceIndex == null
        ? undefined
        : draft.gates.find((gate) => gate.sourceIndex === selectedSourceIndex)
      const selectedGateAtPlayhead = selectedGate
        && Math.abs(selectedGate.gate_at_ms - lastPositionRef.current) <= 1
      void reloadAt(
        lastPositionRef.current,
        selectedGateAtPlayhead ? selectedSourceIndex : undefined,
      )
      // Draft identity is the intentional reload trigger.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft, mounted, storageKey])

    useEffect(() => {
      if (!frameReadyVersion || selectedSourceIndex == null) return
      const gate = draftRef.current.gates[selectedSourceIndex]
      if (!gate) return
      void loadAt(gate.gate_at_ms, selectedSourceIndex)
      // A gate selection is an explicit editor navigation command.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frameReadyVersion])

    useEffect(() => {
      const receiveMessage = (event: MessageEvent) => {
        if (event.source !== iframeRef.current?.contentWindow) return
        const message = event.data
        if (message?.type === 'pixo-web-preflight') {
          const state = String(message.state || '')
          setPreflight(state === 'loading' ? 'loading' : state === 'ready' ? 'ready' : 'error')
          if (state === 'ready') setFrameReadyVersion((value) => value + 1)
          if (state === 'error') {
            onError(message.message || '摄像头识别模型加载失败。')
          }
          return
        }
        if (message?.type !== 'pixo-runtime-event') return
        const detail = message.detail || {}
        if (detail.name === 'seeked' && detail.source === 'authoring') {
          authoringSeekInFlightRef.current = false
          return
        }
        if (detail.name === 'gateOpened') {
          onSimulationChange(null)
          const cueId = String(detail.cueId || '')
          const match = /^admin-(\d+)$/.exec(cueId)
          if (match && !seekingRef.current && !authoringSeekInFlightRef.current) {
            onGateOpened(Number(match[1]))
          }
        }
        if (detail.name === 'gateBlocked') {
          onSimulationChange({
            cueId: String(detail.cueId || ''),
            interactionType: String(detail.type || 'interaction'),
            status: 'available',
          })
        }
        if (detail.name === 'gateSimulationStarted') {
          onSimulationChange({
            cueId: String(detail.cueId || ''),
            interactionType: String(detail.type || 'interaction'),
            status: 'running',
          })
        }
        if (['gateResolved', 'replay', 'experienceCompleted'].includes(String(detail.name || ''))) {
          onSimulationChange(null)
        }
        if (detail.name === 'error') onError(String(detail.message || '客户端预览运行失败。'))
      }
      window.addEventListener('message', receiveMessage)
      return () => window.removeEventListener('message', receiveMessage)
    }, [onError, onGateOpened, onSimulationChange])

    useEffect(() => {
      if (!mounted) return
      let frame = 0
      let lastReportedPosition = -1
      let lastReportedDuration = -1
      let lastReportedPlaying = false
      const sample = () => {
        const documentObject = runtimeWindow(iframeRef.current)?.document
        const video = documentObject?.getElementById('experience-video') as HTMLVideoElement | null
        if (video && !seekingRef.current && !scrubbingRef.current) {
          const positionMs = Math.max(0, video.currentTime * 1000)
          const measuredDuration = Number.isFinite(video.duration)
            ? Math.max(0, video.duration * 1000)
            : (durationMs || 0)
          const playing = !video.paused && !video.ended
          if (
            Math.abs(positionMs - lastReportedPosition) >= 12
            || Math.abs(measuredDuration - lastReportedDuration) >= 1
            || playing !== lastReportedPlaying
          ) {
            lastPositionRef.current = positionMs
            lastReportedPosition = positionMs
            lastReportedDuration = measuredDuration
            lastReportedPlaying = playing
            onProgress(positionMs, measuredDuration, playing)
          }
        }
        frame = window.requestAnimationFrame(sample)
      }
      frame = window.requestAnimationFrame(sample)
      return () => window.cancelAnimationFrame(frame)
    }, [durationMs, mounted, onProgress])

    return (
      <div className={`client-runtime-frame${interactionEnabled ? ' is-interactive' : ' is-positioning'}`}>
        {frameSource ? (
          <iframe
            ref={iframeRef}
            title="客户端互动效果预览"
            src={frameSource}
            allow="camera; microphone; autoplay"
            onLoad={() => {
              onError(null)
              setPreflight((value) => value === 'idle' ? 'ready' : value)
              setFrameReadyVersion((value) => value + 1)
            }}
          />
        ) : null}
        <video
          ref={scrubVideoRef}
          className={`client-runtime-scrub-preview${scrubbing ? ' is-visible' : ''}`}
          src={mediaUrl}
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = scrubPositionRef.current / 1000
          }}
        />
        {preflight === 'loading' ? (
          <div className="client-runtime-status" role="status">
            <span className="preview-media-spinner" aria-hidden="true" />
            <span>正在准备摄像头识别模型…</span>
          </div>
        ) : null}
      </div>
    )
  },
)

export default ClientRuntimePreview
