/**
 * An email address: `"ann@x.io"`, `"Ann <ann@x.io>"` or
 * `{ name: "Ann", address: "ann@x.io" }`.
 */
export type MailAddressLike = string | MailAddress;

/** An email address with an optional display name. */
export interface MailAddress {
  name?: string;
  address: string;
}

/** A file attached to a message. Give `content` or `path`. */
export interface MailAttachment {
  /** The file name the recipient sees. */
  filename?: string;
  /** The file's contents. */
  content?: string | Buffer;
  /** A file path or URL to read the contents from. */
  path?: string;
  /** MIME type; worked out from `filename` when left out. */
  contentType?: string;
  /** Content ID, for images referenced as `<img src="cid:...">` in the HTML. */
  cid?: string;
}

/** Who a message is from and to, and its subject. Returned by `Mailable.envelope()`. */
export interface MailEnvelope {
  /** Defaults to the class name as words: `WelcomeMail` → "Welcome Mail". */
  subject?: string;
  /** Overrides the configured `from` address. */
  from?: MailAddressLike;
  replyTo?: MailAddressLike | MailAddressLike[];
  /** Added to the recipients given with `mailer.to()`. */
  to?: MailAddressLike | MailAddressLike[];
  cc?: MailAddressLike | MailAddressLike[];
  bcc?: MailAddressLike | MailAddressLike[];
  /** Extra message headers. */
  headers?: Record<string, string>;
}

/** The message body. Returned by `Mailable.content()`; give `html`, `text` or both. */
export interface MailContent {
  html?: string;
  text?: string;
}

/** A fully built message, as a transport receives it. */
export interface MailMessage {
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  replyTo: MailAddress[];
  subject: string;
  html?: string;
  text?: string;
  attachments: MailAttachment[];
  headers: Record<string, string>;
}

/** What a transport reports back after sending. */
export interface MailTransportResult {
  /** The provider's ID for the message, when it gives one. */
  messageId?: string;
  /** The provider's raw response. */
  response?: unknown;
}

/**
 * Delivers built messages: SMTP, a provider's HTTP API, a log, memory.
 * Implement it to add a provider, and register it in `useMail({ mailers })`.
 *
 * @example
 * class MyTransport implements MailTransport {
 *   async send(message: MailMessage) {
 *     const res = await fetch('https://api.example.com/send', { method: 'POST', body: JSON.stringify(message) });
 *     return { messageId: (await res.json()).id };
 *   }
 * }
 */
export interface MailTransport {
  send(message: MailMessage): Promise<MailTransportResult | void>;
  /** Release connections; called by `Mailer.close()` and when the app closes. */
  close?(): void | Promise<void>;
}

/** The result of `send()`: the mailer used, the message and the provider's reply. */
export interface SentMessage extends MailTransportResult {
  mailer: string;
  message: MailMessage;
}
