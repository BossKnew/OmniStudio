import { bananaApiRoot, bananaAspectRatio, bananaHeaders, bananaImageFailure, bananaImageSize, bananaRequestBody, testBananaConnection } from './nano-banana';

describe('nano-banana adapter', () => {
  it('normalizes Gemini base URLs to v1beta', () => {
    expect(bananaApiRoot('https://generativelanguage.googleapis.com')).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect(bananaApiRoot('https://generativelanguage.googleapis.com/v1beta')).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect(bananaApiRoot('https://generativelanguage.googleapis.com/v1beta/')).toBe('https://generativelanguage.googleapis.com/v1beta');
  });

  it('copies a Bearer token into x-goog-api-key', () => {
    expect(bananaHeaders({ Authorization: 'Bearer secret-key' })['x-goog-api-key']).toBe('secret-key');
    expect(bananaHeaders({ Authorization: 'Bearer secret-key', 'x-goog-api-key': 'already' })['x-goog-api-key']).toBe('already');
  });

  it('reduces WxH sizes to Gemini aspectRatio and imageSize', () => {
    expect(bananaAspectRatio('1024x1024')).toBe('1:1');
    expect(bananaAspectRatio('1536x1024')).toBe('3:2');
    expect(bananaAspectRatio('16:9')).toBe('16:9');
    expect(bananaImageSize('1024x1024')).toBe('1K');
    expect(bananaImageSize('2048x2048')).toBe('2K');
    expect(bananaImageSize('3840x2160')).toBe('4K');
    expect(bananaImageSize('1024x1024', '2K')).toBe('2K');
    expect(bananaImageSize('512x512')).toBe('512');
  });

  it('builds a generateContent body for text-to-image', () => {
    expect(bananaRequestBody('a cat', { size: '1024x1024' })).toEqual({
      contents: [{ role: 'user', parts: [{ text: 'a cat' }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1', imageSize: '1K' } },
    });
  });

  it('puts reference images before the text part', () => {
    const body = bananaRequestBody('edit it', { size: '1024x1536' }, [{ mimeType: 'image/png', data: 'abc' }]);
    expect(body.contents[0].parts).toEqual([
      { inline_data: { mime_type: 'image/png', data: 'abc' } },
      { text: 'edit it' },
    ]);
    expect((body.generationConfig as { imageConfig: { aspectRatio: string } }).imageConfig.aspectRatio).toBe('2:3');
  });

  it('maps Gemini errors to stable diagnostics', () => {
    expect(bananaImageFailure(401)).toEqual(expect.objectContaining({ code: 'PROVIDER_AUTH' }));
    expect(bananaImageFailure(400, Buffer.from(JSON.stringify({ error: { message: 'prompt was blocked' } })))).toEqual(expect.objectContaining({
      code: 'PROVIDER_MODERATION',
    }));
    expect(bananaImageFailure(400, Buffer.from(JSON.stringify({ error: { message: 'invalid imageConfig' } })))).toEqual(expect.objectContaining({
      code: 'PROVIDER_PARAMETERS',
      message: expect.stringContaining('invalid imageConfig'),
    }));
    expect(bananaImageFailure(404)).toEqual(expect.objectContaining({ code: 'PROVIDER_NOT_FOUND' }));
    expect(bananaImageFailure(429)).toEqual(expect.objectContaining({ code: 'PROVIDER_LIMIT' }));
  });

  it('reports auth failures from the models probe', async () => {
    const http = { request: jest.fn().mockResolvedValue({ ok: false, status: 401, headers: new Headers(), body: Buffer.from('{}') }) };
    await expect(testBananaConnection({ http: http as any, headers: { Authorization: 'Bearer secret' }, baseUrl: 'https://generativelanguage.googleapis.com', timeoutSeconds: 30 }))
      .resolves.toMatchObject({ ok: false, status: 401, message: expect.stringContaining('API Key') });
    expect(http.request).toHaveBeenCalledWith('https://generativelanguage.googleapis.com/v1beta/models', expect.objectContaining({
      headers: expect.objectContaining({ 'x-goog-api-key': 'secret' }),
    }), expect.any(Number));
  });
});
