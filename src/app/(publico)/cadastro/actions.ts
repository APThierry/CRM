"use server";
// Cadastro público de uma empresa nova (Fase F2). Aqui só guardamos o PEDIDO: a
// empresa e o administrador nascem quando a pessoa abre o link do e-mail e escolhe a
// própria senha (../confirmar). Quem digitar o e-mail de outra pessoa não ganha nada.
//
// A resposta é sempre a mesma, exista ou não uma conta com aquele e-mail, e todo o
// trabalho (consultar, gravar, enviar) acontece depois da resposta: nem o tempo conta.
//
// Proteções contra cadastro falso: campo escondido (robôs preenchem), tempo mínimo
// para preencher e limites por IP e por e-mail.
import { after } from "next/server";
import { cadastroAberto, RAMOS } from "@/lib/cadastro";
import { falhaDeEmail, processarPedidoDeCadastro } from "@/lib/conta";
import { ipDaRequisicao, regraPorIp, reservar } from "@/lib/limite";
import { emailValido, normalizarEmail, umaLinha } from "@/lib/validar";

export type Valores = { empresa?: string; ramo?: string; nome?: string; email?: string; telefone?: string };
export type EstadoCadastro = { erro?: string; valores?: Valores; enviadoPara?: string } | null;

const TEMPO_MINIMO_MS = 3_000;

export async function criarConta(_estado: EstadoCadastro, formData: FormData): Promise<EstadoCadastro> {
  const valores = {
    empresa: umaLinha(formData.get("empresa"), 120),
    ramo: umaLinha(formData.get("ramo"), 120),
    nome: umaLinha(formData.get("nome"), 120),
    email: normalizarEmail(formData.get("email")),
    telefone: umaLinha(formData.get("telefone"), 30),
  };
  if (!cadastroAberto()) return { erro: "O cadastro de novas empresas está fechado no momento.", valores };

  // Robô: preencheu o campo escondido. Fingimos que deu certo e não criamos nada.
  if (umaLinha(formData.get("site"), 10)) return { enviadoPara: valores.email };
  const inicio = Number(formData.get("inicio"));
  if (!inicio || Date.now() - inicio < TEMPO_MINIMO_MS) return { erro: "Confira os dados e clique em Criar conta de novo.", valores };

  if (valores.empresa.length < 2 || !valores.nome || !valores.email) return { erro: "Preencha o nome da empresa, o seu nome e o e-mail.", valores };
  if (!emailValido(valores.email)) return { erro: "Confira o e-mail.", valores };
  if (!(RAMOS as readonly string[]).includes(valores.ramo)) return { erro: "Escolha o ramo da empresa.", valores };
  if (formData.get("termos") !== "sim") return { erro: "Para criar a conta, aceite os termos de uso e a política de privacidade.", valores };

  const ip = await ipDaRequisicao();
  // Um só IP: 5 por hora. Sem saber o IP, um limite geral para o site todo.
  if (!reservar(regraPorIp("cadastro", ip, 5, 3600_000, 60)).ok) return { erro: "Muitos cadastros deste endereço. Tente de novo daqui a uma hora.", valores };

  // Por e-mail: de cada IP, 1 a cada 5 minutos; somando todos, 10 por dia. Assim ninguém
  // lota a caixa de outra pessoa. Passou disso, a resposta é a mesma e nada é enviado.
  const regras = [
    { chave: `cadastro-email:${ip ?? "sem-ip"}:${valores.email}`, maximo: 1, janelaMs: 5 * 60_000 },
    { chave: `cadastro-email-dia:${valores.email}`, maximo: 10, janelaMs: 24 * 3600_000 },
  ];
  if (reservar(regras).ok) {
    after(() => processarPedidoDeCadastro({ ...valores, telefone: valores.telefone || null }).catch(falhaDeEmail("cadastro")));
  }
  return { enviadoPara: valores.email };
}
