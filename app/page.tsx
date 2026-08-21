"use client";
import { useState } from "react";

const nav = [
  ["Visão geral", "▦"], ["Clientes & Fazendas", "♙"], ["Contratos", "▤"], ["Financeiro", "◫"],
  ["Faturamento & DER", "◇"], ["Contabilidade & NF", "▧"], ["Almoxarifado", "□"],
  ["Recursos Humanos", "♧"], ["Patrimônio", "⌂"], ["Relatórios", "▥"], ["Configurações", "⚙"],
];
const metrics = [
  ["Área sob gestão", "18.420 ha", "+6,8%", "green"], ["Contratos ativos", "42", "4 a vencer", "amber"],
  ["A receber", "R$ 1,28 mi", "+12,4%", "green"], ["Saldo consolidado", "R$ 864 mil", "3 contas", "blue"],
];

export default function Home() {
  const [active, setActive] = useState("Visão geral"); const [menu, setMenu] = useState(false);
  return <main className="app-shell">
    <aside className={menu ? "sidebar open" : "sidebar"}>
      <div className="brand"><div className="mark">V</div><div><strong>VEHJO</strong><span>Ciclus</span></div></div>
      <div className="workspace"><span>Ambiente</span><strong>Dronefy Agro</strong><i>⌄</i></div>
      <nav>{nav.map(([label,icon])=><button key={label} className={active===label?"active":""} onClick={()=>{setActive(label);setMenu(false)}}><b>{icon}</b>{label}</button>)}</nav>
      <div className="profile"><div className="avatar">JA</div><div><strong>João Alves</strong><span>Administrador</span></div><button>⋯</button></div>
    </aside>
    <section className="content"><header><button className="menu" onClick={()=>setMenu(!menu)}>☰</button><div><small>QUINTA-FEIRA, 20 DE AGOSTO</small><h1>{active}</h1></div><div className="header-actions"><button className="icon-btn">⌕</button><button className="icon-btn alert">♢</button><button className="primary">＋ Novo cadastro</button></div></header>{active==="Visão geral"?<Dashboard/>:<Module title={active}/>}</section>
  </main>;
}

function Dashboard(){return <div className="dashboard">
  <div className="welcome"><div><span>PAINEL EXECUTIVO</span><h2>Bom dia, João.</h2><p>A operação está saudável. Há <strong>4 contratos</strong> e <strong>2 itens de estoque</strong> que precisam da sua atenção.</p></div><button>Ver pendências →</button></div>
  <div className="metrics">{metrics.map(([l,v,d,t])=><article key={l}><div className={`metric-icon ${t}`}>↗</div><span>{l}</span><h3>{v}</h3><small className={t}>{d}</small><div className="spark"><i/><i/><i/><i/><i/><i/></div></article>)}</div>
  <div className="grid-main"><article className="card finance"><CardHead over="FLUXO FINANCEIRO" title="Movimentação mensal" action="Últimos 6 meses"/><div className="legend"><span><i className="dot green"/>Receitas <b>R$ 3,46 mi</b></span><span><i className="dot gray"/>Despesas <b>R$ 2,18 mi</b></span></div><div className="chart"><div className="axis"><span>800k</span><span>600k</span><span>400k</span><span>200k</span><span>0</span></div>{[45,62,54,78,66,91].map((h,i)=><div className="bars" key={i}><i style={{height:`${h}%`}}/><b style={{height:`${h*.62}%`}}/><span>{["Mar","Abr","Mai","Jun","Jul","Ago"][i]}</span></div>)}</div></article>
  <article className="card deadlines"><CardHead over="ATENÇÃO" title="Próximos vencimentos" action="Ver todos"/>{[["CTR-0041","Fazenda Boa Vista","Mato Grosso","12","urgent"],["CTR-0038","Grupo Santa Clara","Goiás","28","warn"],["CTR-0035","Agropecuária Horizonte","Bahia","43","ok"]].map(r=><div className="deadline" key={r[0]}><div className="datebox"><b>{r[3]}</b><span>DIAS</span></div><div><small>{r[0]}</small><strong>{r[1]}</strong><span>{r[2]}</span></div><i className={r[4]}>→</i></div>)}</article></div>
  <div className="grid-bottom"><article className="card"><CardHead over="CONTRATOS" title="Distribuição por status" action="Detalhes →"/><div className="status-row"><div className="donut"><strong>57</strong><span>TOTAL</span></div><div className="status-list"><p><i className="dot green"/>Ativos <b>42</b></p><p><i className="dot amber"/>A vencer <b>4</b></p><p><i className="dot blue"/>Em negociação <b>7</b></p><p><i className="dot gray"/>Encerrados <b>4</b></p></div></div></article>
  <article className="card"><CardHead over="ALMOXARIFADO" title="Estoque crítico" action="Ver estoque →"/><Stock icon="20L" name="Herbicida Glifosato" sku="SUP-0084 · Unidade: L" qty="8 disponíveis"/><Stock icon="⚙" name="Filtro hidráulico" sku="PEC-0012 · Unidade: un" qty="2 disponíveis"/></article></div>
  </div>}

function CardHead({over,title,action}:{over:string,title:string,action:string}){return <div className="card-head"><div><span>{over}</span><h3>{title}</h3></div><button>{action}</button></div>}
function Stock({icon,name,sku,qty}:{icon:string,name:string,sku:string,qty:string}){return <div className="stock-item"><div>{icon}</div><p><strong>{name}</strong><span>{sku}</span></p><em>{qty}</em></div>}
function Module({title}:{title:string}){return <div className="module-page"><div className="module-intro"><div><span>MÓDULO OPERACIONAL</span><h2>{title}</h2><p>Consulte, filtre e gerencie todos os registros desta área.</p></div><button className="primary">＋ Adicionar registro</button></div><div className="card table-card"><div className="toolbar"><label>⌕ <input placeholder="Buscar por código ou descrição..."/></label><button>☷ Filtros</button><button>⇩ Exportar</button></div><table><thead><tr><th>Código</th><th>Descrição</th><th>Atualizado em</th><th>Status</th><th>Ações</th></tr></thead><tbody>{[1,2,3,4,5].map(n=><tr key={n}><td><b>VHC-{String(n).padStart(4,"0")}</b></td><td>{title} — registro demonstrativo {n}</td><td>{20-n}/08/2026</td><td><span className="pill">Ativo</span></td><td><button className="more">•••</button></td></tr>)}</tbody></table></div></div>}

