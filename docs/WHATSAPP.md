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

## Automação (menu Automação)

Tudo começa **desligado**. Só administrador e gestor mudam as configurações.

- **Horário de atendimento:** dias e horas de cada dia da semana. Com o aviso ligado, quem escreve fora do horário recebe a mensagem automática (no máximo uma vez a cada 12 horas por conversa). `{horario}` vira algo como "seg a sex, 08:00 às 18:00; sáb, 08:00 às 12:00".
- **Chatbot de boas-vindas:** em conversa nova (ou parada há mais de X horas) e **na fila**, o bot manda a mensagem de boas-vindas com as opções numeradas. O cliente responde com o número (ou o começo do nome da opção). Cada opção pode responder um texto, colocar uma etiqueta e passar a conversa para um atendente. Resposta que o bot não entende: ele pergunta de novo uma vez; na segunda, avisa que um atendente vai continuar. Quando alguém responde ou clica em **Assumir**, o bot sai da conversa.
- **Agendar mensagem:** no painel da direita da conversa, em *Follow-up e agendamento*. A mensagem sai assinada por quem agendou.
- **Sequências de follow-up:** mensagens com tempo de espera (ex.: 1, 3 e 7 dias depois de iniciar). Iniciadas no painel da conversa. Se o cliente responder, o resto é cancelado. Com o horário de atendimento ligado, uma mensagem que cairia com a empresa fechada vai para a próxima abertura. Iniciar outra sequência na mesma conversa cancela a anterior.
- **Fila de envios:** na tela Automação, o que ainda vai sair e o que deu erro (ex.: WhatsApp desconectado). Mensagens com erro não são reenviadas sozinhas.
- **Mensagens automáticas** aparecem na conversa com "🤖 automática"; as agendadas, com o nome de quem agendou e "(agendada)".
- **O relógio:** o próprio servidor do CRM confere a cada 30 segundos se há mensagem agendada vencida (`src/instrumentation.ts` liga o relógio). Com o CRM desligado, nada sai; quando ele volta, envia o que ficou atrasado.

### Testar sem mandar mensagem para ninguém

Crie o arquivo `.env.development.local` (vale só para o `npm run dev`) com:

```
WHATSAPP_SIMULAR_ENVIO="1"
```

Com isso, tudo que o CRM "enviaria" fica registrado na conversa, mas nada sai para o WhatsApp. A tela Automação mostra um aviso amarelo enquanto o modo simulação está ligado. Apague o arquivo (e reinicie o `npm run dev`) para voltar a enviar de verdade.

## Campanhas (menu Campanhas)

Só administrador e gestor. Uma campanha manda **uma mensagem para cada cliente** do público escolhido, devagar, para proteger o número da empresa.

### Proteções (ritmo "conservador", escolhido em 13/11/2026)

| Regra | Valor |
|---|---|
| Intervalo entre mensagens | 60 a 120 segundos, sorteado |
| Pausa longa | 10 minutos a cada 30 mensagens |
| Limite diário | 150 mensagens (todas as campanhas somadas) |
| Quando envia | Só no horário de atendimento (tela Automação), mesmo com o aviso de fora do horário desligado |
| Uma por vez | Só uma campanha envia por vez; as outras esperam como "Agendada" |
| Texto | Variações `{Olá\|Oi\|Bom dia}` sorteadas por cliente, e o convite *"Para não receber mais estas mensagens, responda SAIR."* sempre no fim |
| Pausa automática | WhatsApp desconectado, ou 3 erros seguidos |

Os valores ficam em `src/lib/campanhas/ritmo.ts`.

### Quem recebe

- Clientes cadastrados com WhatsApp (o contato principal; senão, o WhatsApp do cliente). Uma mensagem por cliente.
- Filtros: segmento, cidade, etiqueta da conversa, curso já feito e certificados vencendo (60 dias) ou vencidos.
- Ficam de fora: quem pediu para sair, quem não tem WhatsApp e números repetidos. A tela Nova campanha mostra quem fica de fora e por quê.

### Passo a passo

1. **Campanhas → + Nova campanha**: escolha o público (a lista ao lado mostra quem recebe e o tempo estimado) e escreva a mensagem.
2. **Criar rascunho**: nada é enviado ainda.
3. Na campanha: confira a prévia, use **Enviar teste** para o seu número (sai com *[TESTE]*), tire quem não deve receber.
4. **▶ Iniciar** (ou escolha "Começar em" para agendar). A página se atualiza sozinha a cada 15 s enquanto envia.
5. Acompanhe: na fila, enviadas, entregues, lidas, responderam, erros e fora. **⏸ Pausar** e **▶ Retomar** a qualquer momento; **Cancelar** tira quem ainda não recebeu.

### Descadastro (SAIR)

Se o cliente responder só "SAIR" (ou "parar", "pare", "cancelar", "stop", "remover"), o CRM:
- grava o número na lista de quem saiu (vale para todas as campanhas futuras);
- tira o número das campanhas que ainda não chegaram nele;
- responde confirmando, uma vez;
- não manda o chatbot.

Frases como "quero sair da turma de sábado" **não** descadastram.

### Reciclagem (o gestor aprova)

Na tela Campanhas, o bloco **🔁 Reciclagem** lista os clientes com certificados que vencem nos próximos X dias (padrão: 60) ou que venceram há até 30 dias e ainda não foram avisados. Em **Preparar campanha de reciclagem**, o CRM:
- cria **um negócio de reciclagem no funil** para cada curso de cada cliente (na primeira etapa, com nº de alunos, valor pelo preço do curso e previsão na data do vencimento);
- registra uma nota no histórico do cliente;
- monta a campanha como **rascunho**, com `{curso}`, `{vencimento}` e `{cliente}` preenchidos;
- marca os certificados como avisados, para não entrarem de novo.

Nada é enviado até o gestor revisar e clicar em **Iniciar**. A antecedência e o texto ficam em *Configurar reciclagem*.

### Status de entregue e lida

O CRM pede à Evolution API também o evento `MESSAGES_UPDATE` (avisos de entregue e lida). O webhook é atualizado sozinho quando o servidor do CRM liga. Se a Evolution API estiver desligada nessa hora, clique em **Conectar** na tela WhatsApp depois (isso reconfigura o webhook).

### Testar

```bash
npx tsx --conditions=react-server scripts/testar-campanhas.mts
```

Roda 25 verificações no banco local **em modo simulação** (ritmo, horário, envio, entregue/lida, resposta, SAIR, reciclagem) e apaga tudo o que criou no fim.

## Variáveis do CRM (`.env`)

| Variável | Para quê |
|---|---|
| `EVOLUTION_API_URL` | Endereço da Evolution API |
| `EVOLUTION_API_KEY` | Chave de acesso (igual à `AUTHENTICATION_API_KEY` da Evolution) |
| `EVOLUTION_INSTANCIA` | Nome da conexão (uma por organização) |
| `WHATSAPP_WEBHOOK_URL` | Endereço que a Evolution chama para entregar mensagens |
| `WHATSAPP_WEBHOOK_SEGREDO` | Segredo enviado no cabeçalho `x-crm-segredo`; o CRM recusa chamadas sem ele |
| `ARQUIVOS_DIR` | Pasta das mídias (padrão: `../crm-arquivos`, fora do projeto). Faça backup dela junto com o banco |
| `WHATSAPP_SIMULAR_ENVIO` | `1` = modo simulação: nada sai para o WhatsApp (só para testes) |
| `AUTOMACAO_DESLIGADA` | `1` = não liga o relógio de envios agendados neste servidor |

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
| `src/lib/automacao/` | Horário de atendimento, chatbot (`ao-receber.ts`), agendamento e o relógio de envios |
| `src/instrumentation.ts` | Liga o relógio quando o servidor sobe |
| `src/app/(crm)/automacao/` | Tela Automação |
| `src/app/(crm)/whatsapp/` | Tela de conexão (QR Code) |
| `src/lib/campanhas/ritmo.ts` | Regras de proteção (intervalo, pausa, limite, variações, SAIR) |
| `src/lib/campanhas/motor.ts` | Envia a próxima mensagem de campanha (chamado pelo relógio) |
| `src/lib/campanhas/publico.ts` | Monta o público e tira quem saiu |
| `src/lib/campanhas/status.ts` | Entregue/lida, "respondeu" e descadastro |
| `src/lib/campanhas/reciclagem.ts` | Lista de reciclagem e preparação da campanha com negócios no funil |
| `src/app/(crm)/campanhas/` | Telas de campanhas |
| `src/app/(crm)/clientes/[id]/conversa-whatsapp.tsx` | Conversa na ficha do cliente |

## Limitações atuais

- Mídias recebidas **antes** da Fase B (12/11/2026) não têm o arquivo, só a descrição ("📷 Imagem").
- Ainda não dá para gravar áudio direto no CRM: anexe um arquivo de áudio.
- Campanhas só com texto (sem foto ou PDF) e com o ritmo fixo do arquivo `ritmo.ts` (sem tela para mudar).
- Os avisos de entregue/lida só são guardados para mensagens de campanha.
- Na VPS, o webhook vai usar o endereço interno do Docker. Isso entra no guia de deploy.
