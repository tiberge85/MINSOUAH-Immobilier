import { Injectable } from '@nestjs/common';
import { InjectQueue, Process, Processor } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { WhatsAppService } from './whatsapp/whatsapp.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
@Processor('notifications')
export class NotificationsProcessor {
  constructor(
    private whatsapp: WhatsAppService,
    private prisma: PrismaService,
  ) {}

  @Process('rent-reminder')
  async handleRentReminder(job: Job) {
    const { periodId, tenantPhone, tenantName, amount, property, dueDate, type, reminderCount } = job.data;

    await this.whatsapp.sendRentReminder({
      phone: tenantPhone, tenantName, amount, property, dueDate: new Date(dueDate),
      orgId: job.data.orgId,
    });
  }

  @Process('payment-confirmed')
  async handlePaymentConfirmed(job: Job) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: job.data.paymentId },
      include: {
        tenant: true,
        contract: { include: { unit: { include: { building: true } } } },
        rentPeriod: true,
      },
    });
    if (!payment) return;

    await this.whatsapp.sendPaymentConfirmation({
      phone: payment.tenant.phoneWhatsapp || payment.tenant.phone,
      tenantName: `${payment.tenant.firstName} ${payment.tenant.lastName}`,
      amount: payment.amount,
      reference: payment.reference,
      property: payment.contract.unit.building.name,
      period: payment.rentPeriod
        ? `${payment.rentPeriod.periodMonth}/${payment.rentPeriod.periodYear}`
        : new Date().toLocaleDateString('fr-FR'),
      receiptUrl: payment.receiptUrl || '',
      orgId: payment.orgId,
    });
  }

  @Process('overdue-reminder')
  async handleOverdueReminder(job: Job) {
    const { periodId, day } = job.data;
    const period = await this.prisma.rentPeriod.findUnique({
      where: { id: periodId },
      include: { contract: { include: { tenant: true, unit: { include: { building: true } } } } },
    });
    if (!period) return;

    await this.whatsapp.sendOverdueReminder({
      phone: period.contract.tenant.phoneWhatsapp || period.contract.tenant.phone,
      tenantName: `${period.contract.tenant.firstName} ${period.contract.tenant.lastName}`,
      amount: period.amountDue,
      property: period.contract.unit.building.name,
      daysOverdue: day,
      orgId: period.orgId,
    });
  }
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue('notifications') private queue: Queue,
    private whatsapp: WhatsAppService,
    private prisma: PrismaService,
  ) {}

  async sendBulkReminders(orgId: string) {
    const overdue = await this.prisma.rentPeriod.findMany({
      where: { orgId, status: 'OVERDUE' },
      include: { contract: { include: { tenant: true, unit: { include: { building: true } } } } },
    });

    const jobs = overdue.map(p =>
      this.queue.add('rent-reminder', {
        periodId: p.id,
        orgId,
        tenantPhone: p.contract.tenant.phoneWhatsapp || p.contract.tenant.phone,
        tenantName: `${p.contract.tenant.firstName} ${p.contract.tenant.lastName}`,
        amount: p.amountDue,
        property: p.contract.unit.building.name,
        dueDate: p.dueDate,
      })
    );

    await Promise.all(jobs);
    return { sent: overdue.length };
  }

  async getLogs(orgId: string, query: any = {}) {
    return this.prisma.notificationLog.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
