import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_ASSET_FILTERS, activeAssetFilterCount, hasActiveAssetFilters, isInvertedDateRange, localDayEndExclusiveIso, localDayStartIso, toAssetQuery } from './asset-query.ts';

test('omits empty filters and includes active ones', () => {
  assert.equal(toAssetQuery(EMPTY_ASSET_FILTERS), '');
  assert.equal(
    toAssetQuery({ mediaKind: 'IMAGE', role: 'OUTPUT', q: '  封面  ', modelId: 'model-1', from: '', to: '' }),
    'mediaKind=IMAGE&role=OUTPUT&q=%E5%B0%81%E9%9D%A2&modelId=model-1',
  );
});

test('skips keywords when includeQ is false', () => {
  assert.equal(
    toAssetQuery({ ...EMPTY_ASSET_FILTERS, mediaKind: 'VIDEO', q: 'secret' }, { includeQ: false, teamId: 'team-1' }),
    'mediaKind=VIDEO&teamId=team-1',
  );
});

test('converts local calendar days to an exclusive ISO range', () => {
  const from = new Date(localDayStartIso('2026-08-01'));
  const to = new Date(localDayEndExclusiveIso('2026-08-01'));
  assert.equal(to.getTime() - from.getTime(), 24 * 60 * 60 * 1000);
  assert.equal(from.getHours(), 0);
  assert.equal(from.getMinutes(), 0);
  const query = toAssetQuery({ ...EMPTY_ASSET_FILTERS, from: '2026-08-01', to: '2026-08-07', q: '' });
  const params = new URLSearchParams(query);
  assert.equal(params.get('from'), localDayStartIso('2026-08-01'));
  assert.equal(params.get('to'), localDayEndExclusiveIso('2026-08-07'));
});

test('reports active filters and inverted date ranges', () => {
  assert.equal(hasActiveAssetFilters(EMPTY_ASSET_FILTERS), false);
  assert.equal(hasActiveAssetFilters({ ...EMPTY_ASSET_FILTERS, q: '  note  ' }), true);
  assert.equal(activeAssetFilterCount({ ...EMPTY_ASSET_FILTERS, mediaKind: 'IMAGE', from: '2026-08-01' }), 2);
  assert.equal(isInvertedDateRange('2026-08-10', '2026-08-01'), true);
  assert.equal(isInvertedDateRange('2026-08-01', '2026-08-01'), false);
});
