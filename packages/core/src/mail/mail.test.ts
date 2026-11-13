import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeghApplication } from "../core/application";
import { AppConfig, MeghConfig } from "../config/config";
import { LoggerService } from "../observability/logger";
import {
  ArrayTransport,
  Mailable,
  MailError,
  Mailer,
  SmtpTransport,
  mailConfigFromEnv,
  resolveMailConfig,
  type MailConfig,
  type MailMessage,
} from "./index";
import { buildMessage, parseAddress } from "./mailer";
import { smtpTransportOptions } from "./transports";

class WelcomeMail extends Mailable {
  constructor(private readonly name = "Ann") {
    super();
  }
  envelope() {
    return { subject: `Welcome, ${this.name}` };
  }
  content() {
    return { html: `<p>Hi ${this.name}</p>`, text: `Hi ${this.name}` };
  }
}

class OTPCodeMail extends Mailable {
  async content() {
    return { text: "123456" };
  }
}

const none = { to: [], cc: [], bcc: [] };
const env = (vars: Record<string, string>) => mailConfigFromEnv((k) => vars[k]);

let memory: ArrayTransport;
const configure = (extra: MailConfig = {}) => {
  memory = new ArrayTransport();
  Mailer.configure({
    default: "memory",
    from: "Megh <hello@megh.dev>",
    mailers: { memory },
    ...extra,
  });
};

beforeEach(async () => {
  await Mailer.reset();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Mailer.reset();
});

describe("mail config", () => {
  it("reads MEGH_MAIL_* variables", () => {
    const config = env({
      MEGH_MAIL_MAILER: "smtp",
      MEGH_MAIL_HOST: "smtp.x.io",
      MEGH_MAIL_PORT: "2525",
      MEGH_MAIL_ENCRYPTION: "TLS",
      MEGH_MAIL_USERNAME: "user",
      MEGH_MAIL_PASSWORD: "secret",
      MEGH_MAIL_FROM_ADDRESS: "hello@x.io",
      MEGH_MAIL_FROM_NAME: "X",
    });
    expect(config.default).toBe("smtp");
    expect(config.from).toEqual({ address: "hello@x.io", name: "X" });
    expect(config.mailers!.smtp).toEqual({
      transport: "smtp",
      host: "smtp.x.io",
      port: 2525,
      encryption: "tls",
      username: "user",
      password: "secret",
    });
  });

  it("rejects a bad encryption or port", () => {
    expect(() => env({ MEGH_MAIL_ENCRYPTION: "starttls" })).toThrow(
      /MEGH_MAIL_ENCRYPTION must be one of ssl, tls, none/,
    );
    expect(() => env({ MEGH_MAIL_PORT: "abc" })).toThrow(
      /MEGH_MAIL_PORT must be a number/,
    );
  });

  it("defaults to smtp when a host is set, else log in development and array in tests", () => {
    expect(
      resolveMailConfig({}, env({ MEGH_MAIL_HOST: "smtp.x.io" })).default,
    ).toBe("smtp");
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveMailConfig({}, env({})).default).toBe("log");
    vi.stubEnv("NODE_ENV", "test");
    expect(resolveMailConfig({}, env({})).default).toBe("array");
  });

  it("refuses to guess a mailer in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => resolveMailConfig({}, env({}))).toThrow(/No mailer is set/);
    expect(resolveMailConfig({ default: "log" }, env({})).default).toBe("log");
  });

  it("lets options override the environment, and checks the default exists", () => {
    const config = resolveMailConfig(
      { from: "a@x.io", mailers: { audit: new ArrayTransport() } },
      env({ MEGH_MAIL_MAILER: "audit", MEGH_MAIL_FROM_ADDRESS: "b@x.io" }),
    );
    expect(config.default).toBe("audit");
    expect(config.from).toBe("a@x.io");
    expect(Object.keys(config.mailers)).toEqual([
      "smtp",
      "log",
      "array",
      "audit",
    ]);
    expect(() => resolveMailConfig({ default: "nope" }, env({}))).toThrow(
      /default mailer "nope" is not configured/,
    );
  });
});

describe("smtp options", () => {
  it("maps encryption to Nodemailer's secure and requireTLS", () => {
    expect(
      smtpTransportOptions({ transport: "smtp", host: "h", encryption: "ssl" }),
    ).toEqual({ host: "h", secure: true });
    expect(
      smtpTransportOptions({
        transport: "smtp",
        host: "h",
        port: 587,
        encryption: "tls",
      }),
    ).toEqual({
      host: "h",
      port: 587,
      secure: false,
      requireTLS: true,
    });
    expect(
      smtpTransportOptions({ transport: "smtp", host: "h", port: 465 }).secure,
    ).toBe(true);
    expect(
      smtpTransportOptions({
        transport: "smtp",
        host: "h",
        port: 25,
        encryption: "none",
      }).secure,
    ).toBe(false);
  });

  it("adds auth and extra options, and needs a host", () => {
    expect(
      smtpTransportOptions({
        transport: "smtp",
        host: "h",
        username: "u",
        password: "p",
        options: { pool: true },
      }),
    ).toMatchObject({ auth: { user: "u", pass: "p" }, pool: true });
    expect(() => smtpTransportOptions({ transport: "smtp" })).toThrow(
      /smtp mailer has no host/,
    );
  });

  it("builds a real MIME message with Nodemailer", async () => {
    const transport = new SmtpTransport({
      transport: "smtp",
      options: { streamTransport: true, buffer: true, newline: "unix" },
    });
    const message = await buildMessage(
      new WelcomeMail(),
      {
        to: [{ name: "Ann", address: "ann@x.io" }],
        cc: [],
        bcc: [{ address: "audit@x.io" }],
      },
      "Megh <hello@megh.dev>",
    );
    message.attachments.push({ filename: "terms.txt", content: "Be nice." });
    const result = await transport.send(message);
    const raw = String((result.response as any).message);
    expect(raw).toContain("From: Megh <hello@megh.dev>");
    expect(raw).toContain("To: Ann <ann@x.io>");
    expect(raw).toContain("Subject: Welcome, Ann");
    expect(raw).toContain("filename=terms.txt");
    // Bcc is delivered through the SMTP envelope. (Nodemailer's stream transport
    // keeps the Bcc header in its output; its SMTP transport drops it.)
    expect((result.response as any).envelope.to).toEqual([
      "ann@x.io",
      "audit@x.io",
    ]);
    expect(result.messageId).toMatch(/@megh\.dev>$/);
    transport.close();
  });
});

describe("building a message", () => {
  it("parses addresses", () => {
    expect(parseAddress("ann@x.io")).toEqual({ address: "ann@x.io" });
    expect(parseAddress("\"Ann Lee\" <ann@x.io>")).toEqual({
      name: "Ann Lee",
      address: "ann@x.io",
    });
    expect(parseAddress({ name: "", address: " ann@x.io " })).toEqual({
      address: "ann@x.io",
    });
    expect(() => parseAddress("not-an-address")).toThrow(MailError);
    expect(() => parseAddress("ann@x.io\r\nBcc: evil@x.io")).toThrow(
      /line breaks/,
    );
  });

  it("names the subject after the class, and merges envelope recipients", async () => {
    class InviteMail extends Mailable {
      envelope() {
        return {
          from: "team@x.io",
          cc: "lead@x.io",
          replyTo: ["help@x.io"],
          headers: { "X-Tag": "invite" },
        };
      }
      content() {
        return { text: "Join us" };
      }
    }
    const message = await buildMessage(
      new InviteMail(),
      { ...none, to: [{ address: "ann@x.io" }] },
      "hello@x.io",
    );
    expect(message).toEqual<MailMessage>({
      from: { address: "team@x.io" },
      to: [{ address: "ann@x.io" }],
      cc: [{ address: "lead@x.io" }],
      bcc: [],
      replyTo: [{ address: "help@x.io" }],
      subject: "Invite Mail",
      text: "Join us",
      attachments: [],
      headers: { "X-Tag": "invite" },
    });
    expect(
      (
        await buildMessage(
          new OTPCodeMail(),
          { ...none, to: [{ address: "a@x.io" }] },
          "h@x.io",
        )
      ).subject,
    ).toBe("OTP Code Mail");
  });

  it("explains what is missing", async () => {
    const to = { ...none, to: [{ address: "a@x.io" }] };
    await expect(buildMessage(new WelcomeMail(), to)).rejects.toThrow(
      /WelcomeMail has no sender/,
    );
    await expect(
      buildMessage(new WelcomeMail(), none, "h@x.io"),
    ).rejects.toThrow(/WelcomeMail has no recipients/);
    class Empty extends Mailable {
      content() {
        return {};
      }
    }
    await expect(buildMessage(new Empty(), to, "h@x.io")).rejects.toThrow(
      /Empty.content\(\) returned neither html nor text/,
    );
    class Injected extends Mailable {
      envelope() {
        return { subject: "Hi\nBcc: evil@x.io" };
      }
      content() {
        return { text: "x" };
      }
    }
    await expect(buildMessage(new Injected(), to, "h@x.io")).rejects.toThrow(
      /subject must not contain line breaks/,
    );
  });
});

describe("Mailer", () => {
  it("sends through the default mailer", async () => {
    configure();
    const sent = await new Mailer()
      .to("Ann <ann@x.io>")
      .cc("lead@x.io")
      .send(new WelcomeMail());
    expect(sent.mailer).toBe("memory");
    expect(memory.messages).toHaveLength(1);
    expect(memory.messages[0]).toMatchObject({
      from: { name: "Megh", address: "hello@megh.dev" },
      to: [{ name: "Ann", address: "ann@x.io" }],
      cc: [{ address: "lead@x.io" }],
      subject: "Welcome, Ann",
    });
  });

  it("sends through a named mailer, and rejects unknown ones", async () => {
    configure();
    const info = vi.fn();
    vi.spyOn(LoggerService, "child").mockReturnValue({ info } as any);
    const sent = await new Mailer()
      .mailer("log")
      .to("ann@x.io")
      .send(new WelcomeMail());
    expect(sent.mailer).toBe("log");
    expect(memory.messages).toHaveLength(0);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["ann@x.io"],
        subject: "Welcome, Ann",
        text: "Hi Ann",
      }),
      "Mail not sent (log mailer)",
    );
    await expect(
      new Mailer().mailer("sendgrid").to("a@x.io").send(new WelcomeMail()),
    ).rejects.toThrow(/no mailer named "sendgrid"/);
  });

  it("uses a custom transport and returns its reply", async () => {
    const send = vi.fn(async () => ({ messageId: "abc" }));
    Mailer.configure({
      default: "custom",
      from: "h@x.io",
      mailers: { custom: { send } },
    });
    const sent = await new Mailer().send(
      new (class extends WelcomeMail {
        envelope() {
          return { to: "ann@x.io" };
        }
      })(),
    );
    expect(sent.messageId).toBe("abc");
    expect(send).toHaveBeenCalledOnce();
  });

  it("reads the environment when configure() was not called", async () => {
    vi.stubEnv("MEGH_MAIL_FROM_ADDRESS", "env@x.io");
    vi.stubEnv("MEGH_MAIL_MAILER", "array");
    const sent = await new Mailer().to("a@x.io").send(new WelcomeMail());
    expect(sent.mailer).toBe("array");
    expect(sent.message.from).toEqual({ address: "env@x.io" });
  });

  it("closes transports on close() and when reconfigured", async () => {
    const close = vi.fn();
    Mailer.configure({
      default: "c",
      from: "h@x.io",
      mailers: { c: { send: async () => {}, close } },
    });
    await new Mailer().to("a@x.io").send(new WelcomeMail());
    await Mailer.close();
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("Mailer.fake", () => {
  it("records instead of sending, with assertions", async () => {
    configure();
    const mail = Mailer.fake();
    await new Mailer().to("ann@x.io").bcc("audit@x.io").send(new WelcomeMail());
    await new Mailer().to("bob@x.io").send(new WelcomeMail("Bob"));
    expect(memory.messages).toHaveLength(0);

    mail.assertSent(WelcomeMail);
    mail.assertSent(WelcomeMail, 2);
    mail.assertSent(
      WelcomeMail,
      (sent) => sent.hasTo("ANN@x.io") && sent.hasBcc("audit@x.io"),
    );
    mail.assertSent(WelcomeMail, (sent) => sent.hasFrom("hello@megh.dev"));
    mail.assertNotSent(OTPCodeMail);
    mail.assertNotSent(WelcomeMail, (sent) => sent.hasTo("carol@x.io"));
    mail.assertSentCount(2);
    expect(
      mail.sentOf(WelcomeMail, (s) => s.hasTo("bob@x.io"))[0].message.subject,
    ).toBe("Welcome, Bob");
  });

  it("fails with a message that says what was sent", async () => {
    configure();
    const mail = Mailer.fake();
    expect(() => mail.assertSent(WelcomeMail)).toThrow(
      "Expected WelcomeMail to be sent, but it was not. Nothing was sent.",
    );
    mail.assertNothingSent();
    await new Mailer().to("a@x.io").send(new OTPCodeMail());
    expect(() => mail.assertSent(WelcomeMail)).toThrow(
      "Sent: OTPCodeMail (1).",
    );
    expect(() =>
      mail.assertSent(OTPCodeMail, (s) => s.hasTo("b@x.io")),
    ).toThrow(/OTPCodeMail to be sent matching the check/);
    expect(() => mail.assertSent(OTPCodeMail, 2)).toThrow(
      "sent 2 time(s), but it was sent 1 time(s)",
    );
    expect(() => mail.assertNotSent(OTPCodeMail)).toThrow(/not to be sent/);
    expect(() => mail.assertNothingSent()).toThrow(/Expected no mail/);
  });

  it("still builds the message, so a broken mailable fails the test", async () => {
    configure();
    Mailer.fake();
    await expect(new Mailer().send(new WelcomeMail())).rejects.toThrow(
      /no recipients/,
    );
  });

  it("restore() sends again", async () => {
    configure();
    Mailer.fake().restore();
    await new Mailer().to("a@x.io").send(new WelcomeMail());
    expect(memory.messages).toHaveLength(1);
  });
});

describe("app.useMail", () => {
  it("configures the mailer from options or an @AppConfig class", async () => {
    const transport = new ArrayTransport();
    @AppConfig
    class MailSettings extends MeghConfig<MailConfig> {
      config() {
        return { default: "t", from: "h@x.io", mailers: { t: transport } };
      }
    }
    const app = MeghApplication.getInternalApp();
    app.useErrorLogger(false);
    app.useMail(MailSettings);
    await new Mailer().to("a@x.io").send(new WelcomeMail());
    expect(transport.messages).toHaveLength(1);
    expect(() => app.useMail({ default: "missing" })).toThrow(
      /"missing" is not configured/,
    );
  });

  it("closes the transports when the app closes", async () => {
    const close = vi.spyOn(Mailer, "close");
    const app = MeghApplication.getInternalApp();
    app.useErrorLogger(false);
    app.useMail({ default: "array" });
    await app.run(0);
    close.mockClear();
    await app.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
