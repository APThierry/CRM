-- Atualiza quem ainda usa o texto padrão antigo (que dizia "da {cliente}").
UPDATE "ConfiguracaoAutomacao"
SET "reciclagemTexto" = '{Olá|Oi}{, primeiro_nome}! Aqui é da {empresa}. Passando para avisar que os certificados de {curso} vencem em {vencimento}. {Quer|Podemos} já reservar a turma de reciclagem?'
WHERE "reciclagemTexto" = '{Olá|Oi}{, primeiro_nome}! Aqui é da {empresa}. Os certificados de {curso} da {cliente} vencem em {vencimento}. Quer que a gente já reserve a turma de reciclagem?';
