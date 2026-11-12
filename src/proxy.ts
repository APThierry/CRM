// Proxy (antigo "middleware"): roda antes de cada página.
// Faz só a checagem RÁPIDA: sem o cookie de sessão, manda para /login.
// A checagem completa (sessão válida no banco) acontece no servidor, em
// src/lib/auth.ts, em toda página e Server Action.
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_SESSAO = "crm_sessao"; // mesmo nome de src/lib/sessao.ts
const PUBLICAS = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const publica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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
