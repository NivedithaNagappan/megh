import { internalLogger } from "../observability/internal-logger";
import type { SmtpMailerConfig } from "./config";
import { MailError } from "./errors";
import type { MailMessage, MailTransport, MailTransportResult } from "./types";

function requireNodemailer(): any {
  try {
    return require("nodemailer");
  } catch {
    throw new MailError(
      "The smtp mailer needs nodemailer, which is not installed.\nRun: npm install nodemailer",
    );
  }
}

/** Nodemailer transport options for an SMTP mailer. */
export function smtpTransportOptions(
  config: SmtpMailerConfig,
): Record<string, unknown> {
  if (!config.host && !config.options) {
    throw new MailError(
      "The smtp mailer has no host. Set MEGH_MAIL_HOST in .env, or pass mailers.smtp.host to app.useMail().",
    );
  }
  const secure = config.encryption
    ? config.encryption === "ssl"
    : config.port === 465;
  const options: Record<string, unknown> = {
    host: config.host,
    port: config.port,
    secure,
  };
  if (config.encryption === "tls") options.requireTLS = true;
  if (config.username)
    options.auth = { user: config.username, pass: config.password ?? "" };
  for (const key of Object.keys(options))
    if (options[key] === undefined) delete options[key];
  return { ...options, ...config.options };
}

/** The message in the shape Nodemailer's `sendMail()` takes. */
export function toNodemailerMessage(
  message: MailMessage,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    from: message.from,
    to: message.to,
    subject: message.subject,
  };
  if (message.cc.length) out.cc = message.cc;
  if (message.bcc.length) out.bcc = message.bcc;
  if (message.replyTo.length) out.replyTo = message.replyTo;
  if (message.text !== undefined) out.text = message.text;
  if (message.html !== undefined) out.html = message.html;
  if (message.attachments.length) out.attachments = message.attachments;
  if (Object.keys(message.headers).length) out.headers = message.headers;
  return out;
}

/** Sends through an SMTP server with Nodemailer, connecting on the first send. */
export class SmtpTransport implements MailTransport {
  private transporter: any;

  constructor(private readonly config: SmtpMailerConfig) {}

  async send(message: MailMessage): Promise<MailTransportResult> {
    this.transporter ??= requireNodemailer().createTransport(
      smtpTransportOptions(this.config),
    );
    const info = await this.transporter.sendMail(toNodemailerMessage(message));
    return { messageId: info?.messageId, response: info };
  }

  close(): void {
    this.transporter?.close?.();
    this.transporter = undefined;
  }
}

/** Writes each message to the Megh logger (module `mail`) instead of sending it. */
export class LogTransport implements MailTransport {
  private readonly logger = internalLogger("mail");

  async send(message: MailMessage): Promise<MailTransportResult> {
    const list = (addresses: MailMessage["to"]) => addresses.map(formatAddress);
    this.logger.info(
      {
        from: formatAddress(message.from),
        to: list(message.to),
        ...(message.cc.length ? { cc: list(message.cc) } : {}),
        ...(message.bcc.length ? { bcc: list(message.bcc) } : {}),
        subject: message.subject,
        ...(message.attachments.length
          ? {
              attachments: message.attachments.map(
                (a) => a.filename ?? a.path ?? "attachment",
              ),
            }
          : {}),
        text: message.text,
        html: message.html,
      },
      "Mail not sent (log mailer)",
    );
    return {};
  }
}

/** Keeps every message in `messages`, for tests. */
export class ArrayTransport implements MailTransport {
  readonly messages: MailMessage[] = [];

  async send(message: MailMessage): Promise<MailTransportResult> {
    this.messages.push(message);
    return {};
  }

  /** Forget the messages kept so far. */
  flush(): void {
    this.messages.length = 0;
  }
}

function formatAddress(a: { name?: string; address: string }) {
  return a.name ? `${a.name} <${a.address}>` : a.address;
}
