import {
  simulateReadableStream,
  type LanguageModel,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAzure } from '@ai-sdk/azure';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type {
  RootConfigService,
  LoggerService,
} from '@backstage/backend-plugin-api';
import type { Config } from '@backstage/config';

/**
 * Public description of a configured model — what the frontend picker shows.
 */
export interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  default?: boolean;
}

interface ModelEntry {
  info: ModelInfo;
  model: LanguageModel;
}

/**
 * Holds the catalog of models the assistant can use. Built once at startup
 * from `assistant.llm.models[]`. The frontend lists `listModels()`; each chat
 * request names a model id that `resolveChain()` turns into a primary model
 * plus any configured fallbacks.
 */
export class ModelRegistry {
  private readonly entries = new Map<string, ModelEntry>();
  private readonly order: string[] = [];
  private defaultId?: string;

  constructor(private readonly fallbackIds: string[] = []) {}

  register(info: ModelInfo, model: LanguageModel): void {
    if (this.entries.has(info.id)) {
      throw new Error(
        `Duplicate model id "${info.id}" in assistant.llm.models`,
      );
    }
    this.entries.set(info.id, { info, model });
    this.order.push(info.id);
    if (info.default && !this.defaultId) this.defaultId = info.id;
  }

  /** Default to the first registered model when none is flagged default. */
  finalize(): void {
    if (!this.defaultId && this.order.length) this.defaultId = this.order[0];
  }

  get size(): number {
    return this.order.length;
  }

  get defaultModelId(): string | undefined {
    return this.defaultId;
  }

  listModels(): ModelInfo[] {
    return this.order.map(id => ({
      ...this.entries.get(id)!.info,
      default: id === this.defaultId,
    }));
  }

  /**
   * The ordered list of models to try for a request: the selected model (or
   * the default when the id is missing/unknown), followed by the configured
   * fallback ids. AiSdkProvider walks this chain when a provider errors.
   */
  resolveChain(id?: string): Array<{ id: string; model: LanguageModel }> {
    const primaryId = id && this.entries.has(id) ? id : this.defaultId;
    if (!primaryId) {
      throw new Error(
        'No LLM models configured (assistant.llm.models is empty)',
      );
    }
    const ids = [
      primaryId,
      ...this.fallbackIds.filter(fId => fId !== primaryId),
    ];
    return ids
      .filter(mId => this.entries.has(mId))
      .map(mId => ({ id: mId, model: this.entries.get(mId)!.model }));
  }
}

export function createModelRegistry(
  config: RootConfigService,
  logger: LoggerService,
): ModelRegistry {
  const root = config.getOptionalConfig('assistant.llm');
  const fallbackIds = root?.getOptionalStringArray('fallback') ?? [];
  const registry = new ModelRegistry(fallbackIds);

  const modelConfigs = root?.getOptionalConfigArray('models') ?? [];
  if (modelConfigs.length) {
    for (const mc of modelConfigs) {
      const info: ModelInfo = {
        id: mc.getString('id'),
        label: mc.getOptionalString('label') ?? mc.getString('id'),
        provider: mc.getString('provider'),
        default: mc.getOptionalBoolean('default'),
      };
      registry.register(info, buildModel(mc));
    }
  } else if (root) {
    // ponytail: legacy single-provider compat shim. Synthesizes one model from
    // the old assistant.llm.provider / bedrock / litellm keys so existing
    // deployments keep working. Remove once all configs use models[].
    const legacy = buildLegacyModel(root, logger);
    if (legacy) registry.register(legacy.info, legacy.model);
  }

  if (registry.size === 0) {
    logger.warn(
      'No assistant.llm.models configured; registering an offline mock model. ' +
        'Set assistant.llm.models[] to enable live answers.',
    );
    registry.register(
      { id: 'mock', label: 'Mock (offline)', provider: 'mock', default: true },
      createMockModel(),
    );
  }

  registry.finalize();
  logger.info(
    `LLM models: ${registry
      .listModels()
      .map(m => (m.default ? `${m.id} (default)` : m.id))
      .join(', ')}`,
  );
  return registry;
}

function requireModelName(mc: Config): string {
  const name = mc.getOptionalString('model') ?? mc.getOptionalString('modelId');
  if (!name) {
    throw new Error(
      `assistant.llm.models["${mc.getString('id')}"] is missing "model"`,
    );
  }
  return name;
}

function buildModel(mc: Config): LanguageModel {
  const provider = mc.getString('provider');
  switch (provider) {
    case 'bedrock': {
      const bedrock = createAmazonBedrock({
        region: mc.getOptionalString('region') ?? 'us-east-1',
        // apiKey maps to a Bedrock API key (AWS_BEARER_TOKEN_BEDROCK).
        // When omitted the AWS credential chain (IAM role / env) is used.
        apiKey:
          mc.getOptionalString('apiKey') ??
          process.env.AWS_BEARER_TOKEN_BEDROCK,
      });
      return bedrock(requireModelName(mc));
    }
    case 'azure': {
      // Azure AI Foundry's OpenAI v1-compatible route:
      // https://{resourceName}.openai.azure.com/openai/v1
      const azure = createAzure({
        resourceName: mc.getOptionalString('resourceName'),
        baseURL: mc.getOptionalString('baseUrl'),
        apiKey: mc.getOptionalString('apiKey'),
        apiVersion: mc.getOptionalString('apiVersion'),
      });
      return azure(requireModelName(mc));
    }
    case 'openai-compatible': {
      // Universal adapter for any OpenAI-shaped API (OpenAI, Groq, Together,
      // OpenRouter, vLLM, LiteLLM, ...). No proxy required.
      const compatible = createOpenAICompatible({
        name: mc.getOptionalString('name') ?? mc.getString('id'),
        baseURL: mc.getString('baseUrl'),
        apiKey: mc.getOptionalString('apiKey'),
      });
      return compatible(requireModelName(mc));
    }
    case 'mock':
      return createMockModel();
    default:
      throw new Error(
        `Unknown assistant.llm.models provider "${provider}" ` +
          '(expected bedrock | azure | openai-compatible | mock)',
      );
  }
}

function buildLegacyModel(
  root: Config,
  logger: LoggerService,
): ModelEntry | undefined {
  const provider = root.getOptionalString('provider');
  if (!provider || provider === 'mock') return undefined;

  if (provider === 'bedrock') {
    const modelId =
      root.getOptionalString('bedrock.modelId') ??
      'anthropic.claude-sonnet-4-6';
    logger.warn(
      'Using legacy assistant.llm.bedrock config; migrate to assistant.llm.models[].',
    );
    const bedrock = createAmazonBedrock({
      region: root.getOptionalString('bedrock.region') ?? 'us-east-1',
      apiKey:
        root.getOptionalString('bedrock.bearerToken') ??
        process.env.AWS_BEARER_TOKEN_BEDROCK,
    });
    return {
      info: {
        id: 'default',
        label: `Bedrock ${modelId}`,
        provider: 'bedrock',
        default: true,
      },
      model: bedrock(modelId),
    };
  }

  if (provider === 'litellm') {
    const model = root.getString('litellm.model');
    logger.warn(
      'Using legacy assistant.llm.litellm config; migrate to assistant.llm.models[].',
    );
    const compatible = createOpenAICompatible({
      name: 'litellm',
      baseURL: root.getString('litellm.baseUrl'),
      apiKey: root.getOptionalString('litellm.apiKey'),
    });
    return {
      info: {
        id: 'default',
        label: model,
        provider: 'openai-compatible',
        default: true,
      },
      model: compatible(model),
    };
  }

  return undefined;
}

/**
 * A canned offline model so the plugin boots and is explorable without any
 * provider credentials. Streams a single fixed message.
 */
function createMockModel(): LanguageModel {
  const text =
    'This is a mock assistant response. Configure assistant.llm.models with a ' +
    'real provider (bedrock, azure, or openai-compatible) to enable live answers.';
  // Low-level LanguageModelV3 usage/finish shapes (provider spec).
  const usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
  };
  const finishReason = { unified: 'stop' as const, raw: undefined };
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      finishReason,
      usage,
      content: [{ type: 'text', text }],
      warnings: [],
    }),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: '0' },
          { type: 'text-delta', id: '0', delta: text },
          { type: 'text-end', id: '0' },
          { type: 'finish', finishReason, usage },
        ],
      }),
    }),
  });
}
