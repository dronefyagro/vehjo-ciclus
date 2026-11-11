"use client";

import { useEffect, useMemo, useState } from "react";
import type { VehjoData } from "./lib/google-sheets";
import { release } from "./version";

type IconName = "overview" | "clients" | "farms" | "contracts" | "receive" | "pay" | "bank" | "billing" | "invoice" | "stock" | "people" | "assets" | "settings" | "search" | "bell" | "shield" | "download";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const nav: Array<{ label: string; icon: IconName; group?: string }> = [
  { label: "Visão geral", icon: "overview", group: "Principal" }, { label: "Clientes", icon: "clients", group: "Operações" }, { label: "Fazendas", icon: "farms" }, { label: "Contratos", icon: "contracts" },
  { label: "Contas a Receber", icon: "receive", group: "Financeiro" }, { label: "Contas a Pagar", icon: "pay" }, { label: "Contas Bancárias", icon: "bank" }, { label: "Faturamento e DER", icon: "billing" }, { label: "Notas Fiscais", icon: "invoice" },
  { label: "Estoque", icon: "stock", group: "Gestão" }, { label: "Recursos Humanos", icon: "people" }, { label: "Patrimônio", icon: "assets" }, { label: "Configurações", icon: "settings" },
];

const numberValue = (value = "") => Number(value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const rows = (data: VehjoData, name: string) => (data.sheets[name] ?? []).slice(1).filter((row) => row.some(Boolean));

export default function DashboardClient({ data }: { data: VehjoData }) {
  const [active, setActive] = useState("Visão geral");
  const [menu, setMenu] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [sheetData, setSheetData] = useState(data.sheets);
  const liveData = useMemo(() => ({ ...data, sheets: sheetData }), [data, sheetData]);
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js"); const capture = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); }; const complete = () => { setInstalled(true); setInstallPrompt(null); }; window.addEventListener("beforeinstallprompt", capture); window.addEventListener("appinstalled", complete); setInstalled(window.matchMedia("(display-mode: standalone)").matches); return () => { window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", complete); }; }, []);
  const install = async () => { if (installPrompt) { await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === "accepted") setInstallPrompt(null); } else window.alert("Para instalar, abra o menu do navegador e escolha ‘Instalar VEJHO Ciclus’ ou ‘Criar atalho’."); };
  const summary = useMemo(() => { const contracts = rows(liveData, "Contratos"); return {
    area: contracts.reduce((sum, row) => sum + numberValue(row[5]), 0), contracts: contracts.filter((row) => /ativo|a vencer/i.test(row[9] ?? "")).length,
    receive: rows(liveData, "Contas a Receber").reduce((sum, row) => sum + numberValue(row[7] || row[5]), 0), payable: rows(liveData, "Contas a Pagar").reduce((sum, row) => sum + numberValue(row[7] || row[5]), 0), balance: rows(liveData, "Contas Bancárias").reduce((sum, row) => sum + numberValue(row[8] || row[4]), 0),
    critical: rows(liveData, "Estoque").filter((row) => numberValue(row[6]) <= numberValue(row[7])).length, clients: rows(liveData, "Clientes").length, farms: rows(liveData, "Fazendas").length,
  }; }, [liveData]);

  return <main className="app-shell">
    <aside className={menu ? "sidebar open" : "sidebar"}>
      <div className="brand"><img src="/ciclus-logo.svg" alt="Ciclus"/><span>VEJHO · GESTÃO INTEGRADA</span></div>
      <div className="workspace"><div className="workspace-avatar">DA</div><div><span>Ambiente de trabalho</span><strong>Dronefy Agro</strong></div><i>⌄</i></div>
      <nav aria-label="Navegação principal">{nav.map((item) => <div key={item.label} className="nav-entry">{item.group && <span className="nav-group">{item.group}</span>}<button className={active === item.label ? "active" : ""} onClick={() => { setActive(item.label); setMenu(false); }}><Icon name={item.icon}/><span>{item.label}</span>{active === item.label && <i/>}</button></div>)}</nav>
      <div className="version-badge"><span>{release.version}</span><small>Versão atual</small></div>
      <div className="profile"><div className="avatar">DA</div><div><strong>Dronefy Agro</strong><span>Administrador</span></div><button aria-label="Opções do perfil">•••</button></div>
    </aside>
    {menu && <button className="backdrop" aria-label="Fechar menu" onClick={() => setMenu(false)}/>} 
    <section className="content"><header><div className="header-title"><button className="menu" onClick={() => setMenu(!menu)} aria-label="Abrir menu">☰</button><div><small>VEJHO CICLUS / {active.toUpperCase()}</small><h1>{active}</h1></div></div><div className="header-actions">{!installed && <button className="install-button" onClick={install}><Icon name="download"/><span>Baixar plataforma</span></button>}<button className="header-icon" aria-label="Pesquisar"><Icon name="search"/></button><button className="header-icon alert" aria-label="Notificações"><Icon name="bell"/></button><div className="live-status"><span/>Sistema operacional</div></div></header>
      {!data.connected && <div className="connection-warning"><strong>Atualização temporariamente indisponível</strong><span>{data.error}</span></div>}
      {active === "Visão geral" ? <Dashboard data={liveData} summary={summary}/> : active === "Configurações" ? <Settings data={liveData}/> : <Module title={active} data={liveData} onChange={setSheetData}/>} 
    </section>
  </main>;
}

function Dashboard({ data, summary }: { data: VehjoData; summary: { area: number; contracts: number; receive: number; payable: number; balance: number; critical: number; clients: number; farms: number } }) {
  const metrics = [{ label: "Área sob gestão", value: `${summary.area.toLocaleString("pt-BR")} ha`, icon: "farms" as IconName, tone: "green" }, { label: "Contratos ativos", value: String(summary.contracts), icon: "contracts" as IconName, tone: "blue" }, { label: "Contas a receber", value: brl(summary.receive), icon: "receive" as IconName, tone: "violet" }, { label: "Saldo consolidado", value: brl(summary.balance), icon: "bank" as IconName, tone: "amber" }];
  const expiring = rows(data, "Contratos").filter((r) => { const d = numberValue(r[8]); return d >= 0 && d <= 45; }).slice(0, 4);
  const stock = rows(data, "Estoque").filter((r) => numberValue(r[6]) <= numberValue(r[7])).slice(0, 4);
  return <div className="dashboard"><section className="welcome"><div><span>PAINEL EXECUTIVO</span><h2>Olá, Dronefy Agro.</h2><p>Acompanhe os principais indicadores da sua operação em uma visão integrada.</p></div><div className="welcome-mark"><img src="/ciclus-symbol.svg" alt=""/><span><b>VEJHO Ciclus</b>Gestão inteligente</span></div></section>
    <div className="metrics">{metrics.map((metric) => <article key={metric.label}><div className={`metric-icon ${metric.tone}`}><Icon name={metric.icon}/></div><span>{metric.label}</span><h3>{metric.value}</h3><small><i/>Atualizado agora</small></article>)}</div>
    <div className="quick-kpis"><article><Icon name="clients"/><div><strong>{summary.clients}</strong><span>Clientes cadastrados</span></div></article><article><Icon name="farms"/><div><strong>{summary.farms}</strong><span>Fazendas vinculadas</span></div></article><article><Icon name="pay"/><div><strong>{brl(summary.payable)}</strong><span>Contas a pagar</span></div></article><article><Icon name="stock"/><div><strong>{summary.critical}</strong><span>Itens em estoque crítico</span></div></article></div>
    <div className="chart-grid"><article className="card chart-card"><CardHead icon="bank" over="FINANCEIRO" title="Posição consolidada" action="Valores atuais"/><div className="bar-chart">{[{l:"A receber",v:summary.receive,c:"green"},{l:"A pagar",v:summary.payable,c:"red"},{l:"Saldo",v:summary.balance,c:"blue"}].map((item) => { const max=Math.max(summary.receive,summary.payable,Math.abs(summary.balance),1); return <div className="bar-row" key={item.l}><span>{item.l}</span><div><i className={item.c} style={{width:`${Math.max(4,Math.abs(item.v)/max*100)}%`}}/></div><strong>{brl(item.v)}</strong></div>})}</div></article><article className="card chart-card"><CardHead icon="contracts" over="OPERAÇÃO" title="Carteira operacional" action="Resumo"/><div className="donut-wrap"><div className="donut" style={{background:`conic-gradient(#22c55e 0 ${Math.min(100,summary.contracts/Math.max(1,rows(data,"Contratos").length)*100)}%, #e7ece9 0)`}}><span><b>{summary.contracts}</b>ativos</span></div><div className="donut-legend"><p><i className="active-dot"/>Contratos ativos <b>{summary.contracts}</b></p><p><i/>Outros contratos <b>{Math.max(0,rows(data,"Contratos").length-summary.contracts)}</b></p><p><i className="farm-dot"/>Área gerida <b>{summary.area.toLocaleString("pt-BR")} ha</b></p></div></div></article></div>
    <div className="section-heading"><div><span>ACOMPANHAMENTO</span><h2>Prioridades da operação</h2></div><span className="secure-status"><Icon name="shield"/> Ambiente protegido</span></div>
    <div className="grid-main"><article className="card"><CardHead icon="contracts" over="CONTRATOS" title="Próximos vencimentos" action="Até 45 dias"/>{expiring.length ? expiring.map((r, i) => <div className="deadline" key={r[0] || i}><div className="datebox"><b>{r[8] || "—"}</b><span>DIAS</span></div><div><small>{r[0]}</small><strong>{r[1] || r[2]}</strong><span>Vencimento: {r[4] || "Não informado"}</span></div><i>→</i></div>) : <Empty/>}</article>
      <article className="card"><CardHead icon="stock" over="ALMOXARIFADO" title="Estoque crítico" action={`${summary.critical} item(ns)`}/>{stock.length ? stock.map((r, i) => <Stock key={r[0] || i} name={r[1] || "Item"} sku={`${r[0] || ""} · ${r[3] || ""}`} qty={`${r[6] || "0"} disponíveis`}/>) : <Empty/>}</article></div>
  </div>;
}

function CardHead({ icon, over, title, action }: { icon: IconName; over: string; title: string; action: string }) { return <div className="card-head"><div className="card-title"><span className="card-icon"><Icon name={icon}/></span><div><span>{over}</span><h3>{title}</h3></div></div><button>{action}</button></div>; }
function Stock({ name, sku, qty }: { name: string; sku: string; qty: string }) { return <div className="stock-item"><div><Icon name="stock"/></div><p><strong>{name}</strong><span>{sku}</span></p><em>{qty}</em></div>; }
function Empty() { return <div className="empty-state"><span>✓</span><strong>Tudo em ordem</strong><p>Nenhum registro requer atenção neste momento.</p></div>; }

function Module({ title, data, onChange }: { title: string; data: VehjoData; onChange: React.Dispatch<React.SetStateAction<Record<string, string[][]>>> }) {
  const [query, setQuery] = useState(""); const [editing, setEditing] = useState<{ rowIndex?: number; values: string[] } | null>(null); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(""); const source = data.sheets[title] ?? []; const headers = source[0] ?? ["Código", "Descrição", "Status"]; const records = source.slice(1).map((values, index) => ({ values, rowIndex: index + 2 })).filter((r) => r.values.some(Boolean)); const filtered = records.filter((record) => !query || record.values.some((value) => value.toLowerCase().includes(query.toLowerCase()))); const navItem = nav.find((item) => item.label === title);
  const persist = async () => { if (!editing) return; setSaving(true); setMessage(""); const action = editing.rowIndex ? "update" : "create"; try { const response = await fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, sheet: title, rowIndex: editing.rowIndex, values: editing.values }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error); onChange((current) => { const next = [...(current[title] ?? [headers])]; if (editing.rowIndex) next[editing.rowIndex - 1] = editing.values; else next.push(editing.values); return { ...current, [title]: next }; }); setEditing(null); setMessage("Cadastro salvo com sucesso."); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar."); } finally { setSaving(false); } };
  const remove = async (rowIndex: number) => { if (!window.confirm("Deseja realmente excluir este cadastro?")) return; setMessage(""); const response = await fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", sheet: title, rowIndex }) }); const result = await response.json() as { error?: string }; if (!response.ok) return setMessage(result.error ?? "Não foi possível excluir."); onChange((current) => ({ ...current, [title]: (current[title] ?? []).filter((_, index) => index !== rowIndex - 1) })); setMessage("Cadastro excluído com sucesso."); };
  return <div className="module-page"><div className="module-intro"><div className="module-title"><span className="module-icon"><Icon name={navItem?.icon ?? "overview"}/></span><div><span>MÓDULO DE GESTÃO</span><h2>{title}</h2><p>{records.length.toLocaleString("pt-BR")} registro(s) disponíveis</p></div></div><button className="primary-action" onClick={() => setEditing({ values: headers.map((header, index) => index === 0 ? `${title.slice(0,3).toUpperCase()}-${String(records.length+1).padStart(4,"0")}` : "") })}>＋ Novo cadastro</button></div>
    {message && <div className="action-message">{message}</div>}
    <div className="module-summary"><div><strong>{records.length.toLocaleString("pt-BR")}</strong><span>Total de registros</span></div><div><strong>{filtered.length.toLocaleString("pt-BR")}</strong><span>Resultados exibidos</span></div><div><strong>Ativo</strong><span>Status do módulo</span></div></div>
    <div className="card table-card"><div className="table-toolbar"><label><Icon name="search"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Buscar em ${title.toLowerCase()}...`}/></label><span>{filtered.length} resultado(s)</span></div><div className="table-scroll"><table><thead><tr>{headers.map((h, i) => <th key={`${h}-${i}`}>{h}</th>)}<th>Ações</th></tr></thead><tbody>{filtered.length ? filtered.map((record, index) => <tr key={record.values[0] || index}>{headers.map((_, i) => <td key={i}>{record.values[i] || "—"}</td>)}<td><div className="row-actions"><button onClick={() => setEditing({ rowIndex: record.rowIndex, values: headers.map((_, i) => record.values[i] ?? "") })}>Editar</button><button className="danger" onClick={() => remove(record.rowIndex)}>Excluir</button></div></td></tr>) : <tr><td colSpan={headers.length + 1}><Empty/></td></tr>}</tbody></table></div></div>
    {editing && <div className="modal-backdrop" role="presentation"><section className="edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-title"><div className="modal-head"><div><span>{editing.rowIndex ? "EDITAR CADASTRO" : "NOVO CADASTRO"}</span><h3 id="edit-title">{title}</h3></div><button onClick={() => setEditing(null)} aria-label="Cancelar e fechar">×</button></div><div className="form-grid">{headers.map((header, index) => <label key={`${header}-${index}`}><span>{header}</span><input value={editing.values[index] ?? ""} onChange={(event) => setEditing({ ...editing, values: editing.values.map((value, i) => i === index ? event.target.value : value) })}/></label>)}</div><div className="modal-actions"><button className="cancel-action" onClick={() => setEditing(null)} disabled={saving}>Cancelar</button><button className="save-action" onClick={persist} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button></div></section></div>}
  </div>;
}

function Settings({ data }: { data: VehjoData }) {
  return <div className="module-page">
    <div className="module-intro"><div className="module-title"><span className="module-icon"><Icon name="settings"/></span><div><span>ADMINISTRAÇÃO</span><h2>Configurações</h2><p>Preferências gerais e informações da plataforma</p></div></div></div>
    <div className="settings-grid">
      <section className="card release-card"><div className="release-heading"><div><span>VERSÃO ATUAL</span><h3>{release.version}</h3><p>Publicada em {release.releasedAt}</p></div><img src="/ciclus-symbol.svg" alt="Ciclus"/></div><h4>Melhorias desta versão</h4><ul>{release.improvements.map((item) => <li key={item}><span>✓</span>{item}</li>)}</ul><div className="next-release"><span>Próxima versão planejada</span><strong>VC 1.0.4</strong></div></section>
      <section className="card system-card"><span>INFORMAÇÕES DO SISTEMA</span><h3>VEJHO Ciclus</h3><dl><div><dt>Ambiente</dt><dd>Dronefy Agro</dd></div><div><dt>Situação</dt><dd className="online">Operacional</dd></div><div><dt>Módulos ativos</dt><dd>{Object.keys(data.sheets).length}</dd></div><div><dt>Atualizações</dt><dd>Progressivas</dd></div></dl></section>
    </div>
  </div>;
}

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    overview:<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>, clients:<><circle cx="9" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 4.5a4 4 0 0 1 0 7.5M18 15a5 5 0 0 1 3 4.5V21"/></>, farms:<><path d="M3 21V10l9-6 9 6v11M3 10h18M8 21v-6h8v6M6 8V4h3"/></>, contracts:<><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6"/></>,
    receive:<><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2M8 15h4m4-13 2 2-2 2"/></>, pay:<><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2M8 15h4m4-9-2-2 2-2"/></>, bank:<><path d="m3 9 9-5 9 5M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18"/></>, billing:<><path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM9 8h6M9 12h6M9 16h3"/></>, invoice:<><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h4"/><circle cx="9" cy="8" r="1"/></>, stock:<><path d="m4 7 8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10"/></>,
    people:<><circle cx="8" cy="8" r="4"/><path d="M2 21v-2a6 6 0 0 1 12 0v2M16 11a3 3 0 1 0 0-6M17 15a5 5 0 0 1 5 5v1"/></>, assets:<><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 15h4"/></>, settings:<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></>,
    search:<><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>, shield:<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4"/></>, download:<><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
