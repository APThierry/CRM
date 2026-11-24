# Fase F: várias empresas no mesmo CRM (plano)

> **Status: F1 e F2 prontas** (base multiempresa e cadastro público). F3 e F4 ainda são plano. Tudo vem antes da instalação na VPS: é mais fácil mudar agora do que depois, com dados reais lá dentro.

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
- **Fim da "empresa padrão":** `getOrganizacaoPadrao` foi apagada. O "primeiro acesso" só aparece numa instalação nova (uma empresa só e ninguém com senha; em produção, só com o `SETUP_TOKEN`, veja "Segurança"). As outras empresas entram pelo script `scripts/criar-empresa.mts` e, na F2, pela página de cadastro.
- **Teste de isolamento:** um script cria duas empresas e confere que uma não enxerga nada da outra (telas, exportação CSV, agenda, arquivos de mídia, webhooks, relatórios, WhatsApp).

#### Como ficou (F1)

| Parte | Onde |
| --- | --- |
| Situação da empresa (`situacao`, `testeAte`) e as regras "pode entrar?" | `prisma/schema.prisma`, `src/lib/empresas/situacao.ts` |
| Empresa nova com funil, etiquetas, respostas, automação e instância | `src/lib/empresas/preparar.ts` (o seed usa a mesma função), `src/lib/empresas/criar.ts` |
| Qual número de WhatsApp é de qual empresa | `src/lib/whatsapp/instancia.ts`. Todas as funções de `evolution.ts` recebem a instância |
| Webhook do WhatsApp ignora instância desconhecida | `src/app/api/whatsapp/webhook/route.ts` |
| Empresa suspensa ou com teste vencido | Login recusa com aviso; a sessão aberta deixa de valer; agenda `.ics` some; relógio não envia agendadas, campanhas nem webhooks dela; chatbot e aviso de fora do horário não respondem. As mensagens recebidas continuam gravadas e o SAIR continua valendo. Quando ela volta, o que ficou na fila segue |
| Criar empresa pelo terminal | `scripts/criar-empresa.mts` (mostra um link para o administrador escolher a senha) |
| Dar acesso pelo terminal | `scripts/definir-acesso.mts` (link para uma conta que existe, ou cria um administrador numa empresa) |

Para mudar a situação de uma empresa, enquanto o painel do dono (F4) não existe, use o Prisma Studio (`npx prisma studio`), tabela `Organizacao`, coluna `situacao`.

**Teste de isolamento** (com o banco local ligado e o build atual):

```bash
npm run build
npx tsx --conditions=react-server scripts/testar-multiempresa.mts
```

O script cria um banco descartável com **duas empresas** e liga o CRM compilado numa porta livre. Não toca nos seus dados. Faz 142 verificações:

- **telas:** abre 27 telas com cada empresa e exige status 200, o conteúdo próprio e nada da outra;
- **ids trocados:** páginas com o id da outra empresa não abrem (e abrem para o dono);
- **planilhas, agenda e arquivos:** um arquivo de verdade abre para o dono e dá 404 para a outra empresa;
- **gravações:** chama as Server Actions de verdade, com sessão, usando ids da outra empresa (53 tentativas). Nada muda nas duas empresas, e a mesma chamada feita pelo dono funciona;
- **papéis:** vendedor não mexe em turmas, certificados nem na conexão do WhatsApp;
- **WhatsApp:** cada número entrega só na própria empresa;
- **empresa suspensa:** login, sessão, agenda, actions, chatbot e as funções verdadeiras do relógio.

O que ele **não** cobre: as actions que não recebem id de nada (criar cliente, criar campanha, salvar perfil...), porque usam sempre a empresa da sessão, o teste de campanha (`enviarTeste`, que não grava nada) e as respostas do navegador (só o servidor é testado).

### F2. Cadastro público e e-mail ✅

- **Página "Criar conta"** (`/cadastro`): nome da empresa, ramo, nome da pessoa, e-mail e aceite dos termos.
- **Confirmação por e-mail:** a conta só nasce depois que a pessoa abre o link recebido e escolhe a senha.
  - Junto vem o **"Esqueci minha senha"**, que já estava no roteiro.
- **Proteção contra abuso:**
  - limite de cadastros por IP;
  - campo escondido contra robôs;
  - e-mail confirmado antes de conectar o WhatsApp;
  - **campanhas só liberadas depois que você aprovar a empresa** (é o que mais pode dar problema com spam).
- **Período de teste:** ao acabar, a empresa fica suspensa até você ativar.
- **Primeiros passos:** depois do cadastro, uma tela guia a pessoa: escolher o ramo, ver o funil sugerido, conectar o WhatsApp e convidar a equipe.

#### Como ficou (F2)

Decisões: o nome do produto vem de `APP_NOME` (padrão "CRM"), o teste dura 14 dias (`CADASTRO_DIAS_TESTE`) e o dono do sistema recebe um e-mail a cada cadastro (`DONO_EMAIL`).

| Tela | Endereço | O que faz |
| --- | --- | --- |
| Criar conta | `/cadastro` | Empresa, ramo, nome, WhatsApp (opcional), e-mail e aceite dos termos. Guarda o pedido e manda o link; **não pede senha e não cria nada ainda** |
| Confirmar e-mail | `/confirmar?codigo=...` | Link do e-mail (vale 48 h, uma vez só). A pessoa escolhe a senha; aí a empresa é criada, em teste, e ela já entra. Abrir o link não gasta, porque alguns programas de e-mail abrem os links sozinhos |
| Convite | `/convite?codigo=...` | Link do convite feito em Usuários (vale 3 dias, uma vez só). A pessoa escolhe a senha e entra na empresa |
| Esqueci minha senha | `/senha/esqueci` | Manda o link de senha nova. A resposta é sempre a mesma, exista ou não a conta |
| Senha nova | `/senha/nova?codigo=...` | Link do e-mail (vale 1 h, uma vez só). Troca a senha, desconecta os outros aparelhos e entra |
| Termos e privacidade | `/termos`, `/privacidade` | **Texto provisório**: precisa ser escrito/revisado por vocês, de preferência com um advogado. Ao trocar o texto, troque `TERMOS_VERSAO` em `src/lib/cadastro.ts` |
| Primeiros passos | `/primeiros-passos` | Lista que se marca sozinha: WhatsApp, horário e chatbot, equipe, primeiro cliente, primeira mensagem |

Regras:

- **Ninguém define a senha de outra pessoa.** Cadastro, convite e link de senha vão para o e-mail, e quem recebe escolhe a senha. Quem digitar o e-mail de outra pessoa não ganha acesso a nada.
- **Nada segura um e-mail.** Pedidos de cadastro (`CadastroPendente`) e convites (`Convite`) não são contas: podem existir vários para o mesmo e-mail, vencem sozinhos, e a conta é de quem abrir o link primeiro. Uma conta antiga, nunca confirmada, nunca usada e sem nenhum dado é apagada quando o e-mail é pedido de novo; com qualquer dado, nada é apagado e o dono do e-mail assume pelo "Esqueci minha senha".
- **As telas não revelam quem tem conta.** Criar conta, esqueci a senha, convite e entrar respondem igual com ou sem conta, e o envio acontece depois da resposta. Se já existir conta, quem fica sabendo é o dono do e-mail. Dentro da própria empresa, o CRM diz que a pessoa já está na lista.
- **Proteção contra robôs:**
  - campo escondido: quem preenche recebe "deu certo", mas nada é criado;
  - o formulário não pode ser enviado em menos de 3 segundos;
  - no máximo 5 cadastros por hora do mesmo IP (sem `PROXY_IP_HEADER`, 60 por hora no site todo) e 10 por dia para o mesmo e-mail;
  - no máximo 10 pedidos de senha nova por hora do mesmo IP, e, para o mesmo e-mail, 1 a cada 5 minutos e 5 por hora. Pedir outro link não invalida o anterior; trocar a senha invalida todos;
  - convites: 40 por dia por empresa e 6 por dia para o mesmo endereço. O e-mail não leva endereços de sites digitados no nome da empresa.
- **Campanhas:** empresa cadastrada pela página nasce com `campanhasLiberadas = false`. Ela monta e revisa campanhas, mas não inicia nem manda teste, e o relógio ignora. Para liberar, enquanto o painel do dono (F4) não existe: Prisma Studio, tabela `Organizacao`, coluna `campanhasLiberadas`.
- **Período de teste:** uma faixa no topo mostra quantos dias faltam. Quando acaba, a empresa fica bloqueada (regra da F1) até você mudar a `situacao` para `ATIVA`.
- **Nome da empresa:** o menu mostra o nome da empresa de quem está logado (antes era fixo "Brigada MG"). A resposta rápida padrão usa `{empresa}`.

**E-mail na VPS:** preencha `SMTP_HOST`, `SMTP_PORTA`, `SMTP_USUARIO`, `SMTP_SENHA`, `EMAIL_REMETENTE`, `APP_URL` e `DONO_EMAIL` (veja `.env.example`). Para os e-mails não caírem no spam, o serviço escolhido vai pedir para configurar SPF e DKIM no DNS do domínio. No seu computador, sem `SMTP_HOST`, os e-mails aparecem no terminal do `npm run dev`, com o link.

O código está em:

- `src/lib/email.ts`: envio;
- `src/lib/conta.ts`: links e textos dos e-mails;
- `src/lib/cadastro.ts`: ramos e versão dos termos;
- `src/lib/limite.ts`: limite de tentativas;
- `src/lib/campanhas/liberacao.ts`: liberação das campanhas;
- `src/app/(publico)/`: as telas.

**Teste** (com o banco local ligado):

```bash
npx tsx --conditions=react-server scripts/testar-cadastro.mts
```

O script usa um banco descartável e faz 54 verificações: limites, e-mail válido, cadastro (nada nasce antes da confirmação), contas antigas não confirmadas, links (uma vez só, vencem, um tipo não serve para o outro, cliques ao mesmo tempo), convites, teto de usuários, campanhas bloqueadas até aprovar e a faxina.

### Segurança (revisão antes da VPS) ✅

O que protege o CRM quando ele ficar na internet. As variáveis estão em `.env.example`.

**Login** (`src/lib/login-protecao.ts`). Em 15 minutos, contando só as senhas erradas: 5 por IP + e-mail, 30 por IP e 20 por e-mail somando todos os IPs. A tentativa é contada antes de conferir a senha, então uma rajada não passa. Quem já entrou na conta naquele aparelho tem um cookie e uma contagem só dele (10), que ninguém de fora gasta.

> **A troca:** durante um ataque vindo de muitos IPs contra um e-mail, o dono continua entrando nos aparelhos em que já entrou. Num aparelho **novo**, ele espera a vez (o bloqueio não se renova com pedidos recusados) ou usa "Esqueci minha senha", que já entra. O cookie vale para a última conta que entrou naquele navegador.

Contas inexistentes, desativadas ou não confirmadas fazem a mesma conta (hash falso) e recebem a mesma frase. No máximo 2 contas de senha ao mesmo tempo, com fila de 40. Os limites ficam na memória: reiniciar o CRM zera.

**Primeiro acesso em produção** (`src/lib/primeiro-acesso.ts`). Só com `SETUP_TOKEN` (mínimo de 16 caracteres, 5 tentativas por IP a cada 15 min). Conta apenas empresas que não vieram da página Criar conta, então alguém se cadastrar antes não atrapalha. Há sempre o outro caminho, pelo terminal do servidor:

```bash
# conta que já existe (ex.: o administrador da empresa do seed)
npx tsx --conditions=react-server scripts/definir-acesso.mts email@empresa.com
# criar um administrador numa empresa que já existe
npx tsx --conditions=react-server scripts/definir-acesso.mts email@empresa.com --empresa brigada-mg --nome "Nome"
```

**Links** (`src/lib/url.ts`). Em produção, só `APP_URL` (https). Sem ela, o CRM liga e funciona, mas não gera links e avisa no terminal. Sem SMTP em produção, o link não aparece no terminal. As páginas dos links mandam `Referrer-Policy: no-referrer` (por isso, com o JavaScript do navegador desligado, o formulário delas não é aceito).

**IP de quem acessa.** Só o cabeçalho de `PROXY_IP_HEADER`, que o Caddy sobrescreve (veja [DEPLOY-VPS.md](DEPLOY-VPS.md)). O `X-Forwarded-For` comum é ignorado, porque pode ser inventado. Sem a variável, valem os limites por e-mail e os gerais.

**Empresa não aprovada.** Até 50 mensagens novas por dia, 200 agendadas esperando, 1 GB de arquivos (veja [WHATSAPP.md](WHATSAPP.md)).

**Webhooks.** Só para sites públicos (veja [INTEGRACOES.md](INTEGRACOES.md)).

**Papéis.** Conectar o WhatsApp: administrador e gestor. Turmas, inscrições, presença, resultado e certificados: administrador, gestor e instrutor (vendedor vê, mas não altera). As actions conferem; a tela só esconde os botões.

**Tamanho dos envios.** O Next tem **um** limite para todas as Server Actions (17 MB, por causa dos anexos). O `src/proxy.ts` recusa antes: 64 KB nas telas públicas, 1 MB nas internas e 17 MB só em `/atendimento`. É uma segunda barreira, não a principal:

- o servidor ainda recebe os bytes antes de responder 413;
- em `/atendimento`, quem inventar um cookie consegue mandar 17 MB antes de ser recusado pela falta de sessão;
- quem inventar o cabeçalho interno `X-Action-Forwarded` e não declarar o tamanho volta ao limite geral de 17 MB (o Caddy remove esse cabeçalho).

Por isso o limite de verdade é o do Caddy (DEPLOY-VPS.md).

**Teste** (com o banco local ligado e o build atual):

```bash
npm run build
npx tsx --conditions=react-server scripts/testar-seguranca.mts
```

O script usa um banco descartável, o CRM compilado em modo de produção, e um e-mail e uma Evolution API de mentira neste computador. Faz 144 verificações: SSRF e rebinding, primeiro acesso, login (rajada, ataque distribuído, dono bloqueado por terceiro, tempo de resposta), links com Host forjado, cadastro e convites, teto de envios ao mesmo tempo, rodízio do relógio, certificados ao mesmo tempo, tamanhos, espaço e instâncias.

O que ele **não** cobre: o Caddy, um servidor SMTP e uma Evolution API de verdade, e a entrega de um webhook por HTTPS até o fim (o teste entrega por HTTP no próprio computador).

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
