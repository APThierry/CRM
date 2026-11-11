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
- **Conectar o número:** na tela de configurações o CRM mostra o QR Code da instância, e você lê pelo celular.

## Por enquanto

Enquanto a integração não fica pronta, a ficha do cliente tem um botão **"Abrir no WhatsApp"** (link `wa.me`), que abre a conversa no WhatsApp Web ou no celular.

> Status: Fase 3 do [ROADMAP.md](ROADMAP.md).
