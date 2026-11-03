import "server-only";

/**
 * 邮件发送（Resend）：需要环境变量 RESEND_API_KEY 与 MAIL_FROM（如 "SOLYN FA MASTER <noreply@solynadvisory.com>"，
 * 发信域名需在 Resend 中验证）。未配置时不发送，调用方据此给出“请手动复制链接”等提示。
 */
export const mailEnabled = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;

export async function sendMail(to: string | string[], subject: string, html: string): Promise<{ sent: boolean; error?: string }> {
  if (!mailEnabled()) return { sent: false, error: "未配置邮件服务（RESEND_API_KEY / MAIL_FROM）" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: Array.isArray(to) ? to : [to], subject, html }),
    });
    if (!r.ok) return { sent: false, error: `Resend ${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** 品牌邮件模板：深色页眉 + 正文段落 + 可选按钮 */
export function mailHtml(title: string, paragraphs: string[], button?: { label: string; url: string }, foot?: string) {
  return `<!doctype html><html><body style="margin:0;background:#F3F4F2;font-family:-apple-system,'PingFang SC','Hiragino Sans','Noto Sans SC',sans-serif;color:#1B2A24">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:6px;overflow:hidden">
<tr><td style="background:#16362A;padding:20px 28px;color:#D7E0DA;font-size:12px;letter-spacing:2px">SOLYN FA MASTER</td></tr>
<tr><td style="padding:28px">
<div style="font-size:18px;font-weight:600;color:#16362A;margin-bottom:16px">${esc(title)}</div>
${paragraphs.map((p) => `<p style="font-size:14px;line-height:1.7;margin:0 0 12px">${esc(p)}</p>`).join("")}
${button ? `<p style="margin:22px 0"><a href="${esc(button.url)}" style="background:#275642;color:#FFFFFF;text-decoration:none;padding:11px 22px;border-radius:4px;font-size:14px;display:inline-block">${esc(button.label)}</a></p><p style="font-size:12px;color:#5B6B63;word-break:break-all">${esc(button.url)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #E3E8E4;font-size:11px;color:#7C9A8B">${esc(foot ?? "本邮件由系统自动发送，请勿直接回复。SOLYN ADVISORY · 商业机密")}</td></tr>
</table></td></tr></table></body></html>`;
}
