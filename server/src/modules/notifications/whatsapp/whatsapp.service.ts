import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../../prisma/prisma.service';

const WA_API = 'https://graph.facebook.com/v19.0';

const TEMPLATES = {
  RENT_REMINDER_PREVIEW: 'rappel_loyer_j5',
  RENT_REMINDER_DUE:     'rappel_loyer_echeance',
  PAYMENT_CONFIRMED:     'confirmation_paiement',
  OVERDUE_1:             'relance_impaye_j3',
  OVERDUE_2:             'relance_impaye_j7',
  OVERDUE_FORMAL:        'mise_en_demeure',
  TICKET_UPDATE:         'ticket_maintenance',
};

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private config: ConfigService, private prisma: PrismaService) {}

  async sendTemplate(phone: string, templateName: string, params: string[], orgId: string) {
    const token = this.config.get('whatsapp.token');
    const phoneNumberId = this.config.get('whatsapp.phoneNumberId');

    if (!token || !phoneNumberId) {
      this.logger.warn('WhatsApp non configuré — simulation envoi');
      await this.logNotification(orgId, phone, templateName, 'SENT', null);
      return;
    }

    const ciPhone = phone.replace(/^0/, '225').replace(/\D/g, '');

    try {
      const res = await axios.post(
        `${WA_API}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: ciPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'fr' },
            components: [{
              type: 'body',
              parameters: params.map(text => ({ type: 'text', text })),
            }],
          },
        },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );

      const msgId = res.data?.messages?.[0]?.id;
      await this.logNotification(orgId, phone, templateName, 'SENT', msgId);
      this.logger.log(`WhatsApp envoyé à ${phone} — template: ${templateName}`);

    } catch (err) {
      this.logger.error(`Erreur WhatsApp: ${err.message}`);
      await this.logNotification(orgId, phone, templateName, 'FAILED', null, err.message);
      // Ne pas throw — l'envoi WA ne doit pas bloquer l'opération principale
    }
  }

  async sendRentReminder(data: {
    phone: string; tenantName: string; amount: number;
    property: string; dueDate: Date; orgId: string;
  }) {
    const formatted = new Intl.NumberFormat('fr-FR').format(data.amount);
    const dateStr = new Date(data.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    await this.sendTemplate(data.phone, TEMPLATES.RENT_REMINDER_DUE, [data.tenantName, formatted, dateStr, data.property], data.orgId);
  }

  async sendPaymentConfirmation(data: {
    phone: string; tenantName: string; amount: number;
    reference: string; property: string; period: string; receiptUrl: string; orgId: string;
  }) {
    const formatted = new Intl.NumberFormat('fr-FR').format(data.amount);
    await this.sendTemplate(data.phone, TEMPLATES.PAYMENT_CONFIRMED, [
      data.tenantName, formatted, data.period, data.property, data.reference, data.receiptUrl || ''
    ], data.orgId);
  }

  async sendOverdueReminder(data: {
    phone: string; tenantName: string; amount: number;
    property: string; daysOverdue: number; orgId: string;
  }) {
    const template = data.daysOverdue >= 15 ? TEMPLATES.OVERDUE_FORMAL
      : data.daysOverdue >= 7 ? TEMPLATES.OVERDUE_2 : TEMPLATES.OVERDUE_1;
    const formatted = new Intl.NumberFormat('fr-FR').format(data.amount);
    await this.sendTemplate(data.phone, template, [data.tenantName, formatted, data.property, String(data.daysOverdue)], data.orgId);
  }

  private async logNotification(orgId: string, phone: string, template: string, status: string, externalId: string, error?: string) {
    try {
      await this.prisma.notificationLog.create({
        data: { orgId, recipientPhone: phone, template, status: status as any, externalId, errorMessage: error },
      });
    } catch {}
  }
}
