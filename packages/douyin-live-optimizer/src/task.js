export function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException("Task cancelled", "AbortError");
}

export function sleep(milliseconds, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Task cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function waitFor(find, {
  signal, attempts = 50, interval = 100, sleepFn = sleep,
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    throwIfAborted(signal);
    const target = find();
    if (target) return target;
    if (attempt < attempts - 1) await sleepFn(interval, signal);
  }
  throwIfAborted(signal);
  return null;
}
