# Guia rápido de Git

O Git guarda o histórico de todas as mudanças do projeto. Dá para voltar atrás, ver o que mudou e trabalhar em equipe.

## Conceitos

- **Commit**: uma "foto" do projeto com uma mensagem explicando a mudança.
- **Branch**: uma linha de trabalho separada. A `main` é a versão estável.
- **Remoto (GitHub)**: cópia do projeto na internet. É de lá que a VPS baixa o código.

## Uso no dia a dia

```bash
git status                     # o que mudou?
git add .                      # marca tudo para o próximo commit
git commit -m "Adiciona tela de clientes"
git log --oneline              # histórico
```

## Trabalhar numa funcionalidade nova

```bash
git checkout -b tela-clientes  # cria e entra na branch
# ...faz as mudanças e commits...
git checkout main
git merge tela-clientes        # junta na main
```

## Mandar para o GitHub (primeira vez)

1. Crie um repositório **privado** em https://github.com/new (sem README).
2. Rode:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/crm.git
   git push -u origin main
   ```

## O que nunca vai para o Git

O arquivo `.gitignore` já cuida disso:
- `.env`, que guarda senhas e chaves;
- `node_modules`, que o `npm install` recria;
- `src/generated`, que o Prisma recria.
