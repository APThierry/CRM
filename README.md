# CRM

CRM web para empresas de treinamento, começando por uma **empresa de bombeiros que vende cursos de brigadista**, com integração com **WhatsApp**.
Ele foi pensado desde o início para atender **várias empresas (multiempresa)**. Cada organização vê só os próprios dados e configura o próprio funil.

## O que o sistema faz (planejado)

- **Clientes e contatos**: empresas, condomínios, escolas, indústrias e os contatos de cada uma (técnico de segurança, síndico, RH).
- **Funil de vendas**: quadro Kanban com etapas configuráveis.
- **Cursos (serviços)**: Brigada Básica, Intermediária, Avançada, Primeiros Socorros, com carga horária e validade.
- **Turmas**: data, local, instrutor e vagas, in company ou abertas.
- **Participantes e certificados**: presença, aprovação, número e validade do certificado.
- **Reciclagem**: avisa quando os certificados de um cliente estão para vencer. É a venda recorrente do negócio.
- **WhatsApp**: conversar com o cliente de dentro do CRM e mandar lembretes.
- **Tarefas e histórico**: ligações, visitas, notas e follow-ups.

## Tecnologias

| Parte | Ferramenta | Para quê |
|---|---|---|
| Site e servidor | [Next.js](https://nextjs.org) 16 + React 19 + TypeScript | Telas e lógica, tudo em um projeto só |
| Visual | Tailwind CSS 4 | Estilizar as telas |
| Banco de dados | PostgreSQL | Guardar os dados |
| Acesso ao banco | Prisma 7 | Escrever consultas em TypeScript em vez de SQL puro |
| WhatsApp | Evolution API ou API oficial da Meta | Enviar e receber mensagens |
| Produção | VPS Linux + Docker | Hospedar o sistema |

## Documentação

1. [Instalação local (no seu PC)](docs/INSTALACAO-LOCAL.md)
2. [Arquitetura e modelo de dados](docs/ARQUITETURA.md)
3. [Integração com WhatsApp](docs/WHATSAPP.md)
4. [Instalação na VPS](docs/DEPLOY-VPS.md)
5. [Roteiro (o que já foi feito e o que falta)](docs/ROADMAP.md)
6. [Guia de Git (controle de versões)](docs/GIT.md)

## Começo rápido

```bash
npm install
npx prisma dev --name crm --detach   # sobe o PostgreSQL local
npx prisma migrate dev               # cria as tabelas
npm run dev                          # abre em http://localhost:3000
```
