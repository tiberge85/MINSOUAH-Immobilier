import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BuildingsService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string, query: any = {}) {
    const { search, type, page = 1, limit = 20 } = query;
    const where: any = { orgId };
    if (type) where.type = type;
    if (search) where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
      { commune: { contains: search, mode: 'insensitive' } },
    ];

    const [data, total] = await Promise.all([
      this.prisma.building.findMany({
        where,
        include: {
          units: { select: { id: true, status: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: +limit,
      }),
      this.prisma.building.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, orgId: string) {
    const building = await this.prisma.building.findFirst({
      where: { id, orgId },
      include: {
        units: {
          include: { photos: { where: { isCover: true } } },
          orderBy: { unitNumber: 'asc' },
        },
        owner: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      },
    });
    if (!building) throw new NotFoundException('Immeuble introuvable');
    return building;
  }

  async create(orgId: string, dto: any) {
    return this.prisma.building.create({ data: { ...dto, orgId } });
  }

  async update(id: string, orgId: string, dto: any) {
    await this.findOne(id, orgId);
    return this.prisma.building.update({ where: { id }, data: dto });
  }

  async remove(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.building.delete({ where: { id } });
  }

  async stats(orgId: string) {
    const [buildings, units] = await Promise.all([
      this.prisma.building.count({ where: { orgId } }),
      this.prisma.unit.groupBy({
        by: ['status'],
        where: { orgId },
        _count: true,
      }),
    ]);
    return { buildings, units };
  }
}
