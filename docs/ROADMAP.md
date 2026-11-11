# Roteiro

## Fase 0: Base ✅
- [x] Projeto Next.js 16 + TypeScript + Tailwind
- [x] Banco PostgreSQL local com Prisma
- [x] Modelo de dados multiempresa (clientes, funil, cursos, turmas, certificados, WhatsApp)
- [x] Primeira migração aplicada
- [x] Git e documentação inicial

## Fase 1: Primeiras telas
- [ ] Dados de exemplo (seed): organização de bombeiros, cursos e etapas do funil
- [ ] Layout com menu lateral
- [ ] Clientes: lista, busca, cadastro, edição, ficha com contatos e histórico
- [ ] Funil de vendas: Kanban de arrastar e soltar
- [ ] Cursos e turmas
- [ ] Participantes e certificados

## Fase 2: Login e usuários
- [ ] Login com e-mail e senha
- [ ] Papéis (admin, gestor, vendedor, instrutor)
- [ ] Filtro por organização em todas as consultas

## Fase 3: WhatsApp
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
