# Instalação local (Windows)

Este passo a passo serve para rodar o CRM no seu computador e desenvolver.

## 1. Programas necessários

| Programa | Versão usada | Como conferir |
|---|---|---|
| Node.js | 26 | `node --version` |
| Git | 2.47 | `git --version` |
| VS Code (recomendado) | qualquer | — |

Você **não** precisa de Docker no PC. O banco local roda com `prisma dev`.

## 2. Baixar as dependências

Na pasta do projeto (`D:\CRM`):

```bash
npm install
```

Isso cria a pasta `node_modules` com as bibliotecas. Ela não vai para o Git.

## 3. Banco de dados local

```bash
npx prisma dev --name crm --detach
```

Esse comando sobe um PostgreSQL local em segundo plano e mostra um endereço parecido com:

```
postgres://postgres:postgres@localhost:51214/template1?sslmode=disable
```

Copie o arquivo `.env.example` para `.env` e cole esse endereço em `DATABASE_URL`.

Comandos úteis:

```bash
npx prisma dev ls          # lista os bancos locais
npx prisma dev stop crm    # para o banco
npx prisma dev start crm   # liga de novo
```

## 4. Criar as tabelas

```bash
npx prisma migrate dev
```

Ele aplica os arquivos em `prisma/migrations/`, que guardam o histórico de mudanças do banco.

Para ver e editar os dados num painel visual:

```bash
npx prisma studio
```

## 5. Rodar o sistema

```bash
npm run dev
```

Depois abra http://localhost:3000.

## Quando você mudar o banco

1. Edite `prisma/schema.prisma`.
2. Rode `npx prisma migrate dev --name descricao-da-mudanca`.
3. Faça o commit do schema **e** da nova pasta em `prisma/migrations/`.
