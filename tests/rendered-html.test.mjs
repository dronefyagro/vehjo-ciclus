import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mantém a versão visível alinhada ao pacote", async () => {
  const [versionSource, packageSource] = await Promise.all([read("app/version.ts"), read("package.json")]);
  const release = versionSource.match(/version:\s*"VC\s+([\d.]+)"/)?.[1];
  assert.equal(release, JSON.parse(packageSource).version);
});

test("protege todas as rotas de mutação contra requisições externas", async () => {
  const routes = await Promise.all([read("app/api/records/route.ts"), read("app/api/bank-statement/route.ts"), read("app/api/card-invoice/route.ts"), read("app/api/fiscal-invoice/route.ts"), read("app/api/admin/users/route.ts")]);
  for (const route of routes) {
    assert.match(route, /rejectUnsafeMutation\(request(?:,[^)]+)?\)/);
    assert.match(route, /if \(rejected\) return rejected/);
  }
});

test("grava dados importados como valores literais", async () => {
  const recordsRoute = await read("app/api/records/route.ts");
  assert.match(recordsRoute, /bulk-create[\s\S]*valueInputOption=RAW/);
  assert.match(recordsRoute, /syncCashFlow[\s\S]*valueInputOption=RAW/);
  assert.match(recordsRoute, /sheet === "Contratos" \? "USER_ENTERED" : "RAW"/);
});

test("valida módulos, células, lotes e linhas antes de alterar a base", async () => {
  const [recordsRoute, guard] = await Promise.all([read("app/api/records/route.ts"), read("app/lib/api-guard.ts")]);
  assert.match(recordsRoute, /SHEET_NAMES\.includes/);
  assert.match(recordsRoute, /normalizeCells\(payload\.values\)/);
  assert.match(recordsRoute, /normalizeRows\(payload\.rows\)/);
  assert.match(recordsRoute, /validSheetRowIndex/);
  assert.match(guard, /MAX_CELL_LENGTH = 2_000/);
  assert.match(guard, /MAX_COLUMNS = 26/);
});

test("exibe Configurações pela tela especializada e usa imagens otimizadas", async () => {
  const dashboard = await read("app/dashboard-client.tsx");
  assert.match(dashboard, /active === "Configurações" \? <Settings/);
  assert.match(dashboard, /from "next\/image"/);
  assert.doesNotMatch(dashboard, /<img\b/);
  assert.doesNotMatch(dashboard, /Date\.now\(\)/);
});

test("aplica cabeçalhos de segurança e evita cache de dados privados", async () => {
  const config = await read("next.config.ts");
  assert.match(config, /X-Content-Type-Options/);
  assert.match(config, /X-Frame-Options/);
  assert.match(config, /Cache-Control/);
  assert.match(config, /private, no-store/);
});

test("protege páginas e APIs com sessão assinada e cookie seguro", async () => {
  const [accessProxy, auth] = await Promise.all([read("proxy.ts"), read("app/lib/auth.ts")]);
  assert.match(accessProxy, /export function proxy/);
  assert.match(accessProxy, /verifySessionToken/);
  assert.match(accessProxy, /\/login/);
  assert.match(accessProxy, /status: 401/);
  assert.match(auth, /createHmac/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /httpOnly: true/);
  assert.match(auth, /sameSite: "strict"/);
});

test("aplica os perfis de acesso no menu, nos dados e nas APIs", async () => {
  const [access, dashboard, home, records] = await Promise.all([read("app/lib/access-control.ts"), read("app/dashboard-client.tsx"), read("app/page.tsx"), read("app/api/records/route.ts")]);
  assert.match(access, /SUPERVISOR_BLOCKED = new Set\(\["Configurações", "Usuários e Acessos"\]\)/);
  assert.match(access, /STANDARD_MODULES/);
  assert.match(access, /"Contas a Receber"/);
  assert.match(access, /"Notas Fiscais"/);
  assert.doesNotMatch(access.match(/const STANDARD_MODULES[\s\S]*?\]\);/)?.[0] ?? "", /"Visão geral"|"Clientes"|"Relatórios Financeiro"/);
  assert.match(dashboard, /visibleNav/);
  assert.match(dashboard, /defaultModuleForRole/);
  assert.match(home, /canAccessSheet/);
  assert.match(records, /canAccessSheet\(session\.role, sheet\)/);
});

test("importa notas fiscais em PDF e XML com conferência e deduplicação", async () => {
  const [dashboard, importer, route, records] = await Promise.all([read("app/dashboard-client.tsx"), read("app/fiscal-invoice-importer.tsx"), read("app/api/fiscal-invoice/route.ts"), read("app/api/records/route.ts")]);
  assert.match(dashboard, /Importar PDF\/XML/);
  assert.match(importer, /accept="\.pdf,\.xml/);
  assert.match(importer, /Marcar todos/);
  assert.match(importer, /Cliente\/Fornecedor/);
  assert.match(route, /parseXml/);
  assert.match(route, /parsePdf/);
  assert.match(records, /existingInvoiceKeys/);
});

test("oferece análise automática de despesas com recorrência e Pareto", async () => {
  const [dashboard, expenseAnalysis] = await Promise.all([read("app/dashboard-client.tsx"), read("app/expense-analysis.tsx")]);
  assert.match(dashboard, /label: "Análise de Despesas"/);
  assert.match(dashboard, /active === "Análise de Despesas" \? <ExpenseAnalysis/);
  assert.match(expenseAnalysis, /data\.sheets\["Contas a Pagar"\]/);
  assert.match(expenseAnalysis, /PARETO DAS DESPESAS/);
  assert.match(expenseAnalysis, /Despesas que se repetem/);
  assert.match(expenseAnalysis, /Monitoramento de Pragas e Aplicação com drone/);
  assert.match(expenseAnalysis, /Combustível/);
  assert.match(expenseAnalysis, /Hospedagem/);
  assert.match(expenseAnalysis, /Alimentação/);
});

test("mantém os nomes das colunas visíveis nos grids financeiros", async () => {
  const [dashboard, styles] = await Promise.all([read("app/dashboard-client.tsx"), read("app/enhancements.css")]);
  assert.match(dashboard, /visibleHeaders\.map\(\(header, index\) => <th/);
  assert.match(styles, /\.data-grid-card \.table-scroll thead\{display:table-header-group!important;visibility:visible!important\}/);
  assert.match(styles, /\.data-grid-card \.table-scroll th\{position:static/);
  assert.match(styles, /\.data-grid-card \.table-scroll-top\{position:relative/);
});

test("implanta a fundação tributária sem fabricar cálculos oficiais", async () => {
  const [dashboard, taxation, engine, registry] = await Promise.all([
    read("app/dashboard-client.tsx"),
    read("app/taxation.tsx"),
    read("app/api/tax-engine/route.ts"),
    read("app/lib/taxation.ts"),
  ]);
  assert.match(dashboard, /label: "Tributação"/);
  assert.match(dashboard, /active === "Tributação" \? <Taxation/);
  assert.match(taxation, /Painel Tributário/);
  assert.match(taxation, /Configuração da Empresa/);
  assert.match(taxation, /RBT12/);
  assert.match(taxation, /Não disponível/);
  assert.match(taxation, /Notas Fiscais/);
  assert.match(engine, /operational: false/);
  assert.match(engine, /status: "foundation"/);
  assert.match(engine, /status: 503/);
  assert.match(registry, /calculadora-rtc-regime-regular/);
  assert.match(registry, /calculadora-rtc-simples-nacional/);
  assert.match(registry, /calculadora-rtc-gerador-danfse/);
});
