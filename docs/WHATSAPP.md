# Integração com WhatsApp

O CRM vai falar com o WhatsApp por meio de um **provedor**. O código terá uma camada única (`enviarMensagem`, `receberWebhook`), então dá para trocar de provedor sem reescrever o sistema.

## As duas opções

| | Evolution API (não oficial) | API oficial da Meta (Cloud API) |
|---|---|---|
| Como funciona | Conecta um número comum lendo um QR Code, como o WhatsApp Web | Número registrado no WhatsApp Business Platform |
| Onde roda | Na sua VPS (Docker) | Nos servidores da Meta |
| Custo | Grátis (só a VPS) | Cobrança por mensagem iniciada pela empresa (templates) |
| Burocracia | Nenhuma | Conta Meta Business verificada e templates aprovados |
| Risco | O número **pode ser banido**, principalmente com envios em massa | Estável e permitido |
| Bom para | Começar rápido, testar, poucos envios | Produção e lembretes em escala |

## Recomendação

1. **Desenvolvimento e começo:** Evolution API na VPS com um número de testes, para ver tudo funcionando rápido.
2. **Produção com muitos clientes:** migrar para a API oficial, principalmente para os lembretes de reciclagem em massa.

## Como o fluxo funciona

- **Enviar:** o CRM chama a API do provedor com o número e o texto, e salva em `MensagemWhatsapp` com `direcao = SAIDA`.
- **Receber:** o provedor chama uma URL do CRM (*webhook*, por exemplo `/api/whatsapp/webhook`) a cada mensagem nova. O CRM procura o cliente pelo telefone e salva com `direcao = ENTRADA`.

> Status: ainda não implementado. Veja [ROADMAP.md](ROADMAP.md).
