import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
      bodySizeLimit: "17mb",
    },
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
