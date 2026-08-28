import { pollRunwayImageTask, runwayImageFailure, runwayImageRatio, runwayImageRequestBody, submitRunwayImage, testRunwayImageConnection } from './runway-image';

describe('runway-images adapter', () => {
  it('maps named ratios and WxH onto Runway pixel ratios', () => {
    expect(runwayImageRatio('16:9')).toBe('1280:720');
    expect(runwayImageRatio('16:9', '1080p')).toBe('1920:1080');
    expect(runwayImageRatio('1:1')).toBe('1024:1024');
    expect(runwayImageRatio('1024x1024')).toBe('1024:1024');
    expect(runwayImageRatio('1920:1080')).toBe('1920:1080');
    expect(runwayImageRatio('3:2')).toBe('1168:880');
    expect(runwayImageRatio('1536x1024')).toBe('1440:1080');
  });

  it('builds a text-to-image body and tagged reference images', () => {
    expect(runwayImageRequestBody('gen4_image', 'a cat', { size: '1024x1024' })).toEqual({
      model: 'gen4_image',
      promptText: 'a cat',
      ratio: '1024:1024',
    });
    expect(runwayImageRequestBody('gen4_image_turbo', 'edit it', { size: '16:9' }, ['data:image/png;base64,abc'])).toEqual({
      model: 'gen4_image_turbo',
      promptText: 'edit it',
      ratio: '1280:720',
      referenceImages: [{ uri: 'data:image/png;base64,abc', tag: 'image1' }],
    });
  });

  it('maps Runway errors to stable diagnostics', () => {
    expect(runwayImageFailure(401)).toEqual(expect.objectContaining({ code: 'PROVIDER_AUTH' }));
    expect(runwayImageFailure(404)).toEqual(expect.objectContaining({ code: 'PROVIDER_NOT_FOUND' }));
    expect(runwayImageFailure(400, Buffer.from(JSON.stringify({ error: 'content moderated' })))).toEqual(expect.objectContaining({
      code: 'PROVIDER_MODERATION',
    }));
    expect(runwayImageFailure(400, Buffer.from(JSON.stringify({ failure: 'invalid ratio' })))).toEqual(expect.objectContaining({
      code: 'PROVIDER_PARAMETERS',
      message: expect.stringContaining('invalid ratio'),
    }));
  });

  it('submits text_to_image and polls the task until SUCCEEDED', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const http = {
      request: jest.fn(async (url: string, init: any) => {
        calls.push({ url, init });
        if (init.method === 'POST') {
          return { ok: true, status: 200, headers: new Headers(), body: Buffer.from(JSON.stringify({ id: 'task-1' })) };
        }
        if (calls.filter((call) => call.init.method === 'GET').length === 1) {
          return { ok: true, status: 200, headers: new Headers(), body: Buffer.from(JSON.stringify({ status: 'RUNNING' })) };
        }
        return { ok: true, status: 200, headers: new Headers(), body: Buffer.from(JSON.stringify({ status: 'SUCCEEDED', output: ['https://cdn.example/out.png'] })) };
      }),
    };
    const deps = {
      http: http as any,
      headers: { Authorization: 'Bearer secret' },
      baseUrl: 'https://api.dev.runwayml.com',
      timeoutSeconds: 30,
      pollTimeoutSeconds: 60,
      sleep: jest.fn().mockResolvedValue(undefined),
      now: () => 0,
    };
    await expect(submitRunwayImage(deps, { model: 'gen4_image', promptText: 'a cat', ratio: '1024:1024' })).resolves.toBe('task-1');
    expect(calls[0].url).toBe('https://api.dev.runwayml.com/v1/text_to_image');
    expect(calls[0].init.headers['X-Runway-Version']).toBe('2024-11-06');
    await expect(pollRunwayImageTask(deps, 'task-1')).resolves.toBe('https://cdn.example/out.png');
    expect(calls[2].url).toBe('https://api.dev.runwayml.com/v1/tasks/task-1');
  });

  it('surfaces a failed task with failure detail', async () => {
    const http = {
      request: jest.fn(async () => ({
        ok: true, status: 200, headers: new Headers(),
        body: Buffer.from(JSON.stringify({ status: 'FAILED', failure: 'safety filter' })),
      })),
    };
    await expect(pollRunwayImageTask({
      http: http as any,
      headers: { Authorization: 'Bearer secret' },
      baseUrl: 'https://api.dev.runwayml.com',
      timeoutSeconds: 30,
      pollTimeoutSeconds: 60,
      sleep: jest.fn().mockResolvedValue(undefined),
      now: () => 0,
    }, 'task-9')).rejects.toMatchObject({
      noRetry: true,
      providerFailure: { message: expect.stringContaining('safety filter') },
    });
  });

  it('reports auth failures from the dummy task probe', async () => {
    const http = { request: jest.fn().mockResolvedValue({ ok: false, status: 401, headers: new Headers(), body: Buffer.from('{}') }) };
    await expect(testRunwayImageConnection({ http: http as any, headers: { Authorization: 'Bearer secret' }, baseUrl: 'https://api.dev.runwayml.com', timeoutSeconds: 30 }))
      .resolves.toMatchObject({ ok: false, status: 401, message: expect.stringContaining('API Key') });
    expect(http.request).toHaveBeenCalledWith('https://api.dev.runwayml.com/v1/tasks/00000000-0000-4000-8000-000000000000', expect.objectContaining({
      headers: expect.objectContaining({ 'X-Runway-Version': '2024-11-06' }),
    }), expect.any(Number));
  });
});
