// A small incremental parser for Server-Sent Events, for streams read with fetch() +
// ReadableStream (POST with a JSON body, which EventSource can't do).
//
// Follows the WHATWG event-stream rules we need: \n, \r\n and \r line endings (also when a
// line or a \r\n is split across chunks), ":" comment lines (heartbeats) are skipped,
// several data: lines join with \n, and an empty line dispatches the event.

export interface SseMessage {
  event: string;
  data: string;
}

export class SseParser {
  private buffer = "";
  private eventType = "";
  private dataLines: string[] = [];

  /** Feed decoded text; returns the events completed by it. */
  push(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const out: SseMessage[] = [];
    let lineStart = 0;
    let i = 0;
    while (i < this.buffer.length) {
      const ch = this.buffer[i];
      if (ch !== "\n" && ch !== "\r") {
        i++;
        continue;
      }
      // A \r at the very end may be the first half of a \r\n: wait for the next chunk.
      if (ch === "\r" && i === this.buffer.length - 1) break;
      const line = this.buffer.slice(lineStart, i);
      i += ch === "\r" && this.buffer[i + 1] === "\n" ? 2 : 1;
      lineStart = i;
      const message = this.processLine(line);
      if (message) out.push(message);
    }
    this.buffer = this.buffer.slice(lineStart);
    return out;
  }

  /** End of stream: handle a last unterminated line and event. */
  flush(): SseMessage[] {
    const out: SseMessage[] = [];
    if (this.buffer.length > 0) {
      const rest = this.buffer.replace(/\r$/, "");
      this.buffer = "";
      out.push(...this.push(`${rest}\n`));
    }
    const last = this.dispatch();
    if (last) out.push(last);
    return out;
  }

  private processLine(line: string): SseMessage | null {
    if (line === "") return this.dispatch();
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.eventType = value;
    else if (field === "data") this.dataLines.push(value);
    // id, retry and unknown fields: not used here.
    return null;
  }

  private dispatch(): SseMessage | null {
    if (this.dataLines.length === 0) {
      this.eventType = "";
      return null;
    }
    const message = { event: this.eventType || "message", data: this.dataLines.join("\n") };
    this.eventType = "";
    this.dataLines = [];
    return message;
  }
}

/** Reads a fetch() response body as SSE and yields each message. Cancels the body if the consumer stops early. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      const messages = done
        ? [...parser.push(decoder.decode()), ...parser.flush()]
        : parser.push(decoder.decode(value, { stream: true }));
      for (const message of messages) yield message;
      if (done) {
        finished = true;
        return;
      }
    }
  } finally {
    if (!finished) await reader.cancel().catch(() => undefined);
  }
}
