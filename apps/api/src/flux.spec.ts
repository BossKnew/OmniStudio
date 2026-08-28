import { fluxApiRoot, fluxDimensions, fluxEndpointSlug, fluxFailure, fluxHeaders, fluxPollUrl, fluxRequestBody, fluxTaskParts, fluxTaskToken, fluxVideoAspect, fluxVideoPath, fluxVideoResolution, pollFluxUntilReady, submitFluxRequest, testFluxConnection } from './flux';

describe('flux adapter', () => {
  it('normalizes BFL base URLs to /v1', () => {
    expect(fluxApiRoot('https://api.bfl.ai')).toBe('https://api.bfl.ai/v1');
    expect(fluxApiRoot('https://api.bfl.ai/v1')).toBe('https://api.bfl.ai/v1');
    expect(fluxApiRoot('https://api.eu.bfl.ai')).toBe('https://api.eu.bfl.ai/v1');
    expect(fluxApiRoot('https://api.us.bfl.ai/v1/')).toBe('https://api.us.bfl.ai/v1');
  });

  it('copies a Bearer token into x-key', () => {
    expect(fluxHeaders({ Authorization: 'Bearer secret-key' })['x-key']).toBe('secret-key');
    expect(fluxHeaders({ Authorization: 'Bearer secret-key', 'x-key': 'already' })['x-key']).toBe('already');
  });

  it('uses the model ID as the BFL path slug', () => {
    expect(fluxEndpointSlug('flux-2-pro')).toBe('flux-2-pro');
    expect(fluxEndpointSlug('/v1/flux-2-pro-preview/')).toBe('flux-2-pro-preview');
    expect(fluxVideoPath('flux-3-video')).toBe('flux-3-video');
    expect(fluxVideoPath('latest')).toBe('flux-3-video');
    expect(() => fluxEndpointSlug('../secret')).toThrow();
  });

  it('rounds WxH sizes to multiples of 16', () => {
    expect(fluxDimensions('1024x1024')).toEqual({ width: 1024, height: 1024 });
    expect(fluxDimensions('1536x1024')).toEqual({ width: 1536, height: 1024 });
    expect(fluxDimensions('1000x500')).toEqual({ width: 1008, height: 496 });
  });

  it('maps video resolution and aspect labels', () => {
    expect(fluxVideoResolution('720p')).toBe('hd');
    expect(fluxVideoResolution('1080P')).toBe('fhd');
    expect(fluxVideoAspect('16:9')).toBe('16:9');
    expect(fluxVideoAspect('1280x720')).toBe('16:9');
  });

  it('builds a text-to-image body and numbered reference images', () => {
    expect(fluxRequestBody('a cat', { size: '1024x1024' })).toEqual({
      prompt: 'a cat',
      output_format: 'png',
      width: 1024,
      height: 1024,
    });
    expect(fluxRequestBody('edit it', {}, ['aaa', 'bbb'])).toEqual({
      prompt: 'edit it',
      output_format: 'png',
      input_image: 'aaa',
      input_image_2: 'bbb',
    });
  });

  it('encodes polling URLs into the task token', () => {
    const token = fluxTaskToken('abc', 'https://api.eu.bfl.ai/v1/get_result?id=abc');
    expect(fluxTaskParts(token)).toEqual({ id: 'abc', pollingUrl: 'https://api.eu.bfl.ai/v1/get_result?id=abc' });
    expect(fluxPollUrl('https://api.bfl.ai', token)).toBe('https://api.eu.bfl.ai/v1/get_result?id=abc');
    expect(fluxPollUrl('https://api.bfl.ai', 'abc')).toBe('https://api.bfl.ai/v1/get_result?id=abc');
  });

  it('maps BFL errors to stable diagnostics', () => {
    expect(fluxFailure(401)).toEqual(expect.objectContaining({ code: 'PROVIDER_AUTH' }));
    expect(fluxFailure(402)).toEqual(expect.objectContaining({ code: 'PROVIDER_LIMIT' }));
    expect(fluxFailure(400, Buffer.from(JSON.stringify({ detail: 'content moderated' })))).toEqual(expect.objectContaining({
      code: 'PROVIDER_MODERATION',
    }));
    expect(fluxFailure(422, Buffer.from(JSON.stringify({ detail: 'invalid width' })))).toEqual(expect.objectContaining({
      code: 'PROVIDER_PARAMETERS',
      message: expect.stringContaining('invalid width'),
    }));
    expect(fluxFailure(404)).toEqual(expect.objectContaining({ code: 'PROVIDER_NOT_FOUND' }));
  });

  it('submits then polls polling_url until Ready', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const http = {
      request: jest.fn(async (url: string, init: any) => {
        calls.push({ url, init });
        if (init.method === 'POST') {
          return { ok: true, status: 200, headers: new Headers(), body: Buffer.from(JSON.stringify({ id: 'job-1', polling_url: 'https://api.eu.bfl.ai/v1/get_result?id=job-1' })) };
        }
        if (calls.filter((call) => call.init.method === 'GET').length === 1) {
          return { ok: true, status: 200, headers: new Headers(), body: Buffer.from(JSON.stringify({ status: 'Pending' })) };
        }
        return { ok: true, status: 200, headers: new Headers(), body: Buffer.from(JSON.stringify({ status: 'Ready', result: { sample: 'https://delivery.bfl.ai/out.png' } })) };
      }),
    };
    const deps = {
      http: http as any,
      headers: { Authorization: 'Bearer secret' },
      baseUrl: 'https://api.bfl.ai',
      timeoutSeconds: 30,
      pollTimeoutSeconds: 60,
      sleep: jest.fn().mockResolvedValue(undefined),
      now: () => 0,
    };
    const token = await submitFluxRequest(deps, 'flux-2-pro', { prompt: 'a cat' });
    expect(calls[0].url).toBe('https://api.bfl.ai/v1/flux-2-pro');
    expect(calls[0].init.headers['x-key']).toBe('secret');
    expect(token).toContain('job-1|https://api.eu.bfl.ai/v1/get_result?id=job-1');
    await expect(pollFluxUntilReady(deps, token)).resolves.toBe('https://delivery.bfl.ai/out.png');
    expect(calls[1].url).toBe('https://api.eu.bfl.ai/v1/get_result?id=job-1');
  });

  it('surfaces Ready-time moderation as a non-retryable failure', async () => {
    const http = {
      request: jest.fn(async () => ({
        ok: true, status: 200, headers: new Headers(),
        body: Buffer.from(JSON.stringify({ status: 'Content Moderated' })),
      })),
    };
    await expect(pollFluxUntilReady({
      http: http as any,
      headers: { Authorization: 'Bearer secret' },
      baseUrl: 'https://api.bfl.ai',
      timeoutSeconds: 30,
      pollTimeoutSeconds: 60,
      sleep: jest.fn().mockResolvedValue(undefined),
      now: () => 0,
    }, 'job-1')).rejects.toMatchObject({
      noRetry: true,
      providerFailure: { code: 'PROVIDER_MODERATION' },
    });
  });

  it('reports auth failures from the get_result probe', async () => {
    const http = { request: jest.fn().mockResolvedValue({ ok: false, status: 401, headers: new Headers(), body: Buffer.from('{}') }) };
    await expect(testFluxConnection({ http: http as any, headers: { Authorization: 'Bearer secret' }, baseUrl: 'https://api.bfl.ai', timeoutSeconds: 30 }))
      .resolves.toMatchObject({ ok: false, status: 401, message: expect.stringContaining('API Key') });
    expect(http.request).toHaveBeenCalledWith('https://api.bfl.ai/v1/get_result?id=0', expect.objectContaining({
      headers: expect.objectContaining({ 'x-key': 'secret' }),
    }), expect.any(Number));
  });
});
