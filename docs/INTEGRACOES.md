# Relatórios e integrações (Fase E)

Esta fase cobre quatro coisas:

- **Relatórios**: desempenho por atendente, vendas e funil, turmas e certificados.
- **Exportação**: planilhas CSV que abrem no Excel e no Google Planilhas.
- **Google Agenda**: um link de assinatura por pessoa.
- **Webhooks de saída**: avisam outro sistema (n8n, Zapier, Make...) quando algo acontece no CRM.

## Relatórios (menu Relatórios)

Só administrador e gestor veem. No topo você escolhe o período ("Este mês", "Mês passado", "Últimos 90 dias", "Este ano" ou datas livres).

| Aba | O que mostra |
| --- | --- |
| **Por atendente** | Mensagens enviadas, conversas atendidas, tempo de resposta (mediana), conversas aguardando resposta agora, negócios criados, ganhos, valor ganho, perdidos e registros no histórico |
| **Vendas e funil** | Valor ganho, ticket médio, conversão, perdidos, novos negócios, dias até fechar, funil atual por etapa, e cortes por mês, curso, origem e segmento, mais os motivos de perda |
| **Turmas e certificados** | Turmas, alunos treinados, aprovação, certificados emitidos, números por curso, clientes que mais treinaram e certificados vencendo nos próximos 12 meses |

Como cada número é calculado:

- **Tempo de resposta.** Começa a contar quando o cliente escreve e para na primeira resposta de **uma pessoa**: pelo CRM ou pelo celular da empresa. Chatbot, follow-up e campanha não contam como resposta. Usamos a **mediana** (o valor do meio) para que uma mensagem recebida de madrugada não distorça a média.
- **Aguardando agora.** Conversas abertas cuja última mensagem é do cliente. É a situação deste momento, então não depende do período.
- **Vendas.** Contam pela data de fechamento: o negócio entrou na etapa "Ganho" ou "Perdido" dentro do período.
- **Turmas.** Contam pela data de início. Certificados contam pela data de emissão.

O código está em `src/lib/relatorios.ts` (cálculos) e `src/app/(crm)/relatorios/page.tsx` (tela).

## Exportar planilhas (CSV)

Use o botão **⬇ Exportar planilha** na tela Relatórios, ou abra o endereço direto (é preciso estar logado como administrador ou gestor):

| Endereço | Conteúdo |
| --- | --- |
| `/api/exportar/clientes.csv` | Todos os clientes, com o contato principal |
| `/api/exportar/negocios.csv` | Todos os negócios: etapa, valor, responsável, motivo da perda |
| `/api/exportar/certificados.csv` | Todos os certificados, com validade e situação |
| `/api/exportar/atendentes.csv?de=2026-11-01&ate=2026-11-30` | Desempenho por atendente no período |

O formato foi escolhido para abrir certo no Excel brasileiro:

- O separador é `;` e o arquivo começa com BOM, para os acentos aparecerem certos.
- Os números usam vírgula decimal.
- Uma célula que começa com `=`, `+`, `-` ou `@` ganha um apóstrofo na frente, para o Excel não executar fórmulas vindas dos dados.

O código está em `src/lib/csv.ts`.

## Google Agenda (link de assinatura)

Cada pessoa gera o **próprio link** em **Meu perfil → Minha agenda no Google Agenda**. O link traz três tipos de evento:

- **Turmas**: todas as turmas da empresa (o instrutor vê só as dele), como eventos de dia inteiro, com local, inscritos e link para a turma.
- **Tarefas**: as tarefas com data que estão em aberto.
- **WhatsApp agendado**: as mensagens que a pessoa agendou.

Para adicionar no Google Agenda:

1. Abra o Google Agenda no computador (calendar.google.com).
2. Em **Outras agendas**, clique em **+** e depois em **Do URL**.
3. Cole o link e clique em **Adicionar agenda**. A agenda aparece também no celular.

Limitações:

- **Atualização lenta.** O Google busca o link sozinho a cada poucas horas, e não dá para forçar. Uma mudança no CRM demora para aparecer lá.
- **Só leitura.** O que for criado no Google Agenda não volta para o CRM.

Segurança:

- O link funciona sem login, então é secreto.
- O banco guarda só o hash do código, como nas sessões de login.
- Gerar um link novo ou clicar em **Desligar link** faz o anterior parar de funcionar.
- Um usuário desativado perde o acesso à agenda.

Na VPS o link, e os endereços dentro dos eventos, usam sempre o `APP_URL` do `.env` (nunca os cabeçalhos da requisição). Sem `APP_URL`, a agenda responde "indisponível" em vez de inventar um endereço.

O código está em `src/lib/agenda.ts` e `src/app/api/agenda/[arquivo]/route.ts`.

## Webhooks de saída (menu Integrações)

Só o administrador cadastra webhooks. Cada webhook é um endereço (URL) mais a lista de eventos que ele recebe.

| Evento | Quando acontece |
| --- | --- |
| `cliente.criado` | Cliente cadastrado (tela de clientes ou pela conversa do WhatsApp) |
| `negocio.criado` | Negócio criado no funil |
| `negocio.etapa` | Negócio mudou de etapa |
| `negocio.ganho` | Negócio entrou numa etapa do tipo "Ganho" |
| `negocio.perdido` | Negócio entrou numa etapa do tipo "Perdido" |
| `mensagem.recebida` | Cliente mandou mensagem no WhatsApp (fotos e áudios chegam só como descrição, sem o arquivo) |
| `certificado.emitido` | Certificado emitido pela primeira vez |
| `contato.descadastrou` | Alguém respondeu SAIR às campanhas |

Ainda não disparam evento:

- Os negócios criados pela **reciclagem** (Campanhas), que são feitos em lote.
- Os clientes criados pelo **seed** (dados de exemplo).

### Para onde um webhook pode apontar

Só para **sites públicos na internet**. Sem essa regra, quem cadastra um webhook poderia fazer o servidor do CRM acessar endereços internos da VPS (banco, Evolution API, painel da hospedagem) e ler as respostas. Essa falha é conhecida como SSRF.

| Regra | Detalhe |
| --- | --- |
| Produção | Só `https://`, nas portas 443 e 8443, com certificado válido |
| Recusados | O próprio servidor (loopback), redes privadas, link-local (`169.254...`), CGNAT, IPv6 local (ULA), multicast, reservados, e IPv6 com IPv4 dentro (`::ffff:...`, NAT64, 6to4, Teredo) |
| Nomes recusados | Sem ponto (`postgres`, `evolution`) e os que terminam em `.local`, `.internal`, `.localhost`, `.lan`, `.home`, `.corp`, `.arpa`... |
| Quando confere | Ao criar, ao editar e a **cada entrega**. O nome é consultado uma vez, por nós, e a conexão usa exatamente os IPs conferidos. Mudar o DNS depois (rebinding) não adianta |
| Resposta | O CRM lê só o código (200, 500...). O corpo não é lido, gravado nem mostrado |
| Erros na tela | Frases fixas ("não consegui conectar", "respondeu 500"), sem detalhe da rede |
| Tempo | 10 segundos no total, contando a consulta do nome |
| Limites | 20 webhooks por empresa, 5 testes por minuto (30 por hora), 2000 avisos esperando (`WEBHOOKS_PENDENTES`) |

Para testar com um sistema no seu computador (n8n local, por exemplo), ponha `WEBHOOKS_PERMITIR_LOCAL="1"` no `.env.development.local`. Em produção essa variável é **ignorada**.

O CRM consulta o DNS direto no servidor de DNS da máquina, sem olhar o arquivo `hosts`. Um nome que só existe no `hosts` não funciona.

### O que o outro sistema recebe

É um `POST` com JSON:

```json
{
  "id": "cmwf...",               // id da entrega: é o mesmo nas novas tentativas
  "evento": "negocio.ganho",
  "criadoEm": "2026-11-13T21:02:07.056Z",
  "dados": { "id": "...", "titulo": "...", "valor": 2700, "cliente": { ... }, "etapa": { ... } }
}
```

Junto vêm estes cabeçalhos:

| Cabeçalho | Conteúdo |
| --- | --- |
| `X-CRM-Evento` | O nome do evento |
| `X-CRM-Entrega` | O mesmo `id` do corpo. Use para não processar o mesmo aviso duas vezes |
| `X-CRM-Timestamp` | Segundos desde 1970 |
| `X-CRM-Assinatura` | `sha256=` seguido do HMAC-SHA256, em hexadecimal, de `timestamp + "." + corpo`, usando o **segredo** do webhook |

### Conferir a assinatura (exemplo em Node.js)

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function avisoValido(corpoTexto, cabecalhos, segredo) {
  const ts = cabecalhos["x-crm-timestamp"];
  // Recusa avisos com mais de 5 minutos (evita reenvio de um aviso capturado).
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const esperado = "sha256=" + createHmac("sha256", segredo).update(`${ts}.${corpoTexto}`).digest("hex");
  const recebido = cabecalhos["x-crm-assinatura"] ?? "";
  return recebido.length === esperado.length && timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}
```

O segredo aparece na tela Integrações, em **Segredo de assinatura**. No n8n, use um nó "Crypto" (HMAC SHA256) ou um nó de código com a função acima.

### Entrega e novas tentativas

O CRM **não espera** o outro sistema. O aviso entra numa fila (tabela `EntregaWebhook`) e o relógio entrega a cada 30 s.

| Situação | O que acontece |
| --- | --- |
| Resposta `2xx` | Entregue |
| Erro, outra resposta ou mais de 10 s sem responder | Tenta de novo depois de 1 min, 5 min, 30 min, 2 h e 6 h. Depois da 6ª tentativa fica como **Falhou** |
| Falhou | Na tela Integrações, o botão **reenviar** coloca o aviso de novo na fila |
| Redirecionamento (`3xx`) | Não é seguido e conta como erro. Use o endereço final |
| Webhook desligado | Não recebe avisos novos |
| Várias empresas | Cada rodada do relógio (até 20 entregas) é dividida entre as empresas, em rodízio: a fila cheia de uma não atrasa as outras |
| Aviso entregue ou desistido | É apagado depois de 30 dias |

A tela Integrações mostra os últimos 10 avisos de cada webhook. Também tem o botão **Enviar teste**, que manda o evento `teste` na hora e mostra o código da resposta.

O código está em `src/lib/webhooks/` (`eventos.ts` com a lista, `disparar.ts` com a fila, a entrega e os dados, `destino.ts` com as regras de endereço e `requisicao.ts` com a conexão) e em `src/app/(crm)/integracoes/`.

## Testar

Com o banco local ligado:

```bash
npx tsx --conditions=react-server scripts/testar-integracoes.mts
```

O script usa um banco descartável (não toca nos seus dados) e faz 33 verificações:

- formato do CSV;
- formato do `.ics`;
- tempo de resposta e mediana;
- webhooks, com um servidor de mentira: assinatura, novas tentativas, desistência, webhook desligado;
- link da agenda;
- relatórios conferidos com o banco.

No fim, apaga o banco de teste. A segurança dos webhooks (endereços internos, rebinding, tempo, corpo da resposta) está em `scripts/testar-seguranca.mts` (veja [MULTIEMPRESA.md](MULTIEMPRESA.md)).
