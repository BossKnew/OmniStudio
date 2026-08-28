import { TeamsController } from './teams.controller';

describe('TeamsController', () => {
  it('returns membership teams for regular users and every team for administrators', async () => {
    const prisma: any = { workTeam: { findMany: jest.fn().mockResolvedValue([{ id: 'design', name: 'Design' }]) } };
    const controller = new TeamsController(prisma);

    await controller.list({ id: 'user-1', role: 'USER', teamIds: ['design'] } as any);
    expect(prisma.workTeam.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['design'] } },
      select: { id: true, name: true },
    }));

    await controller.list({ id: 'admin-1', role: 'ADMIN', teamIds: [] } as any);
    expect(prisma.workTeam.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: undefined,
      select: { id: true, name: true },
    }));
  });
});
