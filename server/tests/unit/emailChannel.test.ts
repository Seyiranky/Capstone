import nodemailer from 'nodemailer';
import * as email from '../../src/lib/channels/email';

jest.mock('nodemailer');

const mockedNodemailer = nodemailer as jest.Mocked<typeof nodemailer>;

describe('email channel', () => {
  const originalEnv = process.env;
  let sendMail: jest.Mock;

  beforeEach(() => {
    // A fresh copy per test: the driver reads process.env on every call, which
    // is what makes it configurable, and also what makes leakage between tests
    // possible if the environment is shared.
    process.env = { ...originalEnv };
    delete process.env.EMAIL_DRIVER;
    delete process.env.EMAIL_FROM;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.APP_URL;
    delete process.env.BREVO_API_KEY;

    sendMail = jest.fn().mockResolvedValue({ messageId: '<abc@isoko>' });
    mockedNodemailer.createTransport.mockReturnValue({ sendMail } as never);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  const message = { to: 'worker@example.com', subject: 'Payment confirmed', text: 'body', html: '<p>body</p>' };

  describe('driver selection', () => {
    it('logs rather than sending when nothing is configured', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});

      const result = await email.send(message);

      expect(email.driverName()).toBe('log');
      expect(result).toEqual({ provider: 'log', providerMessageId: null });
      expect(mockedNodemailer.createTransport).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('worker@example.com'));
      log.mockRestore();
    });

    it('names the drivers it has when asked for one it does not', async () => {
      process.env.EMAIL_DRIVER = 'nope';
      await expect(email.send(message)).rejects.toThrow(
        "Unknown EMAIL_DRIVER 'nope'. Available: log, smtp, brevo",
      );
    });

    it('refuses a message with no recipient', async () => {
      await expect(email.send({ ...message, to: '' })).rejects.toThrow('no recipient address');
    });
  });

  describe('smtp driver', () => {
    beforeEach(() => {
      process.env.EMAIL_DRIVER = 'smtp';
    });

    it('fails loudly when the host is missing rather than silently not sending', async () => {
      await expect(email.send(message)).rejects.toThrow('SMTP_HOST is not set');
      expect(mockedNodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('sends through the configured host and returns the provider message id', async () => {
      process.env.SMTP_HOST = 'smtp-relay.brevo.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'key';
      process.env.EMAIL_FROM = 'Isoko Talents <hello@isoko.test>';

      const result = await email.send(message);

      expect(mockedNodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp-relay.brevo.com',
          port: 587,
          secure: false,
          auth: { user: 'user', pass: 'key' },
        }),
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Isoko Talents <hello@isoko.test>',
          to: 'worker@example.com',
          subject: 'Payment confirmed',
        }),
      );
      expect(result).toEqual({ provider: 'smtp:smtp-relay.brevo.com', providerMessageId: '<abc@isoko>' });
    });

    it('treats port 465 as implicit TLS', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '465';

      await email.send(message);

      expect(mockedNodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ port: 465, secure: true }),
      );
    });

    it('omits auth entirely when no credentials are given', async () => {
      process.env.SMTP_HOST = 'localhost';

      await email.send(message);

      expect(mockedNodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ auth: undefined }),
      );
    });

    it('propagates a provider rejection so the caller can record why', async () => {
      process.env.SMTP_HOST = 'smtp-relay.brevo.com';
      sendMail.mockRejectedValue(new Error('535 Authentication failed'));

      await expect(email.send(message)).rejects.toThrow('535 Authentication failed');
    });

    it('reports a null message id rather than failing when the provider omits one', async () => {
      process.env.SMTP_HOST = 'smtp-relay.brevo.com';
      sendMail.mockResolvedValue({});

      await expect(email.send(message)).resolves.toEqual({
        provider: 'smtp:smtp-relay.brevo.com',
        providerMessageId: null,
      });
    });
  });

  describe('brevo driver (HTTPS, for hosts that block SMTP)', () => {
    let fetchSpy: jest.SpyInstance;
    afterEach(() => fetchSpy?.mockRestore());

    it('sends through Brevo\'s API with the sender split into name and address', async () => {
      process.env.EMAIL_DRIVER = 'brevo';
      process.env.BREVO_API_KEY = 'xkeysib-test';
      process.env.EMAIL_FROM = 'Isoko <hello@example.com>';
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ messageId: '<brevo-1@smtp-relay>' }), { status: 201 }),
      );

      const result = await email.send(message);

      expect(result).toEqual({ provider: 'brevo', providerMessageId: '<brevo-1@smtp-relay>' });
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      expect((init.headers as Record<string, string>)['api-key']).toBe('xkeysib-test');
      expect(JSON.parse(init.body)).toEqual({
        sender: { name: 'Isoko', email: 'hello@example.com' },
        to: [{ email: 'worker@example.com' }],
        subject: 'Payment confirmed',
        textContent: 'body',
        htmlContent: '<p>body</p>',
      });
      expect(mockedNodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('passes on Brevo\'s reason when it refuses, such as an unverified sender', async () => {
      process.env.EMAIL_DRIVER = 'brevo';
      process.env.BREVO_API_KEY = 'xkeysib-test';
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ code: 'invalid_parameter', message: 'Sender is not valid' }), { status: 400 }),
      );
      await expect(email.send(message)).rejects.toThrow('Brevo refused the email (400): Sender is not valid');
    });

    it('refuses to run without its key', async () => {
      process.env.EMAIL_DRIVER = 'brevo';
      await expect(email.send(message)).rejects.toThrow('BREVO_API_KEY is not set');
    });

    it('reads a sender with or without a display name', () => {
      expect(email.parseAddress('Isoko <a@b.co>')).toEqual({ name: 'Isoko', email: 'a@b.co' });
      expect(email.parseAddress('"Isoko Team" <a@b.co>')).toEqual({ name: 'Isoko Team', email: 'a@b.co' });
      expect(email.parseAddress('a@b.co')).toEqual({ email: 'a@b.co' });
    });
  });

  it('smtp gives up on a blocked connection within seconds, not minutes', async () => {
    process.env.EMAIL_DRIVER = 'smtp';
    process.env.SMTP_HOST = 'smtp.example.com';
    await email.send(message);
    expect(mockedNodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 20_000 }),
    );
  });

  describe('render', () => {
    it('uses the notification title as the subject and carries the body in both parts', () => {
      const { subject, text, html } = email.render('Payment confirmed', 'You received 25,000 RWF.');

      expect(subject).toBe('Payment confirmed');
      expect(text).toContain('You received 25,000 RWF.');
      expect(html).toContain('You received 25,000 RWF.');
    });

    it('links back to the app, honouring APP_URL', () => {
      process.env.APP_URL = 'https://isoko.example';
      const { text, html } = email.render('Gig approved', 'Your gig is live.');

      expect(text).toContain('https://isoko.example/notifications');
      expect(html).toContain('https://isoko.example/notifications');
    });

    it('tells the reader how to stop receiving these', () => {
      const { text, html } = email.render('Gig approved', 'Your gig is live.');
      expect(text).toContain('Settings');
      expect(html).toContain('Settings');
    });

    it('escapes notification content, which is user-supplied', () => {
      // Titles interpolate gig titles and user names, so a quote or an angle
      // bracket from a real listing must not break out of the markup.
      const { html } = email.render('New review', 'Grace said "<b>great</b> work" & meant it.');

      expect(html).toContain('&lt;b&gt;great&lt;/b&gt;');
      expect(html).toContain('&quot;');
      expect(html).toContain('&amp;');
      expect(html).not.toContain('<b>great</b>');
    });
  });
});
