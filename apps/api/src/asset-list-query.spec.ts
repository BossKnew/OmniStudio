import { BadRequestException } from '@nestjs/common';
import { assetFilterWhere, escapeLike, parseAssetListQuery } from './asset-list-query';

const modelId = '11111111-1111-4111-8111-111111111111';

describe('parseAssetListQuery', () => {
  it('returns an empty filter object when no query is present', () => {
    expect(parseAssetListQuery(undefined, { allowQ: true })).toEqual({});
    expect(parseAssetListQuery({}, { allowQ: true })).toEqual({});
  });

  it('parses mediaKind, role, modelId, q, and an ISO date range', () => {
    const result = parseAssetListQuery({
      mediaKind: 'VIDEO',
      role: 'OUTPUT',
      modelId,
      q: '  封面  ',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-28T00:00:00.000Z',
    }, { allowQ: true });
    expect(result).toEqual({
      mediaKind: 'VIDEO',
      role: 'OUTPUT',
      modelId,
      q: '封面',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-28T00:00:00.000Z'),
    });
  });

  it('escapes LIKE wildcards in the keyword', () => {
    expect(parseAssetListQuery({ q: '100%_off' }, { allowQ: true }).q).toBe('100\\%\\_off');
    expect(escapeLike('\\already')).toBe('\\\\already');
  });

  it('rejects invalid enums, ids, dates, and oversized keywords', () => {
    expect(() => parseAssetListQuery({ mediaKind: 'AUDIO' }, { allowQ: true })).toThrow(BadRequestException);
    expect(() => parseAssetListQuery({ role: 'MASK' }, { allowQ: true })).toThrow(BadRequestException);
    expect(() => parseAssetListQuery({ modelId: 'not-a-uuid' }, { allowQ: true })).toThrow(BadRequestException);
    expect(() => parseAssetListQuery({ from: '2026-08-01' }, { allowQ: true })).toThrow(BadRequestException);
    expect(() => parseAssetListQuery({ from: '2026-08-28T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' }, { allowQ: true })).toThrow(BadRequestException);
    expect(() => parseAssetListQuery({ from: '2026-08-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' }, { allowQ: true })).toThrow(BadRequestException);
    expect(() => parseAssetListQuery({ q: 'x'.repeat(101) }, { allowQ: true })).toThrow(BadRequestException);
    expect(() => parseAssetListQuery({ q: ['a'] }, { allowQ: true })).toThrow(BadRequestException);
  });

  it('rejects keywords on the shared library', () => {
    expect(() => parseAssetListQuery({ q: '封面' }, { allowQ: false })).toThrow(BadRequestException);
    expect(parseAssetListQuery({ q: '   ' }, { allowQ: false })).toEqual({});
  });
});

describe('assetFilterWhere', () => {
  it('keeps library roles and excludes deleted assets by default', () => {
    expect(assetFilterWhere({})).toEqual({ deletedAt: null, role: { in: ['UPLOAD', 'OUTPUT'] } });
  });

  it('lists only unpurged trash items when requested', () => {
    expect(assetFilterWhere({}, { trash: true })).toEqual({
      deletedAt: { not: null },
      purgedAt: null,
      role: { in: ['UPLOAD', 'OUTPUT'] },
    });
  });

  it('applies mediaKind, role, and createdAt bounds', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-28T00:00:00.000Z');
    expect(assetFilterWhere({ mediaKind: 'IMAGE', role: 'UPLOAD', from, to })).toEqual({
      deletedAt: null,
      role: 'UPLOAD',
      mediaKind: 'IMAGE',
      createdAt: { gte: from, lt: to },
    });
  });

  it('filters by model id and ORs note with the generation prompt', () => {
    expect(assetFilterWhere({ q: '雨夜' })).toEqual({
      deletedAt: null,
      role: { in: ['UPLOAD', 'OUTPUT'] },
      OR: [
        { note: { contains: '雨夜', mode: 'insensitive' } },
        { job: { prompt: { contains: '雨夜', mode: 'insensitive' } } },
      ],
    });
    expect(assetFilterWhere({ modelId })).toEqual({
      deletedAt: null,
      role: { in: ['UPLOAD', 'OUTPUT'] },
      job: { modelId },
    });
  });

  it('ANDs model id with keyword matching so the job clause is not overwritten', () => {
    expect(assetFilterWhere({ modelId, q: '封面' })).toEqual({
      deletedAt: null,
      role: { in: ['UPLOAD', 'OUTPUT'] },
      AND: [
        { job: { modelId } },
        { OR: [
          { note: { contains: '封面', mode: 'insensitive' } },
          { job: { prompt: { contains: '封面', mode: 'insensitive' } } },
        ] },
      ],
    });
  });
});
