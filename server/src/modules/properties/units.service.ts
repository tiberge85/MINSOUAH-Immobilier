import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  async findByBuilding(buildingId: string, orgId: string, query: any = {}) {
    const { status, type } = query;
    const where: any = { buildingId, orgId };
    if (status) where.status = status;
    if (type) where.type = type;

    return this.prisma.unit.findMany({
      where,
      include: {
        photos: { where: { isCover: true }, take: 1 },
        contracts: {
          where: { status: 'ACTIVE' },
          include: { tenant: { select: { firstName: true, lastName: true, phone: true } } },
          take: 1,
        },
      },
      orderBy: [{ floor: 'asc' }, { unitNumber: 'asc' }],
    });
  }

  async findOne(id: string, orgId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id, orgId },
      include: {
        building: true,
        photos: true,
        contracts: {
          include: { tenant: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        tickets: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!unit) throw new NotFoundException('Unité introuvable');
    return unit;
  }

  async create(buildingId: string, orgId: string, dto: any) {
    const unit = await this.prisma.unit.create({
      data: { ...dto, buildingId, orgId },
    });
    await this.prisma.building.update({
      where: { id: buildingId },
      data: { totalUnits: { increment: 1 } },
    });
    return unit;
  }

  async update(id: string, orgId: string, dto: any) {
    await this.findOne(id, orgId);
    return this.prisma.unit.update({ where: { id }, data: dto });
  }

  async remove(id: string, orgId: string) {
    const unit = await this.findOne(id, orgId);
    await this.prisma.unit.delete({ where: { id } });
    await this.prisma.building.update({
      where: { id: unit.buildingId },
      data: { totalUnits: { decrement: 1 } },
    });
    return { message: 'Unité supprimée' };
  }
}
