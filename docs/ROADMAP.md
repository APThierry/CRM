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
- [x] Bloqueio após 5 senhas erradas (15 min), por IP + e-mail (regras novas em docs/MULTIEMPRESA.md)
- [x] Papéis (admin, gestor, vendedor, instrutor); tela Usuários só para admin
- [x] Meu perfil: trocar nome e senha, ligar/desligar assinatura
- [x] Assinatura do atendente no WhatsApp (*Nome:*) e autor de mensagens e atividades
- [x] Filtro por organização em todas as consultas (pela organização do usuário logado)
- [ ] Restrições finas por papel (vendedor ver só os próprios clientes, instrutor só turmas)
- [x] "Esqueci minha senha" por e-mail (Fase F2)

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
- [x] Lembrete de reciclagem por WhatsApp (Fase D, com aprovação do gestor)
- [x] Painel: vendas do mês, valor no funil, conversão, turmas da semana (conversão e cortes na tela Relatórios)

## Fase 5: Produção
- [ ] Dockerfile e docker-compose
- [ ] Deploy na VPS com HTTPS
- [ ] Backup automático
- [ ] Cadastro de novas organizações (atender outros negócios): virou a Fase F, veja docs/MULTIEMPRESA.md

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
- [x] Fase D: Campanhas
  - [x] Público por segmento, cidade, etiqueta, curso e certificados vencendo/vencidos
  - [x] Ritmo protegido: 60–120 s entre mensagens, pausa de 10 min a cada 30, 150 por dia, só no horário
  - [x] Variações de texto ({Olá|Oi}) e convite para SAIR em toda mensagem
  - [x] Descadastro por "SAIR" (vale para campanhas futuras), com confirmação
  - [x] Rascunho, teste para o próprio número, iniciar/agendar, pausar, retomar, cancelar, tirar destinatário
  - [x] Pausa automática com WhatsApp desconectado ou 3 erros seguidos
  - [x] Status por destinatário: enviada, entregue, lida, respondeu, erro
  - [x] Reciclagem: lista de certificados vencendo, campanha preparada com negócios no funil, gestor aprova
  - [x] Teste automático em modo simulação (scripts/testar-campanhas.mts)
  - [ ] Campanhas com foto ou PDF
  - [ ] Tela para mudar o ritmo (hoje fixo em ritmo.ts)
  - [ ] Esconder o item Campanhas do menu para quem não é gestor
- [x] Fase E: Relatórios e integrações (detalhes em docs/INTEGRACOES.md)
  - [x] Relatórios por atendente: mensagens, conversas, tempo de resposta (mediana), aguardando agora, negócios e valor ganho
  - [x] Vendas e funil: valor ganho, ticket médio, conversão, funil atual, por mês, curso, origem e segmento, motivos de perda
  - [x] Turmas e certificados: alunos treinados, aprovação, certificados emitidos, por curso e cliente, vencimentos por mês
  - [x] Exportação CSV para Excel (clientes, negócios, certificados, atendentes), protegida contra fórmulas
  - [x] Google Agenda por link de assinatura (.ics) pessoal: turmas, tarefas e WhatsApp agendado
  - [x] Webhooks de saída assinados (HMAC-SHA256), com fila, 6 tentativas, teste e reenvio
  - [x] Teste automático (scripts/testar-integracoes.mts)
  - [ ] Gráficos nos relatórios
  - [ ] Webhook para os negócios criados em lote pela reciclagem
  - [ ] Google Agenda com escrita (OAuth), se o link de assinatura não bastar
- [ ] Fase F: Várias empresas no mesmo CRM (plano em docs/MULTIEMPRESA.md)
  - [x] F1. Base: situação da empresa (teste, ativa, suspensa), um WhatsApp por empresa, empresa nova já com funil, teste de isolamento (scripts/testar-multiempresa.mts)
  - [x] F2. Cadastro público com confirmação por e-mail, "esqueci minha senha", proteção contra abuso, período de teste, campanhas só depois da aprovação e primeiros passos (scripts/testar-cadastro.mts)
  - [x] Revisão de segurança antes da VPS (detalhes em docs/MULTIEMPRESA.md, "Segurança")
    - [x] Webhooks só para sites públicos (SSRF, rebinding), sem ler o corpo da resposta
    - [x] Login com tentativas reservadas, limites por IP, IP + e-mail e e-mail, aparelho conhecido e fila do scrypt
    - [x] Primeiro acesso em produção só com SETUP_TOKEN, e script para dar acesso pelo terminal
    - [x] Links só com APP_URL; IP só do cabeçalho confiável
    - [x] Convites e cadastro em que a própria pessoa escolhe a senha; nada nasce antes da confirmação
    - [x] Telas públicas não revelam quem tem conta
    - [x] Teto de mensagens novas por dia para empresa não aprovada; tetos de agendadas, webhooks, usuários, arquivos e instâncias
    - [x] Papéis: WhatsApp só administrador e gestor; turmas e certificados sem o vendedor
    - [x] Relógio em rodízio entre as empresas, limpeza de avisos antigos, agendada com 24 h de atraso não sai
    - [x] Certificado sem número repetido, cabeçalhos de segurança, seed não roda em produção
    - [x] Testes: scripts/testar-seguranca.mts e scripts/testar-multiempresa.mts (com as Server Actions de verdade)
    - [ ] Aviso na tela quando alguém sem permissão é mandado para o painel
    - [ ] Esconder do menu o que o papel não abre (WhatsApp, Campanhas, Integrações)
    - [ ] Verificação em duas etapas (TOTP) para administradores
    - [ ] Content-Security-Policy completa (hoje só frame-ancestors e base-uri)
  - [ ] F3. Módulos por empresa: turmas e certificados opcionais, "Produtos e serviços", funil sugerido por ramo
  - [ ] F4. Painel do dono do sistema: empresas, uso, suspender, ativar, liberar campanhas
