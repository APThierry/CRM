# Skills do projeto

Instruções extras que o Claude Code carrega ao trabalhar neste repositório.

## Origem

Copiadas de [softaworks/agent-toolkit](https://github.com/softaworks/agent-toolkit) (licença MIT, ver `LICENSE-agent-toolkit`), commit `3027f20`, em 12/11/2026.

| Skill | Para quê |
|---|---|
| requirements-clarity | Esclarecer requisitos antes de programar |
| database-schema-designer | Desenhar e revisar o modelo do banco |
| react-dev, react-useeffect | Boas práticas de React com TypeScript |
| design-system-starter | Padronizar cores, tipografia e componentes |
| qa-test-planner | Planos de teste e relatórios de bug |
| naming-analyzer, reducing-entropy | Nomes melhores e código mais enxuto |
| dependency-updater | Atualizar dependências com segurança |
| lesson-learned | Tirar lições das mudanças recentes |
| commit-work | Commits bem escritos |
| mermaid-diagrams, c4-architecture | Diagramas da arquitetura |
| crafting-effective-readmes | Documentação |
| session-handoff | Passar o contexto de uma sessão para outra |

## Deixadas de fora

- **gepetto**: envia o plano do projeto para o Gemini e o Codex (com o Gemini em modo `yolo`). Não queremos o código do CRM indo para serviços externos sem controle.
- **codex, gemini, perplexity**: dependem de outras IAs e chaves externas.
- **mui**: o projeto usa Tailwind, não Material-UI.
- Utilitárias e profissionais sem relação com o CRM (jira, datadog, meme-factory, e-mails etc.).

## Atualizar

Baixe o repositório de novo, revise o que mudou nos scripts (`scripts/`) e copie por cima a pasta de cada skill.
