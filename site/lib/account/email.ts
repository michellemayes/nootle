// The sign-in email, sent with Resend (RESEND_API_KEY, EMAIL_FROM).

const DEFAULT_FROM = "Nootle <signin@nootle.ai>";

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function magicLinkEmail(link: string) {
  const href = escapeHtml(link);
  const subject = "Sign in to Nootle";
  const text = `Sign in to Nootle

Use this link to sign in. It works for 15 minutes.

${link}

If you didn't ask to sign in, you can ignore this email.
`;
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:12px;padding:36px 32px;">
<tr><td>
<p style="margin:0 0 24px;font-size:15px;font-weight:600;letter-spacing:-0.01em;">Nootle</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.02em;">Sign in to Nootle</h1>
<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#4a4a4a;">Use this button to sign in. It works for 15 minutes.</p>
<a href="${href}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;">Sign in</a>
<p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#7a7a7a;">Or paste this link into your browser:<br><a href="${href}" style="color:#7a7a7a;word-break:break-all;">${href}</a></p>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#7a7a7a;">If you didn't ask to sign in, you can ignore this email.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject, text, html };
}

/** Emails `to` a sign-in link. Throws if Resend refuses it. */
export async function sendMagicLink(to: string, link: string): Promise<void> {
  const { subject, text, html } = magicLinkEmail(link);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? DEFAULT_FROM, to: [to], subject, text, html }),
  });
  if (!response.ok) throw new Error(`Resend answered ${response.status}`);
}
