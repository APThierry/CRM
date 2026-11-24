import "server-only";
// Envio de e-mail (Fase F2): confirmação de cadastro, "esqueci minha senha" e
// aviso ao dono do sistema. Usa SMTP, que funciona com qualquer serviço
// (Brevo, Resend, Amazon SES, o e-mail do domínio...). Veja docs/MULTIEMPRESA.md.
//
// Sem SMTP_HOST no .env (no seu computador), nada sai: o e-mail aparece no
// terminal do `npm run dev`, com o link, para você testar. Em produção o link NUNCA
// vai para o terminal (quem lê os registros entraria na conta): sem SMTP, dá erro.
import nodemailer from "nodemailer";
import { emProducao } from "@/lib/ambiente";
import { nomeDoApp } from "@/lib/url";
import { emailValido, normalizarEmail, umaLinha } from "@/lib/validar";

export type Email = { para: string; assunto: string; texto: string; html?: string };

/** Últimos e-mails "enviados" sem SMTP, fora de produção (os scripts de teste leem daqui). */
export const caixaDeSaida: Email[] = [];

const global = globalThis as unknown as { transporteEmail?: nodemailer.Transporter };

function transporte() {
  if (!process.env.SMTP_HOST) return null;
  global.transporteEmail ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORTA ?? 587),
    secure: Number(process.env.SMTP_PORTA ?? 587) === 465,
    auth: process.env.SMTP_USUARIO ? { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_SENHA ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return global.transporteEmail;
}

/** Envia (ou mostra no terminal). Lança erro se o servidor de e-mail recusar. */
export async function enviarEmail(email: Email) {
  // Um destinatário só: "a@x.com, b@y.com" mandaria o link para duas pessoas.
  if (!emailValido(normalizarEmail(email.para))) throw new Error("destinatário inválido");
  const t = transporte();
  if (!t) {
    if (emProducao()) throw new Error("SMTP não configurado");
    caixaDeSaida.push(email);
    if (caixaDeSaida.length > 50) caixaDeSaida.shift();
    console.log(`\n[e-mail não enviado: falta SMTP_HOST no .env]\nPara: ${email.para}\nAssunto: ${email.assunto}\n\n${email.texto}\n`);
    return;
  }
  await t.sendMail({
    from: process.env.EMAIL_REMETENTE ?? `${nomeDoApp()} <nao-responda@localhost>`,
    to: { name: "", address: email.para },
    subject: umaLinha(email.assunto, 200),
    text: email.texto,
    html: email.html,
  });
}

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** E-mail simples com um botão. Os textos são escapados (vêm de quem se cadastrou). */
export function emailComBotao({ para, assunto, saudacao, paragrafos, botao, link, rodape }: {
  para: string;
  assunto: string;
  saudacao: string;
  paragrafos: string[];
  botao: string;
  link: string;
  rodape?: string;
}): Email {
  const app = nomeDoApp();
  const texto = [saudacao, "", ...paragrafos, "", `${botao}: ${link}`, "", rodape ?? "", `${app}`].join("\n").replace(/\n{3,}/g, "\n\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<div style="max-width:520px;margin:24px auto;background:#ffffff;border-radius:12px;padding:28px">
<div style="font-size:20px;font-weight:bold;color:#b91c1c;margin-bottom:16px">${escapar(app)}</div>
<p>${escapar(saudacao)}</p>
${paragrafos.map((p) => `<p style="line-height:1.5">${escapar(p)}</p>`).join("\n")}
<p style="margin:24px 0"><a href="${escapar(link)}" style="background:#b91c1c;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${escapar(botao)}</a></p>
<p style="font-size:12px;color:#64748b;word-break:break-all">Se o botão não funcionar, copie este endereço no navegador:<br>${escapar(link)}</p>
${rodape ? `<p style="font-size:12px;color:#64748b">${escapar(rodape)}</p>` : ""}
</div></body></html>`;
  return { para, assunto, texto, html };
}
