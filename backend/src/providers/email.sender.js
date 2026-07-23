import nodemailer from 'nodemailer';
import config from '../utils/config.js';
import { PermanentDeliveryError } from './delivery.errors.js';

const permanentSmtpCodes = new Set(['EAUTH', 'EENVELOPE', 'EMESSAGE']);

export const deterministicMessageId = (notificationId, smtpUser) => {
  const domain = smtpUser?.split('@')[1] || 'notifications.local';
  return `<notification-${notificationId}@${domain}>`;
};

export const classifySmtpError = (error) => {
  if (permanentSmtpCodes.has(error.code) || Number(error.responseCode) >= 500) {
    return new PermanentDeliveryError(error.message, { cause: error });
  }
  return error;
};

export const createEmailSender = ({
  smtpUser = config.SMTP_USER,
  smtpAppPassword = config.SMTP_APP_PASSWORD,
  smtpFrom = config.SMTP_FROM,
  transporter
} = {}) => {
  const sendTransport = transporter || (smtpUser && smtpAppPassword
    ? nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: smtpUser, pass: smtpAppPassword },
      connectionTimeout: config.PROVIDER_TIMEOUT_MS,
      greetingTimeout: config.PROVIDER_TIMEOUT_MS,
      socketTimeout: config.PROVIDER_TIMEOUT_MS
    })
    : undefined);

  return async ({ notificationId, to, subject, message }) => {
    if (!sendTransport || !smtpUser || !smtpAppPassword || !smtpFrom) {
      throw new PermanentDeliveryError('Gmail SMTP configuration is incomplete');
    }
    try {
      return await sendTransport.sendMail({
        from: smtpFrom,
        to,
        subject,
        text: message,
        messageId: deterministicMessageId(notificationId, smtpUser)
      });
    } catch (error) {
      throw classifySmtpError(error);
    }
  };
};
