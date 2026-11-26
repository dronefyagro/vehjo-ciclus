export type BankMovement = "credit" | "debit";
export type BankConfidence = "Alta" | "Média" | "Baixa";
export type BankTarget = "Contas a Receber" | "Contas a Pagar" | "Transferências" | "Ignorar";

export type BankRawTransaction = {
  date: string;
  amount: number;
  movement: BankMovement;
  description: string;
  counterparty: string;
  document?: string;
  externalId?: string;
};

export type BankLearnedRule = {
  key: string;
  target: string;
  category: string;
  costRelation?: string;
  costBehavior?: string;
  origin?: string;
  destination?: string;
};

export type BankMigrationDecision = BankRawTransaction & {
  id: string;
  ruleKey: string;
  target: BankTarget;
  category: string;
  accounting: string;
  flowType: string;
  costRelation: string;
  costBehavior: string;
  origin: string;
  destination: string;
  confidence: BankConfidence;
  suggestionSource: string;
  selected: boolean;
  reviewRequired: boolean;
};

const DRONEFY_DOCUMENTS = new Set(["40206420000143"]);

export const normalizeBankText = (value = "") => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9]+/g, " ")
  .trim()
  .toLowerCase();

export const onlyDigits = (value = "") => value.replace(/\D/g, "");

export const extractBankDocument = (value = "") => value.match(
  /\b\d{2}\.?\d{3}\.?\d{3}(?:\/|\s)?\d{4}-?\d{2}\b|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
)?.[0];

export const bankRuleKey = (transaction: Pick<BankRawTransaction, "document" | "counterparty">) => {
  const document = onlyDigits(transaction.document);
  if (document.length >= 11) return `doc:${document}`;
  const name = normalizeBankText(transaction.counterparty)
    .replace(/\b(pix|ted|doc|pagamento|transferencia|recebido|enviado|compra|debito|credito|ltda|sa|me|eireli)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `nome:${name.slice(0, 72)}`;
};

type ExpenseSuggestion = { category: string; relation: string; behavior: string; flowType: string };

const expenseSuggestion = (transaction: BankRawTransaction): ExpenseSuggestion | undefined => {
  const value = normalizeBankText(`${transaction.counterparty} ${transaction.description}`);
  const rules: Array<[RegExp, ExpenseSuggestion]> = [
    [/posto|combustivel|gasolina|etanol|diesel/, { category: "Combustível", relation: "Direto", behavior: "Variável", flowType: "Despesa operacional" }],
    [/auto pec|retifica|oficina|mecanica|pneu|borracharia|manutencao.*veiculo/, { category: "Manutenção de veículos", relation: "Direto", behavior: "Variável", flowType: "Despesa operacional" }],
    [/locadora|rent car|aluguel.*carro|veiculo locado/, { category: "Locação de veículos", relation: "Direto", behavior: "Variável", flowType: "Despesa operacional" }],
    [/cemig|energia|eletric/, { category: "Energia elétrica", relation: "Indireto", behavior: "Fixo", flowType: "Despesa administrativa" }],
    [/agua|saneamento|copasa/, { category: "Água e saneamento", relation: "Indireto", behavior: "Fixo", flowType: "Despesa administrativa" }],
    [/telecom|internet|telefon|claro|vivo|tim\b/, { category: "Internet e telecomunicações", relation: "Indireto", behavior: "Fixo", flowType: "Despesa administrativa" }],
    [/hotel|pousada|restaurante|churrasc|lanch|aliment|padaria|supermercado|hiper pao/, { category: "Viagens e alimentação", relation: "Direto", behavior: "Variável", flowType: "Despesa operacional" }],
    [/uber|99app|expresso|passagem|azul|gol\b|latam|transport/, { category: "Transporte e viagens", relation: "Direto", behavior: "Variável", flowType: "Despesa operacional" }],
    [/fazenda|ministerio|darf|das\b|imposto|tribut/, { category: "Impostos e tributos", relation: "Indireto", behavior: "Fixo", flowType: "Despesa tributária" }],
    [/pacote servicos|tarifa|taxa bancaria|anuidade/, { category: "Tarifa Bancária", relation: "Indireto", behavior: "Fixo", flowType: "Despesa financeira" }],
    [/conselho|crea|cfta/, { category: "Taxas e anuidades", relation: "Indireto", behavior: "Fixo", flowType: "Despesa administrativa" }],
    [/parafuso|ferrament|material|papelaria|armarinho/, { category: "Materiais e suprimentos", relation: "Direto", behavior: "Variável", flowType: "Despesa operacional" }],
    [/software|tecnologia|vindi|google|microsoft|adobe|canva|vercel|openai/, { category: "Tecnologia e software", relation: "Indireto", behavior: "Fixo", flowType: "Despesa administrativa" }],
  ];
  return rules.find(([pattern]) => pattern.test(value))?.[1];
};

const isRelatedParty = (text: string) => /agrosolver|santos e carvalho|santos e cavalho|59059260000185|jovenildo(?: alves)?(?: de)? carval|carmen regina|socio/.test(text);

export const classifyBankMigration = (
  transaction: BankRawTransaction,
  accountLabel: string,
  companyDocument: string,
  learnedRules: Map<string, BankLearnedRule>,
): BankMigrationDecision => {
  const key = bankRuleKey(transaction);
  const learned = learnedRules.get(key);
  const text = normalizeBankText(`${transaction.counterparty} ${transaction.description}`);
  const counterpartyDocument = onlyDigits(transaction.document);
  const ownDocuments = new Set([...DRONEFY_DOCUMENTS, onlyDigits(companyDocument)].filter((item) => item.length >= 11));
  const ownAccount = ownDocuments.has(counterpartyDocument)
    || /mesma tit|mesma titularidade|entre contas|transferencia interna/.test(text);
  const cardSettlement = /pagamento (?:da )?fatura|debito automatico.*cartao|administradora.*cartao|cora scfi.*fatura/.test(text);
  const capitalContribution = /deb parcelas subsc integr|cota capital|integralizacao de capital|subscricao de capital/.test(text);
  const investment = /aplicacao financeira|resgate aplicacao|aplicacao rdc|resgate rdc/.test(text);
  const refund = /estorno|devolucao|reembolso|chargeback/.test(text);
  const relatedParty = isRelatedParty(text);
  const automaticExpense = expenseSuggestion(transaction);

  let target: BankTarget;
  let category: string;
  let accounting: string;
  let flowType: string;
  let confidence: BankConfidence;
  let suggestionSource: string;

  if (ownAccount) {
    target = "Transferências";
    category = "Transferência interna";
    accounting = "Transferência";
    flowType = transaction.movement === "credit" ? "Entrada por transferência" : "Saída por transferência";
    confidence = "Alta";
    suggestionSource = "Mesma titularidade reconhecida";
  } else if (cardSettlement) {
    target = "Transferências";
    category = "Pagamento de fatura";
    accounting = "Movimentação financeira";
    flowType = "Pagamento de cartão de crédito";
    confidence = "Alta";
    suggestionSource = "Liquidação de cartão sem duplicar a despesa";
  } else if (capitalContribution || investment) {
    target = "Transferências";
    category = capitalContribution ? "Integralização de capital" : "Aplicação financeira";
    accounting = "Movimentação patrimonial";
    flowType = transaction.movement === "credit" ? "Resgate/entrada patrimonial" : "Aplicação/saída patrimonial";
    confidence = "Alta";
    suggestionSource = "Movimentação patrimonial reconhecida";
  } else if (relatedParty) {
    target = transaction.movement === "credit" ? "Contas a Receber" : "Contas a Pagar";
    category = transaction.movement === "credit" ? "Empréstimo ou aporte recebido" : "Empréstimo, adiantamento ou devolução";
    accounting = "Empréstimo";
    flowType = transaction.movement === "credit" ? "Entrada de financiamento" : "Saída de financiamento";
    confidence = "Média";
    suggestionSource = "Parte relacionada reconhecida · confirmar finalidade";
  } else if (refund) {
    target = transaction.movement === "credit" ? "Contas a Receber" : "Contas a Pagar";
    category = "Estorno e reembolso";
    accounting = "Ajuste financeiro";
    flowType = transaction.movement === "credit" ? "Entrada de ajuste" : "Saída de ajuste";
    confidence = "Alta";
    suggestionSource = "Estorno ou reembolso reconhecido";
  } else {
    target = transaction.movement === "credit" ? "Contas a Receber" : "Contas a Pagar";
    category = transaction.movement === "credit" ? "Receita a conciliar" : automaticExpense?.category || "Pendente de classificação";
    accounting = transaction.movement === "credit" ? "Receita" : "Despesa";
    flowType = transaction.movement === "credit" ? "Recebimento bancário" : automaticExpense?.flowType || "Pagamento bancário";
    confidence = automaticExpense ? "Alta" : transaction.movement === "credit" || counterpartyDocument.length === 14 ? "Média" : "Baixa";
    suggestionSource = automaticExpense ? "Categoria de despesa reconhecida" : confidence === "Média" ? "Movimentação identificada · confirmar classificação" : "Revisão obrigatória";
  }

  // Regras estruturais evitam que um aprendizado antigo transforme transferências e faturas em receita ou despesa.
  const structuralProtection = ownAccount || cardSettlement || capitalContribution || investment;
  if (learned && !structuralProtection) {
    if (["Contas a Receber", "Contas a Pagar", "Transferências", "Ignorar"].includes(learned.target)) target = learned.target as BankTarget;
    category = learned.category || category;
    if (target === "Transferências") {
      accounting = "Transferência";
      flowType = transaction.movement === "credit" ? "Entrada por transferência" : "Saída por transferência";
    } else if (target === "Contas a Receber" && accounting !== "Empréstimo") {
      accounting = "Receita";
      flowType = "Recebimento bancário";
    } else if (target === "Contas a Pagar" && accounting !== "Empréstimo") {
      accounting = "Despesa";
      flowType = "Pagamento bancário";
    }
    confidence = "Alta";
    suggestionSource = "Regra aprendida em conferência anterior";
  }

  const origin = learned?.origin || (transaction.movement === "credit" ? transaction.counterparty : accountLabel);
  const destination = learned?.destination || (transaction.movement === "credit" ? accountLabel : transaction.counterparty);
  const reviewRequired = confidence === "Baixa" || relatedParty;
  const fallbackId = `${transaction.date}|${transaction.movement}|${transaction.amount.toFixed(2)}|${key}|${normalizeBankText(transaction.description).slice(0, 120)}`;

  return {
    ...transaction,
    id: transaction.externalId || fallbackId,
    ruleKey: key,
    target,
    category,
    accounting,
    flowType,
    costRelation: learned?.costRelation || automaticExpense?.relation || "Indireto",
    costBehavior: learned?.costBehavior || automaticExpense?.behavior || "Variável",
    origin,
    destination,
    confidence,
    suggestionSource,
    selected: confidence !== "Baixa",
    reviewRequired,
  };
};

export const bankImportKey = (bank: string, account: string, transactionId: string) => [bank, account, transactionId]
  .map((value) => normalizeBankText(value))
  .join("|");

export const reconcileRelatedBankPairs = (transactions: BankMigrationDecision[]) => transactions.map((transaction) => {
  if (transaction.movement !== "debit" || transaction.target !== "Contas a Pagar" || transaction.accounting !== "Despesa") return transaction;
  const relatedCredit = transactions.find((candidate) => candidate.movement === "credit"
    && candidate.accounting === "Empréstimo"
    && candidate.date === transaction.date
    && Math.abs(candidate.amount - transaction.amount) < 0.005);
  if (!relatedCredit) return transaction;
  return {
    ...transaction,
    category: "Repasse ou devolução de recurso",
    accounting: "Empréstimo",
    flowType: "Saída de financiamento",
    confidence: "Média" as const,
    suggestionSource: `Entrada vinculada a ${relatedCredit.counterparty} no mesmo dia · confirmar finalidade`,
    selected: true,
    reviewRequired: true,
  };
});
