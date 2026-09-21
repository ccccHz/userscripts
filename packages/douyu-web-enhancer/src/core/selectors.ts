export interface SelectorMatch<T extends Element = Element> {
  element: T;
  selector: string;
}

export class SelectorRegistry {
  readonly #document: Pick<Document, "querySelector" | "querySelectorAll">;
  readonly #selectors: Readonly<Record<string, readonly string[]>>;

  constructor(
    document: Pick<Document, "querySelector" | "querySelectorAll">,
    selectors: Readonly<Record<string, readonly string[]>>,
  ) {
    this.#document = document;
    this.#selectors = selectors;
  }

  find<T extends Element = Element>(name: string): SelectorMatch<T> | null {
    const candidates = this.#selectors[name];
    if (!candidates) throw new Error(`Unknown selector group: ${name}`);

    for (const selector of candidates) {
      const element = this.#document.querySelector<T>(selector);
      if (element) return { element, selector };
    }
    return null;
  }

  findAll<T extends Element = Element>(name: string): SelectorMatch<T>[] {
    const candidates = this.#selectors[name];
    if (!candidates) throw new Error(`Unknown selector group: ${name}`);

    return candidates.flatMap((selector) =>
      [...this.#document.querySelectorAll<T>(selector)].map((element) => ({
        element,
        selector,
      })),
    );
  }
}
