import {
  createBackendPlugin,
  coreServices,
} from '@backstage/backend-plugin-api';
import { createRouter } from './router';
import { createModelRegistry } from './llm/modelRegistry';
import { AiSdkProvider } from './llm/AiSdkProvider';
import { ToolService } from './service/ToolService';

export const assistantPlugin = createBackendPlugin({
  pluginId: 'assistant',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        userInfo: coreServices.userInfo,
        auth: coreServices.auth,
        discovery: coreServices.discovery,
        cache: coreServices.cache,
      },
      async init({
        logger,
        config,
        httpRouter,
        httpAuth,
        userInfo,
        auth,
        discovery,
        cache,
      }) {
        const toolService = new ToolService({
          auth,
          discovery,
          cache,
          logger,
        });

        const modelRegistry = createModelRegistry(config, logger);
        const maxConcurrent =
          config.getOptionalNumber('assistant.llm.maxConcurrent') ?? 5;
        const llmProvider = new AiSdkProvider(
          modelRegistry,
          logger,
          maxConcurrent,
        );

        const systemPrompt = config.getOptionalString(
          'assistant.systemPrompt',
        );

        const router = await createRouter({
          toolService,
          llmProvider,
          modelRegistry,
          httpAuth,
          userInfo,
          auth,
          logger,
          systemPrompt,
        });

        httpRouter.use(router);
        httpRouter.addAuthPolicy({
          path: '/health',
          allow: 'unauthenticated',
        });
      },
    });
  },
});
