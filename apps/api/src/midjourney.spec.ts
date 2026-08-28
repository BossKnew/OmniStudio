import { mjApiRoot, mjAspect, mjFailure, mjHeaders, mjPrompt, mjRequestBody, mjSubmitOk, mjTaskId, pollMidjourneyTask, submitMidjourneyImagine, testMidjourneyConnection } from './midjourney';

describe('midjourney adapter', () => {
  it('strips a trailing /mj path from the gateway root', () => {
    expect(mjApiRoot('https://proxy.example.com')).toBe('https://proxy.example.com');
    expect(mjApiRoot('https://proxy.example.com/mj')).toBe('https://proxy.example.com');
    expect(mjApiRoot('https://proxy.example.com/mj/submit/imagine')).toBe('https://proxy.example.com');
  });

  it('copies a Bearer token into mj-api-secret', () => {
    expect(mjHeaders({ Authorization: 'Bearer secret-key' })['mj-api-secret']).toBe('secret-key');
    expect(mjHeaders({ Authorization: 'Bearer secret-key', 'mj-api-secret': 'already' })['mj-api-secret']).toBe('already');
  });

  it('appends --ar and --v when missing from the prompt', () => {
    expect(mjAspect('1536x1024')).toBe('3:2');
    expect(mjPrompt('a cat', 'v7', { size: '1024x1024' })).toBe('a cat --ar 1:1 --v 7');
    expect(mjPrompt('a cat --ar 16:9 --v 6', 'v7', { size: '1024x1024' })).toBe('a cat --ar 16:9 --v 6');
    expect(mjPrompt('a ninja', 'niji-6', {})).toBe('a ninja --niji 6');
    expect(mjPrompt('plain', 'midjourney', {})).toBe('plain');
  });

  it('puts reference images into base64Array', () => {
    expect(mjRequestBody('a cat --ar 1:1 --v 7')).toEqual({ prompt: 'a cat --ar 1:1 --v 7' });
    expect(mjRequestBody('edit it', ['data:image/png;base64,abc']).base64Array).toEqual(['data:image/png;base64,abc']);
  });

  it('treats proxy submit codes 1/21/22 as success', () => {
    expect(mjSubmitOk({ code: 1, result: 'task-1' })).toBe(true);
    expect(mjSubmitOk({ code: 21, result: 'task-1' })).toBe(true);
    expect(mjSubmitOk({ code: 22, result: 'task-1' })).toBe(true);
    expect(mjSubmitOk({ code: 0, description: 'busy' })).toBe(false);
    expect(mjTaskId({ code: 1, result: '1400193484773946' })).toBe('1400193484773946');
  });

  it('maps gateway errors to stable diagnostics', () => {
    expect(mjFailure(401)).toEqual(expect.objectContaining({ code: 'PROVIDER_AUTH' }));
    expect(mjFailure(404)).toEqual(expect.objectContaining({ code: 'PROVIDER_NOT_FOUND' }));
    expect(mjFailure(400, Buffer.from(JSON.stringify({ description: 'banned prompt' })))).toEqual(expect.objectContaining({
      code: 'PROVIDER_MODERATION',
    }));
  });

  it('submits imagine and polls fetch until SUCCESS', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const http = {
      request: jest.fn(async (url: string, init: any) => {
        calls.push({ url, init });
        if (init.method === 'POST') {
          return { ok: true, status: 200, headers: new Headers(), body: Buffer.from(JSON.stringify({ code: 1, result: 'task-9' })) };
        }
        if (calls.filter((call) => call.init.method === 'GET').length === 1) {
          return { ok: true, status: 200, headers: new Headers(), body: Buffer.from(JSON.stringify({ status: 'IN_PROGRESS', progress: '40%' })) };
        }
        return { ok: true, status: 200, headers: new Headers(), body: Buffer.from(JSON.stringify({ status: 'SUCCESS', imageUrl: 'https://cdn.discordapp.com/grid.png' })) };
      }),
    };
    const deps = {
      http: http as any,
      headers: { Authorization: 'Bearer secret' },
      baseUrl: 'https://proxy.example.com/mj',
      timeoutSeconds: 30,
      pollTimeoutSeconds: 60,
      sleep: jest.fn().mockResolvedValue(undefined),
      now: () => 0,
    };
    await expect(submitMidjourneyImagine(deps, { prompt: 'a cat --v 7' })).resolves.toBe('task-9');
    expect(calls[0].url).toBe('https://proxy.example.com/mj/submit/imagine');
    expect(calls[0].init.headers['mj-api-secret']).toBe('secret');
    await expect(pollMidjourneyTask(deps, 'task-9')).resolves.toBe('https://cdn.discordapp.com/grid.png');
    expect(calls[2].url).toBe('https://proxy.example.com/mj/task/task-9/fetch');
  });

  it('surfaces a failed fetch with failReason', async () => {
    const http = {
      request: jest.fn(async () => ({
        ok: true, status: 200, headers: new Headers(),
        body: Buffer.from(JSON.stringify({ status: 'FAILURE', failReason: 'Banned prompt' })),
      })),
    };
    await expect(pollMidjourneyTask({
      http: http as any,
      headers: { Authorization: 'Bearer secret' },
      baseUrl: 'https://proxy.example.com',
      timeoutSeconds: 30,
      pollTimeoutSeconds: 60,
      sleep: jest.fn().mockResolvedValue(undefined),
      now: () => 0,
    }, 'task-9')).rejects.toMatchObject({
      noRetry: true,
      providerFailure: { message: expect.stringContaining('Banned prompt') },
    });
  });

  it('reports auth failures from the fetch probe', async () => {
    const http = { request: jest.fn().mockResolvedValue({ ok: false, status: 401, headers: new Headers(), body: Buffer.from('{}') }) };
    await expect(testMidjourneyConnection({ http: http as any, headers: { Authorization: 'Bearer secret' }, baseUrl: 'https://proxy.example.com', timeoutSeconds: 30 }))
      .resolves.toMatchObject({ ok: false, status: 401, message: expect.stringContaining('API Key') });
    expect(http.request).toHaveBeenCalledWith('https://proxy.example.com/mj/task/0/fetch', expect.objectContaining({
      headers: expect.objectContaining({ 'mj-api-secret': 'secret' }),
    }), expect.any(Number));
  });
});
