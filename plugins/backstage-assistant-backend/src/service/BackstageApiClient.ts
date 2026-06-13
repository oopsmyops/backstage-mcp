import type {
  AuthService,
  BackstageCredentials,
  DiscoveryService,
} from '@backstage/backend-plugin-api';

export class BackstageApiClient {
  constructor(
    private readonly auth: AuthService,
    private readonly discovery: DiscoveryService,
    private readonly credentials: BackstageCredentials,
  ) {}

  async fetch(
    pluginId: string,
    path: string,
    options?: RequestInit,
  ): Promise<Response> {
    const baseUrl = await this.discovery.getBaseUrl(pluginId);
    const { token } = await this.auth.getPluginRequestToken({
      onBehalfOf: this.credentials,
      targetPluginId: pluginId,
    });

    const headers = new Headers(options?.headers);
    headers.set('Authorization', `Bearer ${token}`);

    return fetch(`${baseUrl}${path}`, { ...options, headers });
  }

  async fetchJson<T>(
    pluginId: string,
    path: string,
    options?: RequestInit,
  ): Promise<T> {
    const headers = new Headers(options?.headers);
    headers.set('Accept', 'application/json');
    if (options?.body) {
      headers.set('Content-Type', 'application/json');
    }

    const res = await this.fetch(pluginId, path, { ...options, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Backstage ${pluginId} API ${res.status}: ${res.statusText} — ${body}`.trim(),
      );
    }
    return res.json() as Promise<T>;
  }

  async fetchText(pluginId: string, path: string): Promise<string> {
    const res = await this.fetch(pluginId, path);
    if (!res.ok) {
      throw new Error(
        `Backstage ${pluginId} API ${res.status}: ${res.statusText}`,
      );
    }
    return res.text();
  }
}
