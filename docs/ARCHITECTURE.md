# Arquitetura

Aplicação monolítica **Next.js 16 (App Router)** renderizada no servidor, com **PostgreSQL** via **Prisma 7**. Interface com **Tailwind 4 + shadcn/ui (Radix) + Lucide**. Mesma base e convenções do projeto HomeRemodel, simplificada para **um único usuário** e **somente pt-BR** (textos literais, sem camada de i18n).

```
Navegador ──► proxy.ts (manda ao login quem não tem cookie; não é a barreira de segurança)
          ──► Páginas (Server Components) ──┐
          ──► Server Actions ──────────────┼──► server/services (casos de uso)
          ──► Route Handlers /api/* ───────┘        │ autenticação + validação
                                                     ├──► domain/ (regras puras, testadas)
                                                     └──► Prisma ──► PostgreSQL
```

## Camadas

| Camada | Pasta | Responsabilidade |
| --- | --- | --- |
| Domínio | `src/domain` | Regras puras: fatura do cartão, parcelas, saldos, sugestão de categoria, resumo do painel, leitura e mapeamento da Zak26. Testes em `tests/unit`. |
| Validação | `src/lib/validation` | Schemas Zod usados nos formulários e nos serviços. Valores digitados em reais viram centavos. |
| Serviços | `src/server/services` | Únicos que escrevem no banco. Testes em `tests/integration`. |
| Entradas | `src/server/actions`, `src/app/api` | Adaptadores finos. Actions devolvem `ActionResult`. Upload da planilha e sugestão são route handlers. |
| Apresentação | `src/app`, `src/components` | Server Components buscam dados nos serviços; Client Components só cuidam da interação. |

## Convenções

- **Dinheiro em centavos inteiros** (`...Cents`). Em `Transaction`, `amountCents` é sempre positivo; o sentido vem do `type`.
- **Datas de calendário** em `@db.Date`, tratadas como meia-noite UTC (`src/lib/dates.ts`); "hoje" usa `APP_TIMEZONE` (`America/Sao_Paulo`).
- **Meses** como texto `"YYYY-MM"` (`src/lib/months.ts`).
- **Nada some em silêncio:** contas, categorias e projetos com histórico são arquivados; ajuste de saldo é um lançamento explícito; exclusões pedem confirmação.

## Modelo de dados

Definido em [`prisma/schema.prisma`](../prisma/schema.prisma).

| Entidade | Para quê |
| --- | --- |
| `User`, `Session` | Um usuário; sessões no banco (hash do token), bloqueio após tentativas erradas |
| `Account` | Conta corrente, poupança, cartão (com `closingDay`/`dueDay`), benefício (Ticket), investimentos |
| `Category` | Despesa ou receita; `countsInCostOfLiving` (despesas) e `continuesAfterRetirement` (receitas) |
| `Project` | Iniciativas como Sótão e Agro; ficam fora do custo de vida |
| `Invoice` | Fatura de um cartão por **mês de vencimento**; status OPEN/CLOSED/PAID (CLOSED é calculado na exibição) |
| `InstallmentPlan` | Compra parcelada; cada parcela é um `Transaction` na fatura do seu mês |
| `Transaction` | Despesa, receita ou transferência. `month` é o **mês de caixa**. `source`/`importKey` marcam o que veio da Zak26 |
| `AssetSnapshot` | Valor do patrimônio por mês e classe (Poupança, Fundos, Ações, FIIs, ETF, Previdência) |
| `Holding` | Posição da carteira (ticker, quantidade, preço médio, dividendos acumulados) |
| `ImportRun` | Relatório de cada importação e a grade bruta das abas Inv e Geral (para as próximas etapas) |

## Regras principais

**Fatura do cartão** (`domain/invoices.ts`): a compra feita até o dia de fechamento (inclusive) entra no ciclo que fecha naquele mês; depois, no seguinte. Dias como 31 são limitados ao tamanho do mês. A fatura é identificada pelo mês de vencimento: vence no mesmo mês do fechamento se `dueDay > closingDay`, senão no mês seguinte.

**Mês de caixa:** compras no cartão contam no mês da fatura (como na planilha); o resto, no mês da data. Listas, painel e totais usam esse mês.

**Fatura paga trava a compra:** numa fatura paga, só descrição, categoria, projeto e observação podem mudar. Pagar a fatura cria uma transferência da conta para o cartão; excluir esse pagamento reabre a fatura.

**Parcelas:** o valor é dividido em partes iguais, com os centavos que sobram na 1ª parcela. "Comprometido futuro" é a soma das faturas não pagas depois da fatura atual.

**Saldos** (`domain/balances.ts`): saldo inicial + receitas − despesas − transferências enviadas + recebidas. No cartão, o número é a dívida (compras − pagamentos).

**Sugestão** (`domain/suggest.ts`): ao sair do campo Descrição, procura a descrição igual (sem acento, maiúsculas, nem sufixo de parcela) ou, se não houver, que comece igual; entre as 10 mais recentes vence a categoria mais frequente.

**Painel** (`domain/dashboard.ts`): categorias comparadas com a média dos 3 meses anteriores (alerta quando passa de 20%). Custo de vida = despesas fora de projetos em categorias marcadas. Patrimônio = último valor de cada classe; "cobre X anos" = patrimônio ÷ (média de 12 meses do custo de vida × 12).

## Importação da Zak26

`src/domain/zak26/*` (puro) + `src/server/services/zak-import.ts`.

1. `server/import/xlsx-grid.ts` lê o .xlsx com exceljs e entrega cada aba como `Grid`, com o valor calculado das fórmulas.
2. `parse.ts` percorre as abas `Jan`…`Dez` até o mês atual. Um bloco começa num cabeçalho da coluna A (reconhecido por regex, robusto a acentos corrompidos) e termina na linha com `Total:` na coluna B. Cada valor numérico vira uma linha com chave `ZAK26:<aba>:B<linha>`. Datas inválidas usam o dia 1º do mês e viram aviso. As colunas P–R ("Outros", repetido de 2025) são ignoradas. A soma de cada bloco é comparada com o total da planilha. Da **Geral** saem o saldo inicial, os saldos mensais, o Ticket e o patrimônio; da **Inv**, a carteira.
3. `plan.ts` mapeia para lançamentos: `<X> Crédito` vai para o cartão, na fatura do mês da aba (não recalculada pela data); `<X> Débito` vai para a conta; Agro/Sótão viram categoria Projetos + projeto; "Rembolso Crédito/Débito" são despesas reembolsáveis (quitadas antes do mês atual); o bloco "Rembolso" é receita; Investimento vira transferência (Poupança ou Corretora); o Ticket entra e sai pela conta Ticket; cada mês passado com compras no crédito ganha a transferência que paga a fatura no vencimento.
4. A prévia não grava nada e compara o saldo da conta corrente calculado com o da planilha. A confirmação grava tudo numa transação e pula as chaves já existentes. "Desfazer" apaga só o que tem `source = ZAK26`.
5. `series.ts` detecta parcelas relançadas à mão (mesma descrição, valor e data em vários meses). Ao confirmar o total, as linhas são numeradas pela distância da 1ª fatura da compra e as parcelas que faltam vão para as próximas faturas.

Conferência com a planilha real: o saldo de janeiro bate exatamente; a partir de fevereiro há R$ 35,00 de diferença constante porque o "Saldo Anterior" de fevereiro na aba Geral foi digitado à mão.

## Testes

- `tests/unit` (Vitest): regras puras, inclusive a leitura da Zak26 com grades de exemplo.
- `tests/integration` (Vitest + banco de teste): serviços de lançamentos e importação.
- `tests/e2e` (Playwright): fluxos no navegador, inclusive no tamanho de celular.
