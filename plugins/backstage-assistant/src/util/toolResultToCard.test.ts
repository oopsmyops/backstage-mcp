import { toolResultToCard, entityUrl } from './toolResultToCard';

describe('toolResultToCard', () => {
  it('maps search_catalog to a table with internal entity links', () => {
    const cards = toolResultToCard('search_catalog', {
      entities: [
        {
          ref: 'component:default/payment-service',
          name: 'payment-service',
          type: 'service',
          owner: 'team-a',
          description: 'Handles payments',
        },
      ],
    });
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card.type).toBe('table');
    if (card.type !== 'table') throw new Error('expected table');
    const row = card.rows[0] as Record<string, any>;
    expect(row.name).toEqual({
      text: 'payment-service',
      href: '/catalog/default/component/payment-service',
    });
    expect(row.owner).toBe('team-a');
  });

  it('returns an empty-state text card when the list is empty', () => {
    const cards = toolResultToCard('search_catalog', { entities: [] });
    expect(cards).toEqual([{ type: 'text', body: 'No results found.' }]);
  });

  it('maps get_entity to a details card including relation links', () => {
    const cards = toolResultToCard('get_entity', {
      ref: 'component:default/web',
      kind: 'Component',
      name: 'web',
      owner: 'team-x',
      relations: [
        { type: 'providesApi', targetRef: 'api:default/web-api', targetName: 'web-api' },
      ],
    });
    const card = cards[0];
    expect(card.type).toBe('details');
    if (card.type !== 'details') throw new Error('expected details');
    expect(card.items[0]).toEqual({
      label: 'Name',
      value: { text: 'web', href: '/catalog/default/component/web' },
    });
    const relation = card.items.find(i => i.label === 'providesApi');
    expect(relation?.value).toEqual({
      text: 'web-api',
      href: '/catalog/default/api/web-api',
    });
  });

  it('maps get_api_spec to a code card with detected language', () => {
    const cards = toolResultToCard('get_api_spec', {
      entityRef: 'api:default/web-api',
      spec: '{"openapi":"3.0.0"}',
    });
    expect(cards[0]).toEqual({
      type: 'code',
      title: 'API specification',
      language: 'json',
      code: '{"openapi":"3.0.0"}',
    });
  });

  it('maps get_techdocs to a document card', () => {
    const cards = toolResultToCard('get_techdocs', {
      entityRef: 'component:default/web',
      content: '# Title\nbody',
    });
    expect(cards[0]).toEqual({
      type: 'document',
      title: 'Documentation',
      sections: [{ body: '# Title\nbody' }],
    });
  });

  it('maps get_task_status to a status card', () => {
    const cards = toolResultToCard('get_task_status', {
      taskId: 'abcdef123456',
      status: 'completed',
      templateRef: 'template:default/node',
    });
    const card = cards[0];
    expect(card.type).toBe('status');
    if (card.type !== 'status') throw new Error('expected status');
    expect(card.status).toBe('completed');
    expect(card.items?.find(i => i.label === 'Task ID')?.value).toBe('abcdef12');
  });

  it('maps get_catalog_facets to one table per facet', () => {
    const cards = toolResultToCard('get_catalog_facets', {
      facets: { 'spec.type': [{ value: 'service', count: 12 }] },
    });
    expect(cards[0].type).toBe('table');
    expect(cards[0].title).toBe('spec.type');
  });

  it('returns [] for unknown tools and error results', () => {
    expect(toolResultToCard('nope', { foo: 1 })).toEqual([]);
    expect(toolResultToCard('search_catalog', { error: 'boom' })).toEqual([]);
    expect(toolResultToCard('get_entity', null)).toEqual([]);
  });
});

describe('entityUrl', () => {
  it('builds an internal catalog route, defaulting the namespace', () => {
    expect(entityUrl('component:web')).toBe('/catalog/default/component/web');
    expect(entityUrl('api:prod/orders')).toBe('/catalog/prod/api/orders');
    expect(entityUrl(undefined)).toBeUndefined();
  });
});
