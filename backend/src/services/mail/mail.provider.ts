import nodemailer, { Transporter } from "nodemailer";
import { env } from "../../config/env.js";

/**
 * The seam between "a code has been issued" and "an inbox receives it".
 *
 * Modelled on push.provider.ts, and for the same reason: nothing above this
 * file should know what a mail vendor is, and the flow has to be exercisable
 * without an account at one. The logging provider is what the test suite and a
 * developer's machine run on.
 *
 * Where it differs from push, and the difference matters: push is a delivery
 * channel for a Notification row that is itself the record, so a push provider
 * that only logs still leaves a working product. Email is not a channel here,
 * it is the mechanism — a student who never receives the code cannot register
 * and cannot recover a password. So the logging provider is refused in
 * production at boot; see config/env.ts.
 */

export interface MailMessage {
  /** A single recipient. Nothing in this system mails more than one at a time. */
  to: string;
  subject: string;
  /** Always present. HTML is an enhancement, never the only form. */
  text: string;
  html?: string;
}

export interface MailResult {
  delivered: boolean;
  detail?: string;
}

export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<MailResult>;
  verify?(): Promise<void>;
}

/**
 * Prints the message and reports success.
 *
 * It prints the body, one-time code included, which is exactly what makes it
 * useful in development and exactly why production refuses to start on it.
 */
export class LoggingMailProvider implements MailProvider {
  readonly name = "log";

  async send(message: MailMessage): Promise<MailResult> {
    console.log(
      `[mail] → ${message.to}: ${message.subject}\n${message.text}\n`
    );

    return { delivered: true, detail: "logged" };
  }
}

/**
 * Real delivery over SMTP.
 *
 * The transport is built once and reused: nodemailer pools connections, and
 * rebuilding it per message would open a TCP and TLS handshake for every code.
 * Auth is omitted entirely when no user is configured, because some relays
 * authenticate by IP and passing empty credentials makes them refuse.
 */
export class SmtpMailProvider implements MailProvider {
  readonly name = "smtp";

  private transporter: Transporter | null = null;

  private transport(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        pool: true,
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        requireTLS: env.SMTP_REQUIRE_TLS,
        auth: env.SMTP_USER
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
      });
    }

    return this.transporter;
  }

  async send(message: MailMessage): Promise<MailResult> {
    /**
     * Throwing rather than returning `delivered: false` is deliberate, and the
     * caller depends on it: a send that fails must not leave a challenge row
     * looking issued, or the student is told to check an inbox nothing was sent
     * to and is then throttled from trying again.
     */
    const info = await this.transport().sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    return { delivered: true, detail: info.messageId };
  }

  async verify(): Promise<void> {
    await this.transport().verify();
  }
}

let provider: MailProvider | null = null;

export const getMailProvider = (): MailProvider => {
  if (!provider) {
    provider =
      env.MAIL_PROVIDER === "smtp"
        ? new SmtpMailProvider()
        : new LoggingMailProvider();
  }

  return provider;
};

/** Test seam. Pass null to fall back to the configured provider. */
export const setMailProvider = (next: MailProvider | null) => {
  provider = next;
};
