import { qwenImageApiRoot, qwenImageFailure, qwenImageRequestBody, qwenImageSize, testQwenImageConnection } from './qwen-image';

describe('qwen-image adapter', () => {
  it('normalizes DashScope base URLs to the API root', () => {
    expect(qwenImageApiRoot('https://dashscope.aliyuncs.com')).toBe('https://dashscope.aliyuncs.com/api/v1');
    expect(qwenImageApiRoot('https://dashscope.aliyuncs.com/api/v1')).toBe('https://dashscope.aliyuncs.com/api/v1');
    expect(qwenImageApiRoot('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBe('https://dashscope.aliyuncs.com/api/v1');
    expect(qwenImageApiRoot('https://dashscope-intl.aliyuncs.com/api/v1/')).toBe('https://dashscope-intl.aliyuncs.com/api/v1');
    expect(qwenImageApiRoot('https://ws-123.cn-beijing.maas.aliyuncs.com')).toBe('https://ws-123.cn-beijing.maas.aliyuncs.com/api/v1');
    expect(qwenImageApiRoot('https://ws-123.cn-beijing.maas.aliyuncs.com/api/v1')).toBe('https://ws-123.cn-beijing.maas.aliyuncs.com/api/v1');
  });

  it('converts OpenAI-style sizes to the DashScope asterisk format', () => {
    expect(qwenImageSize('1024x1024')).toBe('1024*1024');
    expect(qwenImageSize('1536X1024')).toBe('1536*1024');
    expect(qwenImageSize('1824*1024')).toBe('1824*1024');
    expect(qwenImageSize('auto')).toBeUndefined();
    expect(qwenImageSize(undefined)).toBeUndefined();
  });

  it('builds a sync multimodal-generation body for text-to-image', () => {
    expect(qwenImageRequestBody('qwen-image-3.0', 'a cat', { size: '1024x1024', count: 2 })).toEqual({
      model: 'qwen-image-3.0',
      input: { messages: [{ role: 'user', content: [{ text: 'a cat' }] }] },
      parameters: { prompt_extend: false, watermark: false, size: '1024*1024', n: 2 },
    });
  });

  it('omits size and n when they are absent or singular', () => {
    expect(qwenImageRequestBody('qwen-image-3.0', 'a cat', {})).toEqual({
      model: 'qwen-image-3.0',
      input: { messages: [{ role: 'user', content: [{ text: 'a cat' }] }] },
      parameters: { prompt_extend: false, watermark: false },
    });
    expect(qwenImageRequestBody('qwen-image-3.0', 'a cat', { count: 1 })).not.toHaveProperty('parameters.n');
  });

  it('builds an image-edit body with reference data URLs before the text part', () => {
    const body = qwenImageRequestBody('qwen-image-3.0', 'edit it', { count: 1 }, ['data:image/png;base64,abc', 'data:image/jpeg;base64,def']);
    const messages = body.input as { messages: Array<{ role: string; content: Array<{ text?: string; image?: string }> }> };
    expect(messages.messages[0].content).toEqual([
      { image: 'data:image/png;base64,abc' },
      { image: 'data:image/jpeg;base64,def' },
      { text: 'edit it' },
    ]);
  });

  it('maps DashScope errors to stable, non-secret diagnostics', () => {
    expect(qwenImageFailure(401)).toEqual(expect.objectContaining({ code: 'PROVIDER_AUTH' }));
    expect(qwenImageFailure(403)).toEqual(expect.objectContaining({ code: 'PROVIDER_AUTH' }));
    expect(qwenImageFailure(400, Buffer.from(JSON.stringify({ code: 'InvalidParameter', message: 'n must be 1' })))).toEqual(expect.objectContaining({
      code: 'PROVIDER_PARAMETERS',
      message: expect.stringContaining('n must be 1'),
    }));
    expect(qwenImageFailure(400, Buffer.from(JSON.stringify({ code: 'DataInspectionFailed', message: 'content moderation' })))).toEqual(expect.objectContaining({
      code: 'PROVIDER_MODERATION',
    }));
    expect(qwenImageFailure(404, Buffer.from(JSON.stringify({ code: 'ModelNotFound', message: 'model not found' })))).toEqual(expect.objectContaining({
      code: 'PROVIDER_NOT_FOUND',
      message: expect.stringContaining('model not found'),
    }));
    expect(qwenImageFailure(429)).toEqual(expect.objectContaining({ code: 'PROVIDER_LIMIT' }));
    expect(qwenImageFailure(503)).toEqual(expect.objectContaining({ code: 'PROVIDER_UNAVAILABLE' }));
  });

  it('reports auth failures from the connection probe', async () => {
    const http = { request: jest.fn().mockResolvedValue({ ok: false, status: 401, headers: new Headers(), body: Buffer.from('{}') }) };
    await expect(testQwenImageConnection({ http: http as any, headers: {}, baseUrl: 'https://dashscope.aliyuncs.com/api/v1', timeoutSeconds: 30 }))
      .resolves.toMatchObject({ ok: false, status: 401, message: expect.stringContaining('API Key') });
  });

  it('treats a reachable tasks endpoint as a successful probe', async () => {
    const http = { request: jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), body: Buffer.from('{}') }) };
    await expect(testQwenImageConnection({ http: http as any, headers: {}, baseUrl: 'https://dashscope.aliyuncs.com', timeoutSeconds: 30 }))
      .resolves.toMatchObject({ ok: true, status: 200 });
    expect(http.request).toHaveBeenCalledWith('https://dashscope.aliyuncs.com/api/v1/tasks/0', expect.objectContaining({ redirectPolicy: 'same-origin' }), expect.any(Number));
  });
});
