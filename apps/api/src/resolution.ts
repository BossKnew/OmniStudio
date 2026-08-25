// 图片模型分辨率档位（几 K + 短边）与比例的自由组合计算。
// 档位只定义短边长度，例如 1K -> 1024；任意比例都可组合：
//   1K + 3:2  -> 1536x1024
//   1K + 16:9 -> 1824x1024（按 8 取整）
// 与 apps/web/lib/resolution-options.ts 保持同一算法，两侧都有单测覆盖。

export type ResolutionTier = { label: string; shortEdge: number };
export type ParsedSize = { width: number; height: number };

export const DEFAULT_IMAGE_TIERS: ResolutionTier[] = [
  { label: '1K', shortEdge: 1024 },
  { label: '2K', shortEdge: 1440 },
  { label: '4K', shortEdge: 2160 },
];
export const DEFAULT_IMAGE_RATIOS = ['1:1', '3:2', '2:3', '16:9'];
export const MIN_SHORT_EDGE = 64;
export const MAX_SHORT_EDGE = 8192;
const RATIO_PATTERN = /^(\d{1,4}):(\d{1,4})$/;
const SIZE_PATTERN = /^(\d{1,5})x(\d{1,5})$/;

export function parseRatio(value: string): ParsedSize | null {
  const match = RATIO_PATTERN.exec(value.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

export function parseSize(value: string): ParsedSize | null {
  const match = SIZE_PATTERN.exec(value.trim());
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

export function gcd(left: number, right: number): number {
  return right === 0 ? left : gcd(right, left % right);
}

/** 短边 + 比例 -> "WxH"，长边按 8 取整（扩散模型常见对齐要求）。 */
export function computeImageSize(shortEdge: number, ratio: string): string | null {
  const parsed = parseRatio(ratio);
  if (!parsed || !Number.isInteger(shortEdge) || shortEdge < MIN_SHORT_EDGE || shortEdge > MAX_SHORT_EDGE) return null;
  const divisor = gcd(parsed.width, parsed.height);
  const a = parsed.width / divisor;
  const b = parsed.height / divisor;
  const scale = shortEdge / Math.min(a, b);
  const width = roundTo8(a * scale);
  const height = roundTo8(b * scale);
  return `${width}x${height}`;
}

function roundTo8(value: number): number {
  return Math.max(8, Math.round(value / 8) * 8);
}

/** 校验某档位 + 比例组合是否落在配置内。 */
export function imageSizeAllowed(tiers: ResolutionTier[], ratios: string[], size: string): boolean {
  return imageSizeEntry(tiers, ratios, size) !== null;
}

/** 按 size 查找匹配的档位（以短边识别）。 */
export function tierLabelForSize(tiers: ResolutionTier[], size: string): string | undefined {
  const parsed = parseSize(size);
  if (!parsed) return undefined;
  const shortEdge = Math.min(parsed.width, parsed.height);
  return tiers.find((tier) => tier.shortEdge === shortEdge)?.label;
}

export function imageSizeEntry(tiers: ResolutionTier[], ratios: string[], size: string): { tier: ResolutionTier; ratio: string } | null {
  for (const tier of tiers) {
    for (const ratio of ratios) {
      if (computeImageSize(tier.shortEdge, ratio) === size) return { tier, ratio };
    }
  }
  return null;
}

export function cleanImageTiers(value: unknown): ResolutionTier[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  const result: ResolutionTier[] = [];
  const seenShortEdges = new Set<number>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    const shortEdge = typeof entry.shortEdge === 'number' ? entry.shortEdge : Number(entry.shortEdge);
    if (!label || label.length > 16) continue;
    if (!Number.isInteger(shortEdge) || shortEdge < MIN_SHORT_EDGE || shortEdge > MAX_SHORT_EDGE) continue;
    if (seenShortEdges.has(shortEdge)) continue;
    seenShortEdges.add(shortEdge);
    result.push({ label, shortEdge });
  }
  return result;
}

export function cleanImageRatios(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const ratio = raw.trim();
    if (!parseRatio(ratio) || seen.has(ratio)) continue;
    seen.add(ratio);
    result.push(ratio);
  }
  return result;
}
