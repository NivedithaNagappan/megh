import type { JobsOptions } from "bullmq";
import { MeghQueue, type Job } from "../queue/queue";
import type { MailQueueConfig } from "./config";
import type { MailMessage, MailTransportResult } from "./types";

/** What a queued-mail job carries: the mailer to use and the built message. */
export interface QueuedMailPayload {
  mailer: string;
  message: MailMessage;
}

/** Three attempts, 10s then 20s apart; sent jobs are removed (they hold addresses). */
export const DEFAULT_MAIL_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: true,
};

type Deliver = (
  mailer: string,
  message: MailMessage,
) => Promise<MailTransportResult | void>;

/**
 * The queue behind `mailer.queue()` and `mailer.later()`. Each job holds a
 * built message, so the worker only delivers it; the mailable class is not
 * needed there.
 */
export class MailQueue extends MeghQueue<QueuedMailPayload> {
  private readonly jobOptions: JobsOptions;

  constructor(
    config: MailQueueConfig,
    private readonly deliver: Deliver,
  ) {
    super(
      config.name ?? "mail",
      config.adapter,
      config.worker || undefined,
      config.driver,
    );
    this.jobOptions = { ...DEFAULT_MAIL_JOB_OPTIONS, ...config.jobOptions };
    if (config.worker !== false) this.startWorker();
  }

  /** Queue a message, to be sent after `delay` milliseconds. */
  enqueue(payload: QueuedMailPayload, delay: number): Promise<Job> {
    return this.add(
      "send",
      { mailer: payload.mailer, message: toJobMessage(payload.message) },
      delay > 0 ? { ...this.jobOptions, delay } : this.jobOptions,
    );
  }

  async handler(job: Job<QueuedMailPayload>) {
    const result = await this.deliver(
      job.data.mailer,
      fromJobMessage(job.data.message),
    );
    return { messageId: result?.messageId };
  }
}

/** JSON-safe copy of a message: Buffer attachments become base64 text. */
export function toJobMessage(message: MailMessage): MailMessage {
  return {
    ...message,
    attachments: message.attachments.map((a) =>
      Buffer.isBuffer(a.content)
        ? { ...a, content: a.content.toString("base64"), encoding: "base64" }
        : a,
    ),
  };
}

/** Undo {@link toJobMessage}: base64 attachments become Buffers again. */
export function fromJobMessage(message: MailMessage): MailMessage {
  return {
    ...message,
    attachments: message.attachments.map((a) => {
      if (a.encoding !== "base64" || typeof a.content !== "string") return a;
      const { encoding: _encoding, ...rest } = a;
      return { ...rest, content: Buffer.from(a.content, "base64") };
    }),
  };
}
