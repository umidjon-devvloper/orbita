import nodemailer, { type Transporter } from "nodemailer";

export interface Mail {
  readonly to: string;
  readonly subject: string;
  /** Plain-text body — HTML is deliberately omitted for the MVP. */
  readonly text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * In-memory mailer for tests and local development without SMTP. Keeps the
 * last 100 messages, newest first; callers inspect `outbox[0]` to find the
 * reset link they just triggered.
 */
export interface ConsoleMailer extends Mailer {
  readonly outbox: readonly Mail[];
  clear(): void;
  byRecipient(email: string): Mail | undefined;
}

export function createConsoleMailer(): ConsoleMailer {
  const outbox: Mail[] = [];
  return {
    get outbox() {
      return outbox;
    },
    async send(mail) {
      outbox.unshift(mail);
      if (outbox.length > 100) outbox.length = 100;
      await Promise.resolve();
    },
    clear() {
      outbox.length = 0;
    },
    byRecipient(email) {
      return outbox.find((m) => m.to.toLowerCase() === email.toLowerCase());
    },
  };
}

export interface SmtpOptions {
  readonly host: string;
  readonly port: number;
  readonly from: string;
}

/**
 * Thin wrapper around nodemailer configured for Mailpit in development
 * (no auth, plaintext). TLS/auth belongs in production configuration;
 * add it here when the real SMTP server is chosen.
 */
export function createSmtpMailer(opts: SmtpOptions): Mailer {
  const transporter: Transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port,
    secure: false,
    ignoreTLS: true,
  });
  return {
    async send(mail) {
      await transporter.sendMail({
        from: opts.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      });
    },
  };
}
