import { Resend } from "resend";

const FROM = "Velora Vista Visuals <info@veloravistavisuals.com>";
const INTERNAL_EMAIL = "info@veloravistavisuals.com";

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export async function sendTransactionalEmail({ to, subject, heading, details, actionUrl, actionLabel = "Open Team Centre" }: { to: string; subject: string; heading: string; details: Array<[string, unknown]>; actionUrl?: string; actionLabel?: string }) {
  if (!process.env.RESEND_API_KEY) {
    console.error("[transactional-email] RESEND_API_KEY is missing", { subject, to });
    return false;
  }
  const rows = details.map(([label, value]) => `<tr><td style="padding:8px 14px 8px 0;color:#777;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 0"><b>${escapeHtml(value)}</b></td></tr>`).join("");
  const action = actionUrl ? `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:24px;background:#dfff00;color:#111;padding:14px 20px;text-decoration:none;font-weight:bold">${escapeHtml(actionLabel)} ↗</a>` : "";
  try {
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: FROM,
      to,
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:38px;color:#111"><small style="letter-spacing:.14em">VELORA VISTA VISUALS</small><h1 style="font-size:34px;margin:18px 0">${escapeHtml(heading)}</h1><table style="border-collapse:collapse;width:100%;border-top:1px solid #ddd;border-bottom:1px solid #ddd">${rows}</table>${action}</div>`,
    });
    if (result.error) {
      console.error("[transactional-email] Resend rejected email", { subject, to, error: result.error });
      return false;
    }
    return true;
  } catch (error) {
    console.error("[transactional-email] Send failed", { subject, to, error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

export async function sendInternalCustomerUpdate(input: Omit<Parameters<typeof sendTransactionalEmail>[0], "to">) {
  return sendTransactionalEmail({ ...input, to: INTERNAL_EMAIL });
}
