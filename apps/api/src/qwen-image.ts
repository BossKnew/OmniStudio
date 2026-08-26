/**
 * Qwen-Image (千问生图, DashScope/阿里云百炼) image adapter.
 * Speaks the native synchronous multimodal-generation endpoint:
 *   POST {root}/api/v1/services/aigc/multimodal-generation/generation
 * with `input.messages[].content` parts ({text} for T2I, {image} + {text} for I2I),
 * and parses `output.choices[].message.content[].image` URLs.
 *
 * Text-to-image and reference-image editing (1-3 images) are supported.
 * Mask inpainting has no DashScope counterpart and is rejected by the processor.
 */
import { MAX_ERROR_BYTES } from './safe-http.service';
import type { VideoAdapterDeps } from './provider-adapter';

type Json = Record<string, unknown>;

export const QWEN_GENERATION_PATH = '/services/aigc/multimodal-generation/generation';

/** Normalizes a DashScope base URL to the API root carrying /api/v1 (mirrors wanApiRoot). */
export function qwenImageApiRoot(baseUrl: string) {
  let url = baseUrl.trim().replace(/\/+$/, '');
  url = url.replace(/\/services\/aigc\/video-generation\/video-synthesis$/i, '');
  url = url.replace(/\/compatible-mode\/v1$/i, '/api/v1');
  if (/^https:\/\/dashscope(?:-intl|-us)?\.aliyuncs\.com$/i.test(url)) url += '/api/v1';
  if (/^https:\/\/[^/]+\.maas\.aliyuncs\.com$/i.test(url)) url += '/api/v1';
  return url.replace(/\/+$/, '');
}

/** OpenAI-style `WxH` sizes become DashScope's `W*H`; anything else is left to the model. */
export function qwenImageSize(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d{1,5})[xX*×](\d{1,5})$/.exec(value.trim());
  return match ? `${match[1]}*${match[2]}` : undefined;
}

export function qwenImageRequestBody(modelId: string, prompt: string, parameters: { size?: unknown; count?: unknown }, sourceDataUrls: string[] = []) {
  const content: Json[] = sourceDataUrls.map((url) => ({ image: url }));
  content.push({ text: prompt });
  const body: Json = {
    model: modelId,
    input: { messages: [{ role: 'user', content }] },
    parameters: { prompt_extend: false, watermark: false },
  };
  const size = qwenImageSize(parameters.size);
  if (size) (body.parameters as Json).size = size;
  const count = typeof parameters.count === 'number' && Number.isInteger(parameters.count) && parameters.count > 1 ? parameters.count : undefined;
  if (count) (body.parameters as Json).n = count;
  return body;
}

function dashscopeField(body: Buffer | undefined, key: 'code' | 'message') {
  if (!body?.length) return undefined;
  try {
    const parsed = JSON.parse(body.toString('utf8'));
    const object = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Json : undefined;
    const output = object && typeof object.output === 'object' && !Array.isArray(object.output) ? object.output as Json : undefined;
    const value = object?.[key] ?? output?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  } catch { return undefined; }
}

/** Maps DashScope HTTP failures to stable, non-secret diagnostics. */
export function qwenImageFailure(status: number, body?: Buffer) {
  const message = dashscopeField(body, 'message');
  if ((status === 400 || status === 422) && /data.?inspection|moderation|审核/i.test(message ?? '')) {
    return { code: 'PROVIDER_MODERATION', message: '请求或生成结果被供应商安全检查拒绝，请调整提示词或参考图后重试' };
  }
  if (status === 400 || status === 422) {
    return { code: 'PROVIDER_PARAMETERS', message: message ? `供应商拒绝了图片或模型参数：${message}` : '供应商拒绝了图片或模型参数，请管理员检查模型 ID、参考图、尺寸和生成数量' };
  }
  if (status === 401 || status === 403) return { code: 'PROVIDER_AUTH', message: '供应商认证失败，请检查 API Key 是否与 Base URL 地域一致' };
  if (status === 404) {
    return { code: 'PROVIDER_NOT_FOUND', message: message
      ? `供应商接口或模型不存在：${message}`
      : '供应商接口或模型不存在。Base URL 填 https://dashscope.aliyuncs.com/api/v1（不要带 compatible-mode），模型 ID 例如 qwen-image-3.0、qwen-image-2.0-pro、qwen-image-plus。' };
  }
  if (status === 429) return { code: 'PROVIDER_LIMIT', message: '供应商限流或账户额度不足，请稍后重试' };
  return { code: 'PROVIDER_UNAVAILABLE', message: message ? `供应商服务暂时不可用：${message}` : '供应商服务暂时不可用，请稍后重试' };
}

/**
 * Connection probe: a GET against the async tasks API authenticates without
 * generating anything (mirrors the Wan adapter). Non-auth responses count as
 * reachable; generation errors surface on the first real job.
 */
export async function testQwenImageConnection(deps: Pick<VideoAdapterDeps, 'http' | 'headers' | 'baseUrl' | 'timeoutSeconds'>) {
  try {
    const response = await deps.http.request(`${qwenImageApiRoot(deps.baseUrl)}/tasks/0`, {
      method: 'GET',
      headers: deps.headers,
      redirectPolicy: 'same-origin',
      signal: AbortSignal.timeout(Math.min(Math.max(deps.timeoutSeconds, 10), 30) * 1000),
    }, MAX_ERROR_BYTES);
    if (response.status === 401 || response.status === 403) return { ok: false, status: response.status, message: '供应商认证失败，请检查 API Key 是否与 Base URL 地域一致' };
    return { ok: true, status: response.status };
  } catch {
    return { ok: false, message: '供应商连接失败' };
  }
}
