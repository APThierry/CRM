# Arquitetura

## Visão geral

```
 Navegador (vendedor, gestor, instrutor)
        │
        ▼
 ┌──────────────────────────┐        ┌──────────────────────┐
 │  Next.js (telas + API)   │◄──────►│  PostgreSQL          │
 │  src/app/...             │ Prisma │  (dados do CRM)      │
 └──────────┬───────────────┘        └──────────────────────┘
            │ HTTP (envia)  ▲ webhook (recebe)
            ▼               │
 ┌──────────────────────────┐
 │  Provedor de WhatsApp    │  Evolution API (na VPS) ou Meta Cloud API
 └──────────────────────────┘
```

Um único projeto Next.js faz as telas e o servidor (rotas de API e *server actions*). Isso deixa o sistema simples de aprender e de instalar.

## Multiempresa

A tabela `Organizacao` representa cada empresa que usa o CRM. Quase todas as outras tabelas têm `organizacaoId`.

**Regra de ouro:** toda consulta ao banco deve filtrar por `organizacaoId` do usuário logado. Assim uma empresa nunca vê os dados de outra.

Para atender um negócio diferente (uma academia, uma clínica), você:
- cria uma nova `Organizacao`;
- configura as etapas do funil (`EtapaFunil`) daquele negócio;
- cadastra os serviços (`Servico`) que ele vende.

## Tabelas

| Tabela | O que guarda | Exemplo (bombeiros) |
|---|---|---|
| `Organizacao` | Empresa que usa o CRM | A empresa de bombeiros |
| `Usuario` | Quem faz login, com um papel (ADMIN, GESTOR, VENDEDOR, INSTRUTOR) | Vendedor João, instrutor Carlos |
| `Cliente` | Quem compra (PJ ou PF) | Metalúrgica X, Condomínio Y |
| `Contato` | Pessoa dentro do cliente | Técnico de segurança da Metalúrgica X |
| `EtapaFunil` | Colunas do Kanban de vendas | Novo → Visita → Proposta → Fechado |
| `Negocio` | Oportunidade de venda | "Brigada básica, 30 alunos, R$ 4.500" |
| `Servico` | O que é vendido, com validade | Brigada Intermediária, 16h, validade 12 meses |
| `Turma` | Uma edição do curso | 15/12, na sede do cliente, instrutor Carlos |
| `Participante` | Aluno | Funcionário Maria da Metalúrgica X |
| `Matricula` | Aluno numa turma, com resultado e certificado | Maria, aprovada, válido até 15/12/2027 |
| `Atividade` | Histórico e tarefas | "Ligar dia 20 para fechar proposta" |
| `ConfiguracaoWhatsapp` | Conexão de WhatsApp da organização | Instância Evolution "bombeiros" |
| `MensagemWhatsapp` | Mensagens enviadas e recebidas | — |

### Certificados

Regras em `src/lib/certificados.ts`:

- **Emissão:** quando o aluno é marcado como **aprovado** (individualmente ou pelo botão "Aprovar presentes e concluir turma"), o CRM grava o número, a data de emissão e a validade.
- **Número:** prefixo da organização + ano + sequência, por exemplo `BM-2026-0001`. Ele é gerado uma única vez e nunca muda, mesmo se o aluno for reprovado e aprovado de novo.
- **Validade:** último dia da turma (`dataFim`, ou `dataInicio` se não houver) + `Servico.validadeMeses`. Se a data da turma mudar, a validade dos aprovados é recalculada.
- **Situação:** *vencido* (já passou), *vencendo* (vence em até 60 dias), *válido*.
- Uma inscrição com certificado emitido não pode ser removida.
- **Alunos repetidos:** ao inscrever, se o CPF já existir na organização, o CRM reaproveita o participante.

### Reciclagem: a funcionalidade principal

`Matricula.validadeAte` é calculado como a data da turma mais `Servico.validadeMeses`.
Com isso o CRM consegue listar, por exemplo, "clientes com certificados vencendo nos próximos 60 dias", criar um negócio de reciclagem e mandar um WhatsApp.

## Estrutura de pastas

```
prisma/
  schema.prisma        modelo de dados
  migrations/          histórico de mudanças do banco
  seed.ts              dados de exemplo (npm run db:seed)
scripts/
  banco-local.mjs      PostgreSQL local para desenvolvimento (npm run db:local)
src/
  proxy.ts             checagem rápida: sem cookie de sessão -> /login
  app/                 páginas e rotas (cada pasta vira uma URL)
    (publico)/login/   entrar, sair e primeiro acesso (sem menu)
    (crm)/             páginas que exigem login (layout com menu)
    (crm)/page.tsx     painel (/)
    (crm)/usuarios/    gestão de usuários (admin) + formulários do perfil
    (crm)/perfil/      meu perfil
    (crm)/atendimento/ Central de atendimento: page.tsx junta lista.tsx, conversa.tsx e
                       painel.tsx; interativos.tsx roda no navegador; respostas/ = respostas
                       rápidas e etiquetas
    (crm)/whatsapp/    conexão do número (QR Code)
    (crm)/clientes/    lista, novo, ficha [id] e actions.ts (gravações)
    (crm)/funil/       Kanban (kanban.tsx roda no navegador) e actions.ts
    (crm)/turmas/      lista, nova, [id] (alunos e certificados), [id]/editar e actions.ts
    (crm)/certificados/ lista com filtros e [id] (certificado para imprimir)
    (crm)/cursos/      lista
    api/whatsapp/webhook/  recebe as mensagens da Evolution API
    api/arquivos/      entrega as mídias (confere o login)
  components/          peças visuais reutilizadas (menu, cabeçalho, etiquetas)
  lib/
    db.ts              conexão com o banco
    auth.ts            usuário logado (getUsuarioAtual) e papéis (exigirPapel)
    sessao.ts          criar/ler/encerrar sessões (cookie + tabela Sessao)
    senha.ts           hash e conferência de senhas (scrypt)
    org.ts             organização do usuário logado; organização padrão para o webhook
    formatar.ts        moeda, datas, CPF, telefone e link do WhatsApp
    certificados.ts    validade, numeração e situação dos certificados
    atendimento.ts     quem vê qual conversa (vendedor x gestor)
    arquivos.ts        mídias do WhatsApp em ARQUIVOS_DIR (fora do projeto)
    whatsapp/          Evolution API, conversas/mensagens e envio
  generated/prisma/    código gerado pelo Prisma (não editar, não vai para o Git)
docs/                  esta documentação
```

## Padrões usados no código

- **Server Components** (padrão): as páginas buscam dados direto do banco no servidor. Nada de API intermediária.
- **`<Suspense>` + `connection()`**: o projeto usa *Cache Components* do Next.js 16. Toda parte que lê o banco fica dentro de `<Suspense>` e chama `await connection()`, para buscar dados novos a cada acesso.
- **Server Actions** (`actions.ts`): gravações chamadas pelos formulários. Toda action confere se o registro pertence à organização atual.
- **Client Components** (`"use client"`): só onde precisa de interação no navegador, como o Kanban e o menu.

## Login e permissões

- **Pastas entre parênteses** (`(crm)`, `(publico)`) agrupam páginas sem mudar o endereço. `(crm)` tem o menu e exige login; `(publico)` não.
- **`src/proxy.ts`** só confere se o cookie existe (rápido). A conferência de verdade é no servidor: `getUsuarioAtual()` procura a sessão no banco e, se não houver, redireciona para `/login`.
- **Toda Server Action** chama `getUsuarioAtual()` ou `getOrganizacaoAtual()`, então nenhuma gravação acontece sem login, mesmo que alguém chame a action direto.
- **Ações restritas** usam `exigirPapel("ADMIN")`.
- **Sessão:** o cookie `crm_sessao` guarda um código aleatório; a tabela `Sessao` guarda só o SHA-256 dele. Desativar um usuário ou redefinir a senha apaga as sessões, desconectando na hora.
- **Webhook do WhatsApp** fica fora do login (tem o próprio segredo) e usa `getOrganizacaoPadrao()`.
- **Central de atendimento:** `conversasVisiveis(eu)` (em `src/lib/atendimento.ts`) é o filtro usado em toda consulta e action de conversa. Vendedor e instrutor: fila + as suas. Gestor e admin: todas.
- **Mídias:** a rota `/api/arquivos/...` exige sessão e só lê arquivos da pasta da organização do usuário (recusa `..`).

## Pastas fora do projeto

O `next dev` observa a pasta do projeto: qualquer arquivo gravado ali dentro faz a página recarregar. Por isso o que muda o tempo todo fica **ao lado** do projeto:

| Pasta | O que guarda |
|---|---|
| `../crm-banco-local` | Banco PostgreSQL local (`npm run db:local`) |
| `../crm-arquivos` | Fotos, áudios e documentos do WhatsApp (`ARQUIVOS_DIR`) |

O cache em disco do Turbopack também está desligado no desenvolvimento (`turbopackFileSystemCacheForDev: false` em `next.config.ts`): com ele, depois de um tempo a página aberta entrava num ciclo de recarregar.
