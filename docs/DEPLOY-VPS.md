# Instalação na VPS

> **Status: rascunho.** O roteiro abaixo é o plano. Os arquivos `Dockerfile` e `docker-compose.yml` serão criados e testados na etapa de deploy (veja [ROADMAP.md](ROADMAP.md)).

## O que vai rodar na VPS

```
Internet ──► Caddy (HTTPS automático, porta 443)
                └── crm.seudominio.com.br       ──► app Next.js (porta 3000)
             Evolution API (porta 8080)   só por dentro da VPS
             PostgreSQL                   só por dentro da VPS
```

Tudo roda em containers Docker, gerenciados por um único `docker-compose.yml`. Só o Caddy fica na internet: a Evolution API não precisa de endereço público, porque quem fala com ela é o CRM (o QR Code aparece na tela do CRM).

## Regras de segurança do deploy

1. **Não publique a porta do CRM.** No `docker-compose.yml`, o serviço do app usa `expose: ["3000"]`, **nunca** `ports: ["3000:3000"]` (o Docker abre a porta na internet mesmo com o `ufw` ligado). Fora do Docker, rode `next start -H 127.0.0.1`. Se a porta ficar aberta, qualquer um escreve o cabeçalho de IP que quiser e fura os limites de tentativas. O mesmo vale para a Evolution API e o PostgreSQL.
2. **O Caddy sobrescreve o IP.** O CRM só confia no cabeçalho de `PROXY_IP_HEADER`. No Caddyfile, `header_up X-Real-IP {remote_host}` **troca** o que o visitante mandou. Se um dia houver outro proxy na frente (Cloudflare, por exemplo), `{remote_host}` passa a ser o IP dele: use `trusted_proxies` e `{client_ip}`.
3. **Tamanho dos envios por caminho.** O Next tem um limite só (17 MB) para o site todo. Quem corta de verdade é o Caddy, com `request_body`.
4. **O webhook do WhatsApp não fica na internet.** A Evolution API chama o CRM por dentro (`http://app:3000/api/whatsapp/webhook`); o Caddy responde 404 para esse caminho.
5. **Variáveis obrigatórias** no `.env` da VPS (o CRM avisa no terminal o que falta): `APP_URL` (https), `PROXY_IP_HEADER="x-real-ip"`, `SMTP_*`, `EMAIL_REMETENTE`, `WHATSAPP_WEBHOOK_SEGREDO` (aleatório), `EVOLUTION_API_KEY` (aleatória) e `SETUP_TOKEN` (só até o primeiro acesso).
6. **Nunca rode o seed na VPS** (ele se recusa). Crie a empresa com `scripts/criar-empresa.mts`, ou leve o banco do seu computador.

### Caddyfile (rascunho, ainda não testado na VPS)

```caddyfile
crm.seudominio.com.br {
	encode zstd gzip
	header Strict-Transport-Security "max-age=31536000"

	# A Evolution API chama por dentro da rede do Docker, não por aqui.
	@interno path /api/whatsapp/webhook
	respond @interno 404

	# Limite do corpo por caminho. Os três não se sobrepõem.
	@publicas path /login /cadastro /confirmar /convite /senha/* /termos /privacidade
	request_body @publicas {
		max_size 64KB
	}
	@anexos path /atendimento
	request_body @anexos {
		max_size 17MB
	}
	@resto not path /login /cadastro /confirmar /convite /senha/* /termos /privacidade /atendimento
	request_body @resto {
		max_size 1MB
	}

	reverse_proxy app:3000 {
		# Troca (não acrescenta) o que o visitante mandou.
		header_up X-Real-IP {remote_host}
		# Cabeçalho interno do Next: ninguém de fora pode mandar.
		header_up -X-Action-Forwarded
	}
}
```

O que isso **não** resolve: em `/atendimento` o Caddy não sabe quem está logado, então alguém de fora ainda consegue mandar até 17 MB por pedido ali antes de o CRM recusar. Se virar problema, limite também os pedidos por IP (o Caddy precisa de um plugin) ou no provedor da VPS.

Depois de subir, confira de fora da VPS:

```bash
curl -I https://crm.seudominio.com.br/login            # 200, com X-Frame-Options e Strict-Transport-Security
curl -sS -m 5 http://IP_DA_VPS:3000/ ; curl -sS -m 5 http://IP_DA_VPS:8080/   # os dois precisam falhar
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://crm.seudominio.com.br/api/whatsapp/webhook   # 404
head -c 200000 /dev/zero | curl -s -o /dev/null -w "%{http_code}\n" --data-binary @- https://crm.seudominio.com.br/login   # 413
```

### Primeiro acesso na VPS

1. Com o banco novo: `scripts/criar-empresa.mts "Empresa" "Nome" email` mostra o link para o administrador escolher a senha. Nem precisa do `SETUP_TOKEN`.
2. Com o banco levado do seu computador: quem já tinha senha entra normalmente. Perdeu? `scripts/definir-acesso.mts email`.
3. Pela tela: defina `SETUP_TOKEN` no `.env`, abra `/login`, clique em **Primeiro acesso (quem instalou o sistema)** e depois **apague** o `SETUP_TOKEN`.

Os scripts usam o `tsx`, que é dependência de desenvolvimento: a imagem do Docker precisa tê-lo, ou rode os scripts num container com o projeto completo.

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
