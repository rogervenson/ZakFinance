# ZakFinance

Sistema de finanças pessoais do Zak, feito para substituir a planilha **Zak26**: lançamentos do dia a dia, cartão de crédito com fatura e parcelas, categorias e projetos, importação da planilha e painel do mês. Funciona no computador e no celular (pode ser adicionado à tela inicial).

Mais documentação:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — camadas, modelo de dados e regras (fatura, mês de caixa, importação).
- [docs/DEPLOY-RAILWAY.md](docs/DEPLOY-RAILWAY.md) — publicar no Railway.
- [docs/superpowers/specs/2026-11-01-zakfinance-design.md](docs/superpowers/specs/2026-11-01-zakfinance-design.md) — o design completo e o que vem nas próximas etapas.

## Rodando localmente

**Requisitos:** Node.js 22 ou 24 e npm. Docker ou PostgreSQL instalado são opcionais.

```bash
# 1. Dependências (também gera o cliente Prisma)
npm install

# 2. Ambiente
cp .env.example .env          # PowerShell: Copy-Item .env.example .env

# 3. Banco — em outro terminal, deixe rodando:
npm run db
#    PostgreSQL 17 embutido no projeto (pacote embedded-postgres), dados em ./.data,
#    porta 5434 (não conflita com o HomeRemodel, que usa 5433).

# 4. Tabelas + cadastros iniciais (contas, categorias, projetos, usuário)
npm run setup

# 5. App
npm run dev
```

Abra **http://localhost:3000**. No primeiro `npm run setup` o usuário é criado com o e-mail de `ADMIN_EMAIL`; sem `ADMIN_PASSWORD`, uma senha aleatória é mostrada uma vez no terminal. A troca de senha é obrigatória no primeiro acesso.

## Primeiros passos

1. **Contas:** confira o dia de fechamento e de vencimento do Cartão Santander (o padrão é fecha 12, vence 20).
2. **Importar planilha:** no Google Sheets, *Arquivo → Fazer download → Microsoft Excel (.xlsx)*; envie em *Importar planilha*, confira a prévia e clique em *Importar*. Depois confirme o total de parcelas das compras parceladas detectadas. A importação pode ser desfeita.
3. **Contas → Ajustar saldo:** confira o saldo real da conta; a diferença vira um lançamento "Ajuste de saldo".
4. A partir daí, lance o dia em **Lançamentos** (Enter salva e já prepara o próximo).

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | App em modo desenvolvimento |
| `npm run db` | PostgreSQL local embutido |
| `npm run setup` | Gera o cliente, aplica migrations e o seed |
| `npm run typecheck` / `npm run lint` | Checagens |
| `npm test` | Testes unitários (regras puras) |
| `npm run test:integration` | Serviços contra o banco de teste (`zakfinance_test`, apagado a cada execução) |
| `npm run test:e2e` | Build + testes no navegador (Playwright) no banco de teste |
| `npm run start:prod` | Produção: confere o ambiente, migra, seed e inicia |

Antes de commitar: `npm run typecheck && npm run lint && npm test`.

## O que já existe e o que vem depois

Pronto: login, contas, cartão com fatura e parcelas, lançamento rápido com sugestão de categoria, categorias e projetos, importação da Zak26, painel do mês.

Próximas etapas (ver a spec): carteira de investimentos com cotações, análise de gastos ("como melhorar"), aposentadoria, importação de extratos do Santander (precisa de arquivos de exemplo), contas recorrentes, tela de reembolsos e exportação para Excel.
