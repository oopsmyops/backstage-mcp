import Router from 'express-promise-router';
import express from 'express';
import type {
  AuthService,
  HttpAuthService,
  LoggerService,
  UserInfoService,
} from '@backstage/backend-plugin-api';
import type { LlmProvider } from './llm/types';
import type { ModelRegistry } from './llm/modelRegistry';
import type { ToolService } from './service/ToolService';
import { ChatOrchestrator } from './service/ChatOrchestrator';
import type { ChatRequest } from './types';

export interface RouterOptions {
  toolService: ToolService;
  llmProvider: LlmProvider;
  modelRegistry: ModelRegistry;
  httpAuth: HttpAuthService;
  userInfo: UserInfoService;
  auth: AuthService;
  logger: LoggerService;
  systemPrompt?: string;
}

export async function createRouter(
  options: RouterOptions,
): Promise<ReturnType<typeof Router>> {
  const {
    toolService,
    llmProvider,
    modelRegistry,
    httpAuth,
    userInfo,
    logger,
    systemPrompt,
  } = options;
  const orchestrator = new ChatOrchestrator(
    llmProvider,
    toolService,
    logger,
    systemPrompt,
  );

  const router = Router();
  router.use(express.json({ limit: '512kb' }));

  logger.info('Assistant plugin router initialized');

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', tools: toolService.listTools().length });
  });

  router.get('/tools', async (req, res) => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    logger.debug('Tools endpoint called', { credentials: !!credentials });
    res.json(toolService.listTools());
  });

  router.get('/models', async (req, res) => {
    await httpAuth.credentials(req, { allow: ['user'] });
    res.json({ models: modelRegistry.listModels() });
  });

  router.post('/chat', async (req, res) => {
    logger.info('Chat endpoint called');

    const credentials = await httpAuth.credentials(req, { allow: ['user'] });

    let userEntityRef = 'user:default/anonymous';
    let ownershipRefs: string[] = [];
    try {
      const info = await userInfo.getUserInfo(credentials);
      userEntityRef = info.userEntityRef;
      ownershipRefs = info.ownershipEntityRefs;
    } catch (err) {
      logger.warn('Could not resolve user info, using anonymous', {
        error: String(err),
      });
    }

    logger.info(`Chat request from ${userEntityRef}`, {
      groups: ownershipRefs.filter(r => r.startsWith('group:')),
      messageLength: req.body?.message?.length,
    });

    const body = req.body as ChatRequest;
    if (!body || !body.message || typeof body.message !== 'string') {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'none');
    res.flushHeaders();
    res.socket?.setNoDelay(true);

    const abortController = new AbortController();
    res.on('close', () => abortController.abort());

    const send = (event: string, data: unknown) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      }
    };

    try {
      await orchestrator.chat(
        body,
        {
          credentials,
          userEntityRef,
          ownershipRefs,
          vcsTokens: body.vcsTokens,
        },
        {
          onTextDelta: content => send('text_delta', { content }),
          onToolCall: (toolCallId, toolName, args) =>
            send('tool_call', { toolCallId, toolName, arguments: args }),
          onToolResult: (toolName, content) =>
            send('tool_result', { toolName, content }),
          onUiRender: card =>
            send('ui_render', { card }),
          onOAuthRequired: (provider, scopes) =>
            send('oauth_required', { provider, scopes }),
          onDone: usage => {
            send('done', { usage });
            if (!res.writableEnded) res.end();
          },
          onError: message => send('error', { message }),
        },
        abortController.signal,
      );
    } catch (err) {
      logger.error('Chat endpoint error', { error: String(err) });
      send('error', {
        message:
          err instanceof Error ? err.message : 'Internal server error',
      });
      if (!res.writableEnded) res.end();
    }
  });

  return router;
}
