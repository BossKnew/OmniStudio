import type { Prisma } from './generated/prisma/client';
import { QuotaService } from './quota.service';
import type { PrismaService } from './prisma.service';
import type { RedisService } from './redis.service';

function mockTx(overrides: Partial<Record<keyof Prisma.TransactionClient, unknown>>) {
  return { globalUsage: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, userUsage: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, quotaEvent: { create: jest.fn().mockResolvedValue({}) }, ...overrides } as unknown as Prisma.TransactionClient;
}

describe('QuotaService atomic job counters', () => {
  it('increments global and user counters through the same transaction client', async () => {
    const tx = mockTx({});
    const service = new QuotaService({} as unknown as PrismaService, {} as unknown as RedisService);
    await service.reserveJobInTransaction(tx, { id: 'user-1', role: 'ADMIN', groupIds: [] }, 2, { jobId: 'job-1', modelId: 'model-1', kind: 'SUBMIT', imageCount: 2 });
    expect(tx.globalUsage.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.userUsage.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }));
    expect(tx.quotaEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user-1', jobId: 'job-1', modelId: 'model-1', imageCount: 2, videoSeconds: 0, points: 2, kind: 'SUBMIT' }),
    }));
  });

  it('rejects a member whose sliding window is already full before writing an event', async () => {
    const now = Date.now();
    const tx = mockTx({
      userGroup: { findMany: jest.fn().mockResolvedValue([{ id: 'intern', name: 'Intern', quotaWindow: '5h', quotaPoints: 5 }]) },
      quotaEvent: {
        findMany: jest.fn().mockResolvedValue([{ createdAt: new Date(now - 60_000), points: 5 }]),
        create: jest.fn(),
      },
    });
    const service = new QuotaService({} as unknown as PrismaService, {} as unknown as RedisService);
    await expect(service.reserveJobInTransaction(tx, { id: 'user-1', role: 'USER', groupIds: ['intern'] }, 1, { jobId: 'job-1', kind: 'SUBMIT' })).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({ message: '生成积分已达上限' }),
    });
    expect(tx.quotaEvent.create).not.toHaveBeenCalled();
  });

  it('rejects a job that would exceed remaining points', async () => {
    const now = Date.now();
    const tx = mockTx({
      userGroup: { findMany: jest.fn().mockResolvedValue([{ id: 'intern', name: 'Intern', quotaWindow: '1d', quotaPoints: 8 }]) },
      quotaEvent: {
        findMany: jest.fn().mockResolvedValue([{ createdAt: new Date(now - 60_000), points: 5 }]),
        create: jest.fn(),
      },
    });
    const service = new QuotaService({} as unknown as PrismaService, {} as unknown as RedisService);
    await expect(service.reserveJobInTransaction(tx, { id: 'user-1', role: 'USER', groupIds: ['intern'] }, 5, { jobId: 'job-1', kind: 'SUBMIT' })).rejects.toMatchObject({
      status: 429,
      response: expect.objectContaining({ message: '生成积分已达上限' }),
    });
    expect(tx.quotaEvent.create).not.toHaveBeenCalled();
  });

  it('writes mixed image and video inputs as points on one event', async () => {
    const now = Date.now();
    const tx = mockTx({
      userGroup: { findMany: jest.fn().mockResolvedValue([{ id: 'intern', name: 'Intern', quotaWindow: '1d', quotaPoints: 20 }]) },
      quotaEvent: {
        findMany: jest.fn().mockResolvedValue([{ createdAt: new Date(now - 60_000), points: 5 }]),
        create: jest.fn().mockResolvedValue({}),
      },
    });
    const service = new QuotaService({} as unknown as PrismaService, {} as unknown as RedisService);
    await service.reserveJobInTransaction(tx, { id: 'user-1', role: 'USER', groupIds: ['intern'] }, 7, { jobId: 'job-1', kind: 'SUBMIT', imageCount: 2, videoSeconds: 10 });
    expect(tx.quotaEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ imageCount: 2, videoSeconds: 10, points: 7, kind: 'SUBMIT' }),
    }));
  });

  it('releases an SSE quota slot at most once', async () => {
    const client = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      decr: jest.fn().mockResolvedValue(0),
      del: jest.fn().mockResolvedValue(1),
    };
    const service = new QuotaService({} as unknown as PrismaService, { client } as unknown as RedisService);
    const release = await service.acquireSse('user-1');

    await Promise.all([release(), release()]);

    expect(client.decr).toHaveBeenCalledTimes(1);
    expect(client.del).toHaveBeenCalledTimes(1);
  });
});
