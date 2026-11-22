"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { VehjoData } from "./lib/google-sheets";
import { OFFICIAL_TAX_ENGINES, TAX_CONFIGURATION_FIELDS, TAX_CONFIGURATION_KIND } from "./lib/taxation";

type SheetState = Record<string, string[][]>;
type TaxationProps = { data: VehjoData; onChange: (updater: (current: SheetState) => SheetState) => void };

const tabs = [
  "Painel Tributário",
  "Configuração da Empresa",
  "Calculadora Oficial",
  "Simples Nacional",
  "Lucro Presumido e Real",
  "Reforma 2026–2033",
  "Simulador de Regimes",
  "Integração Fiscal",
  "Inteligência Tributária",
  "Relatórios Tributários",
  "Atualizações Fiscais",
] as const;
type TaxTab = typeof tabs[number];

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numeric = (value = "") => { const raw = String(value).replace(/[^\d,.-]/g, ""); return Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw) || 0; };
const dateIso = (value = "") => { const br = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return br ? `${br[3]}-${br[2]}-${br[1]}` : String(value).slice(0, 10); };
const indexOf = (headers: string[], pattern: RegExp) => headers.findIndex((header) => pattern.test(header.normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
const unavailable = <span className="tax-unavailable">Não disponível</span>;

export default function Taxation({ data, onChange }: TaxationProps) {
  const [activeTab, setActiveTab] = useState<TaxTab>("Painel Tributário");
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("todos");
  const invoiceSheet = useMemo(() => data.sheets["Notas Fiscais"] ?? [], [data.sheets]);
  const configurationRows = (data.sheets["Configurações"] ?? []).slice(1).filter((row) => row[0] === TAX_CONFIGURATION_KIND);
  const metrics = useMemo(() => {
    const headers = invoiceSheet[0] ?? [];
    const dateIndex = indexOf(headers, /data|emissao|competencia/i);
    const valueIndex = indexOf(headers, /^valor$|valor da nota|valor total/i);
    const records = invoiceSheet.slice(1).filter((row) => row.some(Boolean));
    const selected = records.filter((row) => {
      const date = dateIndex >= 0 ? dateIso(row[dateIndex]) : "";
      return date.startsWith(year) && (month === "todos" || date.slice(5, 7) === month);
    });
    const revenue = selected.reduce((sum, row) => sum + Math.abs(numeric(row[valueIndex])), 0);
    const endMonth = month === "todos" ? 12 : Number(month);
    const end = new Date(Date.UTC(Number(year), endMonth, 0));
    const start = new Date(Date.UTC(Number(year), endMonth - 12, 1));
    const rbt12 = records.reduce((sum, row) => {
      const date = dateIndex >= 0 ? new Date(`${dateIso(row[dateIndex])}T00:00:00Z`) : new Date(0);
      return date >= start && date <= end ? sum + Math.abs(numeric(row[valueIndex])) : sum;
    }, 0);
    const monthly = Array.from({ length: 12 }, (_, index) => records.reduce((sum, row) => {
      const date = dateIndex >= 0 ? dateIso(row[dateIndex]) : "";
      return date.slice(0, 7) === `${year}-${String(index + 1).padStart(2, "0")}` ? sum + Math.abs(numeric(row[valueIndex])) : sum;
    }, 0));
    return { revenue, rbt12, documents: selected.length, monthly };
  }, [invoiceSheet, month, year]);
  const maxMonth = Math.max(...metrics.monthly, 1);
  const latestConfiguration = configurationRows.at(-1);

  return <div className="module-page tax-page">
    <div className="module-intro tax-heading"><div className="module-title"><span className="module-icon tax-symbol">%</span><div><span>GESTÃO FISCAL E TRIBUTÁRIA</span><h2>Tributação</h2><p>Fundação auditável para cálculo oficial, acompanhamento e inteligência tributária</p></div></div><div className="tax-foundation-status"><i/>Fundação implantada · motores em homologação</div></div>
    <div className="tax-tabs" role="tablist" aria-label="Áreas do módulo tributário">{tabs.map((tab) => <button key={tab} role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
    <TaxFilters year={year} month={month} onYear={setYear} onMonth={setMonth}/>
    {activeTab === "Painel Tributário" && <TaxDashboard metrics={metrics} maxMonth={maxMonth} configured={Boolean(latestConfiguration)}/>} 
    {activeTab === "Configuração da Empresa" && <TaxConfiguration rows={configurationRows} onChange={onChange}/>} 
    {activeTab === "Calculadora Oficial" && <OfficialCalculator/>}
    {activeTab === "Atualizações Fiscais" && <OfficialEngines/>}
    {activeTab !== "Painel Tributário" && activeTab !== "Configuração da Empresa" && activeTab !== "Calculadora Oficial" && activeTab !== "Atualizações Fiscais" && <FoundationArea tab={activeTab}/>} 
  </div>;
}

function TaxFilters({ year, month, onYear, onMonth }: { year: string; month: string; onYear: (value: string) => void; onMonth: (value: string) => void }) {
  return <div className="tax-filters"><label><span>Empresa</span><select disabled><option>Dronefy Agro</option></select></label><label><span>Estabelecimento</span><select disabled><option>Todos os estabelecimentos</option></select></label><label><span>Exercício</span><select value={year} onChange={(event) => onYear(event.target.value)}>{Array.from({ length: 8 }, (_, index) => 2026 + index).map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Competência</span><select value={month} onChange={(event) => onMonth(event.target.value)}><option value="todos">Ano completo</option>{["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"].map((label, index) => <option key={label} value={String(index + 1).padStart(2, "0")}>{label}</option>)}</select></label><label><span>Regime</span><select disabled><option>Aguardando configuração</option></select></label></div>;
}

function TaxDashboard({ metrics, maxMonth, configured }: { metrics: { revenue: number; rbt12: number; documents: number; monthly: number[] }; maxMonth: number; configured: boolean }) {
  return <>
    <section className="tax-notice"><strong>Base gerencial segura</strong><span>Receitas são lidas das Notas Fiscais. Tributos, créditos e provisões permanecem indisponíveis enquanto não houver configuração válida e cálculo homologado.</span></section>
    <div className="tax-kpis">
      <article><span>Receita bruta no período</span><strong>{money(metrics.revenue)}</strong><small>{metrics.documents} documento(s) fiscal(is)</small></article>
      <article><span>Receita bruta — RBT12</span><strong>{money(metrics.rbt12)}</strong><small>Janela móvel de 12 meses</small></article>
      <article><span>Tributos calculados</span>{unavailable}<small>Sem resultado oficial homologado</small></article>
      <article><span>Carga tributária efetiva</span>{unavailable}<small>Não é presumida como zero</small></article>
      <article><span>Créditos tributários</span>{unavailable}<small>Elegibilidade ainda não apurada</small></article>
      <article><span>Provisão tributária</span>{unavailable}<small>Aguardando integração financeira</small></article>
    </div>
    <div className="tax-dashboard-grid">
      <section className="card tax-chart"><div className="tax-card-title"><div><span>FATURAMENTO FISCAL</span><h3>Evolução mensal da receita bruta</h3></div><em>Fonte: Notas Fiscais</em></div><div className="tax-bars">{metrics.monthly.map((value, index) => <div key={index}><i style={{ height: `${Math.max(value ? 8 : 1, value / maxMonth * 100)}%` }}/><span>{["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"][index]}</span><b>{value ? money(value) : "—"}</b></div>)}</div></section>
      <section className="card tax-readiness"><div className="tax-card-title"><div><span>PRONTIDÃO TRIBUTÁRIA</span><h3>Controles necessários</h3></div></div><ul><li className={configured ? "done" : "pending"}><b>{configured ? "✓" : "!"}</b><span><strong>Configuração da empresa</strong><small>{configured ? "Cadastro tributário registrado" : "Razão social, CNPJ, CNAE e regime pendentes"}</small></span></li><li className="pending"><b>!</b><span><strong>Motores oficiais</strong><small>Implantação em contêiner e homologação pendentes</small></span></li><li className="pending"><b>!</b><span><strong>Conciliação tributária</strong><small>Sem apurações calculadas, declaradas e pagas</small></span></li></ul></section>
    </div>
  </>;
}

function TaxConfiguration({ rows, onChange }: { rows: string[][]; onChange: TaxationProps["onChange"] }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const latest = rows.at(-1);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const values = [TAX_CONFIGURATION_KIND, "razao", "cnpj", "ie", "im", "cnae", "cnaes", "regime", "simples", "uf", "municipio", "operacao", "tratamento", "responsavel", "vigencia"].map((key) => key === TAX_CONFIGURATION_KIND ? key : String(form.get(key) ?? ""));
    values.push(new Date().toISOString());
    try {
      const response = await fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", sheet: "Configurações", values }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a configuração tributária.");
      onChange((current) => ({ ...current, Configurações: [...(current.Configurações ?? []), values] }));
      setEditing(false); setMessage("Configuração tributária registrada com histórico de vigência.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao salvar."); } finally { setSaving(false); }
  };
  return <div className="tax-configuration">
    <section className="card"><div className="tax-card-title"><div><span>CADASTRO TRIBUTÁRIO</span><h3>Configuração vigente da empresa</h3></div><button className="tax-primary" onClick={() => setEditing(!editing)}>{editing ? "Cancelar" : latest ? "Nova vigência" : "Cadastrar"}</button></div>{message && <p className="tax-message">{message}</p>}{!latest && !editing && <div className="tax-empty"><strong>Nenhuma configuração tributária cadastrada</strong><span>Cadastre a empresa antes de habilitar apurações e simulações.</span></div>}{latest && !editing && <dl className="tax-config-summary">{TAX_CONFIGURATION_FIELDS.slice(1, 15).map((field, index) => <div key={field}><dt>{field}</dt><dd>{latest[index + 1] || "Não informado"}</dd></div>)}</dl>}{editing && <form className="tax-form" onSubmit={submit}><label><span>Razão social *</span><input name="razao" defaultValue={latest?.[1]} required/></label><label><span>CNPJ *</span><input name="cnpj" defaultValue={latest?.[2]} required/></label><label><span>Inscrição estadual</span><input name="ie" defaultValue={latest?.[3]}/></label><label><span>Inscrição municipal</span><input name="im" defaultValue={latest?.[4]}/></label><label><span>CNAE principal *</span><input name="cnae" defaultValue={latest?.[5]} required/></label><label><span>CNAEs secundários</span><input name="cnaes" defaultValue={latest?.[6]}/></label><label><span>Regime tributário *</span><select name="regime" defaultValue={latest?.[7] || ""} required><option value="">Selecione</option><option>Simples Nacional</option><option>Lucro Presumido</option><option>Lucro Real</option></select></label><label><span>Enquadramento no Simples</span><select name="simples" defaultValue={latest?.[8] || "Não"}><option>Não</option><option>Sim</option></select></label><label><span>UF *</span><input name="uf" maxLength={2} defaultValue={latest?.[9]} required/></label><label><span>Município *</span><input name="municipio" defaultValue={latest?.[10]} required/></label><label><span>Tipo de operação *</span><select name="operacao" defaultValue={latest?.[11] || ""} required><option value="">Selecione</option><option>Comércio</option><option>Indústria</option><option>Serviços</option><option>Agropecuária</option><option>Mista</option></select></label><label><span>Tratamento especial</span><input name="tratamento" defaultValue={latest?.[12]}/></label><label><span>Responsável contábil *</span><input name="responsavel" defaultValue={latest?.[13]} required/></label><label><span>Início da vigência *</span><input name="vigencia" type="date" defaultValue={latest?.[14]} required/></label><div className="tax-form-actions"><button type="button" onClick={() => setEditing(false)}>Cancelar</button><button className="tax-primary" disabled={saving}>{saving ? "Salvando..." : "Salvar configuração"}</button></div></form>}</section>
    <section className="card tax-audit"><span>HISTÓRICO E AUDITORIA</span><h3>{rows.length} vigência(s) registrada(s)</h3><p>Cada nova configuração é adicionada ao histórico. Registros anteriores não são sobrescritos silenciosamente.</p>{rows.slice().reverse().slice(0, 5).map((row, index) => <div key={`${row[14]}-${index}`}><strong>{row[7] || "Regime não informado"}</strong><span>Vigência desde {row[14] || "data não informada"}</span></div>)}</section>
  </div>;
}

function OfficialCalculator() {
  return <section className="card tax-calculator"><div className="tax-card-title"><div><span>CICLUS TAX ENGINE</span><h3>Calculadora Tributária Oficial</h3></div><em className="tax-status pending">Não homologada</em></div><div className="tax-blocked"><strong>Cálculo bloqueado por segurança</strong><p>Os motores oficiais ainda precisam ser executados em serviços de contêiner compatíveis com Java 25 e Go 1.27, passar por testes de regressão e ser aprovados pelo administrador. Nenhuma alíquota foi criada pelo Ciclus.</p></div><div className="tax-operation-form">{["Empresa e estabelecimento","Competência e data da operação","Natureza da operação","Produto ou serviço","NCM ou NBS","CST e cClassTrib","Valor bruto e componentes da base","UF e município de destino"].map((field) => <label key={field}><span>{field}</span><input disabled placeholder="Disponível após homologação"/></label>)}</div><button className="tax-primary" disabled>Calcular com motor oficial</button></section>;
}

function OfficialEngines() {
  return <div className="official-engines"><section className="tax-notice"><strong>Monitoramento controlado</strong><span>Novas versões não serão ativadas automaticamente. Cada atualização exige análise de compatibilidade, testes e aprovação administrativa.</span></section>{OFFICIAL_TAX_ENGINES.map((engine) => <article className="card" key={engine.id}><div className="tax-card-title"><div><span>RECEITA FEDERAL · LICENÇA {engine.license}</span><h3>{engine.name}</h3></div><em className="tax-status pending">Aguardando homologação</em></div><p>{engine.scope}</p><dl><div><dt>Versão observada</dt><dd>{engine.observedVersion}</dd></div><div><dt>Verificada em</dt><dd>{engine.observedAt}</dd></div><div><dt>Ambiente necessário</dt><dd>{engine.runtime}</dd></div><div><dt>Commit fixado</dt><dd>Não fixado nesta fase</dd></div></dl><a href={engine.repository} target="_blank" rel="noreferrer">Abrir repositório oficial ↗</a></article>)}</div>;
}

function FoundationArea({ tab }: { tab: Exclude<TaxTab, "Painel Tributário" | "Configuração da Empresa" | "Calculadora Oficial" | "Atualizações Fiscais"> }) {
  const content: Record<typeof tab, { title: string; description: string; items: string[]; warning: string }> = {
    "Simples Nacional": { title: "Acompanhamento do Simples Nacional", description: "Estrutura preparada para separar DAS gerencial do cálculo oficial de IBS/CBS.", items: ["RBT12 e receitas por atividade", "Anexos, Fator R, limites e sublimites", "Integração futura com o motor oficial do Simples"], warning: "O motor oficial não substitui o PGDAS-D e não calcula sozinho a alíquota efetiva do DAS." },
    "Lucro Presumido e Real": { title: "Regimes Presumido e Real", description: "Ambiente separado para tributos atuais e tributos da Reforma.", items: ["IRPJ, CSLL, PIS, COFINS, ISS, ICMS e IPI", "CBS, IBS e Imposto Seletivo", "Bases, créditos e periodicidades por regime"], warning: "Nenhum cálculo foi ativado sem regras legais versionadas e testes específicos." },
    "Reforma 2026–2033": { title: "Transição da Reforma Tributária", description: "Linha do tempo gerencial para regras versionadas por competência.", items: ["Exercícios de 2026 a 2033", "Impacto sobre preço, margem e caixa", "Separação entre valor legal e projeção"], warning: "Alíquotas futuras não definidas oficialmente serão sempre identificadas como premissas, nunca como fato legal." },
    "Simulador de Regimes": { title: "Comparador de regimes", description: "Fundação para comparar Simples, Presumido e Real com elegibilidade.", items: ["Receita, folha, custos e margem", "Créditos admissíveis e investimentos", "Resultado líquido e impacto no caixa"], warning: "A escolha de regime não será recomendada apenas pelo menor imposto e dependerá de validação contábil." },
    "Integração Fiscal": { title: "Integração fiscal e financeira", description: "Mapa de conexão entre operações, documentos, apuração e pagamento.", items: ["Notas Fiscais: fonte de receita bruta", "Contas a Pagar: pagamentos de obrigações", "Conciliação entre cálculo, declaração e pagamento"], warning: "Calcular tributo não equivale a emitir nota, autorizar documento, escriturar ou transmitir declaração." },
    "Inteligência Tributária": { title: "Inteligência com rastreabilidade", description: "Análises futuras serão explicativas e nunca alterarão o resultado oficial.", items: ["Tendência da carga e efeito na margem", "Inconsistências cadastrais e divergências", "Cenários de crescimento e novos contratos"], warning: "A inteligência não criará alíquotas nem apresentará interpretação incerta como fato." },
    "Relatórios Tributários": { title: "Relatórios tributários", description: "Catálogo preparado para PDF, Excel e CSV após a primeira apuração homologada.", items: ["Resumo mensal e evolução anual", "Memória de cálculo e conciliação", "Histórico de regras, premissas e versões"], warning: "Relatórios permanecem indisponíveis sem dados tributários confiáveis; valores ausentes não serão exibidos como zero." },
  };
  const area = content[tab];
  return <div className="tax-foundation-area"><section className="card"><span>ESTRUTURA PREPARADA</span><h3>{area.title}</h3><p>{area.description}</p><ul>{area.items.map((item) => <li key={item}>✓ {item}</li>)}</ul></section><section className="card tax-safe"><strong>Próxima etapa controlada</strong><p>{area.warning}</p><span>Funcionalidade ainda não operacional</span></section></div>;
}
