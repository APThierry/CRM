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

- **Atendimento** (menu): a Central com todas as conversas. Veja "Central de atendimento" abaixo.
- **Ficha do cliente → 💬 WhatsApp:** a mesma conversa, vista a partir do cliente.
- **Tela WhatsApp:** só a conexão do número e um resumo (abertas, na fila, não lidas).
- Mensagens enviadas **pelo celular** também aparecem no CRM (com a marca "pelo celular").
- O CRM reconhece o cliente pelo número mesmo sem o nono dígito: compara DDD + 8 últimos dígitos.
- Grupos e status são ignorados.

## Central de atendimento

- **Uma conversa por número.** O CRM junta as mensagens pelo DDD + 8 últimos dígitos, então o nono dígito não cria conversas duplicadas.
- **Abas:** *Abertas* (tudo que você pode ver), *Minhas* (você é o atendente), *Fila* (ninguém assumiu ainda) e *Finalizadas*.
- **Quem atende:** quem responde uma conversa da fila (ou clica em **Assumir**) vira o atendente dela. Gestor e administrador podem transferir qualquer conversa; o atendente pode transferir as dele ou devolver para a fila.
- **Quem vê o quê:** vendedor/atendente e instrutor veem a fila e as próprias conversas. Gestor e administrador veem todas.
- **Finalizar** tira a conversa das abertas. Se o cliente escrever de novo, ela volta sozinha, com o mesmo atendente.
- **Mídia:** fotos, vídeos, áudios e documentos chegam junto com a mensagem (webhook com `base64` ligado) e ficam na pasta `ARQUIVOS_DIR`. Para enviar, use o 📎 (até 16 MB). Áudio vai como mensagem de voz.
- **Respostas rápidas:** digite `/` na caixa de mensagem. Use `{primeiro_nome}`, `{nome}` e `{atendente}` no texto. Cadastro em **Atendimento → Respostas e etiquetas**.
- **Etiquetas:** clique na etiqueta no painel da direita para marcar ou desmarcar. Filtro na lista. Só gestor e administrador criam e apagam etiquetas.
- **Número novo:** o painel da direita oferece **Cadastrar cliente** (já com o número) ou ligar a um cliente existente. Depois aparecem os negócios do cliente, com a etapa do funil para trocar ali mesmo.
- **Atualização:** a tela busca novidades a cada 5 segundos enquanto está aberta.

## Variáveis do CRM (`.env`)

| Variável | Para quê |
|---|---|
| `EVOLUTION_API_URL` | Endereço da Evolution API |
| `EVOLUTION_API_KEY` | Chave de acesso (igual à `AUTHENTICATION_API_KEY` da Evolution) |
| `EVOLUTION_INSTANCIA` | Nome da conexão (uma por organização) |
| `WHATSAPP_WEBHOOK_URL` | Endereço que a Evolution chama para entregar mensagens |
| `WHATSAPP_WEBHOOK_SEGREDO` | Segredo enviado no cabeçalho `x-crm-segredo`; o CRM recusa chamadas sem ele |
| `ARQUIVOS_DIR` | Pasta das mídias (padrão: `../crm-arquivos`, fora do projeto). Faça backup dela junto com o banco |

## Onde fica o código

| Arquivo | O que faz |
|---|---|
| `src/lib/whatsapp/evolution.ts` | Única parte que fala com a Evolution API (trocar de provedor = mudar só aqui) |
| `src/lib/whatsapp/mensagens.ts` | Conversas: encontra o cliente pelo telefone, entende o tipo da mensagem e grava na conversa certa |
| `src/lib/whatsapp/enviar.ts` | Envio de texto e mídia (com assinatura); usado pela Central e pela ficha do cliente |
| `src/lib/atendimento.ts` | Quem vê qual conversa e variáveis das respostas rápidas |
| `src/lib/arquivos.ts` | Grava e lê as mídias em `ARQUIVOS_DIR` |
| `src/app/api/whatsapp/webhook/route.ts` | Recebe as mensagens (e a mídia) |
| `src/app/api/arquivos/[...caminho]/route.ts` | Entrega as mídias só para quem está logado na organização |
| `src/app/(crm)/atendimento/` | Central de atendimento (lista, conversa, painel) e Respostas e etiquetas |
| `src/app/(crm)/whatsapp/` | Tela de conexão (QR Code) |
| `src/app/(crm)/clientes/[id]/conversa-whatsapp.tsx` | Conversa na ficha do cliente |

## Limitações atuais

- Mídias recebidas **antes** da Fase B (12/11/2026) não têm o arquivo, só a descrição ("📷 Imagem").
- Ainda não dá para gravar áudio direto no CRM: anexe um arquivo de áudio.
- Sem envio em massa (de propósito, por causa do risco de banimento).
- Na VPS, o webhook vai usar o endereço interno do Docker. Isso entra no guia de deploy.
