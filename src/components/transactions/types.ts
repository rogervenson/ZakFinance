// Formas serializáveis passadas do servidor para os componentes de lançamento.

export interface AccountOption {
  id: string;
  name: string;
  type: "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "BENEFIT" | "INVESTMENT";
}

export interface CategoryOption {
  id: string;
  name: string;
  kind: "EXPENSE" | "INCOME";
}

export interface ProjectOption {
  id: string;
  name: string;
}

export interface EntryOptions {
  accounts: AccountOption[];
  categories: CategoryOption[];
  projects: ProjectOption[];
  descriptions: string[];
  today: string;
}

export interface TxFormValues {
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  date: string;
  description: string;
  amount: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  projectId: string;
  installments: string;
  reimbursable: boolean;
  note: string;
}

export interface TxRow {
  id: string;
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  date: string;
  description: string;
  amountCents: number;
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  projectId: string | null;
  projectName: string | null;
  installmentPlanId: string | null;
  reimbursable: boolean;
  reimbursementStatus: "PENDING" | "SETTLED" | null;
  note: string | null;
  invoicePaid: boolean;
  isInvoicePayment: boolean;
}
