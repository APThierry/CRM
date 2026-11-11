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
  app/                 páginas e rotas (cada pasta vira uma URL)
    page.tsx           painel (/)
    clientes/          lista, novo, ficha [id] e actions.ts (gravações)
    funil/             Kanban (kanban.tsx roda no navegador) e actions.ts
    cursos/  turmas/   listas
  components/          peças visuais reutilizadas (menu, cabeçalho, etiquetas)
  lib/
    db.ts              conexão com o banco
    org.ts             organização atual (vira "usuário logado" na Fase 2)
    formatar.ts        moeda, datas, telefone e link do WhatsApp
  generated/prisma/    código gerado pelo Prisma (não editar, não vai para o Git)
docs/                  esta documentação
```

## Padrões usados no código

- **Server Components** (padrão): as páginas buscam dados direto do banco no servidor. Nada de API intermediária.
- **`<Suspense>` + `connection()`**: o projeto usa *Cache Components* do Next.js 16. Toda parte que lê o banco fica dentro de `<Suspense>` e chama `await connection()`, para buscar dados novos a cada acesso.
- **Server Actions** (`actions.ts`): gravações chamadas pelos formulários. Toda action confere se o registro pertence à organização atual.
- **Client Components** (`"use client"`): só onde precisa de interação no navegador, como o Kanban e o menu.
