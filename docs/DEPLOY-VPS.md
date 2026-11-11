# Instalação na VPS

> **Status: rascunho.** O roteiro abaixo é o plano. Os arquivos `Dockerfile` e `docker-compose.yml` serão criados e testados na etapa de deploy (veja [ROADMAP.md](ROADMAP.md)).

## O que vai rodar na VPS

```
Internet ──► Caddy (HTTPS automático, porta 443)
                ├── crm.seudominio.com.br       ──► app Next.js (porta 3000)
                └── whatsapp.seudominio.com.br  ──► Evolution API (porta 8080)
             PostgreSQL (só acessível por dentro da VPS)
```

Tudo roda em containers Docker, gerenciados por um único `docker-compose.yml`.

## Requisitos da VPS

- Ubuntu 22.04 ou 24.04
- Pelo menos 2 GB de RAM (4 GB recomendado com Evolution API)
- Acesso SSH como usuário com `sudo`
- Um domínio apontando para o IP da VPS (registro DNS tipo A)

## Passo a passo (planejado)

1. **Acessar a VPS**
   ```bash
   ssh usuario@IP_DA_VPS
   ```
2. **Atualizar o sistema e instalar o Docker**
   ```bash
   sudo apt update && sudo apt upgrade -y
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER   # depois saia e entre de novo no SSH
   ```
3. **Liberar só as portas necessárias**
   ```bash
   sudo ufw allow OpenSSH
   sudo ufw allow 80
   sudo ufw allow 443
   sudo ufw enable
   ```
4. **Baixar o projeto** (do GitHub)
   ```bash
   git clone https://github.com/SEU_USUARIO/crm.git
   cd crm
   ```
5. **Configurar as variáveis**: `cp .env.example .env` e preencher senhas fortes e o domínio.
6. **Subir tudo**
   ```bash
   docker compose up -d --build
   ```
7. **Criar as tabelas**
   ```bash
   docker compose exec app npx prisma migrate deploy
   ```
8. **Atualizar depois de mudanças**
   ```bash
   git pull
   docker compose up -d --build
   docker compose exec app npx prisma migrate deploy
   ```

## Backup

O banco precisa de backup automático diário (`pg_dump`, guardado fora da VPS). Isso será configurado na etapa de deploy.

## Atenção: VPS de terceiros

Como a VPS é de um amigo, combinem quem tem acesso root, quem paga e o que acontece com os dados dos clientes se o acesso acabar. Para atender outros negócios, o ideal é ter uma VPS própria (a partir de uns R$ 30 a 60 por mês).
