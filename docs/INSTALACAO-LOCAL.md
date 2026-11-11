# Instalação local (Windows)

Este passo a passo serve para rodar o CRM no seu computador e desenvolver.

## 1. Programas necessários

| Programa | Versão usada | Como conferir |
|---|---|---|
| Node.js | 26 | `node --version` |
| Git | 2.47 | `git --version` |
| VS Code (recomendado) | qualquer | — |

Você **não** precisa de Docker nem de instalar o PostgreSQL. O banco local vem pelo pacote `embedded-postgres`.

## 2. Baixar o projeto e as dependências

```bash
git clone https://github.com/APThierry/CRM.git
cd CRM
npm install
```

O `npm install` cria a pasta `node_modules` (que não vai para o Git) e gera o cliente do Prisma.

## 3. Configurar

Copie `.env.example` para `.env`. Os valores padrão já servem para o desenvolvimento.

## 4. Ligar o banco de dados

Abra **um terminal só para o banco** e deixe-o aberto:

```bash
npm run db:local
```

Ele sobe um PostgreSQL 17 na porta **5433** e guarda os dados na pasta `.banco-local/`. Para parar, use Ctrl+C.

## 5. Criar as tabelas e os dados de exemplo

Em outro terminal:

```bash
npm run db:migrate    # cria/atualiza as tabelas
npm run db:seed       # dados de exemplo da Brigada MG (apaga e recria a organização de exemplo)
```

Para ver e editar os dados num painel visual:

```bash
npm run db:studio
```

## 6. Rodar o sistema

```bash
npm run dev
```

Depois abra http://localhost:3000.

## Quando você mudar o banco

1. Edite `prisma/schema.prisma`.
2. Rode `npx prisma migrate dev --name descricao-da-mudanca`.
3. Rode `npx prisma generate` (atualiza os tipos usados no código).
4. Faça o commit do schema **e** da nova pasta em `prisma/migrations/`.

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `Can't reach database server at localhost:5433` | O banco não está ligado. Rode `npm run db:local`. |
| Erro de tipo dizendo que um campo não existe | Faltou `npx prisma generate` depois de mudar o schema. |
| `Cannot find name 'PageProps'` | Rode `npx next typegen` ou `npm run dev` uma vez. |
