import type { Config } from "../config.js";

export class BackstageApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
    public readonly url: string
  ) {
    super(`Backstage API error ${status} ${statusText} — ${url}`);
    this.name = "BackstageApiError";
  }
}

export class BackstageClient {
  constructor(private readonly config: Config) {}

  async fetch(path: string, options?: RequestInit): Promise<Response> {
    // Accept both relative paths (/api/catalog/...) and full URLs
    const url = path.startsWith("http")
      ? path
      : `${this.config.backstageBaseUrl}${path}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.requestTimeoutMs
    );

    try {
      const response = await globalThis.fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.backstageToken}`,
          ...(options?.headers as Record<string, string> | undefined),
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new BackstageApiError(response.status, response.statusText, body, url);
      }

      return response;
    } catch (err) {
      if (err instanceof BackstageApiError) throw err;
      if ((err as Error).name === "AbortError") {
        throw new BackstageApiError(408, "Request Timeout", "", url);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await this.fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options?.headers as Record<string, string> | undefined),
      },
    });
    return response.json() as Promise<T>;
  }

  async fetchText(path: string, options?: RequestInit): Promise<string> {
    const response = await this.fetch(path, options);
    return response.text();
  }
}
