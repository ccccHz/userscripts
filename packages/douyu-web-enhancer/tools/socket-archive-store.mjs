import { mkdir, open, rename } from "node:fs/promises";
import { join } from "node:path";

export async function createArchiveStore(directory, options = {}) {
  const limits = { maxBytes: 256 * 1024 * 1024, segmentBytes: 16 * 1024 * 1024,
    segmentMs: 10 * 60 * 1000, queueBytes: 8 * 1024 * 1024, statusReserve: 1024 * 1024, controlReserve: 0, ...options };
  if (limits.maxBytes <= limits.statusReserve * 2 + limits.controlReserve || limits.segmentBytes < 1 || limits.queueBytes < 1) throw new Error("invalid-storage-limits");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let file;
  let segment = 0;
  let segmentSize = 0;
  let segmentAt = 0;
  let bytes = 0;
  let queuedBytes = 0;
  let records = 0;
  let error = null;
  let closed = false;
  let chain = Promise.resolve();
  const rotate = async (at) => {
    await file?.close();
    segment += 1;
    file = await open(join(directory, `packets-${String(segment).padStart(5, "0")}.jsonl`), "wx", 0o600);
    segmentSize = 0; segmentAt = at;
  };
  return {
    append(record, at = Date.now()) {
      if (closed || error) return { accepted: false, reason: "storage-closed", done: Promise.resolve(false) };
      const line = `${JSON.stringify(record)}\n`;
      const size = Buffer.byteLength(line);
      // Atomic status replacement briefly uses both status.json and status.tmp.
      if (bytes + queuedBytes + size > limits.maxBytes - limits.statusReserve * 2 - limits.controlReserve) {
        return { accepted: false, reason: "disk-limit", done: Promise.resolve(false) };
      }
      if (queuedBytes + size > limits.queueBytes) return { accepted: false, reason: "queue-limit", done: Promise.resolve(false) };
      queuedBytes += size;
      const done = chain.then(async () => {
        try {
          if (error) return false;
          if (!file || (segmentSize > 0 && (segmentSize + size > limits.segmentBytes || at - segmentAt >= limits.segmentMs))) await rotate(at);
          // writeFile appends on the already-open descriptor and handles short writes.
          await file.writeFile(line);
          bytes += size; segmentSize += size; records += 1;
          return true;
        } catch { error = "write-failed"; return false; }
        finally { queuedBytes -= size; }
      });
      chain = done.then(() => undefined);
      return { accepted: true, reason: null, done };
    },
    async status(report) {
      await chain;
      const line = `${JSON.stringify(report, null, 2)}\n`;
      if (Buffer.byteLength(line) > limits.statusReserve) throw new Error("status-size-limit");
      const tmp = join(directory, "status.tmp");
      const handle = await open(tmp, "w", 0o600);
      try { await handle.writeFile(line); } finally { await handle.close(); }
      await rename(tmp, join(directory, "status.json"));
    },
    snapshot() { return { bytes, queuedBytes, records, segments: segment, error, maxBytes: limits.maxBytes,
      reservedStatusBytes: limits.statusReserve * 2, reservedControlBytes: limits.controlReserve }; },
    async close() {
      closed = true;
      await chain;
      try { await file?.close(); }
      catch (cause) { error = "close-failed"; throw cause; }
      finally { file = undefined; }
    },
  };
}
