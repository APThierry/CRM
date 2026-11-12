# Integração com WhatsApp

## Decisão: Evolution API (que usa o Baileys por dentro)

O **Baileys** é uma biblioteca em Node.js que conecta um número de WhatsApp comum pelo protocolo do WhatsApp Web, lendo um QR Code.
A **Evolution API** é um servidor pronto que usa o Baileys por dentro e oferece por cima:

| | Baileys direto no CRM | Evolution API (escolhida) |
|---|---|---|
| O que é | Biblioteca que precisa ficar conectada o tempo todo | Servidor separado, em Docker |
| Conexão | Teríamos que manter um processo Node sempre ligado, à parte do Next.js | Já faz isso |
| Integração com o CRM | Código próprio para tudo | API REST para enviar e webhook para receber |
| Vários números (multiempresa) | Teríamos que programar | Uma **instância** por organização |
| Reconexão, QR Code, mídia | Teríamos que programar | Já vem pronto, com painel |
| Trocar pela API oficial depois | Difícil | Fácil, por causa da camada única do CRM |

Escolhemos a Evolution API porque ela entrega o Baileys pronto para produção e encaixa no modelo multiempresa: cada cliente do CRM conecta o próprio número na própria instância.

## Riscos (valem para Baileys e Evolution)

- **Não é oficial.** O WhatsApp pode **banir o número**, principalmente se ele mandar muitas mensagens para quem não tem o contato salvo ou não respondeu antes.
- Boas práticas:
  - use um número dedicado à empresa, não o pessoal;
  - "aqueça" o número aos poucos;
  - evite disparos em massa;
  - mantenha intervalos entre envios nos lembretes de reciclagem;
  - deixe sempre a opção de o cliente pedir para não receber mais mensagens.
- Se o volume crescer, migre para a API oficial da Meta (Cloud API). O CRM já tem o campo `provedor` em `ConfiguracaoWhatsapp` para isso.

## Como vai funcionar

```
CRM ──POST /message/sendText/{instancia}──► Evolution API ──► WhatsApp
CRM ◄──POST /api/whatsapp/webhook────────── Evolution API ◄── WhatsApp
```

- **Enviar:** o CRM chama a Evolution API e salva a mensagem em `MensagemWhatsapp` com `direcao = SAIDA`.
- **Receber:** a Evolution API chama o webhook do CRM a cada mensagem nova. O CRM procura o cliente pelo telefone e salva com `direcao = ENTRADA`.
- **Conectar o número:** na tela WhatsApp o CRM mostra o QR Code da instância, e você lê pelo celular.

## Instalação local (Windows, sem Docker)

A Evolution API fica em uma pasta **ao lado** do CRM (`D:\evolution-api`) e usa o mesmo PostgreSQL local (banco `evolution`).

Uma vez só:

```bash
cd D:\
git clone --depth 1 --branch 2.3.7 https://github.com/evolution-foundation/evolution-api.git
cd evolution-api
npm ci
copy env.example .env
```

No `.env` da Evolution API, ajuste:

| Variável | Valor |
|---|---|
| `DATABASE_CONNECTION_URI` | `postgresql://postgres:postgres@localhost:5433/evolution?schema=public` |
| `CACHE_REDIS_ENABLED` | `false` (localmente não usamos Redis) |
| `AUTHENTICATION_API_KEY` | uma chave aleatória longa, **a mesma** do `EVOLUTION_API_KEY` do CRM |
| `TELEMETRY_ENABLED` | `false` |
| `CONFIG_SESSION_PHONE_CLIENT` | `CRM Brigada MG` (nome que aparece em "Aparelhos conectados") |
| `DATABASE_SAVE_DATA_HISTORIC` | `false` (não importa todo o histórico do celular) |

Com o banco local ligado (`npm run db:local`), crie o banco `evolution` e prepare a API:

```bash
npm run db:generate
npm run db:deploy:win
npm run build
```

## Rodar no dia a dia

Três terminais:

```bash
npm run db:local        # 1. banco de dados
npm run whatsapp:local  # 2. Evolution API (porta 8080)
npm run dev             # 3. CRM (porta 3000)
```

## Conectar o número

1. No CRM, abra **WhatsApp** no menu.
2. Clique em **Conectar WhatsApp**.
3. No celular: **Aparelhos conectados → Conectar um aparelho** e leia o QR Code.
4. O status muda para **Conectado**. O CRM configura o webhook sozinho.

## Como usar

- **Ficha do cliente → 💬 WhatsApp:** conversa com o cliente, envio de mensagens e modelos prontos. A conversa se atualiza a cada 10 segundos.
- **Tela WhatsApp:** as últimas conversas, inclusive de números **não cadastrados** (novos interessados).
- Mensagens enviadas **pelo celular** também aparecem no CRM (com a marca "pelo celular").
- O CRM reconhece o cliente pelo número mesmo sem o nono dígito: compara DDD + 8 últimos dígitos.
- Grupos e status são ignorados.

## Variáveis do CRM (`.env`)

| Variável | Para quê |
|---|---|
| `EVOLUTION_API_URL` | Endereço da Evolution API |
| `EVOLUTION_API_KEY` | Chave de acesso (igual à `AUTHENTICATION_API_KEY` da Evolution) |
| `EVOLUTION_INSTANCIA` | Nome da conexão (uma por organização) |
| `WHATSAPP_WEBHOOK_URL` | Endereço que a Evolution chama para entregar mensagens |
| `WHATSAPP_WEBHOOK_SEGREDO` | Segredo enviado no cabeçalho `x-crm-segredo`; o CRM recusa chamadas sem ele |

## Onde fica o código

| Arquivo | O que faz |
|---|---|
| `src/lib/whatsapp/evolution.ts` | Única parte que fala com a Evolution API (trocar de provedor = mudar só aqui) |
| `src/lib/whatsapp/mensagens.ts` | Encontra o cliente pelo telefone e extrai o texto das mensagens |
| `src/app/api/whatsapp/webhook/route.ts` | Recebe as mensagens |
| `src/app/whatsapp/` | Tela de conexão (QR Code) e ações de envio |
| `src/app/clientes/[id]/conversa-whatsapp.tsx` | Conversa na ficha do cliente |

## Limitações atuais

- Só texto é enviado. Recebidos de mídia aparecem como "📷 Imagem", "🎤 Áudio" etc., sem o arquivo.
- Sem envio em massa (de propósito, por causa do risco de banimento).
- Na VPS, o webhook vai usar o endereço interno do Docker. Isso entra no guia de deploy.
