import { seedreamApiRoot, seedreamFailure, seedreamRequestBody, seedreamSize, testSeedreamConnection } from './seedream';

describe('seedream adapter', () => {
  it('normalizes Volcengine Ark base URLs to /api/v3', () => {
    expect(seedreamApiRoot('https://ark.cn-beijing.volces.com')).toBe('https://ark.cn-beijing.volces.com/api/v3');
    expect(seedreamApiRoot('https://ark.cn-beijing.volces.com/api/v3')).toBe('https://ark.cn-beijing.volces.com/api/v3');
    expect(seedreamApiRoot('https://ark.ap-southeast.bytepluses.com')).toBe('https://ark.ap-southeast.bytepluses.com/api/v3');
  });

  it('maps WxH and tier labels onto Seedream size tokens', () => {
    expect(seedreamSize('1024x1024')).toBe('1K');
    expect(seedreamSize('2048x2048')).toBe('2K');
    expect(seedreamSize('3840x2160')).toBe('4K');
    expect(seedreamSize('1024x1024', '2K')).toBe('2K');
    expect(seedreamSize('2K')).toBe('2K');
  });

  it('builds a generations body for text-to-image', () => {
    expect(seedreamRequestBody('doubao-seedream-4-0-250828', 'a cat', { size: '1024x1024' })).toEqual({
      model: 'doubao-seedream-4-0-250828',
      prompt: 'a cat',
      watermark: false,
      size: '1K',
    });
  });

  it('puts a single reference image as a string and multiple as an array', () => {
    expect(seedreamRequestBody('doubao-seedream-5-0-260128', 'edit it', { size: '2K' }, ['data:image/png;base64,abc'])).toEqual({
      model: 'doubao-seedream-5-0-260128',
      prompt: 'edit it',
      watermark: false,
      size: '2K',
      image: 'data:image/png;base64,abc',
    });
    expect(seedreamRequestBody('doubao-seedream-5-0-260128', 'merge', {}, ['data:image/png;base64,a', 'data:image/png;base64,b']).image).toEqual([
      'data:image/png;base64,a',
      'data:image/png;base64,b',
    ]);
  });

  it('enables sequential generation when more than one image is requested', () => {
    expect(seedreamRequestBody('doubao-seedream-4-0-250828', 'a cat', { count: 2 })).toEqual(expect.objectContaining({
      sequential_image_generation: 'auto',
      sequential_image_generation_options: { max_images: 2 },
    }));
    expect(seedreamRequestBody('doubao-seedream-4-0-250828', 'a cat', { count: 1 })).not.toHaveProperty('sequential_image_generation');
    expect(seedreamRequestBody('doubao-seedream-5-0-pro-260628', 'a cat', { count: 2 })).not.toHaveProperty('sequential_image_generation');
  });

  it('maps Ark errors to stable diagnostics', () => {
    expect(seedreamFailure(401)).toEqual(expect.objectContaining({ code: 'PROVIDER_AUTH' }));
    expect(seedreamFailure(400, Buffer.from(JSON.stringify({ error: { message: 'sensitive content' } })))).toEqual(expect.objectContaining({
      code: 'PROVIDER_MODERATION',
    }));
    expect(seedreamFailure(400, Buffer.from(JSON.stringify({ error: { message: 'invalid size' } })))).toEqual(expect.objectContaining({
      code: 'PROVIDER_PARAMETERS',
      message: expect.stringContaining('invalid size'),
    }));
    expect(seedreamFailure(404)).toEqual(expect.objectContaining({ code: 'PROVIDER_NOT_FOUND' }));
    expect(seedreamFailure(429)).toEqual(expect.objectContaining({ code: 'PROVIDER_LIMIT' }));
  });

  it('reports auth failures from the models probe', async () => {
    const http = { request: jest.fn().mockResolvedValue({ ok: false, status: 401, headers: new Headers(), body: Buffer.from('{}') }) };
    await expect(testSeedreamConnection({ http: http as any, headers: { Authorization: 'Bearer secret' }, baseUrl: 'https://ark.cn-beijing.volces.com', timeoutSeconds: 30 }))
      .resolves.toMatchObject({ ok: false, status: 401, message: expect.stringContaining('API Key') });
    expect(http.request).toHaveBeenCalledWith('https://ark.cn-beijing.volces.com/api/v3/models', expect.objectContaining({ redirectPolicy: 'same-origin' }), expect.any(Number));
  });
});
