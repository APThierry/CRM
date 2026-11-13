// Entrega os arquivos de mídia do WhatsApp (fotos, áudios, documentos).
// GET /api/arquivos/<organizacao>/<mês>/<arquivo>
// O proxy não protege /api, então a sessão é conferida aqui: só quem está
// logado na organização dona do arquivo consegue baixá-lo.
import { extname } from "node:path";
import { lerArquivo } from "@/lib/arquivos";
import { lerSessao } from "@/lib/sessao";

const TIPOS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".webm": "audio/webm",
  ".mp4": "video/mp4",
  ".3gp": "video/3gpp",
  ".pdf": "application/pdf",
};

export async function GET(request: Request, ctx: RouteContext<"/api/arquivos/[...caminho]">) {
  const sessao = await lerSessao();
  if (!sessao) return new Response("Faça login.", { status: 401 });

  const { caminho } = await ctx.params;
  const relativo = caminho.map(decodeURIComponent).join("/");
  const conteudo = await lerArquivo(sessao.usuario.organizacao.id, relativo);
  if (!conteudo) return new Response("Arquivo não encontrado.", { status: 404 });

  const tipo = TIPOS[extname(relativo).toLowerCase()];
  const nome = new URL(request.url).searchParams.get("nome");
  return new Response(new Uint8Array(conteudo), {
    headers: {
      // Tipos desconhecidos são sempre baixados, nunca abertos no navegador.
      "Content-Type": tipo ?? "application/octet-stream",
      "Content-Disposition": `${tipo ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(nome ?? relativo.split("/").pop()!)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
