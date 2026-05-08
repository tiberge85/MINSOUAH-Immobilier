import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('notifications') private notifQueue: Queue,
  ) {}

  async findAll(orgId: string, query: any = {}) {
    const { contractId, tenantId, status, method, month, year, page = 1, limit = 20 } = query;
    const where: any = { orgId };
    if (contractId) where.contractId = contractId;
    if (tenantId) where.tenantId = tenantId;
    if (status) where.status = status;
    if (method) where.paymentMethod = method;

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          tenant: { select: { firstName: true, lastName: true, phone: true } },
          contract: { include: { unit: { include: { building: { select: { name: true } } } } } },
          rentPeriod: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: +limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, total, page: +page, limit: +limit };
  }

  async findRentPeriods(orgId: string, query: any = {}) {
    const { contractId, status, month, year } = query;
    const where: any = { orgId };
    if (contractId) where.contractId = contractId;
    if (status) where.status = status;
    if (month) where.periodMonth = +month;
    if (year) where.periodYear = +year;

    return this.prisma.rentPeriod.findMany({
      where,
      include: {
        contract: {
          include: {
            tenant: { select: { firstName: true, lastName: true, phone: true, phoneWhatsapp: true } },
            unit: { include: { building: { select: { name: true } } } },
          },
        },
        payments: { where: { status: 'COMPLETED' } },
      },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
  }

  async recordPayment(orgId: string, dto: any, userId: string) {
    const contract = await this.prisma.contract.findFirst({ where: { id: dto.contractId, orgId } });
    if (!contract) throw new NotFoundException('Contrat introuvable');

    const reference = `PAY-${Date.now()}`;
    const payment = await this.prisma.payment.create({
      data: {
        ...dto,
        orgId,
        reference,
        status: 'COMPLETED',
        paidAt: new Date(),
        recordedById: userId,
      },
    });

    // Mettre à jour la période de loyer si fournie
    if (dto.rentPeriodId) {
      await this.updateRentPeriodStatus(dto.rentPeriodId, dto.amount);
    }

    // Envoyer confirmation WhatsApp
    await this.notifQueue.add('payment-confirmed', { paymentId: payment.id });

    return payment;
  }

  async initiateMoneyMobile(orgId: string, dto: any) {
    const { CinetPayService } = await import('./cinetpay/cinetpay.service');
    // Will be handled by CinetPayService
    return { message: 'Paiement initié', redirectUrl: '#' };
  }

  async handleCinetPayWebhook(payload: any) {
    const payment = await this.prisma.payment.findFirst({
      where: { reference: payload.cpm_trans_id },
    });
    if (!payment) return;

    if (payload.cpm_result === '00') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'COMPLETED',
          mmTransactionId: payload.cpm_trans_id,
          mmWebhookData: payload,
          paidAt: new Date(),
        },
      });
      if (payment.rentPeriodId) {
        await this.updateRentPeriodStatus(payment.rentPeriodId, payment.amount);
      }
      await this.notifQueue.add('payment-confirmed', { paymentId: payment.id });
    } else {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    }
  }

  async markPeriodPaid(periodId: string, orgId: string) {
    const period = await this.prisma.rentPeriod.findFirst({ where: { id: periodId, orgId } });
    if (!period) throw new NotFoundException('Période introuvable');
    return this.updateRentPeriodStatus(periodId, period.amountDue + period.chargesDue);
  }

  async sendReminder(periodId: string, orgId: string) {
    const period = await this.prisma.rentPeriod.findFirst({
      where: { id: periodId, orgId },
      include: {
        contract: {
          include: { tenant: true, unit: { include: { building: true } } },
        },
      },
    });
    if (!period) throw new NotFoundException('Période introuvable');

    await this.prisma.rentPeriod.update({
      where: { id: periodId },
      data: {
        reminderCount: { increment: 1 },
        lastReminderAt: new Date(),
        status: period.status === 'PENDING' ? 'OVERDUE' : period.status,
      },
    });

    await this.notifQueue.add('rent-reminder', {
      periodId,
      tenantPhone: period.contract.tenant.phoneWhatsapp || period.contract.tenant.phone,
      tenantName: `${period.contract.tenant.firstName} ${period.contract.tenant.lastName}`,
      amount: period.amountDue,
      property: period.contract.unit.building.name,
      dueDate: period.dueDate,
      reminderCount: period.reminderCount + 1,
    });

    return { message: 'Rappel envoyé' };
  }

  @Cron('0 8 * * *')
  async scheduleDailyReminders() {
    const today = new Date();
    const in5Days = new Date(today);
    in5Days.setDate(in5Days.getDate() + 5);

    // Rappels J-5
    const upcomingPeriods = await this.prisma.rentPeriod.findMany({
      where: {
        dueDate: { gte: today, lte: in5Days },
        status: { in: ['PENDING'] },
      },
      include: { contract: { include: { tenant: true, unit: { include: { building: true } } } } },
    });

    for (const period of upcomingPeriods) {
      await this.notifQueue.add('rent-reminder', {
        periodId: period.id,
        type: 'preview',
        tenantPhone: period.contract.tenant.phoneWhatsapp || period.contract.tenant.phone,
        tenantName: `${period.contract.tenant.firstName} ${period.contract.tenant.lastName}`,
        amount: period.amountDue,
        property: period.contract.unit.building.name,
        dueDate: period.dueDate,
      });
    }

    // Marquer les périodes en retard
    await this.prisma.rentPeriod.updateMany({
      where: { dueDate: { lt: today }, status: 'PENDING' },
      data: { status: 'OVERDUE' },
    });
  }

  @Cron('0 6 1 * *')
  async generateMonthlyPeriods() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const activeContracts = await this.prisma.contract.findMany({
      where: { status: 'ACTIVE' },
    });

    for (const contract of activeContracts) {
      const existing = await this.prisma.rentPeriod.findFirst({
        where: { contractId: contract.id, periodMonth: month, periodYear: year },
      });
      if (!existing) {
        const dueDate = new Date(year, month - 1, contract.paymentDay);
        await this.prisma.rentPeriod.create({
          data: {
            orgId: contract.orgId,
            contractId: contract.id,
            periodMonth: month,
            periodYear: year,
            amountDue: contract.monthlyRent,
            chargesDue: contract.charges,
            dueDate,
          },
        });
      }
    }
  }

  private async updateRentPeriodStatus(periodId: string, amountPaid: number) {
    const period = await this.prisma.rentPeriod.findUnique({ where: { id: periodId } });
    if (!period) return;

    const totalDue = period.amountDue + period.chargesDue;
    const newAmountPaid = period.amountPaid + amountPaid;
    let status: any = 'PARTIAL';
    if (newAmountPaid >= totalDue) status = 'PAID';

    return this.prisma.rentPeriod.update({
      where: { id: periodId },
      data: { amountPaid: newAmountPaid, status },
    });
  }
}
