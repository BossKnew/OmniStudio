import { ModelsController } from './models.controller';
import { Prisma } from './generated/prisma/client';

describe('ModelsController', () => {
  const currentModel = (overrides: Record<string, unknown> = {}) => ({
    id: 'model-1', providerId: '11111111-1111-4111-8111-111111111111', displayName: 'GI2', upstreamModelId: 'gpt-image-2',
    adapterKind: 'openai-images', mediaKind: 'IMAGE',
    allowedSizes: ['1024x1024'], allowedQualities: ['standard'], defaults: { size: '1024x1024', quality: 'standard', count: 1 },
    supportsGeneration: true, supportsEdit: false, supportsInpaint: false, supportsFirstLastFrame: false, maxImages: 1, maxInputImages: 1, enabled: true, sortOrder: 0,
    ...overrides,
  });

  const setup = (current = currentModel()) => {
    const prisma: any = {
      model: {
        create: jest.fn().mockImplementation(({ data }) => ({ ...current, ...data })),
        findUniqueOrThrow: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockImplementation(({ data }) => ({ ...current, ...data })),
      },
      provider: { findUnique: jest.fn().mockResolvedValue({ id: current.providerId }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    return { controller: new ModelsController(prisma), prisma };
  };

  const imageCreate = (overrides: Record<string, unknown> = {}) => ({
    providerId: '11111111-1111-4111-8111-111111111111',
    displayName: 'GI2',
    upstreamModelId: 'gpt-image-2',
    adapterKind: 'openai-images',
    ...overrides,
  });

  it('moves an invalid stored default to the first newly allowed quality', async () => {
    const { controller, prisma } = setup();

    await controller.update({ id: 'admin-1' } as any, '11111111-1111-4111-8111-111111111111', { allowedQualities: ['auto', 'low', 'medium', 'high'] });

    expect(prisma.model.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ defaults: expect.objectContaining({ quality: 'auto' }) }),
    }));
  });

  it('uses the default tiers and ratios when the admin leaves them empty', async () => {
    const { controller, prisma } = setup();

    await controller.update({ id: 'admin-1' } as any, '11111111-1111-4111-8111-111111111111', { resolutionTiers: [], allowedRatios: [] });

    expect(prisma.model.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        allowedSizes: [],
        resolutionTiers: [{ label: '1K', shortEdge: 1024 }, { label: '2K', shortEdge: 1440 }, { label: '4K', shortEdge: 2160 }],
        allowedRatios: ['1:1', '3:2', '2:3', '16:9'],
        defaults: expect.objectContaining({ size: '1024x1024' }),
      }),
    }));
  });

  it('creates a model with the default tiers and ratios when none are given', async () => {
    const { controller, prisma } = setup();

    await controller.create({ id: 'admin-1' } as any, imageCreate({ allowedQualities: ['auto'] }));

    expect(prisma.model.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        allowedSizes: [],
        resolutionTiers: [{ label: '1K', shortEdge: 1024 }, { label: '2K', shortEdge: 1440 }, { label: '4K', shortEdge: 2160 }],
        allowedRatios: ['1:1', '3:2', '2:3', '16:9'],
        defaults: expect.objectContaining({ size: '1024x1024' }),
      }),
    }));
  });

  it('keeps explicit tiers and ratios and derives the default size from the first combo', async () => {
    const current = currentModel({ allowedSizes: ['auto'], defaults: { size: 'auto', quality: 'standard', count: 1 } });
    const { controller, prisma } = setup(current);

    await controller.update({ id: 'admin-1' } as any, '11111111-1111-4111-8111-111111111111', {
      resolutionTiers: [{ label: '1K', shortEdge: 1024 }],
      allowedRatios: ['1:1', '3:2'],
    });

    expect(prisma.model.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        allowedSizes: [],
        resolutionTiers: [{ label: '1K', shortEdge: 1024 }],
        allowedRatios: ['1:1', '3:2'],
        defaults: expect.objectContaining({ size: '1024x1024' }),
      }),
    }));
  });

  it('derives a portrait default size when the first ratio is portrait', async () => {
    const { controller, prisma } = setup();

    await controller.create({ id: 'admin-1' } as any, imageCreate({
      resolutionTiers: [{ label: '1K', shortEdge: 1024 }],
      allowedRatios: ['2:3'],
      allowedQualities: ['standard'],
    }));

    expect(prisma.model.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        resolutionTiers: [{ label: '1K', shortEdge: 1024 }],
        allowedRatios: ['2:3'],
        defaults: expect.objectContaining({ size: '1024x1536' }),
      }),
    }));
  });


  it('stores video resolution tiers and derives qualities from tier labels', async () => {
    const { controller, prisma } = setup();

    await controller.create({ id: 'admin-1' } as any, {
      providerId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Wan',
      upstreamModelId: 'wan2.7-t2v',
      adapterKind: 'wan',
      allowedSizes: ['16:9'],
      allowedDurations: [5],
      resolutionTiers: [{ label: '720P', shortEdge: 720 }, { label: '1080P', shortEdge: 1080 }],
      pointMultipliers: { '720P': 1, '1080P': 2 },
    });

    expect(prisma.model.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        resolutionTiers: [{ label: '720P', shortEdge: 720 }, { label: '1080P', shortEdge: 1080 }],
        allowedQualities: ['720P', '1080P'],
        defaults: expect.objectContaining({ quality: '720P' }),
      }),
    }));
  });

  it('keeps only valid point multipliers on create', async () => {
    const { controller, prisma } = setup();

    await controller.create({ id: 'admin-1' } as any, imageCreate({
      allowedSizes: ['1024x1024'],
      allowedQualities: ['standard'],
      pointMultipliers: { '1024x1024': 2, '1024x1536': 0, 'bad': 101 },
    }));

    expect(prisma.model.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pointMultipliers: { '1024x1024': 2 } }),
    }));
  });

  it('clears point multipliers with an explicit null on update', async () => {
    const { controller, prisma } = setup(currentModel({ pointMultipliers: { '1024x1024': 2 } }));

    await controller.update({ id: 'admin-1' } as any, '11111111-1111-4111-8111-111111111111', { pointMultipliers: null });

    expect(prisma.model.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ pointMultipliers: Prisma.DbNull }),
    }));
  });

  it('omits point multipliers when not provided', async () => {
    const { controller, prisma } = setup();

    await controller.create({ id: 'admin-1' } as any, imageCreate({
      allowedSizes: ['1024x1024'],
      allowedQualities: ['standard'],
    }));

    const data = (prisma.model.create as jest.Mock).mock.calls[0][0].data;
    expect(data.pointMultipliers).toBeUndefined();
  });

  it('stores adapterKind on the model and derives mediaKind', async () => {
    const { controller, prisma } = setup();

    await controller.create({ id: 'admin-1' } as any, imageCreate({ adapterKind: 'qwen-image', allowedQualities: ['auto'] }));

    expect(prisma.model.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ adapterKind: 'qwen-image', mediaKind: 'IMAGE' }),
    }));
  });

  it('allows image and video models on the same provider', async () => {
    const { controller, prisma } = setup();

    await controller.create({ id: 'admin-1' } as any, imageCreate({ adapterKind: 'qwen-image', allowedQualities: ['auto'] }));
    await controller.create({ id: 'admin-1' } as any, {
      providerId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Wan',
      upstreamModelId: 'wan2.7-t2v',
      adapterKind: 'wan',
      allowedDurations: [5],
    });

    const kinds = (prisma.model.create as jest.Mock).mock.calls.map((call) => call[0].data);
    expect(kinds[0]).toEqual(expect.objectContaining({ adapterKind: 'qwen-image', mediaKind: 'IMAGE' }));
    expect(kinds[1]).toEqual(expect.objectContaining({ adapterKind: 'wan', mediaKind: 'VIDEO' }));
  });

  it('rejects a mediaKind that does not match the adapter', async () => {
    const { controller } = setup();

    await expect(controller.create({ id: 'admin-1' } as any, imageCreate({
      adapterKind: 'qwen-image',
      mediaKind: 'VIDEO',
      allowedQualities: ['auto'],
    }))).rejects.toMatchObject({ message: '模型类型与适配器类型不匹配' });
  });

  it('keeps inpaint only on OpenAI Images models', async () => {
    const { controller, prisma } = setup();

    await controller.create({ id: 'admin-1' } as any, imageCreate({ adapterKind: 'openai-images', supportsInpaint: true, allowedQualities: ['auto'] }));
    await controller.create({ id: 'admin-1' } as any, imageCreate({ adapterKind: 'qwen-image', supportsInpaint: true, allowedQualities: ['auto'] }));

    const kinds = (prisma.model.create as jest.Mock).mock.calls.map((call) => call[0].data);
    expect(kinds[0]).toEqual(expect.objectContaining({ adapterKind: 'openai-images', supportsInpaint: true }));
    expect(kinds[1]).toEqual(expect.objectContaining({ adapterKind: 'qwen-image', supportsInpaint: false }));
  });

  it('stores first-last-frame support on video models and raises the reference floor', async () => {
    const { controller, prisma } = setup();

    await controller.create({ id: 'admin-1' } as any, {
      providerId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Wan',
      upstreamModelId: 'wan2.7-i2v',
      adapterKind: 'wan',
      allowedDurations: [5],
      supportsFirstLastFrame: true,
      maxInputImages: 1,
    });

    expect(prisma.model.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ supportsFirstLastFrame: true, maxInputImages: 2, mediaKind: 'VIDEO' }),
    }));
  });

  it('ignores first-last-frame support on image models', async () => {
    const { controller, prisma } = setup();

    await controller.create({ id: 'admin-1' } as any, imageCreate({
      supportsFirstLastFrame: true,
      allowedQualities: ['auto'],
    }));

    expect(prisma.model.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ supportsFirstLastFrame: false, mediaKind: 'IMAGE' }),
    }));
  });

  it('requires adapterKind when creating a model', async () => {
    const { controller } = setup();

    await expect(controller.create({ id: 'admin-1' } as any, {
      providerId: '11111111-1111-4111-8111-111111111111',
      displayName: 'GI2',
      upstreamModelId: 'gpt-image-2',
      allowedQualities: ['auto'],
    })).rejects.toMatchObject({ response: expect.objectContaining({ errorCode: 'INVALID_INPUT' }) });
  });
});
