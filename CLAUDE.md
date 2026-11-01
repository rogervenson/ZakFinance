@AGENTS.md

# ZakFinance

Sistema de finanças pessoais de um único usuário (Zak). Spec: `docs/superpowers/specs/2026-11-01-zakfinance-design.md`.

- Camadas como no HomeRemodel: regras puras em `src/domain` (com testes unitários), Zod em `src/lib/validation`, `src/server/services` é a única camada que escreve no banco, actions e route handlers finos.
- Dinheiro sempre em centavos inteiros (`...Cents`); datas de calendário `@db.Date` à meia-noite UTC (`src/lib/dates.ts`); meses como `"YYYY-MM"`.
- Interface somente em pt-BR (textos literais, sem camada de i18n). Código e identificadores em inglês.
- Nunca alterar dados silenciosamente: ajustes de saldo são lançamentos explícitos; exclusões pedem confirmação.
- Antes de commitar: `npm run typecheck && npm run lint && npm test`.
