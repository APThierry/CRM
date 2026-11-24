import type { NextConfig } from "next";

// Cabeçalhos de segurança de todas as respostas.
const CABECALHOS = [
  // O navegador não "adivinha" o tipo de um arquivo.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Ninguém põe o CRM dentro de outro site para enganar cliques.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'" },
  // Para outros sites vai só o domínio, nunca o caminho da página.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];
// Páginas cujo endereço leva um código secreto: não mandam referência nenhuma.
const SEM_REFERENCIA = [{ key: "Referrer-Policy", value: "no-referrer" }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers: async () => [
    { source: "/:caminho*", headers: CABECALHOS },
    ...["/confirmar", "/convite", "/senha/:resto*", "/api/agenda/:arquivo*"].map((source) => ({ source, headers: SEM_REFERENCIA })),
  ],
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Sem o cache em disco do Turbopack no `next dev`: com ele, depois de um
    // tempo a página aberta ficava recarregando sem parar (o servidor mandava
    // "restart" a cada conexão). Só afeta o desenvolvimento, não o build.
    turbopackFileSystemCacheForDev: false,
    serverActions: {
      // Fotos, vídeos e documentos enviados pela Central de atendimento
      // (o WhatsApp aceita até 16 MB; a folga é para o resto do formulário).
      // Vale para TODAS as actions: o Next não tem limite por página. Quem corta os
      // envios grandes nas outras telas é o src/proxy.ts e, antes dele, o Caddy.
      bodySizeLimit: "17mb",
    },
    // O proxy (src/proxy.ts) guarda uma cópia do envio: com o padrão (10 MB), um anexo
    // maior que isso chegaria cortado.
    proxyClientMaxBodySize: "17mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
