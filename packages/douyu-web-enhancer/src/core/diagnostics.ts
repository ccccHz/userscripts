export type FeatureStatus =
  | "disabled"
  | "starting"
  | "waiting"
  | "degraded"
  | "active"
  | "error";

export interface FeatureDiagnostic {
  id: string;
  status: FeatureStatus;
  detail?: string;
  selector?: string;
  /** Low-frequency, copyable runtime evidence. Never put credentials or page content here. */
  data?: unknown;
  updatedAt: string;
}

export interface DiagnosticSnapshot {
  generatedAt: string;
  url: string;
  version: string;
  features: FeatureDiagnostic[];
}

export class Diagnostics {
  readonly #features = new Map<string, FeatureDiagnostic>();
  readonly #subscribers = new Set<() => void>();

  update(
    id: string,
    status: FeatureStatus,
    details: Pick<FeatureDiagnostic, "detail" | "selector" | "data"> = {},
  ): void {
    this.#features.set(id, {
      id,
      status,
      ...details,
      updatedAt: new Date().toISOString(),
    });
    for (const subscriber of this.#subscribers) subscriber();
  }

  subscribe(subscriber: () => void): () => void {
    this.#subscribers.add(subscriber);
    return () => this.#subscribers.delete(subscriber);
  }

  snapshot(version: string, url: string): DiagnosticSnapshot {
    return {
      generatedAt: new Date().toISOString(),
      url,
      version,
      features: [...this.#features.values()].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
    };
  }
}
