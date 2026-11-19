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
  const routes = await Promise.all([read("app/api/records/route.ts"), read("app/api/bank-statement/route.ts"), read("app/api/card-invoice/route.ts")]);
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

test("protege páginas e APIs com uma única autenticação", async () => {
  const accessProxy = await read("proxy.ts");
  assert.match(accessProxy, /export function proxy/);
  assert.match(accessProxy, /WWW-Authenticate/);
  assert.match(accessProxy, /timingSafeEqual/);
  assert.match(accessProxy, /CICLUS_ACCESS_PASSWORD_SHA256/);
  assert.match(accessProxy, /X-Robots-Tag/);
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
