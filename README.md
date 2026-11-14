# CRM

CRM web para empresas de treinamento, começando pela **[Brigada MG](https://brigadamg.com.br)**, empresa de treinamentos em segurança e cursos de brigadista, com integração com **WhatsApp**.
Ele foi pensado desde o início para atender **várias empresas (multiempresa)**. Cada organização vê só os próprios dados e configura o próprio funil.

## O que o sistema faz (planejado)

- **Clientes e contatos**: empresas, condomínios, escolas, indústrias e os contatos de cada uma (técnico de segurança, síndico, RH).
- **Funil de vendas**: quadro Kanban com etapas configuráveis.
- **Cursos (serviços)**: Bombeiro Civil, NR 23/IT 12 (brigada), NR 33, NR 35, NR 10, Lei Lucas, NR 7, NR 5 (CIPA) e Brigada Florestal, com carga horária, validade e modalidade (presencial, EAD ou híbrido).
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
| WhatsApp | Evolution API (usa o Baileys por dentro) | Enviar e receber mensagens |
| Produção | VPS Linux + Docker | Hospedar o sistema |

## Documentação

1. [Instalação local (no seu PC)](docs/INSTALACAO-LOCAL.md)
2. [Arquitetura e modelo de dados](docs/ARQUITETURA.md)
3. [Integração com WhatsApp](docs/WHATSAPP.md)
4. [Relatórios, exportação, Google Agenda e webhooks](docs/INTEGRACOES.md)
5. [Instalação na VPS](docs/DEPLOY-VPS.md)
6. [Roteiro (o que já foi feito e o que falta)](docs/ROADMAP.md)
7. [Guia de Git (controle de versões)](docs/GIT.md)

## Começo rápido

```bash
npm install
cp .env.example .env
npm run db:local      # terminal 1: sobe o PostgreSQL local (deixe aberto)
npm run db:migrate    # terminal 2: cria as tabelas
npm run db:seed       # dados de exemplo da Brigada MG
npm run whatsapp:local  # terminal 3 (opcional): Evolution API, ver docs/WHATSAPP.md
npm run dev           # abre em http://localhost:3000
```

## Primeiro acesso

Na primeira vez, abra http://localhost:3000. Como ninguém tem senha ainda, o CRM mostra **Primeiro acesso**: crie o administrador (nome, e-mail e senha). Depois, em **Usuários**, cadastre a equipe.

## Telas prontas

| Tela | Endereço | O que faz |
|---|---|---|
| Painel | `/` | Valor no funil, vendas do mês, reciclagens a oferecer, tarefas, próximas turmas |
| Atendimento | `/atendimento` | Central do WhatsApp: todas as conversas, fila e "minhas", fotos/áudios/documentos, respostas rápidas com "/", etiquetas, transferência entre atendentes, cadastro de cliente e funil sem sair da conversa |
| Respostas e etiquetas | `/atendimento/respostas` | Textos prontos (da equipe ou só seus) e etiquetas das conversas |
| Automação | `/automacao` | Horário de atendimento com aviso automático, chatbot de boas-vindas (menu), sequências de follow-up e a fila de mensagens agendadas |
| Clientes | `/clientes` | Lista com busca, cadastro e ficha (contatos, negócios, certificados, histórico e tarefas, botão do WhatsApp) |
| Funil de vendas | `/funil` | Kanban de arrastar e soltar (no celular, seletor "Mover para…"), criação de negócios |
| Turmas | `/turmas` | Agenda, cadastro e edição; na turma: inscrição de alunos, presença, aprovação e emissão de certificados |
| Certificados | `/certificados` | Todos os certificados, filtro válido/vencendo/vencido, busca e impressão (PDF) |
| WhatsApp | `/whatsapp` | Conexão do número por QR Code e resumo das conversas |
| Usuários | `/usuarios` | Cadastro da equipe, papéis, desativar e redefinir senha (só administrador) |
| Meu perfil | `/perfil` | Nome, senha e assinatura no WhatsApp |
| Cursos | `/cursos` | Os 9 cursos da Brigada MG (somente leitura por enquanto) |
