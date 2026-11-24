"use server";
// Cadastro público de uma empresa nova (Fase F2).
// Proteções contra cadastro falso: campo escondido (robôs preenchem), tempo
// mínimo para preencher, limite por IP e e-mail confirmado antes de entrar.
// Campanhas só depois que o dono do sistema aprova (Organizacao.campanhasLiberadas).
import { cadastroAberto, diasDeTeste, RAMOS, TERMOS_VERSAO } from "@/lib/cadastro";
import { avisarDonoDoCadastro, enviarConfirmacao } from "@/lib/conta";
import { criarEmpresa, ErroCadastro } from "@/lib/empresas/criar";
import { dentroDoLimite, ipDaRequisicao } from "@/lib/limite";

export type Valores = { empresa?: string; ramo?: string; nome?: string; email?: string; telefone?: string };
export type EstadoCadastro = { erro?: string; valores?: Valores; enviadoPara?: string } | null;

const campo = (f: FormData, nome: string, max = 120) => String(f.get(nome) ?? "").trim().slice(0, max);
const TEMPO_MINIMO_MS = 3_000;

export async function criarConta(_estado: EstadoCadastro, formData: FormData): Promise<EstadoCadastro> {
  const valores: Valores = {
    empresa: campo(formData, "empresa"),
    ramo: campo(formData, "ramo"),
    nome: campo(formData, "nome"),
    email: campo(formData, "email").toLowerCase(),
    telefone: campo(formData, "telefone", 30),
  };
  if (!cadastroAberto()) return { erro: "O cadastro de novas empresas está fechado no momento.", valores };

  // Robô: preencheu o campo escondido. Fingimos que deu certo e não criamos nada.
  if (campo(formData, "site")) return { enviadoPara: valores.email };
  const inicio = Number(formData.get("inicio"));
  if (!inicio || Date.now() - inicio < TEMPO_MINIMO_MS) return { erro: "Confira os dados e clique em Criar conta de novo.", valores };

  if (!valores.empresa || !valores.nome || !valores.email) return { erro: "Preencha o nome da empresa, o seu nome e o e-mail.", valores };
  if (!(RAMOS as readonly string[]).includes(valores.ramo ?? "")) return { erro: "Escolha o ramo da empresa.", valores };
  const senha = String(formData.get("senha") ?? "");
  if (senha !== String(formData.get("confirmacao") ?? "")) return { erro: "As senhas não conferem.", valores };
  if (formData.get("termos") !== "sim") return { erro: "Para criar a conta, aceite os termos de uso e a política de privacidade.", valores };

  const ip = await ipDaRequisicao();
  if (!dentroDoLimite(`cadastro:${ip}`, 3, 3600_000)) return { erro: "Muitos cadastros deste endereço. Tente de novo daqui a uma hora.", valores };

  try {
    const { org, admin } = await criarEmpresa({
      nome: valores.empresa,
      ramo: valores.ramo,
      telefone: valores.telefone || null,
      admin: { nome: valores.nome, email: valores.email, senha },
      diasTeste: diasDeTeste(),
      cadastroPublico: { termosVersao: TERMOS_VERSAO },
    });
    // Se o e-mail falhar, a conta fica criada: ao tentar entrar, o CRM manda o link de novo.
    await enviarConfirmacao(admin, org.nome).catch((e) => console.error("[cadastro] não consegui enviar a confirmação:", e));
    await avisarDonoDoCadastro(org, admin, valores.telefone || null).catch((e) => console.error("[cadastro] não consegui avisar o dono:", e));
    console.log(`[cadastro] nova empresa: ${org.nome} (${org.slug})`);
    return { enviadoPara: admin.email };
  } catch (e) {
    if (e instanceof ErroCadastro) return { erro: e.message, valores };
    console.error("[cadastro] falhou:", e);
    return { erro: "Não foi possível criar a conta agora. Tente de novo em alguns minutos.", valores };
  }
}
