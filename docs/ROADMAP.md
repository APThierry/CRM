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
- [ ] Cadastrar e editar cursos e turmas
- [ ] Inscrever participantes na turma, registrar presença/aprovação e gerar validade do certificado
- [ ] Menu para celular

## Fase 2: Login e usuários
- [ ] Login com e-mail e senha
- [ ] Papéis (admin, gestor, vendedor, instrutor)
- [ ] Filtro por organização em todas as consultas

## Fase 3: WhatsApp
- [x] Decidir o provedor: Evolution API (usa o Baileys por dentro)
- [ ] Subir a Evolution API (na VPS ou local com Docker)
- [ ] Conectar número por QR Code
- [ ] Enviar mensagem a partir da ficha do cliente
- [ ] Receber mensagens (webhook) e mostrar a conversa

## Fase 4: Reciclagem e painel
- [ ] Lista de certificados vencendo
- [ ] Lembrete automático por WhatsApp
- [ ] Painel: vendas do mês, valor no funil, conversão, turmas da semana

## Fase 5: Produção
- [ ] Dockerfile e docker-compose
- [ ] Deploy na VPS com HTTPS
- [ ] Backup automático
- [ ] Cadastro de novas organizações (atender outros negócios)
