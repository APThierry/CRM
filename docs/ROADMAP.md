# Roteiro

## Fase 0: Base ✅
- [x] Projeto Next.js 16 + TypeScript + Tailwind
- [x] Banco PostgreSQL local (embedded-postgres) com Prisma
- [x] Modelo de dados multiempresa (clientes, funil, cursos, turmas, certificados, WhatsApp)
- [x] Primeira migração aplicada
- [x] Git e documentação inicial

## Fase 1: Primeiras telas (em andamento)
- [x] Dados de exemplo (seed) da Brigada MG: 9 cursos do site, etapas do funil, clientes fictícios
- [x] Layout com menu lateral
- [x] Painel: valor no funil, vendas do mês, reciclagens, tarefas, próximas turmas
- [x] Clientes: lista, busca, cadastro, ficha com contatos, negócios, certificados e histórico
- [x] Tarefas e histórico na ficha do cliente (com conclusão)
- [x] Funil de vendas: Kanban de arrastar e soltar e criação de negócios
- [x] Cursos e turmas (listas)
- [ ] Editar e excluir cliente, adicionar contatos
- [ ] Editar negócio (valor, previsão, motivo da perda)
- [x] Cadastrar e editar turmas (status, modalidade, cliente in company, instrutor, vagas)
- [x] Inscrever alunos (reaproveita pelo CPF), presença, aprovação/reprovação
- [x] Certificados: número sequencial, validade automática, impressão/PDF
- [x] Tela de certificados com filtro válido/vencendo/vencido e busca
- [ ] Cadastrar e editar cursos (preço, carga horária, validade)
- [ ] Modelo de certificado validado pela Brigada MG (conteúdo programático, responsável técnico)
- [ ] Importar lista de alunos por planilha
- [ ] Menu para celular

## Fase 2 (Fase A do plano Waseller): Login e atendentes ✅
- [x] Login com e-mail e senha (scrypt), sessões no banco, cookie HttpOnly
- [x] Primeiro acesso: o administrador cria a própria senha
- [x] Bloqueio após 5 senhas erradas (15 min)
- [x] Papéis (admin, gestor, vendedor, instrutor); tela Usuários só para admin
- [x] Meu perfil: trocar nome e senha, ligar/desligar assinatura
- [x] Assinatura do atendente no WhatsApp (*Nome:*) e autor de mensagens e atividades
- [x] Filtro por organização em todas as consultas (pela organização do usuário logado)
- [ ] Restrições finas por papel (vendedor ver só os próprios clientes, instrutor só turmas)
- [ ] "Esqueci minha senha" por e-mail

## Fase 3: WhatsApp
- [x] Decidir o provedor: Evolution API (usa o Baileys por dentro)
- [x] Subir a Evolution API localmente (Node, sem Docker)
- [x] Conectar número por QR Code (tela WhatsApp)
- [x] Enviar mensagem a partir da ficha do cliente (com modelos)
- [x] Receber mensagens (webhook protegido por segredo) e mostrar a conversa
- [ ] Enviar e receber arquivos (proposta em PDF, fotos)
- [ ] Cadastrar cliente a partir de um número não cadastrado
- [ ] Subir a Evolution API na VPS

## Fase 4: Reciclagem e painel
- [x] Lista de certificados vencendo
- [ ] Lembrete automático por WhatsApp
- [ ] Painel: vendas do mês, valor no funil, conversão, turmas da semana

## Fase 5: Produção
- [ ] Dockerfile e docker-compose
- [ ] Deploy na VPS com HTTPS
- [ ] Backup automático
- [ ] Cadastro de novas organizações (atender outros negócios)

## Plano "melhor que o Waseller"
- [x] Fase A: Login e atendentes
- [x] Fase B: Central de atendimento
  - [x] Caixa de entrada única, com abas Abertas / Minhas / Fila / Finalizadas e busca
  - [x] Receber e enviar foto, vídeo, áudio e documento
  - [x] Respostas rápidas com "/" e variáveis ({primeiro_nome}, {atendente})
  - [x] Etiquetas coloridas e filtro por etiqueta
  - [x] Fila e atribuição: quem responde fica com a conversa; gestor transfere
  - [x] Vendedor vê só a fila e as conversas dele; gestor e admin veem tudo
  - [x] Cadastrar cliente ou ligar a um cliente existente pela conversa
  - [x] Criar negócio e mudar a etapa do funil pela conversa (e pelo celular no Kanban)
  - [x] Contador de não lidas no menu e atualização automática a cada 5 s
  - [ ] Gravar áudio direto pelo CRM (hoje: anexar um arquivo de áudio)
  - [ ] Notas internas na conversa (visíveis só para a equipe)
- [x] Fase C: Automação
  - [x] Horário de atendimento por dia da semana, com aviso automático fora do horário (1 vez a cada 12 h)
  - [x] Chatbot de boas-vindas: menu numerado, etiqueta e atendente por opção, para quando uma pessoa assume
  - [x] Agendar mensagem numa conversa (dia e hora), com opção de cancelar se o cliente responder
  - [x] Sequências de follow-up (ex.: 1, 3 e 7 dias), canceladas sozinhas quando o cliente responde
  - [x] Follow-ups respeitam o horário de atendimento
  - [x] Fila de envios (o que vai sair, o que deu erro) e cancelamento
  - [x] Relógio de envios dentro do próprio servidor (src/instrumentation.ts)
  - [x] Modo simulação (WHATSAPP_SIMULAR_ENVIO=1) para testar sem enviar nada
  - [ ] Gatilho pelo funil (ao mudar de etapa, iniciar uma sequência ou criar tarefa)
  - [ ] Menu do chatbot com submenus
- [ ] Fase D: Campanhas (disparos protegidos, reciclagem automática, status)
- [ ] Fase E: Relatórios e integrações (por atendente, exportação, Google Agenda, webhooks)
