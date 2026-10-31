import type { AddressInfo } from 'node:net';
import { SMTPServer, type SMTPServerOptions } from 'smtp-server';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertSafeForEnvironment } from '../src/composition/environment-safety.js';
import { createEmailSender } from '../src/composition/platform.js';
import { loadConfig, type AppConfig } from '../src/config/config.js';
import { createLogger, describeError } from '../src/platform/logger.js';
import { UnconfiguredPaymentProvider } from '../src/platform/payments.js';
import { SmtpEmailSender, type SmtpSettings } from '../src/platform/smtp-email.js';
import { givenAnAdministrator } from './support/roster.js';
import { startTestApp, type TestApp } from './support/test-app.js';

/**
 * The transport that delivers (issue #16), against a real SMTP server started by the test.
 *
 * Nothing is faked between the archive and the wire: the server is `smtp-server`, listening on a
 * port of its own, offering STARTTLS with its built-in self-signed certificate and checking the
 * login. What a letter looks like is read off what it received.
 */

const USER = 'ricambi-mailer';
const PASSWORD = 'a-password-the-provider-issued';

interface Received {
  from: string | undefined;
  to: string[];
  raw: string;
  secure: boolean;
}

interface FakeSmtpServer {
  port: number;
  received: Received[];
  close(): Promise<void>;
}

async function startSmtpServer(options: Partial<SMTPServerOptions> = {}): Promise<FakeSmtpServer> {
  const received: Received[] = [];
  const server = new SMTPServer({
    authMethods: ['PLAIN', 'LOGIN'],
    onAuth(auth, _session, callback) {
      if (auth.username === USER && auth.password === PASSWORD) {
        callback(null, { user: auth.username });
      } else {
        callback(new Error('Invalid username or password'));
      }
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        received.push({
          from: session.envelope.mailFrom === false ? undefined : session.envelope.mailFrom.address,
          to: session.envelope.rcptTo.map((recipient) => recipient.address),
          raw: Buffer.concat(chunks).toString('utf8'),
          secure: session.secure,
        });
        callback();
      });
    },
    logger: false,
    ...options,
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.server.address() as AddressInfo;

  return {
    port,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function settingsFor(server: FakeSmtpServer, overrides: Partial<SmtpSettings> = {}): SmtpSettings {
  return {
    host: '127.0.0.1',
    port: server.port,
    secure: false,
    user: USER,
    password: PASSWORD,
    from: { address: 'archive@ricambi.example', name: 'Ricambi' },
    ...overrides,
  };
}

/** The test server's certificate is self-signed; the transport's own default is to verify. */
const TRUST_THE_TEST_SERVER = { tls: { rejectUnauthorized: false } };

/** A letter body as written, with its quoted-printable undone. */
function bodyOf(raw: string): string {
  const body = raw.slice(raw.indexOf('\r\n\r\n') + 4);
  return body
    .replace(/=\r\n/g, '')
    .replace(/=([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function header(raw: string, name: string): string | undefined {
  const headers = raw.slice(0, raw.indexOf('\r\n\r\n')).replace(/\r\n[ \t]+/g, ' ');
  const line = headers.split('\r\n').find((candidate) => candidate.startsWith(`${name}: `));
  return line?.slice(name.length + 2);
}

describe('the SMTP transport', () => {
  describe('in a production archive', () => {
    let server: FakeSmtpServer;
    let app: TestApp;
    let administrator: TestAgent;

    beforeAll(async () => {
      server = await startSmtpServer();
      app = await startTestApp({
        env: { ENVIRONMENT_MODE: 'production', PUBLIC_URL: 'https://ricambi.example' },
        emailSender: new SmtpEmailSender(settingsFor(server), TRUST_THE_TEST_SERVER),
      });
    });

    afterAll(async () => {
      await app.close();
      await server.close();
    });

    beforeEach(async () => {
      await app.reset();
      administrator = (await givenAnAdministrator(app)).agent;
    });

    afterEach(() => {
      server.received.length = 0;
    });

    it('delivers an invitation: envelope, sender, subject and the link, over TLS', async () => {
      await administrator
        .post('/api/roster')
        .send({ name: 'Giulia Rossi', email: 'giulia@club.example', paidThrough: '2026-12-31' })
        .expect(201);

      expect(server.received).toHaveLength(1);
      const [letter] = server.received;

      expect(letter?.secure).toBe(true);
      expect(letter?.from).toBe('archive@ricambi.example');
      expect(letter?.to).toEqual(['giulia@club.example']);
      expect(header(letter?.raw ?? '', 'From')).toBe('Ricambi <archive@ricambi.example>');
      expect(header(letter?.raw ?? '', 'To')).toBe('giulia@club.example');
      expect(header(letter?.raw ?? '', 'Subject')).toBe('Your Ricambi invitation');
      expect(bodyOf(letter?.raw ?? '')).toContain('https://ricambi.example/set-password?token=');
    });

    // Issue #131: the office answers the Visitor, not Ricambi.
    it('delivers a membership request to the Club office, to be answered to the Visitor', async () => {
      await administrator
        .patch('/api/club')
        .send({ officeEmail: 'office@club.example' })
        .expect(200);
      server.received.length = 0;

      await app
        .request()
        .post('/api/membership-requests')
        .send({ name: 'Ada Visitor', email: 'ada@visitor.example', consent: true })
        .expect(204);

      expect(server.received).toHaveLength(1);
      const [letter] = server.received;
      expect(letter?.to).toEqual(['office@club.example']);
      expect(header(letter?.raw ?? '', 'Reply-To')).toBe('ada@visitor.example');
    });
  });

  it('answers 502 when the server refuses, and leaves the person on the roster', async () => {
    const refusing = await startSmtpServer({
      onRcptTo(address, _session, callback) {
        callback(new Error(`<${address.address}>: no such user here`));
      },
    });
    const app = await startTestApp({
      env: { ENVIRONMENT_MODE: 'production', PUBLIC_URL: 'https://ricambi.example' },
      emailSender: new SmtpEmailSender(settingsFor(refusing), TRUST_THE_TEST_SERVER),
    });

    try {
      const { agent: administrator } = await givenAnAdministrator(app);

      const response = await administrator
        .post('/api/roster')
        .send({ name: 'Giulia Rossi', email: 'giulia@club.example', paidThrough: '2026-12-31' })
        .expect(502);
      expect(response.body.error.code).toBe('invitation_not_sent');

      const roster = await administrator.get('/api/roster').expect(200);
      expect(roster.body.members.map((member: { email: string }) => member.email)).toContain(
        'giulia@club.example',
      );
    } finally {
      await app.close();
      await refusing.close();
    }
  });

  it('refuses with an error that names the fault, and not the recipient or the password', async () => {
    const refusing = await startSmtpServer({
      onRcptTo(address, _session, callback) {
        callback(new Error(`<${address.address}>: no such user here`));
      },
    });
    const sender = new SmtpEmailSender(settingsFor(refusing), TRUST_THE_TEST_SERVER);

    try {
      const failure = await sender
        .send({ to: 'giulia@club.example', subject: 'Your Ricambi invitation', text: 'Hello.' })
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect(failure).toBeInstanceOf(Error);
      const lines: string[] = [];
      createLogger(
        { ...loadSmtpConfig(), logLevel: 'info' },
        { write: (line) => lines.push(line) },
      ).error({ err: failure }, 'Could not send');
      const written = lines.join('');

      expect(written).toContain('Your Ricambi invitation');
      expect(describeError(failure).code).toBe('EENVELOPE');
      expect(written).not.toContain('giulia@club.example');
      expect(written).not.toContain(PASSWORD);
    } finally {
      await refusing.close();
    }
  });

  it('refuses a login the server does not accept', async () => {
    const server = await startSmtpServer();
    const sender = new SmtpEmailSender(
      settingsFor(server, { password: 'not-the-password' }),
      TRUST_THE_TEST_SERVER,
    );

    try {
      await expect(
        sender.send({ to: 'giulia@club.example', subject: 'Hello', text: 'Hello.' }),
      ).rejects.toMatchObject({ code: 'EAUTH' });
      expect(server.received).toHaveLength(0);
    } finally {
      await server.close();
    }
  });

  it('will not log in over a connection that could not be upgraded to TLS', async () => {
    const plaintext = await startSmtpServer({ disabledCommands: ['STARTTLS'] });
    const sender = new SmtpEmailSender(settingsFor(plaintext), TRUST_THE_TEST_SERVER);

    try {
      await expect(
        sender.send({ to: 'giulia@club.example', subject: 'Hello', text: 'Hello.' }),
      ).rejects.toMatchObject({ code: 'ETLS' });
      expect(plaintext.received).toHaveLength(0);
    } finally {
      await plaintext.close();
    }
  });

  it('delivers over a connection that is TLS from the start', async () => {
    const implicit = await startSmtpServer({ secure: true });
    const sender = new SmtpEmailSender(
      settingsFor(implicit, { secure: true }),
      TRUST_THE_TEST_SERVER,
    );

    try {
      await sender.send({ to: 'giulia@club.example', subject: 'Hello', text: 'Hello.' });
      expect(implicit.received.map((letter) => letter.secure)).toEqual([true]);
    } finally {
      await implicit.close();
    }
  });
});

const COMPLETE_SMTP_ENVIRONMENT = {
  EMAIL_TRANSPORT: 'smtp',
  SMTP_HOST: 'smtp.provider.example',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: USER,
  SMTP_PASSWORD: PASSWORD,
  EMAIL_FROM_ADDRESS: 'archive@ricambi.example',
};

function loadSmtpConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    ENVIRONMENT_NAME: 'test',
    DATABASE_URL: 'postgres://unused-in-tests/the-connection-is-injected',
    ...COMPLETE_SMTP_ENVIRONMENT,
    ...overrides,
  });
}

describe('EMAIL_TRANSPORT=smtp', () => {
  it('reads every setting from the environment, sending in the name of Ricambi by default', () => {
    expect(loadSmtpConfig().email).toEqual({
      transport: 'smtp',
      smtp: {
        host: 'smtp.provider.example',
        port: 587,
        secure: false,
        user: USER,
        password: PASSWORD,
        from: { address: 'archive@ricambi.example', name: 'Ricambi' },
      },
    });
    expect(
      loadSmtpConfig({ SMTP_SECURE: 'true', EMAIL_FROM_NAME: 'The Archive' }).email,
    ).toMatchObject({
      smtp: { secure: true, from: { name: 'The Archive' } },
    });
  });

  it('refuses to start without a setting it needs, naming every one that is missing', () => {
    expect(() => loadSmtpConfig({ SMTP_HOST: undefined, SMTP_PASSWORD: '' })).toThrow(
      /EMAIL_TRANSPORT=smtp needs SMTP_HOST, SMTP_PASSWORD\./,
    );
    expect(() => loadSmtpConfig({ EMAIL_FROM_ADDRESS: undefined })).toThrow(/EMAIL_FROM_ADDRESS/);
    expect(() => loadSmtpConfig({ SMTP_SECURE: undefined })).toThrow(/SMTP_SECURE/);
  });

  it('says it reaches real people, so a non-production environment will not start with it', () => {
    const config = loadSmtpConfig({ ENVIRONMENT_MODE: 'non-production' });
    const emailSender = createEmailSender(config, createLogger({ ...config, logLevel: 'silent' }));

    expect(emailSender.reachesRealPeople).toBe(true);
    expect(() =>
      assertSafeForEnvironment({
        config,
        emailSender,
        paymentProvider: new UnconfiguredPaymentProvider(),
      }),
    ).toThrow(/real person/);
  });

  it('starts in production', () => {
    const config = loadSmtpConfig({
      ENVIRONMENT_MODE: 'production',
      PUBLIC_URL: 'https://ricambi.example',
    });
    const emailSender = createEmailSender(config, createLogger({ ...config, logLevel: 'silent' }));

    expect(() =>
      assertSafeForEnvironment({
        config,
        emailSender,
        paymentProvider: new UnconfiguredPaymentProvider(),
      }),
    ).not.toThrow();
  });
});
