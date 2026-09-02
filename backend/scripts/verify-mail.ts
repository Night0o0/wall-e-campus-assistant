import { getMailProvider } from "../src/services/mail/mail.provider.js";

const main = async () => {
  const provider = getMailProvider();

  if (provider.name !== "smtp" || !provider.verify) {
    console.error("Mail preflight requires MAIL_PROVIDER=smtp.");
    process.exitCode = 1;
    return;
  }

  try {
    await provider.verify();
    console.log("SMTP connection, TLS negotiation, and authentication passed.");
  } catch (error) {
    console.error(
      "SMTP preflight failed.",
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  }
};

void main();
