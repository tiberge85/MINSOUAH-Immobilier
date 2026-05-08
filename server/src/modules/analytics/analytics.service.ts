import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(orgId: string) {
    const [
      totalBuildings, totalUnits, unitStats,
      activeContracts, expiringContracts,
      payments, overduePeriods, openTickets,
    ] = await Promise.all([
      this.prisma.building.count({ where: { orgId } }),
      this.prisma.unit.count({ where: { orgId } }),
      this.prisma.unit.groupBy({ by: ['status'], where: { orgId }, _count: true }),
      this.prisma.contract.count({ where: { orgId, status: 'ACTIVE' } }),
      this.prisma.contract.count({ where: { orgId, status: 'EXPIRING' } }),
      this.prisma.payment.aggregate({
        where: { orgId, status: 'COMPLETED', paidAt: { gte: this.firstDayOfMonth() } },
        _sum: { amount: true },
      }),
      this.prisma.rentPeriod.count({ where: { orgId, status: 'OVERDUE' } }),
      this.prisma.maintenanceTicket.count({ where: { orgId, status: { not: 'CLOSED' } } }),
    ]);

    const unitStatusMap = Object.fromEntries(unitStats.map(s => [s.status, s._count]));
    const occupiedUnits = unitStatusMap['OCCUPIED'] || 0;
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    return {
      totalBuildings,
      totalUnits,
      occupiedUnits,
      availableUnits: unitStatusMap['AVAILABLE'] || 0,
      maintenanceUnits: unitStatusMap['MAINTENANCE'] || 0,
      occupancyRate,
      activeContracts,
      expiringContracts,
      monthlyRevenue: payments._sum.amount || 0,
      overduePeriods,
      openTickets,
    };
  }

  async getRevenue(orgId: string, year: number) {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);

    const payments = await this.prisma.payment.findMany({
      where: { orgId, status: 'COMPLETED', paidAt: { gte: start, lte: end } },
      select: { amount: true, paidAt: true, paymentType: true },
    });

    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      mois: ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'][i],
      revenus: 0,
      depenses: 0,
    }));

    for (const p of payments) {
      const m = new Date(p.paidAt).getMonth();
      if (p.paymentType === 'RENT' || p.paymentType === 'DEPOSIT') {
        monthly[m].revenus += p.amount;
      } else {
        monthly[m].depenses += p.amount;
      }
    }

    return monthly;
  }

  async getOccupancy(orgId: string) {
    const buildings = await this.prisma.building.findMany({
      where: { orgId },
      include: {
        units: { select: { status: true } },
      },
    });

    return buildings.map(b => ({
      id: b.id, name: b.name,
      total: b.units.length,
      occupied: b.units.filter(u => u.status === 'OCCUPIED').length,
      available: b.units.filter(u => u.status === 'AVAILABLE').length,
      rate: b.units.length > 0
        ? Math.round((b.units.filter(u => u.status === 'OCCUPIED').length / b.units.length) * 100)
        : 0,
    }));
  }

  async getOverdueSummary(orgId: string) {
    const periods = await this.prisma.rentPeriod.findMany({
      where: { orgId, status: { in: ['OVERDUE', 'PARTIAL'] } },
      include: {
        contract: {
          include: {
            tenant: { select: { firstName: true, lastName: true, phone: true } },
            unit: { include: { building: { select: { name: true } } } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const totalOverdue = periods.reduce((s, p) => s + (p.amountDue + p.chargesDue - p.amountPaid), 0);

    return { periods, totalOverdue, count: periods.length };
  }

  async getFinancialReport(orgId: string, month: number, year: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const [payments, periods] = await Promise.all([
      this.prisma.payment.findMany({
        where: { orgId, status: 'COMPLETED', paidAt: { gte: start, lte: end } },
        include: {
          tenant: { select: { firstName: true, lastName: true } },
          contract: { include: { unit: { include: { building: { select: { name: true } } } } } },
        },
      }),
      this.prisma.rentPeriod.findMany({
        where: { orgId, periodMonth: month, periodYear: year },
        include: {
          contract: {
            include: {
              tenant: { select: { firstName: true, lastName: true } },
              unit: { include: { building: { select: { name: true } } } },
            },
          },
        },
      }),
    ]);

    const totalExpected = periods.reduce((s, p) => s + p.amountDue + p.chargesDue, 0);
    const totalCollected = payments.filter(p => p.paymentType === 'RENT').reduce((s, p) => s + p.amount, 0);
    const totalPending = totalExpected - totalCollected;
    const recoveryRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

    return { payments, periods, totalExpected, totalCollected, totalPending, recoveryRate, month, year };
  }

  private firstDayOfMonth() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
}
