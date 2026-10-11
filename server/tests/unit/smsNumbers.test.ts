import * as sms from '../../src/lib/channels/sms';

describe('toRwandanMsisdn', () => {
  test.each([
    ['0788123456', '+250788123456'],
    ['0798 123 456', '+250798123456'],
    ['0722-123-456', '+250722123456'],
    ['0731234567', '+250731234567'],
    ['250788123456', '+250788123456'],
    ['+250 788 123 456', '+250788123456'],
    ['(+250) 788.123.456', '+250788123456'],
  ])('accepts %s', (input, expected) => {
    expect(sms.toRwandanMsisdn(input)).toBe(expected);
  });

  test.each([
    ['a landline', '0252123456'],
    ['an unknown mobile prefix', '0748123456'],
    ['a Kenyan number', '+254712345678'],
    ['too short', '078812345'],
    ['too long', '07881234567'],
    ['text', 'hello'],
    ['empty', ''],
    ['null', null],
  ])('rejects %s', (_label, input) => {
    expect(sms.toRwandanMsisdn(input)).toBeNull();
  });
});

describe('send', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, SMS_DRIVER: 'log' };
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  test('refuses an invalid number before reaching any driver', async () => {
    await expect(sms.send({ to: '0252123456', text: 'hi' })).rejects.toBeInstanceOf(
      sms.InvalidNumberError,
    );
    expect(console.log).not.toHaveBeenCalled();
  });

  test('hands the driver the international form', async () => {
    await sms.send({ to: '0788 123 456', text: 'hi' });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('+250788123456'));
  });
});
