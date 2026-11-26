"use client";

import { useMemo, useState } from "react";

type Confidence = "Alta" | "Média" | "Baixa";
type BankTransaction = {
  id: string;
  externalId?: string;
  date: string;
  amount: number;
  movement: "credit" | "debit";
  description: string;
  counterparty: string;
  document?: string;
  ruleKey: string;
  target: "Contas a Receber" | "Contas a Pagar" | "Transferências" | "Ignorar";
  category: string;
  accounting: string;
  flowType: string;
  costRelation: string;
  costBehavior: string;
  origin: string;
  destination: string;
  confidence: Confidence;
  suggestionSource: string;
  selected: boolean;
  reviewRequired: boolean;
};

type Analysis = {
  fileName: string;
  bank: string;
  account: string;
  accountLabel: string;
  companyDocument: string;
  parser: string;
  pages: number;
  transactions: BankTransaction[];
  totals: { credits: number; debits: number };
  confidence: { high: number; medium: number; low: number };
};

type LearnedRule = { key: string; target: string; category: string; costRelation?: string; costBehavior?: string; origin?: string; destination?: string; bank?: string };
type ImportResult = { error?: string; rows?: string[][]; cashFlow?: string[][]; duplicates?: number };

const normalize = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
const numberValue = (value = "") => Number(value.replace(/R\$|\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const monthName = (date: string) => ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"][Number(date.slice(5, 7)) - 1] ?? "";
const parseResponse = async <T,>(response: Response): Promise<T> => {
  const text = await response.text();
  try { return JSON.parse(text) as T; } catch { throw new Error(response.ok ? "A resposta recebida não pôde ser interpretada." : "O serviço de importação está temporariamente indisponível."); }
};
const headerIndex = (headers: string[], pattern: RegExp) => headers.findIndex((header) => pattern.test(header.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));

export default function BankStatementImporter({ sheets, configRows, onClose, onImported }: {
  sheets: Record<string, string[][]>;
  configRows: string[][];
  onClose: () => void;
  onImported: (updates: Record<string, string[][]>, cashFlow: string[][] | undefined, count: number, duplicates: number) => void;
}) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [learn, setLearn] = useState(true);
  const categories = useMemo(() => [...new Set(configRows.filter((row) => /categoria contábil/i.test(row[0] ?? "")).map((row) => row[1]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [configRows]);
  const learnedRules = useMemo<LearnedRule[]>(() => {
    const map = new Map<string, LearnedRule>();
    for (const row of configRows) if (/^regra bancária$/i.test(row[0] ?? "") && row[1]) map.set(row[1], { key: row[1], target: row[2], category: row[3], costRelation: row[4], costBehavior: row[5], origin: row[6], destination: row[7], bank: row[8] });
    return [...map.values()];
  }, [configRows]);

  const buildRow = (target: string, item: BankTransaction) => {
    const headers = sheets[target]?.[0] ?? [];
    const values = headers.map(() => "");
    const set = (pattern: RegExp, value: string) => { const index = headerIndex(headers, pattern); if (index >= 0) values[index] = value; };
    if (target === "Transferências") {
      set(/^data$/i, item.date);
      set(/^conta origem$/i, item.origin);
      set(/^conta destino$/i, item.destination);
      set(/^valor$/i, String(Math.abs(item.amount)));
      set(/^descrição$/i, `[${item.movement === "credit" ? "Entrada" : "Saída"}] ${item.category} · ${item.description.slice(0, 280)} · ID bancário: ${item.externalId || item.id}`);
      set(/^origem$/i, `Extrato ${analysis?.bank ?? "bancário"} · ${analysis?.fileName ?? "arquivo importado"}`);
      set(/ano de exercício/i, item.date.slice(0, 4));
      return values;
    }
    const status = target === "Contas a Receber" ? "Recebido" : "Pago";
    set(/^data$/i, item.date); set(/^contabilidade$/i, item.accounting);
    set(/^ano$/i, item.date.slice(0, 4)); set(/^m[eê]s$/i, monthName(item.date)); set(/^empresa$/i, "Dronefy");
    set(/^conta corrente$/i, analysis?.accountLabel || analysis?.bank || "Conta bancária"); set(/^tipo contábil$/i, item.flowType);
    set(/^categoria contábil$/i, item.category); set(/^centro de custo$/i, "Consolidado"); set(/^empenho$/i, item.counterparty);
    set(/^origem$/i, item.origin); set(/^cc pagador$/i, item.movement === "debit" ? (analysis?.accountLabel || analysis?.bank || "Conta bancária") : item.origin); set(/^destino$/i, item.destination);
    set(/^valor$/i, String(Math.abs(item.amount))); set(/^status$/i, status); set(/ano de exercício/i, item.date.slice(0, 4));
    set(/relação do custo/i, item.costRelation); set(/comportamento do custo/i, item.costBehavior);
    return values;
  };

  const duplicateKeys = useMemo(() => {
    const result = new Map<string, Set<string>>();
    for (const target of ["Contas a Receber", "Contas a Pagar", "Transferências"]) {
      const sheet = sheets[target] ?? []; const headers = sheet[0] ?? [];
      const date = headerIndex(headers, /^data$/i), value = headerIndex(headers, /^valor$/i);
      const origin = headerIndex(headers, target === "Transferências" ? /^conta origem$/i : /^origem$/i);
      const destination = headerIndex(headers, target === "Transferências" ? /^conta destino$/i : /^destino$/i);
      const account = headerIndex(headers, /^conta corrente$/i);
      result.set(target, new Set(sheet.slice(1).map((row) => [normalize(row[date]), Math.abs(numberValue(row[value])).toFixed(2), normalize(row[origin]), normalize(row[destination]), account >= 0 ? normalize(row[account]) : ""].join("|"))));
    }
    return result;
  }, [sheets]);
  const isDuplicate = (item: BankTransaction) => {
    if (item.target === "Ignorar") return false;
    const row = buildRow(item.target, item); const headers = sheets[item.target]?.[0] ?? [];
    const date = headerIndex(headers, /^data$/i), value = headerIndex(headers, /^valor$/i);
    const origin = headerIndex(headers, item.target === "Transferências" ? /^conta origem$/i : /^origem$/i);
    const destination = headerIndex(headers, item.target === "Transferências" ? /^conta destino$/i : /^destino$/i);
    const account = headerIndex(headers, /^conta corrente$/i);
    return duplicateKeys.get(item.target)?.has([normalize(row[date]), Math.abs(numberValue(row[value])).toFixed(2), normalize(row[origin]), normalize(row[destination]), account >= 0 ? normalize(row[account]) : ""].join("|")) ?? false;
  };
  const update = (id: string, patch: Partial<BankTransaction>) => setAnalysis((current) => current ? { ...current, transactions: current.transactions.map((item) => item.id === id ? { ...item, ...patch } : item) } : current);
  const updateTarget = (item: BankTransaction, target: BankTransaction["target"]) => {
    const loan = /empréstimo|aporte|adiantamento/i.test(item.category);
    const accounting = target === "Transferências" ? "Transferência" : loan ? "Empréstimo" : target === "Contas a Receber" ? "Receita" : target === "Contas a Pagar" ? "Despesa" : item.accounting;
    const flowType = target === "Transferências" ? (item.movement === "credit" ? "Entrada por transferência" : "Saída por transferência") : target === "Contas a Receber" ? "Recebimento bancário" : target === "Contas a Pagar" ? "Pagamento bancário" : item.flowType;
    update(item.id, { target, accounting, flowType, selected: target !== "Ignorar" });
  };
  const updateIdentity = (patch: Partial<Pick<Analysis, "bank" | "account">>) => setAnalysis((current) => {
    if (!current) return current;
    const bank = patch.bank ?? current.bank;
    const account = patch.account ?? current.account;
    const accountLabel = [bank.trim() || "Banco não identificado", account.trim() ? `Conta ${account.trim()}` : ""].filter(Boolean).join(" · ");
    return {
      ...current,
      bank,
      account,
      accountLabel,
      transactions: current.transactions.map((item) => ({
        ...item,
        origin: item.origin === current.accountLabel ? accountLabel : item.origin,
        destination: item.destination === current.accountLabel ? accountLabel : item.destination,
      })),
    };
  });
  const eligible = analysis?.transactions.filter((item) => item.target !== "Ignorar" && !isDuplicate(item)) ?? [];
  const allEligibleSelected = eligible.length > 0 && eligible.every((item) => item.selected);
  const selected = analysis?.transactions.filter((item) => item.selected && item.target !== "Ignorar" && !isDuplicate(item)) ?? [];
  const toggleAllEligible = () => {
    const eligibleIds = new Set(eligible.map((item) => item.id));
    setAnalysis((current) => current ? {
      ...current,
      transactions: current.transactions.map((item) => eligibleIds.has(item.id) ? { ...item, selected: !allEligibleSelected } : item),
    } : current);
  };

  const analyze = async (file?: File) => {
    if (!file) return; setLoading(true); setError(""); const form = new FormData(); form.append("file", file); form.append("rules", JSON.stringify(learnedRules));
    try {
      const response = await fetch("/api/bank-statement", { method: "POST", body: form }); const result = await parseResponse<Analysis & { error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "Não foi possível interpretar o extrato.");
      setAnalysis(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível interpretar o extrato."); } finally { setLoading(false); }
  };

  const commit = async () => {
    if (!selected.length) return setError("Selecione e confira ao menos uma movimentação nova.");
    setImporting(true); setError(""); const updates: Record<string, string[][]> = {}; let cashFlow: string[][] | undefined; let imported = 0; let duplicates = 0;
    try {
      for (const target of ["Contas a Receber", "Contas a Pagar", "Transferências"] as const) {
        const group = selected.filter((item) => item.target === target); if (!group.length) continue;
        for (let start = 0; start < group.length; start += 400) {
          const batchItems = group.slice(start, start + 400);
          const batch = batchItems.map((item) => buildRow(target, item));
          const bankImports = batchItems.map((item) => ({ transactionId: item.externalId || item.id, bank: analysis?.bank ?? "", account: analysis?.account ?? "", date: item.date, movement: item.movement, value: item.amount, target, fileName: analysis?.fileName ?? "", description: item.description }));
          const response = await fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "bulk-create", sheet: target, rows: batch, bankImports }) });
          const result = await parseResponse<ImportResult>(response); if (!response.ok) throw new Error(result.error || `Não foi possível atualizar ${target}.`);
          updates[target] = [...(updates[target] ?? []), ...(result.rows ?? [])];
          imported += result.rows?.length ?? 0; duplicates += result.duplicates ?? 0; if (result.cashFlow) cashFlow = result.cashFlow;
        }
      }
      if (learn) {
        const rules = [...new Map(selected.map((item) => [item.ruleKey, { key: item.ruleKey, target: item.target, category: item.category, costRelation: item.costRelation, costBehavior: item.costBehavior, origin: item.origin, destination: item.destination, bank: analysis?.bank }])).values()];
        for (let start = 0; start < rules.length; start += 400) {
          const response = await fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "learn-bank-rules", sheet: "Configurações", rules: rules.slice(start, start + 400) }) });
          const result = await parseResponse<{ error?: string }>(response); if (!response.ok) throw new Error(result.error || "Os lançamentos foram salvos, mas as regras não foram atualizadas.");
        }
      }
      onImported(updates, cashFlow, imported, duplicates);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir a importação."); } finally { setImporting(false); }
  };

  return <div className="modal-backdrop" role="presentation"><section className="bank-import-modal" role="dialog" aria-modal="true" aria-labelledby="bank-import-title">
    <div className="modal-head"><div><span>FINANCEIRO</span><h3 id="bank-import-title">Importar extrato bancário</h3></div><button onClick={onClose} aria-label="Fechar">×</button></div>
    {!analysis ? <div className="bank-upload"><label><strong>{loading ? "Identificando banco e movimentações..." : "Selecione o extrato bancário"}</strong><span>Formatos aceitos: PDF com texto selecionável, OFX, QFX, CSV e TXT.</span><input type="file" accept=".pdf,.ofx,.qfx,.csv,.txt,application/pdf,text/csv,text/plain" disabled={loading} onChange={(event) => analyze(event.target.files?.[0])}/></label><aside><b>Importação protegida</b><p>Nenhum lançamento é salvo antes da conferência. Duplicidades, transferências internas e pagamentos de fatura são separados das despesas.</p><p>Correções confirmadas passam a ser sugeridas automaticamente nas próximas importações.</p></aside></div> : <>
      <div className="bank-import-summary"><div className="bank-identity-card"><span>Banco e conta — confira antes de importar</span><div className="bank-identity-fields"><label><small>Banco</small><input value={analysis.bank} onChange={(event) => updateIdentity({ bank: event.target.value })}/></label><label><small>Conta</small><input value={analysis.account} onChange={(event) => updateIdentity({ account: event.target.value })}/></label></div><small>{analysis.parser} · {analysis.fileName}</small></div><div><span>Contas a Receber</span><strong>{brl(analysis.transactions.filter((item) => item.target === "Contas a Receber").reduce((sum, item) => sum + item.amount, 0))}</strong><small>{analysis.transactions.filter((item) => item.target === "Contas a Receber").length} entrada(s) conciliada(s)</small></div><div><span>Contas a Pagar</span><strong>{brl(analysis.transactions.filter((item) => item.target === "Contas a Pagar").reduce((sum, item) => sum + item.amount, 0))}</strong><small>{analysis.transactions.filter((item) => item.target === "Contas a Pagar").length} saída(s) operacional(is)</small></div><div><span>Fora de receita/despesa</span><strong>{brl(analysis.transactions.filter((item) => item.target === "Transferências").reduce((sum, item) => sum + item.amount, 0))}</strong><small>{analysis.transactions.filter((item) => item.target === "Transferências").length} transferência(s), fatura(s) ou aplicação(ões)</small></div></div>
      <div className="learning-switch"><label><input type="checkbox" aria-label="Aprender com esta conferência" checked={learn} onChange={(event) => setLearn(event.target.checked)}/><span><b>Aprender com esta conferência</b><small>Salvar as classificações confirmadas para o mesmo CPF/CNPJ ou favorecido.</small></span></label><div className="selection-actions"><button type="button" className="select-all-action" onClick={toggleAllEligible} disabled={!eligible.length} aria-pressed={allEligibleSelected}>{allEligibleSelected ? "Desmarcar todos" : "Marcar todos"}</button><strong>{selected.length} selecionado(s) · {brl(selected.reduce((sum, item) => sum + item.amount, 0))}</strong></div></div>
      <div className="bank-review"><table><thead><tr><th>Importar</th><th>Data</th><th>Movimento</th><th>Favorecido/Pagador</th><th>Valor</th><th>Destino do lançamento</th><th>Categoria</th><th>Origem</th><th>Destino</th><th>Relação</th><th>Comportamento</th><th>Precisão</th></tr></thead><tbody>{analysis.transactions.map((item) => { const duplicate = isDuplicate(item); return <tr key={item.id} className={duplicate ? "duplicate-row" : item.reviewRequired ? "review-row" : ""}><td><input type="checkbox" checked={item.selected && !duplicate} disabled={duplicate || item.target === "Ignorar"} onChange={(event) => update(item.id, { selected: event.target.checked })}/>{duplicate && <small>Duplicado</small>}</td><td><input type="date" value={item.date} onChange={(event) => update(item.id, { date: event.target.value })}/></td><td><span className={`movement ${item.movement}`}>{item.movement === "credit" ? "Entrada" : "Saída"}</span></td><td><input value={item.counterparty} onChange={(event) => update(item.id, { counterparty: event.target.value })}/><small>{item.document || item.suggestionSource}</small></td><td><strong>{brl(item.amount)}</strong></td><td><select value={item.target} onChange={(event) => updateTarget(item, event.target.value as BankTransaction["target"])}><option>Contas a Receber</option><option>Contas a Pagar</option><option>Transferências</option><option>Ignorar</option></select></td><td><input list="bank-categories" value={item.category} onChange={(event) => update(item.id, { category: event.target.value })}/><small>{item.accounting} · {item.flowType}</small></td><td><input value={item.origin} onChange={(event) => update(item.id, { origin: event.target.value })}/></td><td><input value={item.destination} onChange={(event) => update(item.id, { destination: event.target.value })}/></td><td><select value={item.costRelation} onChange={(event) => update(item.id, { costRelation: event.target.value })}><option>Direto</option><option>Indireto</option></select></td><td><select value={item.costBehavior} onChange={(event) => update(item.id, { costBehavior: event.target.value })}><option>Fixo</option><option>Variável</option></select></td><td><span className={`confidence ${normalize(item.confidence)}`}>{item.confidence}</span><small>{item.suggestionSource}</small></td></tr>; })}</tbody></table><datalist id="bank-categories">{categories.map((category) => <option key={category} value={category}/>)}</datalist></div>
    </>}
    {error && <div className="invoice-import-error">{error}</div>}
    <div className="modal-actions">{analysis && <button className="cancel-action" onClick={() => setAnalysis(null)} disabled={loading || importing}>Trocar arquivo</button>}<button className="cancel-action" onClick={onClose} disabled={loading || importing}>Cancelar</button>{analysis && <button className="save-action" onClick={commit} disabled={importing || !selected.length}>{importing ? "Importando e conciliando..." : `Confirmar ${selected.length} lançamento(s)`}</button>}</div>
  </section></div>;
}
