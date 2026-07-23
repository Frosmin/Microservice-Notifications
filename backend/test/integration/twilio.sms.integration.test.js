import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { createSmsSender } from '../../src/providers/sms.sender.js';
import config from '../../src/utils/config.js';

describe('Twilio live SMS', () => {
  it('submits one real SMS and returns the Twilio Message SID', async () => {
    const required = {
      TWILIO_ACCOUNT_SID: config.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: config.TWILIO_AUTH_TOKEN,
      TWILIO_FROM_NUMBER: config.TWILIO_FROM_NUMBER,
      TWILIO_TEST_TO: config.TWILIO_TEST_TO
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([name]) => name);
    expect(missing, `Missing Twilio environment variables: ${missing.join(', ')}`).toEqual([]);

    const result = await createSmsSender()({
      notificationId: `live-${Date.now()}`,
      to: config.TWILIO_TEST_TO,
      message: `P07 Twilio integration test ${new Date().toISOString()}`
    });

    console.log(`Twilio accepted message ${result.messageId} with status ${result.status}`);
    expect(result.messageId).toMatch(/^(SM|MM)[0-9a-fA-F]{32}$/);
    expect(['accepted', 'queued', 'sending', 'sent']).toContain(result.status);
  }, 30000);
});
