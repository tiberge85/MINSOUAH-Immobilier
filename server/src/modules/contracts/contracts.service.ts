import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string, query: any = {}) {
    const { page = 1, limit = 20, status, tenantId, buildingId } = query;
    const skip = (page - 1) * limit;

    const where: any = { orgId };
    if (status) where.status = status;
    if (tenantId) where.tenantId = tenantId;
    if (buildingId) where.unit = { buildingId };

    const [data, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        include: {
          tenant: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
          unit: { include: { building: { select: { id: true, name: true } } } },
        },
        orderBy: { startDate: 'desc' },
        skip,
        take: Number(limit),
      }),
      this.prisma.contract.count({ where }),
    ]);

    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async findOne(id: string, orgId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, orgId },
      include: {
        tenant: true,
        unit: { include: { building: true } },
        rentPeriods: { orderBy: { dueDate: 'desc' }, take: 12 },
        payments: { orderBy: { paidAt: 'desc' }, take: 10 },
      },
    });
    if (!contract) throw new NotFoundException('Contrat non trouvé');
    return contract;
  }

  async create(orgId: string, dto: CreateContractDto) {
    const unit = await this.prisma.unit.findFirst({ where: { id: dto.unitId, orgId } });
    if (!unit) throw new NotFoundException('Unité non trouvée');
    if (unit.status === 'OCCUPIED') throw new BadRequestException('Unité déjà occupée');

    const tenant = await this.prisma.tenant.findFirst({ where: { id: dto.tenantId, orgId } });
    if (!tenant) throw new NotFoundException('Locataire non trouvé');

    const [contract] = await this.prisma.$transaction([
      this.prisma.contract.create({
        data: { ...dto, orgId },
        include: {
          tenant: { select: { id: true, firstName: true, lastName: true } },
          unit: { include: { building: { select: { name: true } } } },
        },
      }),
      this.prisma.unit.update({ where: { id: dto.unitId }, data: { status: 'OCCUPIED' } }),
    ]);

    return contract;
  }

  async update(id: string, orgId: string, dto: UpdateContractDto) {
    const existing = await this.prisma.contract.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Contrat non trouvé');

    return this.prisma.contract.update({
      where: { id },
      data: dto,
      include: {
        tenant: { select: { id: true, firstName: true, lastName: true } },
        unit: { include: { building: { select: { name: true } } } },
      },
    });
  }

  async terminate(id: string, orgId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, orgId },
      include: { unit: true },
    });
    if (!contract) throw new NotFoundException('Contrat non trouvé');

    await this.prisma.$transaction([
      this.prisma.contract.update({ where: { id }, data: { status: 'TERMINATED' } }),
      this.prisma.unit.update({ where: { id: contract.unitId }, data: { status: 'AVAILABLE' } }),
    ]);

    return { message: 'Contrat résilié avec succès' };
  }

  async getExpiringContracts(orgId: string, daysAhead = 30) {
    const limit = new Date();
    limit.setDate(limit.getDate() + daysAhead);

    return this.prisma.contract.findMany({
      where: {
        orgId,
        status: 'ACTIVE',
        endDate: { lte: limit, gte: new Date() },
      },
      include: {
        tenant: { select: { firstName: true, lastName: true, phone: true, email: true } },
        unit: { include: { building: { select: { name: true } } } },
      },
      orderBy: { endDate: 'asc' },
    });
  }
}
