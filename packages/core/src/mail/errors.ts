/** Mail is misconfigured, or a message cannot be built. */
export class MailError extends Error {
  constructor(message: string) {
    super(`[Megh Mail] ${message}`);
    this.name = "MailError";
  }
}
