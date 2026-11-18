# Fase F: várias empresas no mesmo CRM (plano)

> **Status: F1 pronta** (base multiempresa). F2, F3 e F4 ainda são plano. Tudo vem antes da instalação na VPS: é mais fácil mudar agora do que depois, com dados reais lá dentro.

## O que foi decidido

| Pergunta | Decisão |
| --- | --- |
| Quem vai usar | **Qualquer negócio**, não só escolas de treinamento. Turmas e certificados viram módulos que cada empresa liga ou desliga. |
| Como a empresa entra | **Ela mesma se cadastra**, numa página pública "Criar conta", com período de teste. |
| Endereço | **Um endereço só** para todas (ex.: `crm.seudominio.com.br`). O e-mail da pessoa diz de qual empresa ela é. |
| Cobrança | **Por fora**, por enquanto (Pix, boleto). No CRM você só suspende ou reativa uma empresa e vê quanto cada uma usa. |

## Como era antes da F1

O banco já separava tudo por empresa: cada cliente, conversa, negócio, turma, campanha e webhook tem a organização dona, e as telas filtram pela empresa de quem está logado. Os arquivos de mídia também já ficam numa pasta por empresa.

O que prendia o sistema a uma empresa só (a F1 resolveu tudo, menos o que é das próximas etapas):

| Onde | Problema |
| --- | --- |
| `src/lib/org.ts` (`getOrganizacaoPadrao`) | Usa a empresa do `.env` (`ORG_SLUG=brigada-mg`) quando não há login. |
| `src/app/(publico)/login/actions.ts` | O "primeiro acesso" cria o administrador sempre na empresa do `.env`. |
| `src/lib/whatsapp/evolution.ts` | Existe **um** número de WhatsApp (`EVOLUTION_INSTANCIA`) para o servidor todo. |
| `src/app/api/whatsapp/webhook/route.ts` | Uma mensagem de instância desconhecida cai na empresa padrão. Com várias empresas, uma poderia receber mensagem da outra. |
| `prisma/seed.ts` | Funil, cursos e configurações iniciais só são criados pelo seed da Brigada. Empresa nova nasce vazia. |
| Menu e telas | Turmas, certificados e "cursos" aparecem para todo mundo. **(F3)** |
| E-mail | O CRM não manda e-mail nenhum. O cadastro público precisa confirmar o e-mail (e "esqueci minha senha" também). **(F2)** |

## Etapas

Cada etapa termina testada, com commit, antes de começar a próxima.

### F1. Base multiempresa (sem mudar nada para a Brigada) ✅

- **Situação da empresa:** `EM_TESTE`, `ATIVA` ou `SUSPENSA`, com a data de fim do teste.
  - Empresa suspensa: ninguém entra (aparece um aviso), e o relógio para chatbot, follow-up, agendamentos, campanhas e webhooks dela.
- **Um WhatsApp por empresa:** a instância na Evolution passa a ter o nome da empresa (ex.: `org-<id>`), guardado em `ConfiguracaoWhatsapp`.
  - Todas as funções de `evolution.ts` recebem a instância em vez de usar a do `.env`.
  - O webhook **recusa** mensagem de instância desconhecida, em vez de jogar na empresa padrão.
- **Empresa nova com o básico pronto:** uma função `criarEmpresa()` cria o funil padrão, as configurações de automação, o horário de atendimento e o primeiro administrador. O seed passa a usar a mesma função.
- **Fim da "empresa padrão":** `getOrganizacaoPadrao` foi apagada. O "primeiro acesso" só aparece numa instalação nova (uma empresa só e ninguém com senha). As outras empresas entram pelo script `scripts/criar-empresa.mts` e, na F2, pela página de cadastro.
- **Teste de isolamento:** um script cria duas empresas e confere que uma não enxerga nada da outra (telas, exportação CSV, agenda, arquivos de mídia, webhooks, relatórios, WhatsApp).

#### Como ficou (F1)

| Parte | Onde |
| --- | --- |
| Situação da empresa (`situacao`, `testeAte`) e as regras "pode entrar?" | `prisma/schema.prisma`, `src/lib/empresas/situacao.ts` |
| Empresa nova com funil, etiquetas, respostas, automação e instância | `src/lib/empresas/preparar.ts` (o seed usa a mesma função), `src/lib/empresas/criar.ts` |
| Qual número de WhatsApp é de qual empresa | `src/lib/whatsapp/instancia.ts`. Todas as funções de `evolution.ts` recebem a instância |
| Webhook do WhatsApp ignora instância desconhecida | `src/app/api/whatsapp/webhook/route.ts` |
| Empresa suspensa ou com teste vencido | Login recusa com aviso; a sessão aberta deixa de valer; agenda `.ics` some; relógio não envia agendadas, campanhas nem webhooks dela; chatbot e aviso de fora do horário não respondem. As mensagens recebidas continuam gravadas e o SAIR continua valendo. Quando ela volta, o que ficou na fila segue |
| Criar empresa pelo terminal | `scripts/criar-empresa.mts` (mostra a senha provisória uma vez) |

Para mudar a situação de uma empresa, enquanto o painel do dono (F4) não existe, use o Prisma Studio (`npx prisma studio`), tabela `Organizacao`, coluna `situacao`.

**Teste de isolamento** (com o banco e o CRM ligados):

```bash
npx tsx --conditions=react-server scripts/testar-multiempresa.mts
```

O script faz 35 verificações:

- cria uma segunda empresa e confere o que ela recebe pronta;
- abre as telas, a exportação CSV e os arquivos de mídia com a sessão de cada empresa e confere que uma não vê nada da outra;
- manda mensagens pelo webhook do WhatsApp (número da empresa nova e número desconhecido);
- suspende, vence o teste e reativa a empresa, conferindo login, relógio e chatbot.

No fim, apaga o que criou.

### F2. Cadastro público e e-mail

- **Página "Criar conta"** (`/cadastro`): nome da empresa, ramo, nome da pessoa, e-mail, senha e aceite dos termos.
- **Confirmação por e-mail:** a conta só é liberada depois que a pessoa clica no link recebido.
  - Junto vem o **"Esqueci minha senha"**, que já estava no roteiro.
- **Proteção contra abuso:**
  - limite de cadastros por IP;
  - campo escondido contra robôs;
  - e-mail confirmado antes de conectar o WhatsApp;
  - **campanhas só liberadas depois que você aprovar a empresa** (é o que mais pode dar problema com spam).
- **Período de teste:** ao acabar, a empresa fica suspensa até você ativar.
- **Primeiros passos:** depois do cadastro, uma tela guia a pessoa: escolher o ramo, ver o funil sugerido, conectar o WhatsApp e convidar a equipe.

### F3. Módulos por empresa

- Cada empresa liga ou desliga **Turmas e certificados**. Desligado:
  - some do menu;
  - some a aba do relatório;
  - some o evento `certificado.emitido` dos webhooks;
  - some a agenda de turmas.
- **"Cursos" vira "Produtos e serviços"** quando o módulo de turmas está desligado (carga horária e validade só aparecem com ele ligado).
- **Funil sugerido por ramo**, por exemplo:
  - treinamento: Lead, Proposta, Negociação, Ganho, Perdido;
  - serviços: Novo contato, Orçamento enviado, Fechado, Perdido.

  Dá para editar depois.

### F4. Painel do dono do sistema

- Uma área só sua (`/dono`), separada do papel ADMIN de cada empresa. Quem é dono fica definido no servidor, não por uma tela.
- **Lista de empresas:** situação, data de cadastro, fim do teste, atendentes, WhatsApp conectado, mensagens no mês e espaço em disco.
- **Ações:** ativar, suspender, prorrogar teste e liberar campanhas.
- **Saída de uma empresa:** exportar os dados dela e apagar a empresa (com confirmação).

## Decisões que ficam para cada etapa

- **Serviço de e-mail (F2).** É preciso um serviço de envio: Brevo, Resend, Amazon SES ou o SMTP do provedor do domínio. Todos têm plano grátis ou barato para o começo.
- **Duração do teste (F2).** Sugestão: 14 dias.
- **Termos de uso e política de privacidade (F2).**
  - Com outras empresas guardando os dados dos clientes delas no seu servidor, você passa a ser "operador" desses dados (LGPD).
  - O texto precisa vir de vocês, de preferência revisado por um advogado. O CRM só mostra o texto e guarda o aceite.
- **Um e-mail, uma empresa.** No endereço único, cada e-mail pertence a uma empresa só. Quem trabalha em duas usa dois e-mails. Dá para mudar depois, se for preciso.

## Depois da Fase F

Aí vem a instalação na VPS ([DEPLOY-VPS.md](DEPLOY-VPS.md)). A recomendação de máquina para começar continua: 2 vCPU, 4 GB de RAM e 80 GB de SSD. O que pesa é a quantidade de **números de WhatsApp conectados**: cerca de 3 a 5 empresas nessa máquina, e dá para aumentar a VPS depois.
