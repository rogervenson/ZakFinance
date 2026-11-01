# ZakFinance — Design

Data: 2026-11-01
Status: rascunho para aprovação

## 1. Intenção

Zak controla a vida financeira numa planilha do Google Sheets ("Zak26"): uma aba por mês com blocos de gastos por categoria, uma aba "Geral" que consolida o ano (entradas, saídas, saldo em conta, patrimônio) e uma aba "Inv" com a carteira de ações/FIIs/ETF. Funciona, mas exige copiar e colar abas todo mês, tem linhas fixas por bloco, valores digitados à mão que ninguém confere, parcelas relançadas manualmente e já acumula erros de fórmula (ex.: `Nov!C90` em vez de `C190`).

O ZakFinance substitui essa planilha por um sistema web que faz tudo o que ela faz, com menos digitação e respondendo a três perguntas de Zak:

1. **Quanto tenho para sobreviver?** — no sentido de longo prazo: o patrimônio e a renda que ele gera sustentam o custo de vida? Zak deve trabalhar mais ~3 anos e então se aposentar.
2. **Para onde está indo meu dinheiro?**
3. **Como melhorar meus gastos?**

**Peso:** o núcleo do uso é o **controle do dia a dia** (lançamentos, fatura, contas, categorias, projetos, reembolsos). Aposentadoria é uma tela e um indicador no painel, não o centro do sistema.

## 2. Usuário e uso

- **Um único usuário: Zak.** Login com e-mail e senha; sem papéis/permissões.
- Lança **uma vez por dia, no computador**. Quer **acesso pelo celular**, principalmente para consulta.
- Banco principal: **Santander** (conta e cartão). Outros bancos podem existir; não são conhecidos ainda.
- Interface **somente em português (pt-BR)**, moeda **BRL**, fuso `America/Sao_Paulo`.

## 3. Objetivos

### 3.1 Lançamentos (núcleo)
- Um registro único de transações: data, descrição/estabelecimento, valor, categoria, conta/cartão, observação. Meses são filtros — nada de abas.
- **Entrada rápida no desktop**, orientada a teclado: digitar o estabelecimento ("vitorino") sugere categoria e conta a partir do histórico; lançar ~10 itens em 1–2 minutos.
- Entrada rápida simplificada também no celular.
- Tipos: despesa, receita, transferência entre contas (ex.: conta → poupança, conta → corretora), aporte em investimento.

### 3.2 Contas e cartão
- Contas (corrente, poupança, corretora, previdência) e cartões de crédito.
- **Cartão com fatura de verdade:** dia de fechamento e vencimento; cada compra cai na fatura correta pela data. Pagamento da fatura é uma saída da conta corrente. (Na planilha, o bloco "Crédito" de cada mês é na prática a fatura: compras de ~13 do mês anterior a ~12 do mês.)
- **Parcelamento:** lançar a compra uma vez com N parcelas; o sistema distribui nas faturas seguintes e mostra o comprometido futuro.
- Saldo de cada conta calculado pelos lançamentos, com conferência opcional contra o saldo real (ajuste de saldo explícito, nunca silencioso).

### 3.3 Categorias, projetos e reembolsos
- Categorias do dia a dia herdadas da planilha: Mercado, Saúde, Despesas, Carro (o carro em si: manutenção, reformas etc.), com subcategorias opcionais editáveis. Receitas: Salário, Dividendos, Reembolso, Quilometragem, Rove, Ticket, Outros.
- **Projetos** (Sótão, Agro e futuros): agrupam gastos de uma iniciativa, com total, histórico e orçamento opcional. Gastos de projeto aparecem separados e **não entram no custo de vida recorrente**.
- **Reembolsos:** um gasto marcado como reembolsável fica pendente com "quem deve"; quando o pagamento chega, é vinculado ao gasto. Lista de quem deve quanto.
- **Recorrências:** salário, ticket, luz, água, internet etc. são geradas como previstas todo mês e confirmadas (com valor ajustável) por Zak.

### 3.4 Importação de extratos
- Importar **extrato da conta e fatura do cartão do Santander** (formato a definir com arquivos reais: OFX, CSV ou PDF, nessa ordem de preferência).
- Pré-visualização antes de gravar: categoria sugerida pelo histórico, **detecção de duplicados** contra o que já foi lançado à mão (mesma conta, valor, data próxima), itens novos para confirmar.
- Mecanismo extensível para outros bancos depois.

### 3.5 Importação da planilha Zak26 (continuidade)
- Importador que lê o `.xlsx` exportado do Google Sheets e carrega o histórico de 2026:
  - **Abas mensais:** cada bloco "<Categoria> Crédito/Débito" vira lançamentos com a categoria e a forma de pagamento; blocos de receita (Receitas/Salário, Dividendos, Rembolso, Kilometragem, Rove, Investimento) viram receitas/aportes. O bloco "Outros Débito" (colunas P–R, idêntico em todas as abas, datado de 2025) é ignorado e reportado.
  - **Aba Geral:** saldos mensais da conta, linha "Tickets" e o patrimônio por mês (Poupança, Fundos, Ações, FIIs, ETF, Previdência) viram snapshots de patrimônio.
  - **Aba Inv:** posições atuais (ativo, quantidade, preço médio), vendas registradas e dividendos por mês por ativo.
- **Parcelas já na planilha** *(decisão do Claude)*: cada mês importado traz as linhas como estão (os totais batem com a planilha). O importador detecta séries — mesmo item, mesmo valor e mesma data de compra original repetidos em meses seguidos (ex.: "SCT 933,33" de 20/11/2025) — e as propõe no relatório como parcelamentos; Zak confirma o total de parcelas de cada uma, e só então as parcelas futuras passam a contar no "comprometido futuro". As linhas já importadas viram as parcelas pagas dessa série, sem duplicar.
- **Dividendos** *(decisão do Claude)*: a fonte de verdade da renda em caixa são os blocos "Dividendos" das abas mensais. A grade de dividendos por ativo da aba Inv vira o histórico por ativo da carteira; divergências entre as duas aparecem no relatório, sem bloquear.
- **Carteira da aba Inv** *(decisão do Claude)*: as posições (quantidade e preço médio) entram como posição inicial na data da importação. Vendas e "lucro venda" passam a ser um lucro realizado consolidado. A segunda linha de cada ativo (data, quantidade negativa, "Div aporte") é tratada como histórico de venda e reinvestimento de proventos, só no que for inequívoco; o resto vai para o relatório. Aportes lançados nas abas mensais depois dessa data (ex.: "bbas3 1.775,47" em Out) aparecem para Zak conferir se já estão contidos na posição.
- **Reembolsáveis antigos** *(decisão do Claude)*: os blocos "Rembolso Crédito/Débito" e as receitas "Rembolso" anteriores ao mês corrente entram como histórico já quitado, sem casar um a um, para não inundar a lista "quem deve". Os do mês corrente entram pendentes, para Zak vincular. Gastos reembolsáveis **não** contam no custo de vida.
- **Ticket** *(decisão do Claude)*: vira uma conta "Ticket" (cartão benefício) que recebe o valor mensal como receita e cujo consumo vai para Mercado. Na importação, entra como lançamento mensal único (receita + gasto em Mercado), seguindo a aba Geral; a inconsistência da Geral (a receita só aparece em janeiro) é explicada no relatório.
- **Relatório antes de gravar:** quantos itens por aba/bloco, totais por mês comparados aos totais da própria planilha, e tudo o que foi ignorado ou é suspeito (datas inválidas, data fora do mês esperado, valores não numéricos).
- **Importação única** (decisão do usuário): o sistema substitui a planilha, que deixa de ser usada. Não há sincronização contínua. Ainda assim, o importador é seguro contra execução repetida (chaves idempotentes, não duplica), para permitir refazer a carga inicial do zero se algo der errado antes de Zak começar a usar o sistema.

### 3.6 Investimentos e patrimônio
- Carteira a partir de operações (compra/venda/dividendo/JCP/rendimento): preço médio, quantidade, lucro realizado, valorização, rentabilidade com e sem proventos — o que a aba Inv calcula hoje.
- **Cotações automáticas** de B3 (ações, FIIs, ETFs) e USD/BRL, com cache diário; o sistema funciona se a fonte falhar (usa a última cotação).
- Ativos sem cotação (poupança, fundos, previdência) atualizados manualmente, com **lembrete mensal**.
- **Patrimônio mês a mês** (snapshot), com gráfico e conversão para dólar.

### 3.7 Painel e análise
- **Painel (abre aqui), mês atual primeiro:** entradas, saídas, fatura aberta e próxima, contas a vencer, sobra prevista do mês, categorias acima do normal, reembolsos pendentes; indicador pequeno "patrimônio cobre X anos do seu custo de vida".
- **Para onde vai:** gastos por categoria, projeto e estabelecimento por período; evolução mês a mês; comparação com a média.
- **Como melhorar:** orçamento por categoria com alertas; destaques automáticos (categoria subindo, gasto recorrente novo, estabelecimento que mais pesa) e o impacto de um corte em tempo de independência ("este gasto custa X meses").

### 3.8 Aposentadoria / independência
- Custo de vida real = média dos gastos recorrentes (sem projetos), com janela configurável.
- **Fontes de renda**, cada uma marcada se continua após a aposentadoria (marcação editável):
  - **SMA** — salário da empresa onde Zak trabalha. Para.
  - **Adiantamento** — provavelmente da mesma empresa. Para.
  - **Quilometragem** — reembolso de km do carro pelo trabalho. Para.
  - **Ticket** — vale-alimentação. Para.
  - **Felipe, Dani** — pessoas que moram com Zak e pagam aluguel ou ajudam nas despesas. Continuam *(suposição do Claude)*.
  - **Rove** — empresa menor de Zak, de conserto de computadores. Continua *(suposição do Claude)*.
  - **Dividendos/rendimentos** — calculados pela carteira, não pela marcação.
  - **Previdência** — começa na data configurada.
- Na projeção, a necessidade que o patrimônio precisa cobrir = custo de vida − rendas que continuam (média dos últimos meses, com valor editável).
- Projeção até a data de parada (padrão: 3 anos a partir de hoje, ajustável) com aportes e rendimento real esperado; depois, quantos anos o patrimônio dura e o "número" que sustentaria o custo de vida indefinidamente. Sinal verde/amarelo/vermelho.
- Previdência com data e forma de início (renda mensal ou resgate).
- Premissas editáveis (rendimento real, inflação, taxa de retirada) com padrões conservadores e explicados em linguagem simples.
- Simulações: parar antes/depois; cortar X por mês.

### 3.9 Exportação
- Exportar lançamentos (filtro atual) e resumos para Excel/CSV.

## 4. Não objetivos (por agora)

- Múltiplos usuários, compartilhamento, papéis.
- Open Finance / conexão automática com o banco (pode vir depois; a importação de arquivos vem primeiro).
- App nativo de loja (o site responsivo pode ser instalado como atalho/PWA).
- Declaração de imposto de renda, cálculo de IR sobre ações.
- Outros idiomas e moedas além de exibir USD no patrimônio.

## 5. Anti-objetivos (seria fracasso mesmo funcionando)

- Dar **mais** trabalho que a planilha para lançar o dia.
- Números que Zak não consegue conferir ou que divergem da planilha importada sem explicação.
- Perder ou alterar dados silenciosamente (importação, ajustes de saldo, exclusões).
- Painel cheio de gráficos que não respondem às três perguntas.
- Ficar inutilizável no celular.

## 6. Restrições e decisões técnicas

Seguir a base e as convenções do projeto **HomeRemodel (GHR Hub)**, em `C:\Sistemas\HomeRemodel` — ler o `docs/ARCHITECTURE.md` e o `AGENTS.md` de lá:

- Next.js 16 (App Router), React 19, TypeScript, Prisma 7 + `@prisma/adapter-pg`, PostgreSQL; Tailwind 4 + shadcn/ui + Lucide; React Hook Form + Zod; Recharts; Vitest + Playwright; `embedded-postgres` para desenvolvimento.
- Mesmas camadas: `domain/` (regras puras, testadas), `lib/validation`, `server/services` (único que escreve no banco), `server/actions` e `app/api` finos, infraestrutura `server-only`.
- Autenticação por sessão própria (bcrypt, sessões no banco), como no HomeRemodel, simplificada para um usuário; senha inicial via env, troca obrigatória no primeiro login.
- Valores em **centavos inteiros**; datas de calendário como `@db.Date` (UTC meia-noite) com "hoje" em `APP_TIMEZONE=America/Sao_Paulo`.
- Deploy no **Railway** (`railway.json`, `start:prod` com migrate + seed não destrutivo, `/api/health`), como no HomeRemodel.
- Repositório Git com push para o GitHub que o usuário vai criar.
- Texto da interface em pt-BR direto (sem camada de i18n, já que é só um idioma).

## 7. O que fica a cargo de quem constrói

- Modelo de dados exato, telas e navegação, componentes.
- Fonte das cotações (ex.: brapi.dev ou similar) e estratégia de cache.
- Heurística de sugestão de categoria e de detecção de duplicados.
- Ordem de entrega, desde que a primeira entrega útil inclua: login, contas/cartão com fatura, lançamentos com entrada rápida, categorias/projetos, importação da Zak26 e um painel do mês.

## 8. Pendências conhecidas

- Arquivos de exemplo do Santander (extrato e fatura) para definir o formato de importação.
- Confirmar com Zak a origem de "Adiantamento" e se Felipe/Dani/Rove de fato continuam após a aposentadoria (marcação editável no sistema, não bloqueia).
- Repositório no GitHub a ser criado pelo usuário; o push só acontece depois disso.
