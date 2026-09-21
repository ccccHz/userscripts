export class StyleRegistry {
  readonly #document: Document;
  readonly #styles = new Map<string, HTMLStyleElement>();

  constructor(document: Document) {
    this.#document = document;
  }

  add(id: string, css: string): () => void {
    this.remove(id);
    const style = this.#document.createElement("style");
    style.dataset.douyuWebEnhancerStyle = id;
    style.textContent = css;
    (this.#document.head ?? this.#document.documentElement).append(style);
    this.#styles.set(id, style);
    return () => this.remove(id);
  }

  remove(id: string): void {
    this.#styles.get(id)?.remove();
    this.#styles.delete(id);
  }

  destroy(): void {
    for (const id of [...this.#styles.keys()]) this.remove(id);
  }
}
