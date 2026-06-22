import { collectEntityLinks, linkifyEntityNames } from './entityNameLinks';

describe('collectEntityLinks', () => {
  it('harvests name and title from list results, keyed to catalog urls', () => {
    const toolCalls = [
      {
        name: 'search_catalog',
        result: JSON.stringify({
          entities: [
            { ref: 'component:default/payment-service', name: 'payment-service' },
            {
              ref: 'component:default/billing',
              name: 'billing',
              title: 'Billing API',
            },
          ],
        }),
      },
    ];
    const map = collectEntityLinks(toolCalls);
    expect(map.get('payment-service')).toBe(
      '/catalog/default/component/payment-service',
    );
    expect(map.get('billing')).toBe('/catalog/default/component/billing');
    expect(map.get('Billing API')).toBe('/catalog/default/component/billing');
  });

  it('harvests a single get_entity result', () => {
    const map = collectEntityLinks([
      {
        name: 'get_entity',
        result: JSON.stringify({
          ref: 'api:default/orders-api',
          name: 'orders-api',
        }),
      },
    ]);
    expect(map.get('orders-api')).toBe('/catalog/default/api/orders-api');
  });

  it('ignores error results and entries without a usable ref', () => {
    const map = collectEntityLinks([
      { name: 'search_catalog', result: JSON.stringify({ error: 'boom' }) },
      {
        name: 'search_catalog',
        result: JSON.stringify({ entities: [{ name: 'no-ref' }] }),
      },
    ]);
    expect(map.size).toBe(0);
  });
});

describe('linkifyEntityNames', () => {
  const map = new Map([
    ['payment-service', '/catalog/default/component/payment-service'],
    ['billing', '/catalog/default/component/billing'],
  ]);

  it('links a bare name mention in prose', () => {
    expect(linkifyEntityNames('You own payment-service today.', map)).toBe(
      'You own [payment-service](/catalog/default/component/payment-service) today.',
    );
  });

  it('links a name wrapped in markdown bold', () => {
    expect(linkifyEntityNames('Owner of **billing** is you.', map)).toBe(
      'Owner of **[billing](/catalog/default/component/billing)** is you.',
    );
  });

  it('does not double-link a name already inside a markdown link', () => {
    const text =
      '[payment-service](/catalog/default/component/payment-service) is healthy.';
    expect(linkifyEntityNames(text, map)).toBe(text);
  });

  it('does not link names inside inline code or fenced blocks', () => {
    expect(linkifyEntityNames('Run `billing` now.', map)).toBe(
      'Run `billing` now.',
    );
    const fenced = '```\npayment-service\n```';
    expect(linkifyEntityNames(fenced, map)).toBe(fenced);
  });

  it('does not partial-match inside a longer word', () => {
    expect(linkifyEntityNames('the billings report', map)).toBe(
      'the billings report',
    );
  });

  it('returns text unchanged when the map is empty', () => {
    expect(linkifyEntityNames('payment-service', new Map())).toBe(
      'payment-service',
    );
  });
});
