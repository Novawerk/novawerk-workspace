/**
 * Read a `text/event-stream` response and call `onEvent` with each `data:` line parsed as JSON.
 * Comment lines (`: ping`) and other fields are ignored. Resolves when the stream ends.
 */
export async function readEvents<T>(response: Response, onEvent: (event: T) => void): Promise<void> {
  if (!response.body) return
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let newline = buffer.indexOf("\n")
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, "")
      buffer = buffer.slice(newline + 1)
      if (line.startsWith("data:")) {
        try {
          onEvent(JSON.parse(line.slice(5).trimStart()) as T)
        } catch {
          // A malformed line is skipped; the next one may be fine.
        }
      }
      newline = buffer.indexOf("\n")
    }
  }
}
