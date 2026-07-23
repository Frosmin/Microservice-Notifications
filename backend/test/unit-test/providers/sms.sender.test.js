import { describe, expect, it, vi } from 'vitest';
import { createSmsSender } from '../../../src/providers/sms.sender.js';

describe('sms.sender.js', () => {
  const accountSid = `AC${'a'.repeat(32)}`;
  const options = {
    accountSid,
    authToken: 'token',
    fromNumber: '+15005550006',
    apiBaseUrl: 'https://api.twilio.test',
    timeoutMs: 50
  };

  it('sends the Twilio REST contract and normalizes its Message SID', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({ sid: `SM${'1'.repeat(32)}`, status: 'queued' })
    });
    const send = createSmsSender({ ...options, fetchImplementation });
    await expect(send({ notificationId: '4', to: '+59170000000', message: 'Hola' }))
      .resolves.toEqual({ messageId: `SM${'1'.repeat(32)}`, status: 'queued' });

    const expectedUrl = `${options.apiBaseUrl}/2010-04-01/Accounts/${accountSid}/Messages.json`;
    expect(fetchImplementation).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: `Basic ${Buffer.from(`${accountSid}:token`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      })
    }));
    const request = fetchImplementation.mock.calls[0][1];
    expect(request.body).toBeInstanceOf(URLSearchParams);
    expect(Object.fromEntries(request.body)).toEqual({
      To: '+59170000000', From: '+15005550006', Body: 'Hola'
    });
  });

  it.each([408, 429, 500, 503])('treats HTTP %i as retryable', async (status) => {
    const send = createSmsSender({
      ...options,
      fetchImplementation: vi.fn().mockResolvedValue({ ok: false, status, text: vi.fn().mockResolvedValue('later') })
    });
    await expect(send({ notificationId: '4', to: '+59170000000', message: 'Hola' }))
      .rejects.toMatchObject({ name: 'Error' });
  });

  it('treats other 4xx responses and missing credentials as permanent', async () => {
    const send = createSmsSender({
      ...options,
      fetchImplementation: vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue(JSON.stringify({ code: 21211, message: 'Invalid To number' }))
      })
    });
    await expect(send({ notificationId: '4', message: 'Hola' })).rejects.toMatchObject({
      name: 'PermanentDeliveryError',
      message: expect.stringContaining('21211')
    });
    await expect(createSmsSender({ accountSid: undefined, authToken: undefined, fromNumber: undefined })({}))
      .rejects.toMatchObject({ name: 'PermanentDeliveryError' });
  });

  it('rejects empty and oversized SMS bodies before contacting Twilio', async () => {
    const fetchImplementation = vi.fn();
    const send = createSmsSender({ ...options, fetchImplementation });
    await expect(send({ message: '' })).rejects.toMatchObject({ name: 'PermanentDeliveryError' });
    await expect(send({ message: 'x'.repeat(1601) }))
      .rejects.toMatchObject({ name: 'PermanentDeliveryError' });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('keeps network failures and malformed success responses retryable', async () => {
    const networkFailure = createSmsSender({
      ...options,
      fetchImplementation: vi.fn().mockRejectedValue(new Error('network timeout'))
    });
    await expect(networkFailure({ message: 'Hola' })).rejects.toThrow('network timeout');

    const malformedResponse = createSmsSender({
      ...options,
      fetchImplementation: vi.fn().mockResolvedValue({
        ok: true, status: 201, json: vi.fn().mockResolvedValue({ status: 'queued' })
      })
    });
    await expect(malformedResponse({ notificationId: '4', message: 'Hola' }))
      .rejects.toThrow('has no Message SID');
  });
});
