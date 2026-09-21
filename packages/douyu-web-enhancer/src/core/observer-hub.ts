export type ObserverSubscriber = () => void;

export class ObserverHub {
  readonly #observer: MutationObserver;
  readonly #subscribers = new Set<ObserverSubscriber>();
  #scanTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(root: Node, createObserver = (callback: MutationCallback) => new MutationObserver(callback)) {
    this.#observer = createObserver(() => this.#queueScan());
    this.#observer.observe(root, { childList: true, subtree: true });
  }

  subscribe(subscriber: ObserverSubscriber): () => void {
    this.#subscribers.add(subscriber);
    return () => this.#subscribers.delete(subscriber);
  }

  destroy(): void {
    this.#observer.disconnect();
    if (this.#scanTimer !== undefined) clearTimeout(this.#scanTimer);
    this.#scanTimer = undefined;
    this.#subscribers.clear();
  }

  #queueScan(): void {
    if (this.#scanTimer !== undefined) return;
    this.#scanTimer = setTimeout(() => {
      this.#scanTimer = undefined;
      for (const subscriber of [...this.#subscribers]) subscriber();
    }, 50);
  }
}
