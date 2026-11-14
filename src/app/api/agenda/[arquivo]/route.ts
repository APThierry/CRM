// Agenda do usuário em formato .ics, para assinar no Google Agenda.
// GET /api/agenda/<código>.ics
// Sem login: quem protege é o código secreto do link (src/lib/agenda.ts).
// O proxy não roda em /api, então esta rota é pública por natureza.
import { connection } from "next/server";
import { eventosDoUsuario, montarIcs, usuarioDaAgenda } from "@/lib/agenda";

export async function GET(request: Request, ctx: RouteContext<"/api/agenda/[arquivo]">) {
  await connection();
  const { arquivo } = await ctx.params;
  const usuario = await usuarioDaAgenda(arquivo.replace(/\.ics$/i, ""));
  // Mesmo erro para código errado e código antigo: não revela se o link já existiu.
  if (!usuario) return new Response("Link de agenda inválido ou desativado.", { status: 404 });

  const base = new URL(request.url).origin;
  const eventos = await eventosDoUsuario(usuario, base);
  return new Response(montarIcs(`${usuario.organizacao.nome} · ${usuario.nome}`, eventos), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="agenda.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
