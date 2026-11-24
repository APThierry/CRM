// Proxy (antigo "middleware"): roda antes de cada página.
// Faz só a checagem RÁPIDA: sem o cookie de sessão, manda para /login.
// A checagem completa (sessão válida no banco) acontece no servidor, em
// src/lib/auth.ts, em toda página e Server Action.
//
// Também recusa envios grandes demais antes de o CRM processar: o limite das Server
// Actions (next.config.ts) é um só para o site todo, e precisa aceitar 16 MB por causa
// dos anexos da Central. É uma proteção a mais: o limite de verdade é o do Caddy, que
// corta antes de chegar aqui (docs/DEPLOY-VPS.md).
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_SESSAO = "crm_sessao"; // mesmo nome de src/lib/sessao.ts
// Telas sem login: entrar, criar conta, confirmar e-mail, nova senha e termos (Fase F2).
const PUBLICAS = ["/login", "/cadastro", "/confirmar", "/convite", "/senha", "/termos", "/privacidade"];

const MB = 1024 * 1024;
/** Maior envio aceito em cada parte do site. */
const limiteDoEnvio = (pathname: string, publica: boolean) => {
  if (publica) return 64 * 1024; // formulários sem login: só texto curto
  if (pathname === "/atendimento") return 17 * MB; // anexos do WhatsApp (até 16 MB)
  return MB;
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (request.method !== "GET" && request.method !== "HEAD") {
    const tamanho = request.headers.get("content-length");
    // Sem tamanho declarado não dá para conferir (os navegadores sempre mandam). A exceção é
    // o próprio Next, que encaminha para a página certa a action chamada de outra tela: esse
    // pedido interno vem sem tamanho (já passou por aqui antes). Quem inventar o cabeçalho
    // só volta ao limite geral de 17 MB; na VPS o Caddy o remove.
    if (tamanho === null && request.headers.has("transfer-encoding") && !request.headers.has("x-action-forwarded")) {
      return new NextResponse("Informe o tamanho do envio.", { status: 411 });
    }
    if (Number(tamanho ?? 0) > limiteDoEnvio(pathname, publica)) return new NextResponse("Envio grande demais.", { status: 413 });
  }
  if (!publica && !request.cookies.has(COOKIE_SESSAO)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Não roda para a API (o webhook do WhatsApp tem a própria proteção),
  // nem para os caminhos internos do Next (_next/*, __nextjs_*), nem para
  // arquivos estáticos. Atenção: barrar "_next/webpack-hmr" faz a página de
  // login recarregar sem parar em modo desenvolvimento.
  matcher: ["/((?!api|_next|__nextjs|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};
