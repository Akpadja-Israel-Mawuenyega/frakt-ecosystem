import nodemailer from "nodemailer";

/**
 * ───────────────────────────── MAIL HELPER ─────────────────────────────
 *
 * Sends transactional email (password resets, etc.) via SMTP — configured
 * for Mailtrap by default.
 *
 * If the SMTP host/user/pass aren't configured, the message is logged to
 * the console instead of sent — keeps password-reset working in local/dev
 * environments without requiring real mail credentials.
 *
 * @param {object} params
 * @param {string} params.to - Recipient email address.
 * @param {string} params.subject - Email subject line.
 * @param {string} params.text - Plain-text body.
 * @param {string} [params.html] - Optional HTML body.
 */
export async function sendMail({ to, subject, text, html }) {
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    MAIL_ENCRYPTION,
    MAIL_FROM,
    MAIL_FROM_NAME,
  } = process.env;

  const host = SMTP_HOST;

  if (!host || !SMTP_USER || !SMTP_PASS) {
    console.log(
      `[mail] SMTP not configured — logging email instead of sending.\nTo: ${to}\nSubject: ${subject}\n\n${text}`
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(SMTP_PORT) || 587,
    secure: MAIL_ENCRYPTION === "ssl" || Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: MAIL_FROM_NAME ? `"${MAIL_FROM_NAME}" <${MAIL_FROM}>` : MAIL_FROM || SMTP_USER,
    to,
    subject,
    text,
    html,
  });
}
