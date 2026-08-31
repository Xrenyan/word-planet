export type RecorderStatus = 'idle' | 'recording' | 'error' | 'disposed'

export type LocalRecording = Readonly<{ blob: Blob; url: string }>

export type MediaRecorderLike = {
  state: string
  mimeType?: string
  ondataavailable: ((event: { data: Blob }) => void) | null
  onstop: (() => void) | null
  onerror: ((event: Event) => void) | null
  start: () => void
  stop: () => void
}

export type RecorderDependencies = {
  MediaRecorder: new (stream: MediaStream) => MediaRecorderLike
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (url: string) => void
  Blob: typeof Blob
}

export type LocalRecorder = {
  readonly status: RecorderStatus
  readonly recording: LocalRecording | null
  start: () => boolean
  stop: () => Promise<LocalRecording | null>
  dispose: () => void
}

type PendingStop = {
  resolve: (recording: LocalRecording | null) => void
  reject: (reason: Error) => void
}

function safelyStopTracks(stream: MediaStream) {
  let tracks: readonly MediaStreamTrack[] = []
  try {
    tracks = stream.getTracks?.() ?? []
  } catch {
    return
  }
  for (const track of tracks) {
    try {
      track.stop()
    } catch {
      // Continue cleanup when one browser track is already invalid.
    }
  }
}

/** A recorder owns one acquired stream; stopped streams are terminal. */
export function createRecorder(stream: MediaStream, dependencies: RecorderDependencies): LocalRecorder {
  let recorder: MediaRecorderLike
  try {
    recorder = new dependencies.MediaRecorder(stream)
  } catch (error) {
    safelyStopTracks(stream)
    throw error
  }
  let status: RecorderStatus = 'idle'
  let chunks: Blob[] = []
  let current: LocalRecording | null = null
  let pending: PendingStop | null = null
  let pendingPromise: Promise<LocalRecording | null> | null = null

  function settle(result: LocalRecording | null, error?: Error) {
    const operation = pending
    pending = null
    pendingPromise = null
    if (!operation) return
    if (error) operation.reject(error)
    else operation.resolve(result)
  }

  function releaseCurrent() {
    if (!current) return
    try {
      dependencies.revokeObjectURL(current.url)
    } catch {
      // Revocation is best effort; the browser may have already released it.
    }
    current = null
  }

  function endStream() {
    safelyStopTracks(stream)
  }

  recorder.ondataavailable = (event) => {
    if (status === 'recording' && event.data?.size > 0) chunks.push(event.data)
  }

  recorder.onstop = () => {
    endStream()
    if (status === 'disposed') {
      settle(null)
      return
    }
    if (status !== 'recording') return

    status = 'disposed'
    if (chunks.length === 0 || chunks.every((chunk) => chunk.size <= 0)) {
      settle(null)
      return
    }
    try {
      const blob = new dependencies.Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      if (blob.size <= 0) {
        settle(null)
        return
      }
      releaseCurrent()
      current = Object.freeze({ blob, url: dependencies.createObjectURL(blob) })
      settle(current)
    } catch {
      settle(null)
    }
  }

  recorder.onerror = () => {
    endStream()
    if (status !== 'disposed') status = 'error'
    settle(null, new Error('recording-error'))
  }

  return {
    get status() { return status },
    get recording() { return current },
    start() {
      if (status !== 'idle' || recorder.state !== 'inactive') return false
      chunks = []
      try {
        recorder.start()
        status = 'recording'
        return true
      } catch {
        status = 'error'
        endStream()
        return false
      }
    },
    stop() {
      if (pendingPromise) return pendingPromise
      if (status !== 'recording' || recorder.state === 'inactive') return Promise.resolve(null)
      const result = new Promise<LocalRecording | null>((resolve, reject) => { pending = { resolve, reject } })
      pendingPromise = result
      try {
        recorder.stop()
      } catch {
        status = 'error'
        endStream()
        settle(null, new Error('recording-error'))
      }
      return result
    },
    dispose() {
      if (status === 'disposed') {
        releaseCurrent()
        endStream()
        settle(null)
        return
      }
      status = 'disposed'
      releaseCurrent()
      endStream()
      // Settle before invoking a possibly asynchronous native stop callback.
      settle(null)
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // Stream and pending operation are already released.
        }
      }
    },
  }
}
