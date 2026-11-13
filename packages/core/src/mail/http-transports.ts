import { promises as fs } from "fs";
import mime from "mime";
import type {
  MailgunMailerConfig,
  PostmarkMailerConfig,
  ResendMailerConfig,
  SendGridMailerConfig,
} from "./config";
import { MailError } from "./errors";
import type {
  MailAddress,
  MailAttachment,
  MailMessage,
  MailTransport,
  MailTransportResult,
} from "./types";

const DEFAULT_TIMEOUT = 30_000;

/** A provider refused the message, or could not be reached. */
export class MailTransportError extends MailError {
  constructor(
    readonly provider: string,
    /** The HTTP status, when there was a response. */
    readonly status: number | undefined,
    /** The response body, when there was one. */
    readonly body: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "MailTransportError";
  }
}

/** POST to a provider's API, turning network errors and non-2xx replies into a MailTransportError. */
async function post(
  provider: string,
  url: string,
  init: { headers: Record<string, string>; body: string | FormData },
  timeout = DEFAULT_TIMEOUT,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: init.headers,
      body: init.body,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new MailTransportError(
      provider,
      undefined,
      undefined,
      `${provider} could not be reached: ${why}`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new MailTransportError(
      provider,
      res.status,
      body,
      `${provider} rejected the message (HTTP ${res.status}): ${body.slice(0, 500)}`,
    );
  }
  return res;
}

/** An attachment's bytes, read from `content` or `path` (a file or an http(s) URL). */
export async function attachmentBytes(a: MailAttachment): Promise<Buffer> {
  if (Buffer.isBuffer(a.content)) return a.content;
  if (typeof a.content === "string") {
    return Buffer.from(a.content, a.encoding === "base64" ? "base64" : "utf8");
  }
  if (a.path) {
    if (/^https?:\/\//i.test(a.path)) {
      const res = await fetch(a.path, {
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
      });
      if (!res.ok) {
        throw new MailError(
          `Could not download attachment ${a.path} (HTTP ${res.status}).`,
        );
      }
      return Buffer.from(await res.arrayBuffer());
    }
    return fs.readFile(a.path);
  }
  throw new MailError(
    `Attachment${a.filename ? ` ${a.filename}` : ""} has neither content nor path.`,
  );
}

function attachmentName(a: MailAttachment) {
  return (
    a.filename ??
    (a.path ? a.path.split(/[\\/]/).pop() : undefined) ??
    "attachment"
  );
}

function attachmentType(a: MailAttachment) {
  return (
    a.contentType ??
    mime.getType(attachmentName(a)) ??
    "application/octet-stream"
  );
}

/** `Name <a@x.io>`, quoting the name when it has characters that need it. */
export function formatAddress(a: MailAddress): string {
  if (!a.name) return a.address;
  const name = /[()<>[\]:;@\\,."]/.test(a.name)
    ? `"${a.name.replace(/(["\\])/g, "\\$1")}"`
    : a.name;
  return `${name} <${a.address}>`;
}

function requireSetting(value: string | undefined, what: string): string {
  if (!value) throw new MailError(`${what} is not set.`);
  return value;
}

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

// ─── SendGrid ────────────────────────────────────────────────────────────────

/** Twilio SendGrid's v3 Mail Send API. */
export class SendGridTransport implements MailTransport {
  constructor(private readonly config: SendGridMailerConfig) {}

  async send(message: MailMessage): Promise<MailTransportResult> {
    const apiKey = requireSetting(
      this.config.apiKey,
      "The sendgrid mailer's API key (MEGH_MAIL_SENDGRID_API_KEY)",
    );
    const person = (list: MailAddress[]) =>
      list.map((a) =>
        a.name ? { email: a.address, name: a.name } : { email: a.address },
      );
    // SendGrid rejects an address that appears twice across to, cc and bcc.
    const seen = new Set<string>();
    const unique = (list: MailAddress[]) =>
      list.filter((a) => {
        const key = a.address.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const to = unique(message.to);
    const cc = unique(message.cc);
    const bcc = unique(message.bcc);
    const personalization: Record<string, unknown> = { to: person(to) };
    if (cc.length) personalization.cc = person(cc);
    if (bcc.length) personalization.bcc = person(bcc);

    const content: Array<{ type: string; value: string }> = [];
    if (message.text !== undefined)
      content.push({ type: "text/plain", value: message.text });
    if (message.html !== undefined)
      content.push({ type: "text/html", value: message.html });

    const body: Record<string, unknown> = {
      personalizations: [personalization],
      from: person([message.from])[0],
      subject: message.subject,
      content,
    };
    if (message.replyTo.length === 1)
      body.reply_to = person(message.replyTo)[0];
    if (message.replyTo.length > 1)
      body.reply_to_list = person(message.replyTo);
    if (Object.keys(message.headers).length) body.headers = message.headers;
    if (message.attachments.length) {
      body.attachments = await Promise.all(
        message.attachments.map(async (a) => ({
          content: (await attachmentBytes(a)).toString("base64"),
          filename: attachmentName(a),
          type: attachmentType(a),
          ...(a.cid ? { disposition: "inline", content_id: a.cid } : {}),
        })),
      );
    }

    const res = await post(
      "SendGrid",
      `${trimSlash(this.config.endpoint ?? "https://api.sendgrid.com")}/v3/mail/send`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      this.config.timeout,
    );
    return {
      messageId: res.headers.get("x-message-id") ?? undefined,
      response: { status: res.status },
    };
  }
}

// ─── Mailgun ─────────────────────────────────────────────────────────────────

/** Mailgun's Messages API. EU domains use `endpoint: "https://api.eu.mailgun.net"`. */
export class MailgunTransport implements MailTransport {
  constructor(private readonly config: MailgunMailerConfig) {}

  async send(message: MailMessage): Promise<MailTransportResult> {
    const apiKey = requireSetting(
      this.config.apiKey,
      "The mailgun mailer's API key (MEGH_MAIL_MAILGUN_API_KEY)",
    );
    const domain = requireSetting(
      this.config.domain,
      "The mailgun mailer's domain (MEGH_MAIL_MAILGUN_DOMAIN)",
    );
    const form = new FormData();
    form.append("from", formatAddress(message.from));
    // One field per address: a comma inside a display name stays safe.
    for (const a of message.to) form.append("to", formatAddress(a));
    for (const a of message.cc) form.append("cc", formatAddress(a));
    for (const a of message.bcc) form.append("bcc", formatAddress(a));
    form.append("subject", message.subject);
    if (message.text !== undefined) form.append("text", message.text);
    if (message.html !== undefined) form.append("html", message.html);
    if (message.replyTo.length) {
      form.append("h:Reply-To", message.replyTo.map(formatAddress).join(", "));
    }
    for (const [key, value] of Object.entries(message.headers)) {
      form.append(`h:${key}`, value);
    }
    for (const a of message.attachments) {
      const blob = new Blob([new Uint8Array(await attachmentBytes(a))], {
        type: attachmentType(a),
      });
      // Mailgun uses an inline file's name as its content ID.
      if (a.cid) form.append("inline", blob, a.cid);
      else form.append("attachment", blob, attachmentName(a));
    }

    const res = await post(
      "Mailgun",
      `${trimSlash(this.config.endpoint ?? "https://api.mailgun.net")}/v3/${encodeURIComponent(domain)}/messages`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
        },
        body: form,
      },
      this.config.timeout,
    );
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { messageId: json.id, response: json };
  }
}

// ─── Postmark ────────────────────────────────────────────────────────────────

/** Postmark's Email API. */
export class PostmarkTransport implements MailTransport {
  constructor(private readonly config: PostmarkMailerConfig) {}

  async send(message: MailMessage): Promise<MailTransportResult> {
    const token = requireSetting(
      this.config.token,
      "The postmark mailer's server token (MEGH_MAIL_POSTMARK_TOKEN)",
    );
    const list = (addresses: MailAddress[]) =>
      addresses.map(formatAddress).join(", ");
    const body: Record<string, unknown> = {
      From: formatAddress(message.from),
      To: list(message.to),
      Subject: message.subject,
    };
    if (message.cc.length) body.Cc = list(message.cc);
    if (message.bcc.length) body.Bcc = list(message.bcc);
    if (message.replyTo.length) body.ReplyTo = list(message.replyTo);
    if (message.html !== undefined) body.HtmlBody = message.html;
    if (message.text !== undefined) body.TextBody = message.text;
    if (Object.keys(message.headers).length) {
      body.Headers = Object.entries(message.headers).map(([Name, Value]) => ({
        Name,
        Value,
      }));
    }
    if (this.config.messageStream)
      body.MessageStream = this.config.messageStream;
    if (message.attachments.length) {
      body.Attachments = await Promise.all(
        message.attachments.map(async (a) => ({
          Name: attachmentName(a),
          Content: (await attachmentBytes(a)).toString("base64"),
          ContentType: attachmentType(a),
          ...(a.cid ? { ContentID: `cid:${a.cid}` } : {}),
        })),
      );
    }

    const res = await post(
      "Postmark",
      `${trimSlash(this.config.endpoint ?? "https://api.postmarkapp.com")}/email`,
      {
        headers: {
          "X-Postmark-Server-Token": token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      this.config.timeout,
    );
    const json = (await res.json().catch(() => ({}))) as {
      MessageID?: string;
      ErrorCode?: number;
      Message?: string;
    };
    if (json.ErrorCode) {
      throw new MailTransportError(
        "Postmark",
        res.status,
        JSON.stringify(json),
        `Postmark rejected the message (error ${json.ErrorCode}): ${json.Message ?? ""}`,
      );
    }
    return { messageId: json.MessageID, response: json };
  }
}

// ─── Resend ──────────────────────────────────────────────────────────────────

/** Resend's Send Email API. */
export class ResendTransport implements MailTransport {
  constructor(private readonly config: ResendMailerConfig) {}

  async send(message: MailMessage): Promise<MailTransportResult> {
    const apiKey = requireSetting(
      this.config.apiKey,
      "The resend mailer's API key (MEGH_MAIL_RESEND_API_KEY)",
    );
    const body: Record<string, unknown> = {
      from: formatAddress(message.from),
      to: message.to.map(formatAddress),
      subject: message.subject,
    };
    if (message.cc.length) body.cc = message.cc.map(formatAddress);
    if (message.bcc.length) body.bcc = message.bcc.map(formatAddress);
    if (message.replyTo.length)
      body.reply_to = message.replyTo.map(formatAddress);
    if (message.html !== undefined) body.html = message.html;
    if (message.text !== undefined) body.text = message.text;
    if (Object.keys(message.headers).length) body.headers = message.headers;
    if (message.attachments.length) {
      body.attachments = await Promise.all(
        message.attachments.map(async (a) => ({
          filename: attachmentName(a),
          content: (await attachmentBytes(a)).toString("base64"),
          ...(a.cid ? { content_id: a.cid } : {}),
        })),
      );
    }

    const res = await post(
      "Resend",
      `${trimSlash(this.config.endpoint ?? "https://api.resend.com")}/emails`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      this.config.timeout,
    );
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { messageId: json.id, response: json };
  }
}
