import { MailMessage } from "./mail.provider.js";

/**
 * The words in the two emails this system sends.
 *
 * Kept away from the service for the same reason notification.content.ts is:
 * the logic that decides *whether* to send has nothing to do with the wording,
 * and mixing them makes both harder to read and the copy harder to change.
 *
 * Two rules hold for both messages.
 *
 * The code appears in the body and never in a link. A one-time code that is
 * also a clickable URL is a code that gets logged by every mail scanner,
 * proxy and preview fetcher between here and the reader — several of which
 * will helpfully "visit" it. Making the reader type six digits is the whole
 * defence, and it costs them four seconds.
 *
 * Neither message states who the account belongs to, what university it is at,
 * or whether it exists. These land in an inbox that may not be the account
 * holder's — a mistyped address at signup, a recycled corporate mailbox — and a
 * message that confirms "yes, there is an account here" to a stranger is a
 * disclosure the reader never agreed to.
 */

const plural = (minutes: number) => (minutes === 1 ? "minute" : "minutes");

/** Sent to prove an address at registration. No account exists yet. */
export const verificationEmail = (
  code: string,
  ttlMinutes: number
): Omit<MailMessage, "to"> => ({
  subject: `${code} is your Wall-E verification code`,

  text: [
    "Your Wall-E verification code is:",
    "",
    `    ${code}`,
    "",
    `It expires in ${ttlMinutes} ${plural(ttlMinutes)} and can be used once.`,
    "",
    "Enter it on the registration screen to confirm this address.",
    "",
    "If you did not start a registration, no account has been created and you",
    "can ignore this message. Nobody can complete a signup without this code.",
  ].join("\n"),

  html: [
    "<p>Your Wall-E verification code is:</p>",
    `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${code}</p>`,
    `<p>It expires in ${ttlMinutes} ${plural(ttlMinutes)} and can be used once.</p>`,
    "<p>Enter it on the registration screen to confirm this address.</p>",
    "<hr>",
    "<p style=\"color:#64748b;font-size:13px\">If you did not start a registration, no account has been created and you can ignore this message. Nobody can complete a signup without this code.</p>",
  ].join("\n"),
});

/**
 * Sent when somebody starts a registration with an address that already has an
 * account.
 *
 * The alternative — answering the request with "that email is taken" — turns
 * the registration endpoint into an oracle for which addresses hold accounts at
 * this university. Answering identically and mailing the address instead tells
 * exactly one person, the one entitled to know: whoever actually reads that
 * inbox.
 */
export const accountExistsEmail = (): Omit<MailMessage, "to"> => ({
  subject: "About your Wall-E account",

  text: [
    "Somebody just started creating a Wall-E account with this email address.",
    "",
    "An account already exists here, so nothing was created and no code was",
    "issued. If it was you, sign in instead — or use \"Forgot password\" if you",
    "cannot remember your password.",
    "",
    "If it was not you, no action is needed. Nobody has gained access to your",
    "account, and this message is the only thing that happened.",
  ].join("\n"),

  html: [
    "<p>Somebody just started creating a Wall-E account with this email address.</p>",
    "<p>An account already exists here, so nothing was created and no code was issued. If it was you, sign in instead — or use &ldquo;Forgot password&rdquo; if you cannot remember your password.</p>",
    "<hr>",
    "<p style=\"color:#64748b;font-size:13px\">If it was not you, no action is needed. Nobody has gained access to your account, and this message is the only thing that happened.</p>",
  ].join("\n"),
});

/**
 * Sent when a member of staff asks to reset their own password.
 *
 * Self-service reset is a student flow by decision, not by omission: a staff
 * account can publish material to a whole cohort and approve registrations, so
 * recovering one is a human decision made by the university's administrator.
 * Saying so in a mail keeps the endpoint's answer identical for every address
 * while still telling the person what to actually do.
 */
export const staffResetUnavailableEmail = (): Omit<MailMessage, "to"> => ({
  subject: "Resetting your Wall-E staff password",

  text: [
    "A password reset was requested for this Wall-E staff account.",
    "",
    "Staff passwords are not reset by email. Contact your university's Wall-E",
    "administrator, who can set a new password for you directly.",
    "",
    "If you did not ask for this, nothing has changed and your current password",
    "still works.",
  ].join("\n"),

  html: [
    "<p>A password reset was requested for this Wall-E staff account.</p>",
    "<p>Staff passwords are not reset by email. Contact your university&rsquo;s Wall-E administrator, who can set a new password for you directly.</p>",
    "<hr>",
    "<p style=\"color:#64748b;font-size:13px\">If you did not ask for this, nothing has changed and your current password still works.</p>",
  ].join("\n"),
});

/**
 * Sent to recover a password. Only ever sent to an address that has an active
 * student account — the endpoint answers identically either way, but it does
 * not mail strangers to tell them they are strangers.
 */
export const passwordResetEmail = (
  code: string,
  ttlMinutes: number
): Omit<MailMessage, "to"> => ({
  subject: `${code} is your Wall-E password reset code`,

  text: [
    "Your Wall-E password reset code is:",
    "",
    `    ${code}`,
    "",
    `It expires in ${ttlMinutes} ${plural(ttlMinutes)} and can be used once.`,
    "",
    "Enter it in the app to choose a new password.",
    "",
    "If you did not ask to reset a password, you can ignore this message —",
    "nothing has changed, and your current password still works.",
  ].join("\n"),

  html: [
    "<p>Your Wall-E password reset code is:</p>",
    `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${code}</p>`,
    `<p>It expires in ${ttlMinutes} ${plural(ttlMinutes)} and can be used once.</p>`,
    "<p>Enter it in the app to choose a new password.</p>",
    "<hr>",
    "<p style=\"color:#64748b;font-size:13px\">If you did not ask to reset a password, you can ignore this message — nothing has changed, and your current password still works.</p>",
  ].join("\n"),
});
