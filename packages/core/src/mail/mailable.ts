import type { MailAttachment, MailContent, MailEnvelope } from "./types";

type MaybePromise<T> = T | Promise<T>;

/**
 * One kind of email, as a class: its subject, body and attachments. Create
 * it with the data it needs and hand it to the {@link Mailer}.
 *
 * Each method may be `async`, to load data or render a template.
 *
 * @example
 * export class WelcomeMail extends Mailable {
 *   constructor(private readonly user: User) {
 *     super();
 *   }
 *
 *   envelope() {
 *     return { subject: `Welcome, ${this.user.name}` };
 *   }
 *
 *   content() {
 *     return { html: `<p>Hi ${this.user.name}!</p>`, text: `Hi ${this.user.name}!` };
 *   }
 * }
 *
 * await mailer.to(user.email).send(new WelcomeMail(user));
 */
export abstract class Mailable {
  /** Subject, sender and extra recipients. All optional. */
  envelope(): MaybePromise<MailEnvelope> {
    return {};
  }

  /** The body: `html`, `text` or both. */
  abstract content(): MaybePromise<MailContent>;

  /** Files to attach. None by default. */
  attachments(): MaybePromise<MailAttachment[]> {
    return [];
  }
}
