import "server-only";
// Campanhas liberadas? (Fase F2) Empresas que se cadastram sozinhas montam e
// revisam campanhas, mas só disparam depois que o dono do sistema aprova
// (Organizacao.campanhasLiberadas). É a parte que mais pode virar spam e fazer
// o WhatsApp bloquear números.
import { db } from "@/lib/db";

export const AVISO_CAMPANHAS_BLOQUEADAS =
  "As campanhas desta conta ainda não foram liberadas. Você pode montar e revisar, mas o envio só começa depois que o suporte aprovar a conta.";

export async function campanhasLiberadas(organizacaoId: string) {
  const org = await db.organizacao.findUnique({ where: { id: organizacaoId }, select: { campanhasLiberadas: true } });
  return Boolean(org?.campanhasLiberadas);
}
