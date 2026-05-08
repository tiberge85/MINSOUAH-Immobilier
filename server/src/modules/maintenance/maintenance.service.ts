import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

@Injectable()
export class MaintenanceService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string, query: any = {}) {
    const { page = 1, limit = 20, status, priority, unitId, assignedTo } = query;
    const skip = (page - 1) * limit;

    const where: any = { orgId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (unitId) where.unitId = unitId;
    if (assignedTo) where.assignedTo = assignedTo;

    const [data, total] = await Promise.all([
      this.prisma.maintenanceTicket.findMany({
        where,
        include: {
          unit: { include: { building: { select: { id: true, name: true } } } },
          tenant: { select: { id: true, firstName: true, lastName: true } },
          photos: { select: { id: true, url: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      this.prisma.maintenanceTicket.count({ where }),
    ]);

    return { data, total, page: Number(page), limit: Number(limit) };
  }

  async findOne(id: string, orgId: string) {
    const ticket = await this.prisma.maintenanceTicket.findFirst({
      where: { id, orgId },
      include: {
        unit: { include: { building: true } },
        tenant: true,
        photos: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket non trouvé');
    return ticket;
  }

  async create(orgId: string, dto: CreateTicketDto) {
    return this.prisma.maintenanceTicket.create({
      data: { ...dto, orgId },
      include: {
        unit: { include: { building: { select: { name: true } } } },
        tenant: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async update(id: string, orgId: string, dto: UpdateTicketDto) {
    const existing = await this.prisma.maintenanceTicket.findFirst({ where: { id, orgId } });
    if (!existing) throw new NotFoundException('Ticket non trouvé');

    const data: any = { ...dto };
    if (dto.status === 'CLOSED' && !existing.resolvedAt) {
      data.resolvedAt = new Date();
    }

    return this.prisma.maintenanceTicket.update({ where: { id }, data });
  }

  async addPhoto(ticketId: string, orgId: string, url: string) {
    const ticket = await this.prisma.maintenanceTicket.findFirst({ where: { id: ticketId, orgId } });
    if (!ticket) throw new NotFoundException('Ticket non trouvé');
    return this.prisma.maintenancePhoto.create({ data: { ticketId, url } });
  }

  async getStats(orgId: string) {
    const [byStatus, byPriority, recent] = await Promise.all([
      this.prisma.maintenanceTicket.groupBy({ by: ['status'], where: { orgId }, _count: true }),
      this.prisma.maintenanceTicket.groupBy({ by: ['priority'], where: { orgId }, _count: true }),
      this.prisma.maintenanceTicket.findMany({
        where: { orgId, status: { not: 'CLOSED' } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { unit: { include: { building: { select: { name: true } } } } },
      }),
    ]);

    return { byStatus, byPriority, recent };
  }
}
