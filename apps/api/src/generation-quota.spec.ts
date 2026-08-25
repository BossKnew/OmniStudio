import { evaluatePolicies, eventsInWindow, parseQuotaPair, parseQuotaPoints, parseQuotaWindow, pointsForGeneration, quotaPoliciesFromGroups, retryAfterSeconds, usedPoints } from './generation-quota';

describe('generation quota window', () => {
  it('parses the same duration units as session length', () => {
    expect(parseQuotaWindow('5h')).toEqual({ value: '5h', seconds: 5 * 60 * 60 });
    expect(parseQuotaWindow('1d')).toEqual({ value: '1d', seconds: 24 * 60 * 60 });
  });

  it('requires window and points together', () => {
    expect(parseQuotaPair(null, null)).toEqual({ quotaWindow: null, quotaPoints: null });
    expect(() => parseQuotaPair('5h', null)).toThrow('生成额度的窗口和积分必须同时填写或同时留空');
    expect(() => parseQuotaPair(null, 5)).toThrow('生成额度的窗口和积分必须同时填写或同时留空');
    expect(parseQuotaPair('5H', 5)).toEqual({ quotaWindow: '5h', quotaPoints: 5 });
  });

  it('rejects points outside the supported range', () => {
    expect(() => parseQuotaPoints(0)).toThrow('生成额度积分必须为 1-1000000 的整数');
    expect(() => parseQuotaPoints(1_000_001)).toThrow('生成额度积分必须为 1-1000000 的整数');
    expect(parseQuotaPoints(1_000_000)).toBe(1_000_000);
  });

  it('ignores groups that have not configured both fields', () => {
    expect(quotaPoliciesFromGroups([
      { id: 'open', name: 'Open', quotaWindow: null, quotaPoints: null },
      { id: 'intern', name: 'Intern', quotaWindow: '5h', quotaPoints: 5 },
    ])).toEqual([{ groupId: 'intern', name: 'Intern', window: '5h', windowSeconds: 5 * 60 * 60, points: 5 }]);
  });

  it('counts only events inside the sliding window', () => {
    const now = new Date('2026-08-20T12:00:00.000Z');
    const events = [
      { createdAt: new Date('2026-08-20T06:59:00.000Z'), points: 4 },
      { createdAt: new Date('2026-08-20T07:01:00.000Z'), points: 2 },
      { createdAt: new Date('2026-08-20T11:00:00.000Z'), points: 1 },
    ];
    expect(usedPoints(eventsInWindow(events, now, 5 * 60 * 60))).toBe(3);
  });

  it('blocks a request that would exceed the tightest group and waits for the oldest event to age out', () => {
    const now = new Date('2026-08-20T12:00:00.000Z');
    const events = [
      { createdAt: new Date('2026-08-20T08:00:00.000Z'), points: 4 },
      { createdAt: new Date('2026-08-20T11:00:00.000Z'), points: 1 },
    ];
    const intern = { groupId: 'intern', name: 'Intern', window: '5h', windowSeconds: 5 * 60 * 60, points: 5 };
    const design = { groupId: 'design', name: 'Design', window: '1d', windowSeconds: 24 * 60 * 60, points: 100 };
    const result = evaluatePolicies([design, intern], events, 1, now);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.policy.groupId).toBe('intern');
    expect(result.retryAfterSeconds).toBe(60 * 60);
    expect(retryAfterSeconds(eventsInWindow(events, now, intern.windowSeconds), intern.windowSeconds, intern.points, 5, now)).toBe(4 * 60 * 60);
  });

});

describe('pointsForGeneration', () => {
  it('charges base points when no multipliers are configured', () => {
    expect(pointsForGeneration({ mediaKind: 'IMAGE', costPerUnit: 1, count: 2 })).toBe(2);
  });

  it('applies the image size multiplier and rounds the total up', () => {
    expect(pointsForGeneration({ mediaKind: 'IMAGE', costPerUnit: 1, count: 1, size: '1024x1024', pointMultipliers: { '1024x1024': 1.5 } })).toBe(2);
  });

  it('falls back to 1x when the size is not in the multiplier table', () => {
    expect(pointsForGeneration({ mediaKind: 'IMAGE', costPerUnit: 3, count: 1, size: '512x512', pointMultipliers: { '1024x1024': 2 } })).toBe(3);
  });
  it('prefers the explicit multiplier key (image tier label) over the size', () => {
    expect(pointsForGeneration({ mediaKind: 'IMAGE', costPerUnit: 2, count: 1, size: '1536x1024', multiplierKey: '1K', pointMultipliers: { '1K': 1.5 } })).toBe(3);
  });

  it('falls back to the size key when no explicit multiplier key is given', () => {
    expect(pointsForGeneration({ mediaKind: 'IMAGE', costPerUnit: 2, count: 1, size: '1536x1024', pointMultipliers: { '1536x1024': 2 } })).toBe(4);
  });

  it('applies the video quality multiplier to the duration', () => {
    expect(pointsForGeneration({ mediaKind: 'VIDEO', costPerUnit: 1, count: 1, durationSeconds: 5, quality: '1080P', pointMultipliers: { '1080P': 2 } })).toBe(10);
  });

  it('treats invalid multipliers as 1x', () => {
    const base = { mediaKind: 'IMAGE' as const, costPerUnit: 2, count: 3, size: '1024x1024' };
    const invalid: unknown[] = [
      { '1024x1024': 0 }, { '1024x1024': -1 }, { '1024x1024': 101 }, { '1024x1024': '2' }, null, 'table',
    ];
    for (const multipliers of invalid) {
      expect(pointsForGeneration({ ...base, pointMultipliers: multipliers })).toBe(6);
    }
  });
});
