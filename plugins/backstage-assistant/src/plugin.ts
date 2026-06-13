import React from 'react';
import {
  createFrontendPlugin,
  createApiFactory,
  ApiBlueprint,
  AppRootElementBlueprint,
  fetchApiRef,
  discoveryApiRef,
} from '@backstage/frontend-plugin-api';
import { assistantApiRef, AssistantClient } from './api/AssistantApi';
import { ChatWidget } from './components/ChatWidget';

const assistantApi = ApiBlueprint.make({
  name: 'assistant',
  params: defineParams =>
    defineParams(
      createApiFactory({
        api: assistantApiRef,
        deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
        factory: ({ discoveryApi, fetchApi }) =>
          new AssistantClient(discoveryApi, fetchApi),
      }),
    ),
});

const chatWidgetExtension = AppRootElementBlueprint.make({
  name: 'chat-widget',
  params: {
    element: React.createElement(ChatWidget),
  },
});

export const assistantPlugin = createFrontendPlugin({
  pluginId: 'assistant',
  extensions: [assistantApi, chatWidgetExtension],
});
