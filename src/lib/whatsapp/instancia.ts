import "server-only";
// Qual instância da Evolution API (qual número de WhatsApp) é de cada empresa.
// Fica em ConfiguracaoWhatsapp.instancia. Empresa antiga sem configuração
// ganha uma agora, com o nome padrão (crm-<slug>).
import { db } from "@/lib/db";
import { nomeInstancia } from "@/lib/empresas/preparar";
import { estadoConexao } from "./evolution";

export async function instanciaDaEmpresa(organizacaoId: string) {
  const config = await db.configuracaoWhatsapp.findUnique({ where: { organizacaoId }, select: { instancia: true } });
  if (config?.instancia) return config.instancia;
  const org = await db.organizacao.findUniqueOrThrow({ where: { id: organizacaoId }, select: { slug: true } });
  const instancia = nomeInstancia(org.slug);
  await db.configuracaoWhatsapp.upsert({
    where: { organizacaoId },
    create: { organizacaoId, provedor: "EVOLUTION", instancia },
    update: { instancia },
  });
  return instancia;
}

/** A empresa dona de uma instância (webhook da Evolution). Instância desconhecida = null. */
export async function empresaDaInstancia(instancia: string | undefined | null) {
  if (!instancia) return null;
  const config = await db.configuracaoWhatsapp.findFirst({ where: { instancia }, select: { organizacaoId: true } });
  return config?.organizacaoId ?? null;
}

/** Estado da conexão da empresa (atalho para as telas). */
export async function estadoDaEmpresa(organizacaoId: string) {
  return estadoConexao(await instanciaDaEmpresa(organizacaoId));
}
