import { describe, expect, it, vi } from 'vitest';
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }));
import nodemailer from 'nodemailer';

import {
  classifySmtpError,
  createEmailSender,
  deterministicMessageId
} from '../../../src/providers/email.sender.js';

describe('email.sender.js', () => {
  const credentials = {
    smtpUser: 'bot@gmail.com', smtpAppPassword: 'app-password', smtpFrom: 'Bot <bot@gmail.com>'
  };

  it('uses text email, template name and a deterministic Message-ID', async () => {
    const transporter = { sendMail: vi.fn().mockResolvedValue({ messageId: 'accepted' }) };
    const send = createEmailSender({ ...credentials, transporter });
    await send({ notificationId: '10', to: 'a@example.com', subject: 'Welcome', message: 'Hello' });
    expect(transporter.sendMail).toHaveBeenCalledWith({
      from: credentials.smtpFrom,
      to: 'a@example.com',
      subject: 'Welcome',
      text: 'Hello',
      messageId: '<notification-10@gmail.com>'
    });
  });

  it('creates a Gmail transport with App Password and provider timeouts', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'accepted' });
    nodemailer.createTransport.mockReturnValue({ sendMail });
    const send = createEmailSender(credentials);
    await send({ notificationId: '10' });
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: 'bot@gmail.com', pass: 'app-password' },
      connectionTimeout: expect.any(Number),
      socketTimeout: expect.any(Number)
    }));
  });

  it('fails permanently when Gmail configuration is incomplete', async () => {
    const send = createEmailSender({ transporter: { sendMail: vi.fn() } });
    await expect(send({})).rejects.toMatchObject({ name: 'PermanentDeliveryError' });
  });

  it('classifies SMTP authentication and 5xx responses as permanent', () => {
    expect(classifySmtpError(Object.assign(new Error('auth'), { code: 'EAUTH' }))).toMatchObject({
      name: 'PermanentDeliveryError'
    });
    expect(classifySmtpError(Object.assign(new Error('bad address'), { responseCode: 550 })))
      .toMatchObject({ name: 'PermanentDeliveryError' });
  });

  it('leaves transient SMTP failures retryable', () => {
    const error = Object.assign(new Error('busy'), { responseCode: 421 });
    expect(classifySmtpError(error)).toBe(error);
  });

  it('uses a safe fallback Message-ID domain', () => {
    expect(deterministicMessageId('2')).toBe('<notification-2@notifications.local>');
  });
});
