/**
 * Email service — writes to Firestore `mail` collection.
 * Requires the Firebase "Trigger Email" extension installed on the project:
 *   https://firebase.google.com/products/extensions/firebase-firestore-send-email
 *
 * The extension reads from this collection and sends via the SMTP credentials
 * configured in the Firebase Console (Extensions → Trigger Email → SMTP URI).
 *
 * This keeps SMTP credentials out of the browser entirely — only Firebase
 * Functions (running server-side) ever touch them.
 */
import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Send a transactional email.
 * @param {{ to: string|string[], subject: string, html?: string, text?: string }} opts
 * @returns {Promise<{ ok: boolean, id?: string, error?: string }>}
 */
export async function sendEmail({ to, subject, html, text }) {
  try {
    const doc = await addDoc(collection(db, 'mail'), {
      to: Array.isArray(to) ? to : [to],
      message: {
        subject,
        html:  html  || `<p>${text ?? ''}</p>`,
        text:  text  || (html ?? '').replace(/<[^>]*>/g, ''),
      },
      createdAt: new Date().toISOString(),
    });
    return { ok: true, id: doc.id };
  } catch (err) {
    console.warn('[email] sendEmail error:', err?.message);
    return { ok: false, error: err?.message ?? 'unknown' };
  }
}

/** Build a styled reminder email body */
export function buildReminderHtml({ tenantName, amount, month, propertyName, companyName }) {
  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8" /><style>
  body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
  .wrap { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; }
  .header { background: #2563eb; color: #fff; padding: 24px 32px; }
  .header h1 { margin: 0; font-size: 22px; font-weight: 800; }
  .body { padding: 32px; color: #1a1a1a; }
  .amount { font-size: 28px; font-weight: 900; color: #dc2626; margin: 16px 0; }
  .info { background: #f8fafc; border-radius: 8px; padding: 16px; margin: 16px 0; font-size: 14px; }
  .footer { padding: 16px 32px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
</style></head>
<body>
<div class="wrap">
  <div class="header"><h1>Rappel de loyer</h1></div>
  <div class="body">
    <p>Bonjour <strong>${tenantName}</strong>,</p>
    <p>Nous vous informons que votre loyer du mois de <strong>${month}</strong> n'a pas encore été reçu.</p>
    <div class="amount">${Number(amount).toLocaleString('fr-CI')} FCFA</div>
    <div class="info">
      <strong>Propriété :</strong> ${propertyName}<br />
      <strong>Période :</strong> ${month}
    </div>
    <p>Merci de régulariser votre situation dans les meilleurs délais.<br />
    En cas de question, n'hésitez pas à nous contacter.</p>
    <p>Cordialement,<br /><strong>${companyName}</strong></p>
  </div>
  <div class="footer">${companyName} — Gestion immobilière</div>
</div>
</body>
</html>`;
}

/** Build a rent receipt email body */
export function buildReceiptHtml({ tenantName, amount, month, propertyName, companyName, receiptNumber }) {
  return `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8" /><style>
  body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; }
  .wrap { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; }
  .header { background: #16a34a; color: #fff; padding: 24px 32px; }
  .header h1 { margin: 0; font-size: 22px; font-weight: 800; }
  .body { padding: 32px; color: #1a1a1a; }
  .amount { font-size: 28px; font-weight: 900; color: #16a34a; margin: 16px 0; }
  .info { background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 16px 0; font-size: 14px; }
  .footer { padding: 16px 32px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
</style></head>
<body>
<div class="wrap">
  <div class="header"><h1>Quittance de loyer</h1></div>
  <div class="body">
    <p>Bonjour <strong>${tenantName}</strong>,</p>
    <p>Nous confirmons la réception de votre paiement pour le mois de <strong>${month}</strong>.</p>
    <div class="amount">${Number(amount).toLocaleString('fr-CI')} FCFA</div>
    <div class="info">
      ${receiptNumber ? `<strong>N° quittance :</strong> ${receiptNumber}<br />` : ''}
      <strong>Propriété :</strong> ${propertyName}<br />
      <strong>Période :</strong> ${month}
    </div>
    <p>Merci de votre confiance.</p>
    <p>Cordialement,<br /><strong>${companyName}</strong></p>
  </div>
  <div class="footer">${companyName} — Gestion immobilière</div>
</div>
</body>
</html>`;
}
