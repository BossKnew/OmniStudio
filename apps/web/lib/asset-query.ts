export type AssetMediaFilter = 'ALL' | 'IMAGE' | 'VIDEO';
export type AssetRoleFilter = 'ALL' | 'OUTPUT' | 'UPLOAD';

export type AssetLibraryFilters = {
  mediaKind: AssetMediaFilter;
  role: AssetRoleFilter;
  q?: string;
  from?: string;
  to?: string;
  modelId?: string;
};

export const EMPTY_ASSET_FILTERS: AssetLibraryFilters = { mediaKind: 'ALL', role: 'ALL', q: '', from: '', to: '', modelId: '' };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function toAssetQuery(filters: AssetLibraryFilters, extras: { teamId?: string; cursor?: string; includeQ?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.mediaKind !== 'ALL') params.set('mediaKind', filters.mediaKind);
  if (filters.role !== 'ALL') params.set('role', filters.role);
  if (extras.includeQ !== false) {
    const q = filters.q?.trim() ?? '';
    if (q) params.set('q', q);
  }
  if (isDay(filters.from)) params.set('from', localDayStartIso(filters.from));
  if (isDay(filters.to)) params.set('to', localDayEndExclusiveIso(filters.to));
  if (filters.modelId) params.set('modelId', filters.modelId);
  if (extras.teamId) params.set('teamId', extras.teamId);
  if (extras.cursor) params.set('cursor', extras.cursor);
  return params.toString();
}

export function hasActiveAssetFilters(filters: AssetLibraryFilters) {
  return activeAssetFilterCount(filters) > 0;
}

export function activeAssetFilterCount(filters: AssetLibraryFilters) {
  return Number(filters.mediaKind !== 'ALL')
    + Number(filters.role !== 'ALL')
    + Number(Boolean(filters.q?.trim()))
    + Number(Boolean(filters.from))
    + Number(Boolean(filters.to))
    + Number(Boolean(filters.modelId));
}

export function isInvertedDateRange(from?: string, to?: string) {
  return Boolean(from && to && from > to);
}

export function localDayStartIso(ymd: string) {
  return new Date(`${ymd}T00:00:00`).toISOString();
}

export function localDayEndExclusiveIso(ymd: string) {
  const date = new Date(`${ymd}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function isDay(value?: string): value is string {
  return Boolean(value && DAY.test(value));
}
