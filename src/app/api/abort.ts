// A consumer leaving a page must not abort another consumer's shared request.
export function withAbort<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return request
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    request.then(value => { if (!signal.aborted) resolve(value) }, reject)
      .finally(() => signal.removeEventListener('abort', abort))
  })
}
