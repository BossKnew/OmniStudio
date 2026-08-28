import { DEFAULT_TRASH_RETENTION, parseTrashRetention, trashRetentionFromSetting } from './trash-retention';

describe('trash retention parser', () => {
  it.each([
    ['12h', 12 * 60 * 60],
    ['7d', 7 * 24 * 60 * 60],
    ['2w', 14 * 24 * 60 * 60],
    ['30d', 30 * 24 * 60 * 60],
    ['1m', 30 * 24 * 60 * 60],
  ])('parses %s', (value, seconds) => {
    expect(parseTrashRetention(value)).toEqual({ value: value.toLowerCase(), seconds });
  });

  it.each(['0h', '30', '1y', '1.5d', '13m', '999d', '', ' d'])('rejects %s', (value) => {
    expect(() => parseTrashRetention(value)).toThrow();
  });

  it('falls back to the default retention when the stored value is invalid', () => {
    expect(trashRetentionFromSetting(null)).toEqual(parseTrashRetention(DEFAULT_TRASH_RETENTION));
    expect(trashRetentionFromSetting('nope')).toEqual(parseTrashRetention(DEFAULT_TRASH_RETENTION));
  });
});
