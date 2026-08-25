import assert from 'node:assert/strict';
import test from 'node:test';
import { buildResolutionMatrix, computeImageSize, firstImageSize, parseRatio, parseSize } from './resolution-options.ts';

const TIERS = [
  { label: '1K', shortEdge: 1024 },
  { label: '2K', shortEdge: 1440 },
  { label: '4K', shortEdge: 2160 },
];
const RATIOS = ['1:1', '3:2', '2:3', '16:9'];

test('parseSize parses valid WxH sizes and rejects anything else', () => {
  assert.deepEqual(parseSize('1024x1024'), { width: 1024, height: 1024 });
  assert.deepEqual(parseSize('1536x1024'), { width: 1536, height: 1024 });
  assert.equal(parseSize('auto'), null);
  assert.equal(parseSize('0x0'), null);
  assert.equal(parseSize('16:9'), null);
});

test('parseRatio parses a:b ratios and rejects sizes', () => {
  assert.deepEqual(parseRatio('3:2'), { width: 3, height: 2 });
  assert.deepEqual(parseRatio('16:9'), { width: 16, height: 9 });
  assert.equal(parseRatio('1024x1024'), null);
  assert.equal(parseRatio('3:'), null);
  assert.equal(parseRatio('a:b'), null);
});

test('computeImageSize combines short edge with any ratio', () => {
  assert.equal(computeImageSize(1024, '1:1'), '1024x1024');
  assert.equal(computeImageSize(1024, '3:2'), '1536x1024');
  assert.equal(computeImageSize(1024, '2:3'), '1024x1536');
  assert.equal(computeImageSize(1440, '3:2'), '2160x1440');
  assert.equal(computeImageSize(2160, '16:9'), '3840x2160');
  assert.equal(computeImageSize(1024, '16:9'), '1824x1024');
  assert.equal(computeImageSize(1024, '21:9'), '2392x1024');
  assert.equal(computeImageSize(0, '1:1'), null);
  assert.equal(computeImageSize(1024, 'bad'), null);
});

test('buildResolutionMatrix exposes every tier x ratio combination freely', () => {
  const matrix = buildResolutionMatrix(TIERS, RATIOS);
  assert.ok(matrix);
  assert.deepEqual(matrix.tiers, ['1K', '2K', '4K']);
  assert.deepEqual(matrix.ratios, ['1:1', '3:2', '2:3', '16:9']);
  assert.equal(matrix.sizeFor('1K', '3:2'), '1536x1024');
  assert.equal(matrix.sizeFor('1K', '16:9'), '1824x1024');
  assert.equal(matrix.sizeFor('2K', '3:2'), '2160x1440');
  assert.equal(matrix.sizeFor('4K', '16:9'), '3840x2160');
  assert.equal(matrix.sizeFor('1K', '1:1'), '1024x1024');
  assert.deepEqual(matrix.sizesForTier('1K'), ['1024x1024', '1536x1024', '1024x1536', '1824x1024']);
  assert.deepEqual(matrix.sizesForRatio('3:2'), ['1536x1024', '2160x1440', '3240x2160']);
  const part = matrix.partsOf('2160x1440');
  assert.ok(part);
  assert.equal(part.tier, '2K');
  assert.equal(part.ratio, '3:2');
  assert.equal(part.shortEdge, 1440);
});

test('buildResolutionMatrix returns null for empty configs', () => {
  assert.equal(buildResolutionMatrix([], RATIOS), null);
  assert.equal(buildResolutionMatrix(TIERS, []), null);
});

test('firstImageSize derives the default size from the first combo', () => {
  assert.equal(firstImageSize(TIERS, RATIOS), '1024x1024');
  assert.equal(firstImageSize([{ label: '1K', shortEdge: 1024 }], ['2:3']), '1024x1536');
  assert.equal(firstImageSize([], RATIOS), '');
});
