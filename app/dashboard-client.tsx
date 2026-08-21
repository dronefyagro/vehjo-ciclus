"use client";

import { useMemo, useState } from "react";
import type { VehjoData } from "./lib/google-sheets";

const nav = ["Visão geral", "Clientes", "Fazendas", "Contratos", "Contas a Receber", "Contas a Pagar", "Contas Bancárias", "Faturamento e DER", "Notas Fiscais", "Estoque", "Recursos Humanos", "Patrimônio", "Configurações"];

const numberValue = (value = "") => {
  const clean = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  return Number(clean) || 0;
};
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const rows = (data: VehjoData, name: string) => (data.sheets[name] ?? []).slice(1).filter((row) => row.some(Boolean));

export default function DashboardClient({ data }: { data: VehjoData }) {
  const [active, setActive] = useState("Visão geral");
  const [menu, setMenu] = useState(false);
  const summary = useMemo(() => {
    const contracts = rows(data, "Contratos");
    return {
      area: contracts.reduce((sum, row) => sum + numberValue(row[5]), 0),
      contracts: contracts.filter((row) => /ativo|a vencer/i.test(row[9] ?? "")).length,
      receive: rows(data, "Contas a Receber").reduce((sum, row) => sum + numberValue(row[7] || row[5]), 0),
      balance: rows(data, "Contas Bancárias").reduce((sum, row) => sum + numberValue(row[8] || row[4]), 0),
      critical: rows(data, "Estoque").filter((row) => numberValue(row[6]) <= numberValue(row[7])).length,
    };
  }, [data]);

  return <main className="app-shell">
    <aside className={menu ? "sidebar open" : "sidebar"}>
      <div className="brand"><div className="mark">V</div><div><strong>VEHJO</strong><span>Ciclus</span></div></div>
      <div className="workspace"><span>Ambiente</span><strong>Dronefy Agro</strong><i>⌄</i></div>
      <nav>{nav.map((label)=><button key={label} className={active===label?"active":""} onClick={()=>{setActive(label);setMenu(false)}}><b>◇</b>{label}</button>)}</nav>
      <div className="profile"><div className="avatar">DA</div><div><strong>Dronefy Agro</strong><span>Administrador</span></div></div>
    </aside>
    <section className="content">
      <header><button className="menu" onClick={()=>setMenu(!menu)}>☰</button><div><small>GESTÃO INTEGRADA</small><h1>{active}</h1></div><div className="header-actions"><span className="sync-badge">Google Sheets</span></div></header>
      {!data.connected && <div className="connection-warning"><strong>Integração aguardando credenciais</strong><span>{data.error}</span></div>}
      {active === "Visão geral" ? <Dashboard data={data} summary={summary}/> : <Module title={active} data={data}/>} 
    </section>
  </main>;
}

function Dashboard({data, summary}:{data:VehjoData;summary:{area:number;contracts:number;receive:number;balance:number;critical:number}}){
  const metrics = [["Área sob gestão", `${summary.area.toLocaleString("pt-BR")} ha`], ["Contratos ativos", String(summary.contracts)], ["A receber", brl(summary.receive)], ["Saldo consolidado", brl(summary.balance)]];
  const expiring = rows(data,"Contratos").filter(r=>{const d=numberValue(r[8]);return d>=0&&d<=45}).slice(0,3);
  const stock = rows(data,"Estoque").filter(r=>numberValue(r[6])<=numberValue(r[7])).slice(0,3);
  return <div className="dashboard">
    <div className="welcome"><div><span>PAINEL EXECUTIVO</span><h2>Gestão VEHJO Ciclus</h2><p>{data.connected ? `Dados sincronizados com o Google Sheets. ${summary.critical} item(ns) de estoque precisam de atenção.` : "A estrutura está pronta para sincronizar com o Google Sheets."}</p></div><span className="secure-status">Conexão protegida</span></div>
    <div className="metrics">{metrics.map(([label,value])=><article key={label}><div className="metric-icon green">↗</div><span>{label}</span><h3>{value}</h3><small className="green">Google Sheets</small></article>)}</div>
    <div className="grid-main"><article className="card"><CardHead over="CONTRATOS" title="Próximos vencimentos" action="Até 45 dias"/>{expiring.length?expiring.map((r,i)=><div className="deadline" key={r[0]||i}><div className="datebox"><b>{r[8]||"—"}</b><span>DIAS</span></div><div><small>{r[0]}</small><strong>{r[1]||r[2]}</strong><span>{r[4]||""}</span></div><i className="warn">→</i></div>):<Empty/>}</article>
    <article className="card"><CardHead over="ALMOXARIFADO" title="Estoque crítico" action={`${summary.critical} item(ns)`}/>{stock.length?stock.map((r,i)=><Stock key={r[0]||i} name={r[1]||"Item"} sku={`${r[0]||""} · ${r[3]||""}`} qty={`${r[6]||"0"} disponíveis`}/>):<Empty/>}</article></div>
  </div>
}

function CardHead({over,title,action}:{over:string;title:string;action:string}){return <div className="card-head"><div><span>{over}</span><h3>{title}</h3></div><button>{action}</button></div>}
function Stock({name,sku,qty}:{name:string;sku:string;qty:string}){return <div className="stock-item"><div>SUP</div><p><strong>{name}</strong><span>{sku}</span></p><em>{qty}</em></div>}
function Empty(){return <p className="empty-state">Nenhum registro encontrado.</p>}

function Module({title,data}:{title:string;data:VehjoData}){
  const source=data.sheets[title]??[];
  const headers=source[0]??["Código","Descrição","Status"];
  const records=source.slice(1).filter(r=>r.some(Boolean));
  return <div className="module-page"><div className="module-intro"><div><span>MÓDULO OPERACIONAL</span><h2>{title}</h2><p>{records.length} registro(s) carregados do Google Sheets.</p></div><span className="sync-badge">Sincronização automática</span></div><div className="card table-card"><table><thead><tr>{headers.map((h,i)=><th key={`${h}-${i}`}>{h}</th>)}</tr></thead><tbody>{records.length?records.map((record,index)=><tr key={record[0]||index}>{headers.map((_,i)=><td key={i}>{record[i]||"—"}</td>)}</tr>):<tr><td colSpan={headers.length}><Empty/></td></tr>}</tbody></table></div></div>
}

