const UNITS: Record<string, number> = {
  h: 60 * 60,
  d: 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
  m: 30 * 24 * 60 * 60,
};

export const DEFAULT_TRASH_RETENTION = '30d';

export function parseTrashRetention(value: unknown) {
  if (typeof value !== 'string') throw new Error('回收站留存时长格式无效');
  const normalized = value.trim().toLowerCase();
  const match = /^([1-9]\d{0,2})([hdwm])$/.exec(normalized);
  if (!match) throw new Error('回收站留存时长必须使用整数加 h/d/w/m，例如 12h、7d、2w、1m');
  const seconds = Number(match[1]) * UNITS[match[2]];
  if (seconds < UNITS.h || seconds > 12 * UNITS.m) throw new Error('回收站留存时长必须在 1 小时到 12 个月之间');
  return { value: normalized, seconds };
}

export function trashRetentionFromSetting(value: unknown) {
  try { return parseTrashRetention(value); }
  catch { return parseTrashRetention(DEFAULT_TRASH_RETENTION); }
}
