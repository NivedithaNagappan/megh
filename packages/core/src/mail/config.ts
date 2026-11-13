import type { JobsOptions, QueueOptions } from "bullmq";
import { Environment } from "../config/environment-variables";
import type { QueueDriver } from "../queue/memory-driver";
import { MailError } from "./errors";
import type { MailAddressLike, MailTransport } from "./types";

/** SMTP through Nodemailer (`npm install nodemailer`). */
export interface SmtpMailerConfig {
  transport: "smtp";
  host?: string;
  /** Defaults to 465 with `ssl`, else 587. */
  port?: number;
  /**
   * `ssl`: TLS from the start (port 465). `tls`: STARTTLS, required.
   * `none`: plain, upgraded with STARTTLS when the server offers it.
   * Left out, `ssl` on port 465 and `none` otherwise.
   */
  encryption?: "ssl" | "tls" | "none";
  username?: string;
  password?: string;
  /** Extra Nodemailer transport options, applied last (pool, timeouts, dkim, ...). */
  options?: Record<string, unknown>;
}

/** Writes messages to the Megh logger instead of sending them. */
export interface LogMailerConfig {
  transport: "log";
}

/** Keeps messages in memory, for tests. */
export interface ArrayMailerConfig {
  transport: "array";
}

/** A mailer's settings, or a transport of your own. */
export type MailerConfig =
  SmtpMailerConfig | LogMailerConfig | ArrayMailerConfig | MailTransport;

/** Options for `app.useMail()`. Anything left out comes from `MEGH_MAIL_*` in `.env`. */
export interface MailConfig {
  /** The mailer `send()` uses unless one is named with `mailer(name)`. */
  default?: string;
  /** The address messages come from unless `envelope()` says otherwise. */
  from?: MailAddressLike;
  /** Named mailers. `smtp`, `log` and `array` are always there; these add to or replace them. */
  mailers?: Record<string, MailerConfig>;
  /**
   * Turn on `queue()` and `later()`: `true` for the defaults, or options.
   * The queue's worker starts when this is set, unless `worker: false`.
   */
  queue?: boolean | MailQueueConfig;
}

/** Where queued mail goes, and how it is retried. */
export interface MailQueueConfig {
  /** Queue name, as it appears in Redis. Defaults to `mail`. */
  name?: string;
  /** BullMQ queue options, including the Redis `connection`. */
  adapter?: QueueOptions;
  /**
   * Backend. Defaults to `setQueueDriver()`, then `MEGH_QUEUE_DRIVER`, then
   * `bullmq`. Use `memory` or `sync` in tests.
   */
  driver?: QueueDriver;
  /**
   * Options for the worker that sends queued mail, or `false` in a process
   * that only queues mail while another process sends it.
   */
  worker?: false | { concurrency?: number };
  /**
   * Options for each job. Defaults to 3 attempts with exponential backoff
   * from 10 seconds, and removing jobs once sent.
   */
  jobOptions?: JobsOptions;
}

/** A {@link MailConfig} with every gap filled from the environment. */
export interface ResolvedMailConfig {
  default: string;
  from?: MailAddressLike;
  mailers: Record<string, MailerConfig>;
  /** Set when queueing is on. */
  queue?: MailQueueConfig;
}

const ENCRYPTIONS = ["ssl", "tls", "none"] as const;

/** `MailConfig` from the `MEGH_MAIL_*` variables in `.env` and the process environment. */
export function mailConfigFromEnv(
  get: (key: string) => string | undefined = defaultEnvReader(),
): MailConfig {
  const value = (key: string) => {
    const v = get(key);
    return v === undefined || v === "" ? undefined : String(v);
  };
  const encryption = value("MEGH_MAIL_ENCRYPTION")?.toLowerCase();
  if (encryption && !(ENCRYPTIONS as readonly string[]).includes(encryption)) {
    throw new MailError(
      `MEGH_MAIL_ENCRYPTION must be one of ${ENCRYPTIONS.join(", ")}, not "${encryption}".`,
    );
  }
  const port = value("MEGH_MAIL_PORT");
  if (port !== undefined && !/^\d+$/.test(port)) {
    throw new MailError(`MEGH_MAIL_PORT must be a number, not "${port}".`);
  }
  const fromAddress = value("MEGH_MAIL_FROM_ADDRESS");
  const fromName = value("MEGH_MAIL_FROM_NAME");
  return {
    default: value("MEGH_MAIL_MAILER"),
    from: fromAddress
      ? { address: fromAddress, ...(fromName ? { name: fromName } : {}) }
      : undefined,
    mailers: {
      smtp: {
        transport: "smtp",
        host: value("MEGH_MAIL_HOST"),
        port: port === undefined ? undefined : Number(port),
        encryption: encryption as SmtpMailerConfig["encryption"],
        username: value("MEGH_MAIL_USERNAME"),
        password: value("MEGH_MAIL_PASSWORD"),
      },
    },
  };
}

function defaultEnvReader() {
  const env = new Environment();
  return (key: string) => env.get<string | undefined>(key);
}

/**
 * Merge `useMail()` options over the environment, and choose the default
 * mailer: `MEGH_MAIL_MAILER`, else `smtp` when `MEGH_MAIL_HOST` is set, else
 * `log` in development and `array` in tests.
 *
 * @throws MailError in production when no mailer is set, or when the default
 *   mailer is not configured.
 */
export function resolveMailConfig(
  options: MailConfig = {},
  env: MailConfig = mailConfigFromEnv(),
): ResolvedMailConfig {
  const mailers: Record<string, MailerConfig> = {
    smtp: { transport: "smtp" },
    log: { transport: "log" },
    array: { transport: "array" },
    ...env.mailers,
    ...options.mailers,
  };
  const smtp = mailers.smtp as SmtpMailerConfig;
  const name = options.default ?? env.default ?? implicitDefault(smtp);
  if (!mailers[name]) {
    throw new MailError(
      `The default mailer "${name}" is not configured. Configured mailers: ${Object.keys(mailers).join(", ")}.`,
    );
  }
  const queue = options.queue === true ? {} : options.queue || undefined;
  return {
    default: name,
    from: options.from ?? env.from,
    mailers,
    ...(queue ? { queue } : {}),
  };
}

function implicitDefault(smtp: SmtpMailerConfig | undefined): string {
  if (smtp?.transport === "smtp" && smtp.host) return "smtp";
  if (process.env.NODE_ENV === "development") return "log";
  if (process.env.NODE_ENV === "test") return "array";
  throw new MailError(
    "No mailer is set. Set MEGH_MAIL_MAILER (smtp, log or array) or MEGH_MAIL_HOST in .env, " +
      "or pass { default } to app.useMail().",
  );
}
