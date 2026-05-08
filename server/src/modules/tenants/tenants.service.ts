import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string, query: any = {}) {
    const { search, status, page = 1, limit = 20 } = query;
    const where: any = { orgId };
    if (typeof status === 'boolean') where.isActive = status;
    if (search) where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ];

    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: {
          contracts: {
            where: { status: 'ACTIVE' },
            include: { unit: { include: { building: true } } },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: +limit,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit };
  }

  async findOne(id: string, orgId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, orgId },
      include: {
        contracts: {
          include: { unit: { include: { building: true } } },
          orderBy: { createdAt: 'desc' },
        },
        payments: { orderBy: { createdAt: 'desc' }, take: 12 },
        tickets: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!tenant) throw new NotFoundException('Locataire introuvable');
    return tenant;
  }

  async findByPortalToken(token: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { portalToken: token },
      include: {
        contracts: {
          where: { status: 'ACTIVE' },
          include: { unit: { include: { building: true } }, rentPeriods: { orderBy: { dueDate: 'desc' }, take: 12 } },
        },
        payments: { orderBy: { createdAt: 'desc' }, take: 12 },
        tickets: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!tenant) throw new NotFoundException('Portail introuvable');
    return tenant;
  }

  async create(orgId: string, dto: any) {
    return this.prisma.tenant.create({ data: { ...dto, orgId } });
  }

  async update(id: string, orgId: string, dto: any) {
    await this.findOne(id, orgId);
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async remove(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.tenant.update({ where: { id }, data: { isActive: false } });
  }
}
