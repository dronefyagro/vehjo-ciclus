"use client";

import { useMemo, useState } from "react";
import type { VehjoData } from "./lib/google-sheets";

type ExpenseRecord = {
  rowIndex: number;
  code: string;
  date: string;
  year: string;
  status: string;
  value: number;
  category: string;
  commitment: string;
  counterparty: string;
  costKind: CostKind | "Não classificado";
  operationLinked: boolean;
  searchable: string;
};

type CostKind = "Combustível" | "Carro" | "Hospedagem" | "Alimentação";

const COST_KINDS: CostKind[] = ["Combustível", "Carro", "Hospedagem", "Alimentação"];
const normalize = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ÃÂ]/g, "").toLocaleLowerCase("pt-BR").trim();
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numberValue = (value = "") => {
  const raw = String(value).replace(/[^\d,.-]/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  return Number(normalized) || 0;
};
const isoDate = (value = "") => {
  const raw = String(value).trim();
  if (/^\d{5}$/.test(raw)) return new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86400000).toISOString().slice(0, 10);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : raw.slice(0, 10);
};
const brazilianDate = (value = "") => {
  const date = isoDate(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return date ? `${date[3]}/${date[2]}/${date[1]}` : value || "—";
};
const display = (value = "") => value || "—";

function classifyOperationalCost(text: string): CostKind | "Não classificado" {
  if (/posto|combust|gasolina|etanol|diesel|abastec/.test(text)) return "Combustível";
  if (/veiculo|carro|automovel|manutenc|oficina|pneu|pedagio|estacion|locacao.{0,12}veiculo|lavagem|seguro.{0,12}auto/.test(text)) return "Carro";
  if (/hotel|pousada|hosped|airbnb/.test(text)) return "Hospedagem";
  if (/restaurante|aliment|refeicao|lanch|mercado|supermercado|ifood/.test(text)) return "Alimentação";
  return "Não classificado";
}

export default function ExpenseAnalysis({ data, onNavigate }: { data: VehjoData; onNavigate: (module: string, query?: string) => void }) {
  const [year, setYear] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [category, setCategory] = useState("Todas");
  const [query, setQuery] = useState("");

  const expenses = useMemo(() => {
    const sheet = data.sheets["Contas a Pagar"] ?? [];
    const headers = sheet[0] ?? [];
    const index = (...patterns: RegExp[]) => headers.findIndex((header) => patterns.some((pattern) => pattern.test(normalize(header))));
    const codeIndex = index(/^codigo$/, /^sequencia$/);
    const dateIndex = index(/^data$/, /vencimento/, /competencia/);
    const yearIndex = index(/ano de exercicio/, /^ano$/);
    const statusIndex = index(/^status$/, /^situacao$/);
    const valueIndex = index(/^valor$/, /valor total/, /valor pago/);
    const categoryIndex = index(/categoria contabil/, /^categoria$/);
    const commitmentIndex = index(/^empenho$/, /descricao/, /historico/);
    const originIndex = index(/^origem$/, /favorecido/, /fornecedor/);
    const destinationIndex = index(/^destino$/, /beneficiario/);
    const accountIndex = index(/conta corrente/);
    const centerIndex = index(/centro de custo/);
    const typeIndex = index(/tipo contabil/);

    return sheet.slice(1).map((row, offset): ExpenseRecord | null => {
      if (!row.some(Boolean)) return null;
      const rawStatus = statusIndex >= 0 ? row[statusIndex] : "";
      if (/cancelad|estornad/.test(normalize(rawStatus))) return null;
      const value = Math.abs(numberValue(valueIndex >= 0 ? row[valueIndex] : ""));
      if (!value) return null;
      const date = dateIndex >= 0 ? isoDate(row[dateIndex]) : "";
      const text = normalize([categoryIndex, commitmentIndex, originIndex, destinationIndex, accountIndex, centerIndex, typeIndex].map((position) => position >= 0 ? row[position] : "").join(" "));
      const counterparty = display((destinationIndex >= 0 ? row[destinationIndex] : "") || (originIndex >= 0 ? row[originIndex] : "") || (commitmentIndex >= 0 ? row[commitmentIndex] : ""));
      return {
        rowIndex: offset + 2,
        code: display(codeIndex >= 0 ? row[codeIndex] : String(offset + 1)),
        date,
        year: (yearIndex >= 0 ? row[yearIndex] : "") || date.slice(0, 4) || "Sem ano",
        status: display(rawStatus),
        value,
        category: display(categoryIndex >= 0 ? row[categoryIndex] : "Sem classificação"),
        commitment: display(commitmentIndex >= 0 ? row[commitmentIndex] : "Sem descrição"),
        counterparty,
        costKind: classifyOperationalCost(text),
        operationLinked: /monitoramento|praga|aplicacao.{0,20}drone|operacao.{0,20}drone|servico.{0,20}drone/.test(text),
        searchable: normalize(`${row.join(" ")} ${counterparty}`),
      };
    }).filter((record): record is ExpenseRecord => Boolean(record));
  }, [data]);

  const years = useMemo(() => [...new Set(expenses.map((item) => item.year))].sort((a, b) => b.localeCompare(a, "pt-BR")), [expenses]);
  const statuses = useMemo(() => [...new Set(expenses.map((item) => item.status))].sort((a, b) => a.localeCompare(b, "pt-BR")), [expenses]);
  const categories = useMemo(() => [...new Set(expenses.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "pt-BR")), [expenses]);
  const filtered = useMemo(() => expenses.filter((item) => (year === "Todos" || item.year === year) && (status === "Todos" || item.status === status) && (category === "Todas" || item.category === category) && (!query || item.searchable.includes(normalize(query)))), [expenses, year, status, category, query]);
  const total = filtered.reduce((sum, item) => sum + item.value, 0);
  const average = filtered.length ? total / filtered.length : 0;
  const largest = [...filtered].sort((a, b) => b.value - a.value).slice(0, 20);

  const recurring = useMemo(() => {
    const groups = new Map<string, { name: string; total: number; count: number; months: Set<string>; lastDate: string }>();
    filtered.forEach((item) => {
      const rawKey = normalize(item.counterparty.replace(/\b\d{2,}[\d./-]*\b/g, ""));
      const key = rawKey && rawKey !== "—" ? rawKey : normalize(`${item.category} ${item.commitment}`);
      const current = groups.get(key) ?? { name: item.counterparty !== "—" ? item.counterparty : item.commitment, total: 0, count: 0, months: new Set<string>(), lastDate: "" };
      current.total += item.value;
      current.count += 1;
      if (item.date) current.months.add(item.date.slice(0, 7));
      if (item.date > current.lastDate) current.lastDate = item.date;
      groups.set(key, current);
    });
    return [...groups.values()].filter((item) => item.count >= 2 && (item.months.size >= 2 || item.count >= 3)).sort((a, b) => b.total - a.total).slice(0, 12);
  }, [filtered]);
  const recurringTotal = recurring.reduce((sum, item) => sum + item.total, 0);

  const operational = useMemo(() => {
    const totals = new Map<CostKind, { total: number; linked: number; count: number }>(COST_KINDS.map((kind) => [kind, { total: 0, linked: 0, count: 0 }]));
    filtered.forEach((item) => {
      if (item.costKind === "Não classificado") return;
      const current = totals.get(item.costKind)!;
      current.total += item.value;
      current.count += 1;
      if (item.operationLinked) current.linked += item.value;
    });
    return COST_KINDS.map((kind) => ({ kind, ...totals.get(kind)! }));
  }, [filtered]);
  const operationalTotal = operational.reduce((sum, item) => sum + item.total, 0);
  const directlyLinked = operational.reduce((sum, item) => sum + item.linked, 0);

  const pareto = useMemo(() => {
    const grouped = new Map<string, number>();
    filtered.forEach((item) => grouped.set(item.category, (grouped.get(item.category) ?? 0) + item.value));
    const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
    const visible = sorted.length > 9 ? [...sorted.slice(0, 9), ["Outras categorias", sorted.slice(9).reduce((sum, [, value]) => sum + value, 0)] as [string, number]] : sorted;
    return visible.reduce<Array<{ label: string; value: number; cumulative: number }>>((items, [label, value]) => {
      const previous = items.at(-1)?.cumulative ?? 0;
      const percentage = total ? value / total * 100 : 0;
      return [...items, { label, value, cumulative: previous + percentage }];
    }, []);
  }, [filtered, total]);
  const paretoThreshold = pareto.filter((item) => item.cumulative <= 80).length + (pareto.some((item) => item.cumulative >= 80) ? 1 : 0);

  return <div className="module-page expense-analysis-page">
    <div className="module-intro expense-analysis-intro"><div className="module-title"><span className="module-icon">▥</span><div><span>INTELIGÊNCIA FINANCEIRA</span><h2>Análise de Despesas</h2><p>Leitura automática e consolidada dos lançamentos de Contas a Pagar</p></div></div><div className="expense-source-badge"><span>Fonte única</span><strong>Contas a Pagar</strong></div></div>

    <section className="card expense-filters" aria-label="Filtros da análise de despesas">
      <label><span>Exercício</span><select value={year} onChange={(event) => setYear(event.target.value)}><option>Todos</option>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Todos</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Categoria</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>Todas</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="expense-search"><span>Pesquisar</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Favorecido, empenho ou descrição" /></label>
    </section>

    <div className="expense-kpis">
      <article><span>Despesas analisadas</span><strong>{money(total)}</strong><small>{filtered.length.toLocaleString("pt-BR")} lançamento(s) no filtro</small></article>
      <article><span>Ticket médio</span><strong>{money(average)}</strong><small>Média por lançamento</small></article>
      <article><span>Despesas recorrentes</span><strong>{money(recurringTotal)}</strong><small>{recurring.length} grupo(s) recorrente(s)</small></article>
      <article><span>Custos operacionais</span><strong>{money(operationalTotal)}</strong><small>{money(directlyLinked)} vinculados à operação</small></article>
      <article><span>Concentração de 80%</span><strong>{paretoThreshold || 0} categoria(s)</strong><small>Prioridades indicadas pelo Pareto</small></article>
    </div>

    <section className="card expense-pareto-card">
      <div className="expense-section-head"><div><span>PARETO DAS DESPESAS</span><h3>Concentração por categoria contábil</h3><p>As barras mostram o valor e a linha indica o percentual acumulado.</p></div><div className="pareto-legend"><span><i className="bar"/>Valor</span><span><i className="line"/>Acumulado</span></div></div>
      {pareto.length ? <ParetoChart items={pareto}/> : <EmptyAnalysis/>}
    </section>

    <div className="expense-two-column">
      <section className="card expense-ranking-card"><div className="expense-section-head"><div><span>RANKING</span><h3>Maiores despesas em ordem decrescente</h3></div><strong>Top {largest.length}</strong></div><div className="expense-ranking-list">{largest.length ? largest.map((item, position) => <button key={`${item.rowIndex}-${item.code}`} onClick={() => onNavigate("Contas a Pagar", item.code)}><b>{position + 1}</b><span><strong>{item.counterparty}</strong><small>{item.category} · {brazilianDate(item.date)}</small></span><em>{money(item.value)}</em></button>) : <EmptyAnalysis/>}</div></section>
      <section className="card recurring-card"><div className="expense-section-head"><div><span>RECORRÊNCIA</span><h3>Despesas que se repetem</h3></div><strong>{recurring.length} grupo(s)</strong></div><div className="recurring-list">{recurring.length ? recurring.map((item, position) => <div key={`${normalize(item.name)}-${position}`}><b>{position + 1}</b><span><strong>{item.name}</strong><small>{item.count} lançamentos · {item.months.size} competência(s) · média {money(item.total / item.count)}</small></span><em>{money(item.total)}</em></div>) : <EmptyAnalysis/>}</div></section>
    </div>

    <section className="card operation-cost-card">
      <div className="expense-section-head"><div><span>OPERAÇÃO DE CAMPO</span><h3>Monitoramento de Pragas e Aplicação com drone</h3><p>Classificação por descrições, categorias, empenhos e centros de custo.</p></div><strong>{money(operationalTotal)}</strong></div>
      <div className="operation-cost-grid">{operational.map((item) => <article key={item.kind}><span>{item.kind}</span><strong>{money(item.total)}</strong><div><i style={{ width: `${operationalTotal ? item.total / operationalTotal * 100 : 0}%` }}/></div><small>{item.count} lançamento(s) · {money(item.linked)} com vínculo explícito</small></article>)}</div>
      <div className="operation-reconciliation"><span><strong>{money(directlyLinked)}</strong> vínculo direto com Monitoramento/Aplicação</span><span><strong>{money(operationalTotal - directlyLinked)}</strong> custo identificado pendente de rateio ou confirmação</span></div>
    </section>

    <section className="card expense-detail-card"><div className="expense-section-head"><div><span>DETALHAMENTO</span><h3>Lançamentos priorizados</h3></div><strong>{largest.length} resultado(s)</strong></div><div className="expense-detail-scroll"><table><thead><tr><th>Ordem</th><th>Data</th><th>Código</th><th>Favorecido / destino</th><th>Categoria</th><th>Empenho</th><th>Status</th><th>Valor</th><th>Ação</th></tr></thead><tbody>{largest.map((item, position) => <tr key={`detail-${item.rowIndex}`}><td>{position + 1}</td><td>{brazilianDate(item.date)}</td><td>{item.code}</td><td>{item.counterparty}</td><td>{item.category}</td><td>{item.commitment}</td><td>{item.status}</td><td><strong>{money(item.value)}</strong></td><td><button onClick={() => onNavigate("Contas a Pagar", item.code)}>Abrir</button></td></tr>)}</tbody></table></div></section>
  </div>;
}

function ParetoChart({ items }: { items: Array<{ label: string; value: number; cumulative: number }> }) {
  const width = 1000, height = 420, left = 60, top = 25, plotWidth = 900, plotHeight = 280, bottom = top + plotHeight;
  const max = Math.max(...items.map((item) => item.value), 1);
  const slot = plotWidth / items.length;
  return <div className="pareto-scroll"><svg className="pareto-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="pareto-title"><title id="pareto-title">Gráfico de Pareto das despesas por categoria</title>
    {[0, 25, 50, 75, 100].map((percentage) => { const y = bottom - percentage / 100 * plotHeight; return <g key={percentage}><line x1={left} x2={left + plotWidth} y1={y} y2={y} className="pareto-grid"/><text x={left - 10} y={y + 4} textAnchor="end" className="pareto-axis">{percentage}%</text></g>; })}
    <line x1={left} x2={left + plotWidth} y1={bottom - .8 * plotHeight} y2={bottom - .8 * plotHeight} className="pareto-eighty"/>
    {items.map((item, index) => { const x = left + index * slot + slot * .18, barWidth = slot * .64, barHeight = item.value / max * plotHeight, center = x + barWidth / 2; return <g key={item.label}><rect x={x} y={bottom - barHeight} width={barWidth} height={barHeight} rx="4" className="pareto-bar"><title>{`${item.label}: ${money(item.value)}`}</title></rect><text x={center} y={bottom + 22} textAnchor="end" transform={`rotate(-35 ${center} ${bottom + 22})`} className="pareto-label">{item.label.length > 18 ? `${item.label.slice(0, 18)}…` : item.label}</text></g>; })}
    <polyline points={items.map((item, index) => `${left + index * slot + slot / 2},${bottom - item.cumulative / 100 * plotHeight}`).join(" ")} className="pareto-line"/>
    {items.map((item, index) => { const x = left + index * slot + slot / 2, y = bottom - item.cumulative / 100 * plotHeight; return <g key={`point-${item.label}`}><circle cx={x} cy={y} r="5" className="pareto-point"><title>{`${item.cumulative.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% acumulado`}</title></circle><text x={x} y={y - 11} textAnchor="middle" className="pareto-percentage">{item.cumulative.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%</text></g>; })}
  </svg></div>;
}

function EmptyAnalysis() {
  return <div className="expense-empty"><strong>Sem dados para este filtro</strong><span>Ajuste os filtros ou confira os lançamentos em Contas a Pagar.</span></div>;
}
