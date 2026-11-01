# ZakFinance — Plan 1: Foundation, Daily Control and Zak26 Import

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first useful version of ZakFinance: sign-in, accounts and credit card with real invoices and installments, fast daily entry, categories and projects, the one-time Zak26 import, and a month dashboard.

**Architecture:** Monolithic Next.js 16 App Router app copied in shape from `C:\Sistemas\HomeRemodel` (read its `docs/ARCHITECTURE.md` and `AGENTS.md` first). Pure rules in `src/domain` (unit-tested), Zod schemas in `src/lib/validation`, `src/server/services` is the only layer that writes to the database, thin Server Actions / Route Handlers. Single user, no roles, no i18n layer: UI strings are pt-BR literals.

**Tech Stack:** Next.js 16.4, React 19.3, TypeScript, Prisma 7.10 + `@prisma/adapter-pg`, PostgreSQL 17 (`embedded-postgres` in dev), Tailwind 4 + shadcn/ui + Lucide, React Hook Form + Zod 4, Recharts, `exceljs` (xlsx reading), Vitest, Playwright. Same versions as HomeRemodel's `package.json`.

**Spec:** `docs/superpowers/specs/2026-11-01-zakfinance-design.md`

**Out of this plan (later plans):** investments screen and quotes (3.6), analysis/"como melhorar" (3.7 beyond the month dashboard), retirement (3.8), Santander import (3.4, blocked on sample files), recurrences and the reimbursements screen (3.3), export (3.9). This plan **does** import everything Zak26 holds (snapshots, holdings, reimbursable flags), because the import runs once.

## Global Constraints

- Single user: Zak. Email + password sign-in; no roles or permissions.
- UI only in pt-BR; currency BRL; `APP_TIMEZONE=America/Sao_Paulo`.
- Money stored as integer cents (`Int`, named `...Cents`); calendar dates as `@db.Date` at UTC midnight (reuse HomeRemodel `src/lib/dates.ts`).
- Month keys are strings `"YYYY-MM"`.
- Initial password from env, forced change at first sign-in (HomeRemodel pattern).
- Railway deploy: `railway.json`, `npm run start:prod` = check env + `prisma migrate deploy` + non-destructive seed + `next start`; `GET /api/health`.
- Dev DB: embedded Postgres on port **5434**, database `zakfinance` (and `zakfinance_test`), so it can run beside HomeRemodel (5433). Session cookie name `zf_session`.
- Never change data silently: balance adjustments are explicit transactions; deletes ask for confirmation; the import shows a report before writing.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push only after the user creates the GitHub repo.

## Review Focus

1. **Broken dates in the sheet** (`'28/02/0202'`, `'#VALUE!'`, blank date with a value, e.g. Out row 122 "tokyo 265.92"): the row still imports, dated the 1st of the sheet's month, and appears in the report as "data inválida". Test in Task 9.
2. **Typed amounts in Brazilian format** (`"1.234,56"`, `"1234,56"`, `"12,5"`, `"R$ 50"`, `"1234.56"`): parse to the right cents; `"0"`, negatives and garbage are rejected with a pt-BR message. Test in Task 2.
3. **Card purchase on the closing day, and closing day 31 in February:** the closing day belongs to the invoice closing that day; day 31 clamps to the month's last day. Test in Task 4.
4. **Editing a purchase that sits in a paid invoice:** amount, date and account are locked (error "Fatura já paga"); description, category and project can still change. Test in Task 6.
5. **Running the import twice / after manual entries:** the second run creates nothing (idempotent keys), and manual transactions are never touched; "Desfazer importação" removes only `source = ZAK26` rows. Test in Task 10.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `components.json`, `postcss.config.mjs` (if HomeRemodel has one), `vitest.config.mts`, `playwright.config.ts`, `prisma.config.ts`, `scripts/db-server.mjs`, `scripts/check-env.mjs`, `.env.example`, `.gitignore`, `railway.json`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `src/app/globals.css`, `src/app/layout.tsx`, `src/lib/utils.ts`, `src/lib/action-result.ts`, `src/components/ui/*`, `src/app/api/health/route.ts`, `tests/stubs/server-only.ts`, `tests/unit/smoke.test.ts`

- [ ] **Step 1:** Copy these files from `C:\Sistemas\HomeRemodel` and adapt: package name `zakfinance`; drop deps not needed here (`nodemailer`, `pdfkit`, `@types/pdfkit`, `unpdf`, `@types/nodemailer`); add `exceljs` (latest 4.x). Scripts: same as HomeRemodel minus `import`. `db-server.mjs` default URL `postgresql://zakfinance:zakfinance@localhost:5434/zakfinance`, ICU locale `pt-BR`. Health route checks only the database (no storage). `vitest.config.mts` env `APP_TIMEZONE: "America/Sao_Paulo"`. `<html lang="pt-BR">`. `.gitignore` adds `.data/`, `.env`, `*.xlsx`, `test-results/`, `storage/`. `.env.example`: `DATABASE_URL`, `TEST_DATABASE_URL`, `SESSION_TTL_HOURS="12"`, `APP_TIMEZONE="America/Sao_Paulo"`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `MAX_UPLOAD_MB="10"`.
- [ ] **Step 2:** `AGENTS.md` = HomeRemodel's Next.js block; `CLAUDE.md` = `@AGENTS.md` plus: layers rule, cents/dates rule, pt-BR UI, "run `npm run typecheck && npm run lint && npm test` before committing".
- [ ] **Step 3:** `tests/unit/smoke.test.ts`: `expect(1 + 1).toBe(2)`.
- [ ] **Step 4:** Run `npm install`, then `npm run typecheck && npm run lint && npm test`. Expected: all pass.
- [ ] **Step 5:** `git init -b main`, commit everything including `docs/` (`chore: scaffold ZakFinance from HomeRemodel base`).

### Task 2: Money and month helpers

**Files:**
- Create: `src/lib/money.ts`, `src/lib/dates.ts` (copy HomeRemodel's, default tz `America/Sao_Paulo`, drop `ageAt`), `src/lib/months.ts`
- Test: `tests/unit/money.test.ts`, `tests/unit/months.test.ts`

**Interfaces — Produces:**
- `parseBRL(input: string): number | null` → cents; null for empty/garbage/≤0.
- `formatBRL(cents: number): string` → `"R$ 1.234,56"` (Intl `pt-BR`, BRL).
- `toCents(value: number): number` → `Math.round(value * 100)` (for sheet floats).
- `monthKey(date: Date): string`, `addMonthKey(key: string, n: number): string`, `monthStart(key): Date`, `monthEnd(key): Date`, `monthLabel(key): string` (`"out/2026"`), `currentMonthKey(now?: Date): string` (app tz).

- [ ] **Step 1: Failing tests**

```ts
expect(parseBRL("1.234,56")).toBe(123456);
expect(parseBRL("1234,56")).toBe(123456);
expect(parseBRL("12,5")).toBe(1250);
expect(parseBRL("R$ 50")).toBe(5000);
expect(parseBRL("1234.56")).toBe(123456);
expect(parseBRL("0")).toBeNull();
expect(parseBRL("-10")).toBeNull();
expect(parseBRL("abc")).toBeNull();
expect(formatBRL(123456)).toBe("R$ 1.234,56"); // compare after replacing \u00a0 with " "
expect(toCents(538.53)).toBe(53853);
expect(addMonthKey("2026-12", 1)).toBe("2027-01");
expect(addMonthKey("2026-01", -1)).toBe("2025-12");
expect(monthKey(new Date("2026-10-31T00:00:00Z"))).toBe("2026-10");
expect(monthLabel("2026-10")).toBe("out/2026");
```

- [ ] **Step 2:** Run `npx vitest run tests/unit/money.test.ts tests/unit/months.test.ts` → FAIL.
- [ ] **Step 3:** Implement. `parseBRL` rule: strip `R$` and spaces; if it contains `,` treat `.` as thousands and `,` as decimal; otherwise a single `.` followed by 1–2 digits is decimal.
- [ ] **Step 4:** Run tests → PASS.
- [ ] **Step 5:** Commit `feat: money and month helpers`.

### Task 3: Data model, seed and sign-in

**Files:**
- Create: `prisma/schema.prisma`, `prisma/migrations/*` (via `prisma migrate dev --name init`), `prisma/seed.ts`, `src/server/db.ts`, `src/server/errors.ts`, `src/server/auth/{password,session,actor}.ts`, `src/server/services/auth.ts`, `src/server/actions/{run,auth}.ts`, `src/domain/rate-limit.ts`, `src/proxy.ts`, `src/app/login/page.tsx`, `src/app/account/password/page.tsx`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx` (placeholder), `src/components/layout/{app-sidebar,top-bar}.tsx`
- Test: `tests/e2e/global-setup.ts`, `tests/e2e/auth.spec.ts`

**Schema (decided here; field names are binding for later tasks):**

```prisma
enum AccountType { CHECKING SAVINGS CREDIT_CARD BENEFIT INVESTMENT }
enum TxType { EXPENSE INCOME TRANSFER }
enum TxSource { MANUAL ZAK26 }
enum CategoryKind { EXPENSE INCOME }
enum InvoiceStatus { OPEN CLOSED PAID }
enum ReimbursementStatus { PENDING SETTLED }

model User { id String @id @default(cuid()); email String @unique; name String; passwordHash String; mustChangePassword Boolean @default(true); failedLoginCount Int @default(0); lockedUntil DateTime?; createdAt DateTime @default(now()); sessions Session[] }
model Session { id String @id @default(cuid()); userId String; user User @relation(fields: [userId], references: [id], onDelete: Cascade); tokenHash String @unique; expiresAt DateTime; lastSeenAt DateTime @default(now()); createdAt DateTime @default(now()) }

model Account { id String @id @default(cuid()); name String @unique; type AccountType; openingBalanceCents Int @default(0); openingDate DateTime @db.Date; closingDay Int?; dueDay Int?; archivedAt DateTime?; sortOrder Int @default(0) }
// closingDay/dueDay required when type = CREDIT_CARD (validated in Zod).

model Category { id String @id @default(cuid()); name String; kind CategoryKind; countsInCostOfLiving Boolean @default(true); continuesAfterRetirement Boolean @default(false); archivedAt DateTime?; sortOrder Int @default(0); @@unique([name, kind]) }
model Project { id String @id @default(cuid()); name String @unique; budgetCents Int?; archivedAt DateTime?; createdAt DateTime @default(now()) }

model Invoice { id String @id @default(cuid()); accountId String; month String /* due month YYYY-MM */; closingDate DateTime @db.Date; dueDate DateTime @db.Date; status InvoiceStatus @default(OPEN); paidAt DateTime? @db.Date; @@unique([accountId, month]) }

model InstallmentPlan { id String @id @default(cuid()); description String; installmentCents Int; count Int; firstInvoiceMonth String; purchaseDate DateTime @db.Date; accountId String; categoryId String; projectId String?; source TxSource @default(MANUAL); createdAt DateTime @default(now()) }

model Transaction {
  id String @id @default(cuid())
  type TxType
  date DateTime @db.Date            // purchase / event date
  month String                      // cash month YYYY-MM: invoice.month for card purchases, else monthKey(date)
  description String
  amountCents Int                   // always > 0
  accountId String                  // source account
  toAccountId String?               // TRANSFER only
  categoryId String?                // required for EXPENSE/INCOME
  projectId String?
  invoiceId String?                 // set iff account is CREDIT_CARD and type = EXPENSE
  paysInvoiceId String? @unique     // TRANSFER that pays a card invoice
  installmentPlanId String?
  installmentNumber Int?
  reimbursable Boolean @default(false)
  reimbursementStatus ReimbursementStatus?
  reimbursedBy String?
  note String?
  source TxSource @default(MANUAL)
  importKey String? @unique         // e.g. "ZAK26:Out:B58" — idempotency
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([month]) @@index([accountId, date]) @@index([description])
}

model AssetSnapshot { id String @id @default(cuid()); month String; assetClass String /* Poupança|Fundos|Ações|FIIs|ETF|Previdência */; valueCents Int; source TxSource @default(MANUAL); @@unique([month, assetClass]) }
model Holding { id String @id @default(cuid()); ticker String @unique; kind String /* ACAO|FII|ETF */; quantity Int; avgPriceCents Int; dividendsTotalCents Int @default(0); asOf DateTime @db.Date; source TxSource @default(MANUAL) }
model ImportRun { id String @id @default(cuid()); kind String /* ZAK26 */; fileSha256 String; createdAt DateTime @default(now()); report Json; raw Json /* untouched Inv grid + Geral rows for later plans */ }
```

Add the relations Prisma needs (Account↔Transaction both directions named `outgoing`/`incoming`, Invoice↔Transaction `items` and `payment`, etc.).

**Seed (non-destructive, idempotent `upsert` by name):**
- User from `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` (default `"Zak"`) only if no user exists; random password printed once if missing.
- Accounts: `Conta Santander` CHECKING; `Cartão Santander` CREDIT_CARD closingDay 12 dueDay 20; `Poupança` SAVINGS; `Corretora` INVESTMENT; `Ticket` BENEFIT. `openingDate` 2026-01-01.
- Expense categories: Mercado, Despesas, Saúde, Carro (counts=true); Projetos, Reembolsável (counts=false).
- Income categories (continuesAfterRetirement): Salário (false), Adiantamento (false), Quilometragem (false), Ticket (false), Aluguel/Ajuda (true), Rove (true), Dividendos (false), Reembolso (false), Outros (false).
- Projects: Sótão, Agro.

- [ ] **Step 1:** Write `schema.prisma`, run `npm run db` (separate terminal) and `npx prisma migrate dev --name init`. Expected: migration created, client generated.
- [ ] **Step 2:** Copy auth from HomeRemodel (`password.ts`, `session.ts` with `SESSION_COOKIE = "zf_session"` and no `requestMeta` columns, `actor.ts` reduced to `getCurrentUser`, `requireUser`, `requireActor` — no permissions), `services/auth.ts` (login with lockout, logout, changePassword) without audit, `actions/run.ts`, `errors.ts` with pt-BR messages. `proxy.ts` checks `zf_session`.
- [ ] **Step 3:** Layout: shadcn `Sidebar` (collapses to a sheet on mobile) with items: Painel `/`, Lançamentos `/lancamentos`, Faturas `/faturas`, Contas `/contas`, Categorias e projetos `/categorias`, Importar planilha `/importar`. Top bar with user menu (Trocar senha, Sair).
- [ ] **Step 4: Failing e2e** `tests/e2e/auth.spec.ts`: signs in with the seeded test user → redirected to `/account/password`; after changing the password lands on `/` and sees "Painel"; wrong password shows "E-mail ou senha inválidos". `global-setup.ts` copies HomeRemodel's: resets `TEST_DATABASE_URL`, migrates, seeds with a known password.
- [ ] **Step 5:** Run `npx playwright test tests/e2e/auth.spec.ts` → PASS after implementing.
- [ ] **Step 6:** Commit `feat: data model, seed and single-user sign-in`.

### Task 4: Card invoice rules

**Files:**
- Create: `src/domain/invoices.ts`
- Test: `tests/unit/invoices.test.ts`

**Interfaces — Produces:**
- `invoiceMonthFor(purchaseDate: Date, closingDay: number, dueDay: number): string` — closing date of month M = `min(closingDay, lastDay(M))`. Purchase on or before that date belongs to the cycle closing in M, otherwise M+1. Due month = closing month if `dueDay > closingDay`, else closing month + 1. Returns the **due month**.
- `invoiceDates(month: string, closingDay: number, dueDay: number): { closingDate: Date; dueDate: Date }` (both clamped to month length).
- `installmentMonths(firstInvoiceMonth: string, count: number): string[]`
- `splitInstallments(totalCents: number, count: number): number[]` — equal parts, remainder cents on the first installment.

- [ ] **Step 1: Failing tests** (closing 12, due 20 unless stated)

```ts
expect(invoiceMonthFor(d("2026-09-13"), 12, 20)).toBe("2026-10");
expect(invoiceMonthFor(d("2026-10-12"), 12, 20)).toBe("2026-10"); // closing day itself
expect(invoiceMonthFor(d("2026-10-13"), 12, 20)).toBe("2026-11");
expect(invoiceMonthFor(d("2026-10-30"), 25, 5)).toBe("2026-12");  // closes 25/11, due 05/12
expect(invoiceMonthFor(d("2026-02-28"), 31, 10)).toBe("2026-03"); // Feb clamps to 28
expect(invoiceDates("2026-02", 31, 10).closingDate).toEqual(d("2026-01-31"));
expect(installmentMonths("2026-11", 3)).toEqual(["2026-11", "2026-12", "2027-01"]);
expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333]);
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: card invoice and installment rules`.

### Task 5: Accounts, categories and projects

**Files:**
- Create: `src/lib/validation/setup.ts`, `src/server/services/{accounts,categories,projects}.ts`, `src/server/actions/setup.ts`, `src/app/(app)/contas/page.tsx`, `src/app/(app)/categorias/page.tsx`, `src/components/setup/*`
- Test: `tests/e2e/setup.spec.ts`

**Interfaces — Produces:**
- `listAccounts({ includeArchived?: boolean }): Promise<AccountWithBalance[]>` where `AccountWithBalance = Account & { balanceCents: number }`.
- `accountBalance(accountId: string, until?: Date): Promise<number>` — opening + incoming − outgoing; for CREDIT_CARD the result is the **debt** (purchases − payments) and is shown as "Fatura em aberto".
- `createAccount/updateAccount/archiveAccount`, `createCategory/updateCategory/archiveCategory`, `createProject/updateProject/archiveProject`, `listCategories(kind?)`, `listProjects()` (with `spentCents`).
- `adjustBalance(accountId, realBalanceCents, date)` → creates an EXPENSE or INCOME transaction "Ajuste de saldo" in category `Outros` (create on demand) for the difference; never edits the opening balance.

Rules: archiving never deletes; a category/project with transactions cannot be deleted, only archived. Account form requires closing/due day (1–31) for cards.

- [ ] **Step 1:** Failing e2e: create account "Nubank" (card, closes 3, due 10) → appears in `/contas`; set real balance of "Conta Santander" to 100,00 → an "Ajuste de saldo" transaction exists and the balance shows "R$ 100,00"; archive category "Carro" → disappears from the active list but still appears in the filter "arquivadas".
- [ ] **Step 2:** Implement services, actions and pages (tables on desktop, cards on mobile).
- [ ] **Step 3:** Run `npx playwright test tests/e2e/setup.spec.ts` → PASS.
- [ ] **Step 4:** Commit `feat: accounts, categories and projects`.

### Task 6: Transactions service

**Files:**
- Create: `src/lib/validation/transactions.ts`, `src/server/services/transactions.ts`, `src/server/services/invoices.ts`, `src/domain/suggest.ts`
- Test: `tests/unit/suggest.test.ts`, `tests/integration/transactions.test.ts`, `vitest.integration.config.mts` (uses `TEST_DATABASE_URL`, runs migrations once in `globalSetup`; script `npm run test:integration`)

**Interfaces — Consumes:** Task 4 functions, Task 2 helpers.
**Produces:**
- `createTransaction(input: TxInput): Promise<Transaction[]>` where `TxInput = { type; date: string; description: string; amount: string /* BRL text */; accountId; toAccountId?; categoryId?; projectId?; installments?: number /* 1..48, card only */; reimbursable?: boolean; note? }`. Card EXPENSE: finds-or-creates the `Invoice` for `invoiceMonthFor(...)`; with `installments > 1` creates an `InstallmentPlan` and one transaction per installment (amounts from `splitInstallments`, months from `installmentMonths`, description suffixed ` (1/3)`). `month` is always set as defined in the schema comment.
- `updateTransaction(id, input)` — recomputes invoice and month. If the current invoice is PAID: changing amount, date or account throws `AppError("VALIDATION", "Fatura já paga: só é possível alterar descrição, categoria e projeto.")`. Updating a transaction that belongs to an installment plan changes only that installment.
- `deleteTransaction(id, { wholePlan?: boolean })` — same PAID lock.
- `listTransactions(filter: { month?: string; accountId?; categoryId?; projectId?; q?: string; page?: number }): Promise<{ items; totalCents; count }>` — `month` filters by the cash month.
- `payInvoice(invoiceId, fromAccountId, date)` → TRANSFER with `paysInvoiceId`, amount = invoice total; invoice status PAID. `invoiceTotal(invoiceId)`.
- `suggestFor(description: string): Promise<{ categoryId; accountId; projectId? } | null>` using the pure `pickSuggestion(history: { description; categoryId; accountId; projectId; date }[] , description: string)` in `src/domain/suggest.ts`: normalize (lowercase, strip accents, trim, collapse spaces); exact normalized match wins, else the most recent prefix match; among matches, the most frequent category of the last 10.

- [ ] **Step 1: Failing unit tests** `pickSuggestion`: "Vitorino" matches history "vitorino" → Mercado; "vito" (prefix) → Mercado; "xyz" → null; when the last 10 "pp" rows are 7 Saúde and 3 Despesas → Saúde.
- [ ] **Step 2: Failing integration tests:** card purchase 2026-10-13 R$ 300,00 in 3× creates 3 transactions in invoices 2026-11, 2026-12, 2027-01 with 10000 each; `payInvoice` on 2026-11 marks it PAID and the checking balance drops by 10000; updating the amount of the paid installment throws "Fatura já paga…"; updating its category succeeds; a debit expense on 2026-10-05 has `month = "2026-10"`.
- [ ] **Step 3:** Run `npm test` and `npm run test:integration` → FAIL. **Step 4:** Implement. **Step 5:** Run → PASS.
- [ ] **Step 6:** Commit `feat: transactions, invoices and installments`.

### Task 7: Daily entry screen (`/lancamentos`)

**Files:**
- Create: `src/app/(app)/lancamentos/page.tsx`, `src/components/transactions/{quick-entry,transaction-list,transaction-dialog,month-picker}.tsx`, `src/server/actions/transactions.ts`, `src/app/api/suggest/route.ts` (GET `?q=` → `suggestFor`, authenticated)
- Test: `tests/e2e/entry.spec.ts`

Behavior (decided):
- Quick entry row at the top (desktop): fields in tab order **Data** (default today) → **Descrição** (autocomplete of past descriptions; on blur fills category/account from `/api/suggest` unless the user already chose) → **Valor** → **Categoria** → **Conta** → **Parcelas** (visible only for card accounts, default 1) → **Projeto** (optional) → **Reembolsável** (checkbox). Enter saves, toasts "Lançado", clears description and amount, keeps date/account, focuses Descrição.
- Type toggle Despesa / Receita / Transferência (keyboard: the form starts in Despesa).
- On mobile (< md) the row becomes a "+ Lançar" button opening a sheet with the same fields.
- List below: month picker (defaults to current month, ← → arrows), search, account/category/project filters, total of the filtered list; each row editable in a dialog, delete with confirmation ("Excluir este lançamento?"; for installments: "Só esta parcela" / "Todas as parcelas").

- [ ] **Step 1:** Failing e2e: type "vitorino" (seeded history row Mercado/Cartão) → category shows Mercado and account Cartão Santander; type 45,90 and Enter → row appears in the list of the invoice month with "R$ 45,90"; second entry "farmácia" 3× R$ 90,00 on the card → three rows "(1/3)…(3/3)" across months; delete "Todas as parcelas" removes all three.
- [ ] **Step 2:** Implement. **Step 3:** Run `npx playwright test tests/e2e/entry.spec.ts` → PASS.
- [ ] **Step 4:** Commit `feat: fast daily entry and transaction list`.

### Task 8: Invoices screen (`/faturas`)

**Files:**
- Create: `src/app/(app)/faturas/page.tsx`, `src/app/(app)/faturas/[id]/page.tsx`, `src/components/invoices/*`
- Test: `tests/e2e/invoices.spec.ts`

Behavior: per card, list of invoices (month, closing, due, total, status badge Aberta/Fechada/Paga); status CLOSED is derived when today > closingDate and not paid (persisted on read is not required — compute it). Detail lists items grouped by category with totals, and a "Pagar fatura" button (choose account, date default dueDate). Also shows **"Comprometido futuro"**: sum of installments in invoices after the current open one.

- [ ] **Step 1:** Failing e2e: after creating a 3× purchase, `/faturas` shows three invoices and "Comprometido futuro" equals the two future installments; paying the first sets badge "Paga" and the checking balance in `/contas` decreases by its total.
- [ ] **Step 2:** Implement. **Step 3:** Run → PASS. **Step 4:** Commit `feat: card invoices screen`.

### Task 9: Zak26 parser (pure)

**Files:**
- Create: `src/domain/zak26/{grid,layout,parse,series}.ts`
- Test: `tests/unit/zak26-parse.test.ts`, `tests/unit/zak26-series.test.ts`, `tests/unit/fixtures/zak26-grid.ts` (small hand-built grids)

**Interfaces — Produces:**
- `type Cell = string | number | Date | null | { error: string }`; `interface Grid { name: string; get(row: number, col: number): Cell }` (1-based; col 1 = A). For formula cells the adapter (Task 10) passes the cached result.
- `parseZak26(sheets: Grid[], opts: { year: number; lastMonth: string /* "YYYY-MM", inclusive */ }): ZakParse`
- `ZakParse = { rows: ZakRow[]; ticket: { month; cents }[]; checkingOpeningCents: number; geralBalances: { month; cents }[]; snapshots: { month; assetClass; cents }[]; holdings: { ticker; kind; quantity; avgPriceCents; dividendsTotalCents }[]; blockTotals: { month; block; sheetCents; parsedCents }[]; issues: ZakIssue[]; rawInv: Cell[][]; rawGeral: Cell[][] }`
- `ZakRow = { importKey: string /* "ZAK26:<Sheet>:<A1 ref of value cell>" */; month: string; block: BlockId; description: string; cents: number; date: Date; dateIssue: boolean; payment: "CREDITO" | "DEBITO" | null }`
- `ZakIssue = { sheet: string; cell: string; kind: "DATA_INVALIDA" | "VALOR_INVALIDO" | "BLOCO_IGNORADO" | "TOTAL_DIVERGENTE" | "DATA_FORA_DO_MES"; message: string }`
- `detectSeries(rows: ZakRow[]): SeriesCandidate[]` with `SeriesCandidate = { key: string; description: string; installmentCents: number; purchaseDate: Date; months: string[]; importKeys: string[] }`.

**Layout rules (from the real file; implement in `layout.ts`):**
- Month sheets are named `Jan Fev Mar Abr Mai Jun Jul Ago Set Out Nov Dez`; only months ≤ `lastMonth` are read.
- A block starts at a column-A header and ends at the row whose column B is `"Total:"`. Known headers (accents may be mojibake; match after normalizing — lowercase, strip accents and non-letters): `Receitas` (income, rows 3–10), `Dividendos`, `Rembolso` (income), `Kilometragem`, `Rove`, `Investimento`, and the expense pairs `<X> Crédito` / `<X> Débito` for X ∈ Mercado, Despesas, Saúde, Rembolsável|Rembolso (rows 204/222 — "Rembolso Crédito/Débito" means **reimbursable expenses**, unlike the income block "Rembolso" at row 21), Carro, Agro, Sótão.
- Item row = column B is a number (≠ 0) inside a block. Column A is the description (blank → `"(sem descrição)"` + issue). Lines like `SMA:`, `Salário:`, `Ticket`, `Item` without a number are labels, not items.
- Date = column C. If not a valid Date in [2024-01-01, 2027-12-31] → date = 1st of the sheet month, `dateIssue: true`, issue `DATA_INVALIDA` (covers `'28/02/0202'`, `'#VALUE!'`, blanks).
- Debit/income rows whose date falls outside the sheet month → issue `DATA_FORA_DO_MES` (informational; the row keeps its date but `month` is the sheet month). Credit rows are expected to carry older dates and get no issue.
- Columns P–R ("Outros Débito") are ignored with one `BLOCO_IGNORADO` issue per sheet.
- Per block, compare the sum of parsed items with the cached total in column C of the "Total:" row → `TOTAL_DIVERGENTE` when different by > 1 cent.
- **Geral:** row 7 (Tickets) → `ticket[]`; `B22` → `checkingOpeningCents` (Saldo Anterior of January); row 27 (Saldo CC) → `geralBalances`; rows 28–33 (Poupança, Fundos, Ações, FIIs, Etf→"ETF", Previdência) → `snapshots` for columns with a number. Columns B..M = Jan..Dez.
- **Inv:** asset rows are rows where column A is a ticker (`/^[A-Z]{4}\d{1,2}$/`) and column B a positive number: quantity B, avg price C, dividends total K (when numeric). Kind: ticker ending in `11` and listed in the "Total Fii" range (rows 18–21) → FII; `IVVB11` → ETF; else ACAO. Everything else in Inv goes only to `rawInv`.

`detectSeries`: group CREDITO rows by (normalized description, cents, purchase date) appearing in ≥ 2 distinct sheet months → one candidate, months sorted.

- [ ] **Step 1: Failing tests** with fixture grids:
  - a "Out" grid with Mercado Crédito rows `vitorino 538.53 2026-09-16` and `tokyo 265.92 (no date)` → two rows, block `MERCADO_CREDITO`, payment CREDITO, the second with `dateIssue` and date 2026-10-01, one `DATA_INVALIDA` issue at `C122`-style ref.
  - a row with date `'28/02/0202'` → `DATA_INVALIDA`.
  - total cell 100 vs items summing 90 → `TOTAL_DIVERGENTE`.
  - a value in column Q → ignored + `BLOCO_IGNORADO`.
  - sheet `Dez` skipped when `lastMonth = "2026-11"`.
  - Geral fixture → `checkingOpeningCents = 650263`, snapshot `{ month: "2026-10", assetClass: "Previdência", cents: 32980375 }`.
  - Inv fixture → holding `{ ticker: "BBAS3", kind: "ACAO", quantity: 1324, avgPriceCents: 2400 }`, `{ ticker: "KNCR11", kind: "FII" }`, `{ ticker: "IVVB11", kind: "ETF" }`.
  - `detectSeries`: "SCT 933.33 2025-11-20" in Jan, Fev, Mar → one candidate with 3 months.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: Zak26 spreadsheet parser`.

### Task 10: Import service and screen (`/importar`)

**Files:**
- Create: `src/server/import/xlsx-grid.ts` (exceljs → `Grid[]`), `src/domain/zak26/plan.ts`, `src/server/services/zak-import.ts`, `src/app/api/import/zak26/route.ts`, `src/app/(app)/importar/page.tsx`, `src/components/import/*`
- Test: `tests/unit/zak26-plan.test.ts`, `tests/integration/zak-import.test.ts`

**Interfaces — Consumes:** Task 9 `parseZak26`, `detectSeries`; Task 6 invoice helpers.
**Produces:**
- `planZakImport(parse: ZakParse, ctx: { accounts: Record<"checking"|"card"|"savings"|"broker"|"ticket", string>; categories: Record<string, string>; projects: Record<"Sótão"|"Agro", string>; currentMonth: string }): PlannedTx[]` — pure mapping:
  - `<X> Crédito` → EXPENSE on card, invoice month = sheet month (explicit, **not** recomputed from the date); `<X> Débito` → EXPENSE on checking.
  - X Mercado/Despesas/Saúde/Carro → same-name category; Agro/Sótão → category Projetos + project; Rembolsável → category Reembolsável, `reimbursable: true`, status SETTLED for months < currentMonth, PENDING for currentMonth.
  - Receitas block → INCOME on checking; category by description: `SMA`→Salário, `Felipe`/`Dani`→Aluguel/Ajuda, `Adiantamento`→Adiantamento, else Outros. Dividendos → Dividendos; Rembolso (income) → Reembolso; Kilometragem → Quilometragem; Rove → Rove.
  - Investimento → TRANSFER from checking to Poupança when description normalizes to `poupanca`, else to Corretora.
  - Ticket (Geral row 7) → per month: INCOME 954 on Ticket account (category Ticket) + EXPENSE on Ticket account (category Mercado) dated the 1st, importKeys `ZAK26:Geral:<col>7:in` / `:out`.
  - Per month with credit rows: a TRANSFER checking → card paying that invoice, dated the invoice due date, amount = sum of that month's credit rows; invoice PAID for months < currentMonth.
  - Checking account `openingBalanceCents = checkingOpeningCents`.
- `previewZakImport(file: Buffer): Promise<ZakPreview>` — no writes. `ZakPreview = { sha256; months: { month; incomeCents; expenseCents; creditCents; debitCents; rowCount }[]; issues: ZakIssue[]; series: SeriesCandidate[]; alreadyImported: number; balanceCheck: { month; geralCents; computedCents }[] }`.
- `confirmZakImport(file: Buffer): Promise<{ created: number; skipped: number }>` — re-parses, writes in one transaction, skips existing `importKey`s, upserts snapshots/holdings with `source ZAK26`, stores `ImportRun { report, raw }`.
- `confirmSeries(seriesKey: string, totalCount: number)` — creates the `InstallmentPlan` (source ZAK26), links the imported rows as installments 1..k (by month order) and creates the remaining future installments in the next invoices.
- `undoZakImport()` — deletes all rows with `source = ZAK26` (transactions, plans, snapshots, holdings, invoices left empty), resets checking opening balance to 0. Asks for typed confirmation "DESFAZER" in the UI.

Screen: upload → preview (per-month table with the totals, Geral balance check with differences highlighted, issues grouped by kind, series list) → "Importar". After import, a "Parcelamentos detectados" card lists series with an input "Total de parcelas" and button "Confirmar". "Desfazer importação" lives at the bottom.

- [ ] **Step 1: Failing unit tests** for `planZakImport` (one case per mapping bullet above, plus: credit row in sheet Out with date 2026-09-16 → invoice month "2026-10").
- [ ] **Step 2: Failing integration tests:** importing a fixture workbook (build it in the test with exceljs from the Task 9 fixtures) creates N rows; importing again creates 0 and skips N; a manual transaction created before survives `undoZakImport`; `confirmSeries` with total 5 on a 3-month series creates 2 future installments.
- [ ] **Step 3:** Run → FAIL. **Step 4:** Implement. **Step 5:** Run → PASS.
- [ ] **Step 6:** Manual check with the real file (copy of `Cópia de Zak26.xlsx`, never committed): preview shows Jan–Nov, issues include the Mar `DATA_INVALIDA` rows and the "Outros" blocks; month totals match Geral rows 2 and 9 except the documented Ticket difference. Record the result in the commit message.
- [ ] **Step 7:** Commit `feat: one-time Zak26 import with preview, series and undo`.

### Task 11: Month dashboard (`/`)

**Files:**
- Create: `src/domain/dashboard.ts`, `src/server/services/dashboard.ts`, `src/app/(app)/page.tsx`, `src/components/dashboard/*`
- Test: `tests/unit/dashboard.test.ts`, `tests/e2e/dashboard.spec.ts`

**Interfaces — Produces:**
- `summarizeMonth(input: { month: string; txs: DashTx[]; history: { month: string; categoryId: string; cents: number }[] }): MonthSummary` where `DashTx = { type; month; amountCents; categoryId; countsInCostOfLiving: boolean; projectId: string | null; isTransferToInvestment: boolean }` and `MonthSummary = { incomeCents; expenseCents; investedCents; byCategory: { categoryId; cents; avg3Cents; overPct: number | null }[]; byProject: { projectId; cents }[]; costOfLivingCents }`. `overPct` = (cents − avg3)/avg3 when avg3 > 0, flagged in UI when > 0.20. Projects and categories with `countsInCostOfLiving=false` are excluded from `costOfLivingCents`.
- `getDashboard(month: string)` adds: checking balance, open card invoice total and next due date, unpaid invoices due this month, `sobraPrevistaCents = checkingBalance − unpaidInvoicesDueThisMonth`, pending reimbursements total, latest `AssetSnapshot` total ("Patrimônio") and `anosDeCobertura = patrimônio / (avg costOfLiving of last 12 months × 12)` shown small.

Screen (mobile-first cards, then a 2-column desktop grid): month picker; cards Entradas, Saídas, Sobra prevista, Fatura aberta; "Para onde foi" bar chart by category (Recharts, horizontal bars, highlight > 20% above average with "↑ 35% acima da média"); projects list; Patrimônio + "cobre X anos do seu custo de vida".

- [ ] **Step 1: Failing unit tests:** month with Mercado 1200 and previous 3 months 1000/1000/1000 → `overPct` 0.2 (not flagged: rule is strictly > 0.20) and with 1300 → 0.3 flagged; Sótão project expense excluded from `costOfLivingCents`; transfer to investment counted in `investedCents`, not expenses.
- [ ] **Step 2:** Failing e2e: after seeding a few transactions, `/` shows "Entradas", "Saídas" with the right BRL values and the category chart.
- [ ] **Step 3:** Implement. **Step 4:** Run unit + e2e → PASS.
- [ ] **Step 5:** Commit `feat: month dashboard`.

### Task 12: Mobile pass, docs and deploy readiness

**Files:**
- Modify: pages from Tasks 5–11 as needed
- Create: `docs/ARCHITECTURE.md`, `docs/DEPLOY-RAILWAY.md`, `public/manifest.webmanifest`, icons
- Test: `tests/e2e/mobile.spec.ts`

- [ ] **Step 1:** Failing e2e at viewport 390×844: dashboard has no horizontal scroll (`document.documentElement.scrollWidth <= 390`); "+ Lançar" opens the sheet and saves an entry; `/faturas` readable.
- [ ] **Step 2:** Fix layouts; add web manifest (name "ZakFinance", `display: standalone`) so it can be added to the home screen.
- [ ] **Step 3:** Write `README.md` (quick start in pt-BR), `docs/ARCHITECTURE.md` (layers, model, invoice/month rules, import mapping), `docs/DEPLOY-RAILWAY.md` (adapted from HomeRemodel: Postgres service, variables `DATABASE_URL`, `APP_TIMEZONE=America/Sao_Paulo`, `ADMIN_*`; no volume needed).
- [ ] **Step 4:** Run `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build && npx playwright test` → all PASS.
- [ ] **Step 5:** Commit `feat: mobile pass, docs and deploy readiness`. Push when the GitHub remote exists.
