import type { Diagnostics } from "./diagnostics.ts";
import type { ObserverHub } from "./observer-hub.ts";
import type { SelectorRegistry } from "./selectors.ts";
import type { StyleRegistry } from "./styles.ts";

export interface FeatureContext {
  diagnostics: Diagnostics;
  document: Document;
  observerHub: ObserverHub;
  root: HTMLElement;
  selectors: SelectorRegistry;
  styles: StyleRegistry;
}

export type FeatureDisposer = () => void;

export interface FeatureDefinition {
  id: string;
  start(context: FeatureContext): FeatureDisposer | void;
}

export class FeatureRuntime {
  readonly #context: FeatureContext;
  readonly #definitions: Map<string, FeatureDefinition>;
  readonly #disposers = new Map<string, FeatureDisposer>();
  readonly #subscribers = new Set<() => void>();

  constructor(context: FeatureContext, definitions: FeatureDefinition[]) {
    this.#context = context;
    this.#definitions = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );
  }

  enable(id: string): void {
    if (this.#disposers.has(id)) return;
    const definition = this.#definitions.get(id);
    if (!definition) throw new Error(`Unknown feature: ${id}`);

    this.#context.diagnostics.update(id, "starting");
    try {
      const dispose = definition.start(this.#context) ?? (() => undefined);
      this.#disposers.set(id, dispose);
      this.#notify();
    } catch (error) {
      this.#context.diagnostics.update(id, "error", {
        detail: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  disable(id: string): void {
    const dispose = this.#disposers.get(id);
    if (dispose) dispose();
    this.#disposers.delete(id);
    this.#context.diagnostics.update(id, "disabled");
    this.#notify();
  }

  isEnabled(id: string): boolean {
    return this.#disposers.has(id);
  }

  subscribe(subscriber: () => void): () => void {
    this.#subscribers.add(subscriber);
    return () => this.#subscribers.delete(subscriber);
  }

  #notify(): void {
    for (const subscriber of this.#subscribers) subscriber();
  }

  destroy(): void {
    for (const id of [...this.#disposers.keys()]) this.disable(id);
  }
}
