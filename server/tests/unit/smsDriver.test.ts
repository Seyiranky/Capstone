import * as sms from '../../src/lib/channels/sms';

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('pindo driver', () => {
  const originalEnv = process.env;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SMS_DRIVER: 'pindo',
      PINDO_API_TOKEN: 'test-token',
      SMS_SENDER_ID: 'PindoTest',
      SMS_LOW_BALANCE_USD: '2',
    };
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('sends the documented request and reads the documented response', async () => {
    // Shape taken from docs.pindo.ai "Response Codes" (verified 10 Oct 2026).
    fetchMock.mockImplementation(() =>
      reply(201, {
        status: 'sent',
        sms_id: 'out_sms_01H7',
        item_price: 0.006,
        remaining_balance: 100.0,
        total_cost: 0.006,
      }),
    );

    const result = await sms.send({ to: '0788123456', text: 'Isoko: Payment confirmed' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.pindo.io/v1/sms/');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({
      to: '+250788123456',
      text: 'Isoko: Payment confirmed',
      sender: 'PindoTest',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      provider: 'pindo',
      providerMessageId: 'out_sms_01H7',
      segments: 1,
      cost: 0.006,
      balance: 100,
    });
  });

  test('sends GSM-7 text whatever the caller passed', async () => {
    fetchMock.mockImplementation(() => reply(201, { sms_id: 'x' }));

    await sms.send({ to: '0788123456', text: 'Akazi k’umukozi “kemewe” 👍' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toBe(`Akazi k'umukozi "kemewe" `);
  });

  test('explains a rejected token', async () => {
    fetchMock.mockImplementation(() => reply(401, { message: 'Bearer token required' }));
    await expect(sms.send({ to: '0788123456', text: 'hi' })).rejects.toThrow('PINDO_API_TOKEN');
  });

  test('explains an unroutable number', async () => {
    fetchMock.mockImplementation(() => reply(409, { message: 'unsupported telco' }));
    await expect(sms.send({ to: '0788123456', text: 'hi' })).rejects.toThrow('cannot route');
  });

  test('keeps the gateway’s words for anything else', async () => {
    fetchMock.mockImplementation(() => reply(500, { message: 'boom' }));
    await expect(sms.send({ to: '0788123456', text: 'hi' })).rejects.toThrow('(500): {"message":"boom"}');
  });

  test('a missing token fails before any request', async () => {
    delete process.env.PINDO_API_TOKEN;
    await expect(sms.send({ to: '0788123456', text: 'hi' })).rejects.toThrow('PINDO_API_TOKEN is not set');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('remembers the balance and warns once when it runs low', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockImplementation(() => reply(201, { sms_id: 'a', remaining_balance: 1.5 }));

    await sms.send({ to: '0788123456', text: 'one' });
    await sms.send({ to: '0788123456', text: 'two' });

    expect(sms.lastKnownBalance()?.amount).toBe(1.5);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('log driver', () => {
  test('prints the segment count alongside the text', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const result = await sms.send({ to: '0788123456', text: 'a'.repeat(161) });

    expect(result).toMatchObject({ provider: 'log', segments: 2, cost: null, balance: null });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('(2 segments)'));
    log.mockRestore();
  });
});
