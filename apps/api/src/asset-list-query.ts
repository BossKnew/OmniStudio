import { BadRequestException } from '@nestjs/common';
import type { Prisma } from './generated/prisma/client';
import { uuidSchema } from './validation';

const LIBRARY_ROLES = ['UPLOAD', 'OUTPUT'] as const;
const MEDIA_KINDS = ['IMAGE', 'VIDEO'] as const;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
const MAX_QUERY_LENGTH = 100;

export type AssetListFilters = {
  mediaKind?: 'IMAGE' | 'VIDEO';
  role?: 'UPLOAD' | 'OUTPUT';
  q?: string;
  from?: Date;
  to?: Date;
  modelId?: string;
};

export function parseAssetListQuery(query: Record<string, unknown> | undefined, options: { allowQ: boolean }): AssetListFilters {
  const raw = query ?? {};
  const mediaKind = optionalEnum(raw.mediaKind, MEDIA_KINDS, '素材类型无效');
  const role = optionalEnum(raw.role, LIBRARY_ROLES, '来源无效');
  const q = optionalText(raw.q, '关键词');
  const from = optionalInstant(raw.from, '起始时间');
  const to = optionalInstant(raw.to, '结束时间');
  const modelId = optionalUuid(raw.modelId, '模型无效');

  if (q !== undefined) {
    if (!options.allowQ) throw new BadRequestException('团队素材不支持关键词搜索');
    if (q.length > MAX_QUERY_LENGTH) throw new BadRequestException(`关键词不能超过 ${MAX_QUERY_LENGTH} 个字符`);
  }
  if (from && to && from.getTime() >= to.getTime()) throw new BadRequestException('起始时间必须早于结束时间');

  return {
    ...(mediaKind ? { mediaKind } : {}),
    ...(role ? { role } : {}),
    ...(q ? { q: escapeLike(q) } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(modelId ? { modelId } : {}),
  };
}

export function assetFilterWhere(filters: AssetListFilters, options?: { trash?: boolean }): Prisma.AssetWhereInput {
  const where: Prisma.AssetWhereInput = options?.trash
    ? { deletedAt: { not: null }, purgedAt: null, role: filters.role ?? { in: [...LIBRARY_ROLES] } }
    : { deletedAt: null, role: filters.role ?? { in: [...LIBRARY_ROLES] } };
  if (filters.mediaKind) where.mediaKind = filters.mediaKind;
  const createdAt = createdAtFilter(filters.from, filters.to);
  if (createdAt) where.createdAt = createdAt;

  const textMatch = filters.q ? {
    OR: [
      { note: { contains: filters.q, mode: 'insensitive' as const } },
      { job: { prompt: { contains: filters.q, mode: 'insensitive' as const } } },
    ],
  } : undefined;

  if (filters.modelId && textMatch) where.AND = [{ job: { modelId: filters.modelId } }, textMatch];
  else if (filters.modelId) where.job = { modelId: filters.modelId };
  else if (textMatch) where.OR = textMatch.OR;
  return where;
}

export function escapeLike(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function createdAtFilter(from?: Date, to?: Date): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lt: to } : {}),
  };
}

function optionalText(raw: unknown, label: string) {
  const value = optionalString(raw, label);
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalEnum<T extends string>(raw: unknown, allowed: readonly T[], message: string): T | undefined {
  const value = optionalString(raw, message);
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) throw new BadRequestException(message);
  return value as T;
}

function optionalUuid(raw: unknown, message: string) {
  const value = optionalString(raw, message);
  if (value === undefined) return undefined;
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(message);
  return parsed.data;
}

function optionalInstant(raw: unknown, label: string) {
  const value = optionalString(raw, `${label}必须为 ISO 时间`);
  if (value === undefined) return undefined;
  if (value.length > 40 || !ISO_INSTANT.test(value)) throw new BadRequestException(`${label}必须为 ISO 时间`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new BadRequestException(`${label}必须为 ISO 时间`);
  return date;
}

function optionalString(raw: unknown, message: string) {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string') throw new BadRequestException(message);
  return raw;
}
