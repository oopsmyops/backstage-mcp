import {
  createApiRef,
  type FetchApi,
  type DiscoveryApi,
} from '@backstage/frontend-plugin-api';
import type {
  ChatRequest,
  SseEvent,
  ToolDefinition,
  ModelInfo,
} from './types';
import { parseSseStream } from '../util/sseParser';

export interface AssistantApi {
  chat(
    request: ChatRequest,
    onEvent: (event: SseEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
  listTools(): Promise<ToolDefinition[]>;
  listModels(): Promise<ModelInfo[]>;
}

export const assistantApiRef = createApiRef<AssistantApi>({
  id: 'plugin.assistant.api',
});

export class AssistantClient implements AssistantApi {
  constructor(
    private readonly discoveryApi: DiscoveryApi,
    private readonly fetchApi: FetchApi,
  ) {}

  async chat(
    request: ChatRequest,
    onEvent: (event: SseEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const baseUrl = await this.discoveryApi.getBaseUrl('assistant');

    const response = await this.fetchApi.fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Assistant API ${response.status}: ${text || response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    await parseSseStream(response.body, onEvent);
  }

  async listTools(): Promise<ToolDefinition[]> {
    const baseUrl = await this.discoveryApi.getBaseUrl('assistant');
    const response = await this.fetchApi.fetch(`${baseUrl}/tools`);
    if (!response.ok) {
      throw new Error(`Failed to list tools: ${response.status}`);
    }
    return response.json();
  }

  async listModels(): Promise<ModelInfo[]> {
    const baseUrl = await this.discoveryApi.getBaseUrl('assistant');
    const response = await this.fetchApi.fetch(`${baseUrl}/models`);
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`);
    }
    const data = (await response.json()) as { models?: ModelInfo[] };
    return data.models ?? [];
  }
}
