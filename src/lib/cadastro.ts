// Regras do cadastro público (Fase F2). Sem "server-only": a lista de ramos
// também é usada pelo formulário no navegador.

/** Ramos oferecidos no cadastro. Na F3 cada um vai sugerir funil e módulos. */
export const RAMOS = [
  "Treinamento e segurança do trabalho",
  "Saúde (clínica, consultório)",
  "Educação (escola, cursos)",
  "Comércio e loja",
  "Serviços",
  "Imobiliária",
  "Indústria",
  "Outro",
] as const;

/**
 * Versão dos termos de uso e da política de privacidade. Quando o texto mudar,
 * troque a versão: o cadastro guarda qual versão cada empresa aceitou.
 */
export const TERMOS_VERSAO = "2026-11-provisoria";

/** Dias de teste para quem se cadastra (CADASTRO_DIAS_TESTE, padrão 14). */
export const diasDeTeste = () => Number(process.env.CADASTRO_DIAS_TESTE) || 14;

/** CADASTRO_DESLIGADO=1 fecha a página "Criar conta" (só o script cria empresas). */
export const cadastroAberto = () => process.env.CADASTRO_DESLIGADO !== "1";
