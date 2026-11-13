import { Injectable } from "../di";
import type { Constructor } from "../common/utils/common-utils";
import {
  resolveMailConfig,
  type MailConfig,
  type MailerConfig,
  type ResolvedMailConfig,
  type SmtpMailerConfig,
} from "./config";
import { MailError } from "./errors";
import { Mailable } from "./mailable";
import { ArrayTransport, LogTransport, SmtpTransport } from "./transports";
import type {
  MailAddress,
  MailAddressLike,
  MailMessage,
  MailTransport,
  SentMessage,
} from "./types";

type Recipients = { to: MailAddress[]; cc: MailAddress[]; bcc: MailAddress[] };
type AddressInput = MailAddressLike | MailAddressLike[];

/**
 * Sends {@link Mailable}s. Inject it like any service; every instance shares
 * the configuration set by `app.useMail()` (or read from `MEGH_MAIL_*` when
 * `useMail()` was not called).
 *
 * @example
 * constructor(private readonly mailer: Mailer) {}
 *
 * await this.mailer.to(user.email).send(new WelcomeMail(user));
 * await this.mailer.mailer('log').to('dev@x.io').send(new WelcomeMail(user));
 */
@Injectable()
export class Mailer {
  private static config: ResolvedMailConfig | undefined;
  private static readonly transports = new Map<string, MailTransport>();
  private static current: MailFake | null = null;

  /** The named mailer to use; `undefined` means the default. */
  private mailerName: string | undefined;

  /**
   * Set the mail configuration, merged over `MEGH_MAIL_*`. Called by
   * `app.useMail()`; call it yourself outside a Megh app.
   *
   * @throws MailError when the configuration is invalid, e.g. in production
   *   with no mailer set.
   */
  static configure(options?: MailConfig): void {
    const config = resolveMailConfig(options);
    Mailer.close().catch(() => {});
    Mailer.config = config;
  }

  /**
   * Record messages instead of sending them, and get assertions on what was
   * sent. Undo it with `restore()` on the result, or {@link Mailer.restore}.
   *
   * @example
   * const mail = Mailer.fake();
   * await service.register(user);
   * mail.assertSent(WelcomeMail, (sent) => sent.hasTo(user.email));
   */
  static fake(): MailFake {
    Mailer.current = new MailFake();
    return Mailer.current;
  }

  /** Stop faking; messages are sent again. */
  static restore(): void {
    Mailer.current = null;
  }

  /** Close every transport's connections. Called when the app closes. */
  static async close(): Promise<void> {
    const transports = [...Mailer.transports.values()];
    Mailer.transports.clear();
    await Promise.all(transports.map((t) => t.close?.()));
  }

  /** Forget the configuration and transports, so the environment is read again. */
  static async reset(): Promise<void> {
    await Mailer.close();
    Mailer.config = undefined;
    Mailer.current = null;
  }

  /**
   * The same mailer, sending through the named mailer instead of the default.
   *
   * @param name - A key of `mailers` in the configuration, e.g. `smtp` or `log`.
   */
  mailer(name: string): Mailer {
    const scoped = new Mailer();
    scoped.mailerName = name;
    return scoped;
  }

  /** Start a message to these recipients. */
  to(...addresses: AddressInput[]): PendingMail {
    return new PendingMail(this.mailerName).to(...addresses);
  }

  /** Start a message with these carbon-copy recipients. */
  cc(...addresses: AddressInput[]): PendingMail {
    return new PendingMail(this.mailerName).cc(...addresses);
  }

  /** Start a message with these blind-copy recipients. */
  bcc(...addresses: AddressInput[]): PendingMail {
    return new PendingMail(this.mailerName).bcc(...addresses);
  }

  /**
   * Send a mailable to the recipients its `envelope()` names.
   *
   * @returns The mailer used, the built message and the provider's reply.
   * @throws MailError when the message has no sender, no recipients or no body.
   */
  send(mailable: Mailable): Promise<SentMessage> {
    return new PendingMail(this.mailerName).send(mailable);
  }

  /** @internal Build and send (or record) one message. */
  static async dispatch(
    mailerName: string | undefined,
    recipients: Recipients,
    mailable: Mailable,
  ): Promise<SentMessage> {
    const config = (Mailer.config ??= resolveMailConfig());
    const name = mailerName ?? config.default;
    const mailerConfig = config.mailers[name];
    if (!mailerConfig) {
      throw new MailError(
        `There is no mailer named "${name}". Configured mailers: ${Object.keys(config.mailers).join(", ")}.`,
      );
    }
    const message = await buildMessage(mailable, recipients, config.from);
    if (Mailer.current) {
      Mailer.current.record(new SentMail(name, mailable, message));
      return { mailer: name, message };
    }
    const result = await Mailer.transport(name, mailerConfig).send(message);
    return { mailer: name, message, ...(result ?? {}) };
  }

  private static transport(name: string, config: MailerConfig): MailTransport {
    let transport = Mailer.transports.get(name);
    if (!transport) {
      transport = createTransport(config);
      Mailer.transports.set(name, transport);
    }
    return transport;
  }
}

function createTransport(config: MailerConfig): MailTransport {
  if ("send" in config && typeof config.send === "function") return config;
  switch ((config as { transport?: string }).transport) {
    case "smtp":
      return new SmtpTransport(config as SmtpMailerConfig);
    case "log":
      return new LogTransport();
    case "array":
      return new ArrayTransport();
    default:
      throw new MailError(
        `Unknown mail transport "${String((config as { transport?: unknown }).transport)}". Use smtp, log, array, or an object with a send() method.`,
      );
  }
}

/**
 * A message being addressed: `mailer.to(...).cc(...).send(mailable)`.
 * Each method adds recipients and returns the same object.
 */
export class PendingMail {
  private readonly recipients: Recipients = { to: [], cc: [], bcc: [] };

  constructor(private readonly mailerName?: string) {}

  /** Add recipients. */
  to(...addresses: AddressInput[]): this {
    this.recipients.to.push(...toAddresses(addresses));
    return this;
  }

  /** Add carbon-copy recipients. */
  cc(...addresses: AddressInput[]): this {
    this.recipients.cc.push(...toAddresses(addresses));
    return this;
  }

  /** Add blind-copy recipients. */
  bcc(...addresses: AddressInput[]): this {
    this.recipients.bcc.push(...toAddresses(addresses));
    return this;
  }

  /**
   * Build the mailable and send it now.
   *
   * @returns The mailer used, the built message and the provider's reply.
   * @throws MailError when the message has no sender, no recipients or no body.
   */
  send(mailable: Mailable): Promise<SentMessage> {
    return Mailer.dispatch(this.mailerName, this.recipients, mailable);
  }
}

/** @internal Turn a mailable and its recipients into a message. */
export async function buildMessage(
  mailable: Mailable,
  recipients: Recipients,
  defaultFrom?: MailAddressLike,
): Promise<MailMessage> {
  const [envelope, content, attachments] = await Promise.all([
    mailable.envelope(),
    mailable.content(),
    mailable.attachments(),
  ]);
  const label = mailable.constructor.name || "Mailable";
  const fromInput = envelope.from ?? defaultFrom;
  if (!fromInput) {
    throw new MailError(
      `${label} has no sender. Set MEGH_MAIL_FROM_ADDRESS in .env, pass from to app.useMail(), or return from in envelope().`,
    );
  }
  const message: MailMessage = {
    from: parseAddress(fromInput),
    to: [...recipients.to, ...toAddresses([envelope.to])],
    cc: [...recipients.cc, ...toAddresses([envelope.cc])],
    bcc: [...recipients.bcc, ...toAddresses([envelope.bcc])],
    replyTo: toAddresses([envelope.replyTo]),
    subject: envelope.subject ?? headline(label),
    attachments: attachments ?? [],
    headers: { ...envelope.headers },
  };
  if (content?.html !== undefined) message.html = content.html;
  if (content?.text !== undefined) message.text = content.text;

  if (!message.to.length && !message.cc.length && !message.bcc.length) {
    throw new MailError(
      `${label} has no recipients. Use mailer.to(...) or return to in envelope().`,
    );
  }
  if (message.html === undefined && message.text === undefined) {
    throw new MailError(`${label}.content() returned neither html nor text.`);
  }
  assertSingleLine(`${label} subject`, message.subject);
  for (const [key, value] of Object.entries(message.headers)) {
    assertSingleLine(`${label} header "${key}"`, `${key}${value}`);
  }
  return message;
}

/** Normalize one address; rejects line breaks, which could inject headers. */
export function parseAddress(input: MailAddressLike): MailAddress {
  const parsed: MailAddress =
    typeof input === "string" ? parseAddressString(input) : { ...input };
  parsed.address = parsed.address?.trim();
  if (!parsed.address || !parsed.address.includes("@")) {
    throw new MailError(
      `"${typeof input === "string" ? input : input.address}" is not an email address.`,
    );
  }
  assertSingleLine("An email address", parsed.address + (parsed.name ?? ""));
  if (!parsed.name) delete parsed.name;
  return parsed;
}

function parseAddressString(value: string): MailAddress {
  const match = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  if (!match) return { address: value };
  const name = match[1].replace(/^"(.*)"$/, "$1").trim();
  return name ? { name, address: match[2] } : { address: match[2] };
}

function toAddresses(inputs: Array<AddressInput | undefined>): MailAddress[] {
  return inputs
    .flatMap((i) => (i === undefined ? [] : Array.isArray(i) ? i : [i]))
    .map(parseAddress);
}

function assertSingleLine(what: string, value: string) {
  if (/[\r\n]/.test(value))
    throw new MailError(`${what} must not contain line breaks.`);
}

/** `WelcomeMail` → "Welcome Mail", `OTPCodeMail` → "OTP Code Mail". */
function headline(name: string) {
  return name
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

/** One message recorded by {@link MailFake}, with helpers for assertions. */
export class SentMail<T extends Mailable = Mailable> {
  constructor(
    /** The mailer it would have gone through. */
    readonly mailer: string,
    readonly mailable: T,
    readonly message: MailMessage,
  ) {}

  /** Whether `address` is among the `to` recipients (case-insensitive). */
  hasTo(address: MailAddressLike): boolean {
    return includes(this.message.to, address);
  }

  /** Whether `address` is among the `cc` recipients. */
  hasCc(address: MailAddressLike): boolean {
    return includes(this.message.cc, address);
  }

  /** Whether `address` is among the `bcc` recipients. */
  hasBcc(address: MailAddressLike): boolean {
    return includes(this.message.bcc, address);
  }

  /** Whether the message comes from `address`. */
  hasFrom(address: MailAddressLike): boolean {
    return includes([this.message.from], address);
  }
}

function includes(list: MailAddress[], address: MailAddressLike) {
  const wanted = parseAddress(address).address.toLowerCase();
  return list.some((a) => a.address.toLowerCase() === wanted);
}

type Filter<T extends Mailable> = (sent: SentMail<T>) => boolean;

/**
 * Returned by {@link Mailer.fake}: what would have been sent, and assertions
 * that throw a descriptive error when they fail (any test runner works).
 */
export class MailFake {
  /** Every recorded message, oldest first. */
  readonly sent: SentMail[] = [];

  /** @internal */
  record(mail: SentMail): void {
    this.sent.push(mail);
  }

  /** The recorded messages of one mailable class, optionally filtered. */
  sentOf<T extends Mailable>(
    type: Constructor<T>,
    filter?: Filter<T>,
  ): SentMail<T>[] {
    const ofType = this.sent.filter(
      (s) => s.mailable instanceof type,
    ) as SentMail<T>[];
    return filter ? ofType.filter(filter) : ofType;
  }

  /**
   * Assert that a mailable of this class was sent.
   *
   * @param filterOrTimes - A check each match must pass, or the exact number
   *   of times it must have been sent.
   */
  assertSent<T extends Mailable>(
    type: Constructor<T>,
    filterOrTimes?: Filter<T> | number,
  ): void {
    if (typeof filterOrTimes === "number") {
      const count = this.sentOf(type).length;
      if (count !== filterOrTimes) {
        throw new Error(
          `Expected ${type.name} to be sent ${filterOrTimes} time(s), but it was sent ${count} time(s).`,
        );
      }
      return;
    }
    if (!this.sentOf(type, filterOrTimes).length) {
      const why =
        filterOrTimes && this.sentOf(type).length ? " matching the check" : "";
      throw new Error(
        `Expected ${type.name} to be sent${why}, but it was not.${this.summary()}`,
      );
    }
  }

  /** Assert that no mailable of this class (matching `filter`, if given) was sent. */
  assertNotSent<T extends Mailable>(
    type: Constructor<T>,
    filter?: Filter<T>,
  ): void {
    const count = this.sentOf(type, filter).length;
    if (count)
      throw new Error(
        `Expected ${type.name} not to be sent, but it was sent ${count} time(s).`,
      );
  }

  /** Assert that nothing was sent. */
  assertNothingSent(): void {
    if (this.sent.length)
      throw new Error(`Expected no mail to be sent.${this.summary()}`);
  }

  /** Assert how many messages were sent in all. */
  assertSentCount(count: number): void {
    if (this.sent.length !== count) {
      throw new Error(
        `Expected ${count} message(s) to be sent, but ${this.sent.length} were.${this.summary()}`,
      );
    }
  }

  /** Stop faking; same as {@link Mailer.restore}. */
  restore(): void {
    Mailer.restore();
  }

  private summary() {
    if (!this.sent.length) return " Nothing was sent.";
    const counts = new Map<string, number>();
    for (const s of this.sent) {
      const n = s.mailable.constructor.name;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    return ` Sent: ${[...counts].map(([n, c]) => `${n} (${c})`).join(", ")}.`;
  }
}
