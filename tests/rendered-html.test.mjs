import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseFiscalPdfText } from "../app/lib/fiscal-invoice-parser.ts";

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
  assert.match(access.match(/const STANDARD_MODULES[\s\S]*?\]\);/)?.[0] ?? "", /"Visão geral"/);
  assert.match(access.match(/const STANDARD_MODULES[\s\S]*?\]\);/)?.[0] ?? "", /"Clientes"/);
  assert.match(access.match(/const STANDARD_MODULES[\s\S]*?\]\);/)?.[0] ?? "", /"Fazendas"/);
  assert.match(access.match(/const STANDARD_MODULES[\s\S]*?\]\);/)?.[0] ?? "", /"Contratos"/);
  assert.match(access, /"Contas a Receber"/);
  assert.match(access, /"Notas Fiscais"/);
  assert.match(access.match(/const STANDARD_MODULES[\s\S]*?\]\);/)?.[0] ?? "", /"Classificações Financeiras"/);
  assert.doesNotMatch(access.match(/const STANDARD_MODULES[\s\S]*?\]\);/)?.[0] ?? "", /"Relatórios Financeiro"/);
  assert.match(dashboard, /visibleNav/);
  assert.match(dashboard, /defaultModuleForRole/);
  assert.match(home, /canAccessSheet/);
  assert.match(records, /canAccessSheet\(session\.role, sheet\)/);
});

test("cria e aplica classificações financeiras hierárquicas", async () => {
  const [catalog, sheets, dashboard, records] = await Promise.all([
    read("app/lib/financial-classifications.ts"),
    read("app/lib/google-sheets.ts"),
    read("app/dashboard-client.tsx"),
    read("app/api/records/route.ts"),
  ]);
  assert.match(catalog, /FINANCIAL_CLASSIFICATIONS_SHEET = "Classificações Financeiras"/);
  assert.match(catalog, /"Tipo Contábil"/);
  assert.match(catalog, /"Categoria Contábil"/);
  assert.match(catalog, /"Centro de Custo"/);
  assert.match(catalog, /"Empenho"/);
  assert.match(sheets, /ensureFinancialClassificationsSheet/);
  assert.match(sheets, /FINANCIAL_CLASSIFICATION_SEED/);
  assert.match(dashboard, /classificationHierarchy/);
  assert.match(dashboard, /catalogOptions/);
  assert.match(dashboard, /financialClassificationLegend/);
  assert.match(dashboard, /Como usar as classificações financeiras/);
  assert.match(dashboard, /Não representa a conta bancária/);
  assert.match(dashboard, /Regra prática:/);
  assert.match(records, /sheet === FINANCIAL_CLASSIFICATIONS_SHEET/);
});

test("entrega ao usuário padrão somente a visão geral consolidada", async () => {
  const [access, home, dashboard, summary, styles] = await Promise.all([
    read("app/lib/access-control.ts"),
    read("app/page.tsx"),
    read("app/dashboard-client.tsx"),
    read("app/lib/standard-dashboard.ts"),
    read("app/enhancements.css"),
  ]);
  assert.match(access, /defaultModuleForRole[\s\S]*user: "Visão geral"/);
  assert.match(home, /session\.role === "user" \? buildStandardDashboardSummary\(data\) : null/);
  assert.match(home, /Object\.entries\(data\.sheets\)\.flatMap/);
  assert.match(home, /canAccessSheet\(session\.role, name\)/);
  assert.match(dashboard, /session\.role === "user" && standardDashboard/);
  assert.match(dashboard, /Contas a receber no mês/);
  assert.match(dashboard, /Contratos a vencer/);
  assert.match(dashboard, /Total de clientes/);
  assert.match(dashboard, /Situação do estoque/);
  assert.doesNotMatch(dashboard, /VISÃO GERAL DO USUÁRIO|Resumo operacional|Indicadores essenciais da competência atual|Perfil protegido/);
  assert.match(summary, /contractsExpiring/);
  assert.match(summary, /stockSituation/);
  assert.match(styles, /\.standard-dashboard\{padding-top:18px\}/);
  assert.match(styles, /\.standard-overview-card \.metric-icon,.standard-stock-card \.metric-icon\{position:static\}/);
});

test("permite cadastrar e administrar vários usuários com segurança", async () => {
  const [screen, route, users] = await Promise.all([read("app/user-access-management.tsx"), read("app/api/admin/users/route.ts"), read("app/lib/platform-users.ts")]);
  assert.match(screen, /Salvar e cadastrar outro/);
  assert.match(screen, /Usuários padrão/);
  assert.match(screen, /passwordConfirmation/);
  assert.match(route, /action === "update"/);
  assert.match(route, /status: 409/);
  assert.match(route, /pelo menos um administrador ativo/);
  assert.match(users, /input\.existing\?\.source === "sheets"/);
});

test("importa notas fiscais em PDF e XML com conferência e deduplicação", async () => {
  const [dashboard, importer, route, records, parser, ocr] = await Promise.all([read("app/dashboard-client.tsx"), read("app/fiscal-invoice-importer.tsx"), read("app/api/fiscal-invoice/route.ts"), read("app/api/records/route.ts"), read("app/lib/fiscal-invoice-parser.ts"), read("app/lib/client-pdf-ocr.ts")]);
  assert.match(dashboard, /Importar PDF\/XML/);
  assert.match(importer, /accept="\.pdf,\.xml/);
  assert.match(importer, /Marcar todos/);
  assert.match(importer, /Cliente\/Fornecedor/);
  assert.match(route, /parseXml/);
  assert.match(route, /parsePdf/);
  assert.match(records, /existingInvoiceKeys/);
  assert.match(parser, /DANFSe\\s\*v\?2\\\.0/);
  assert.match(parser, /\\d\{50\}/);
  assert.match(route, /OCR_REQUIRED/);
  assert.match(importer, /recognizeImagePdf/);
  assert.match(ocr, /createWorker\("por"\)/);
});

test("reconhece todos os campos essenciais do DANFSe Nacional v2.0", () => {
  const document = parseFiscalPdfText(`DANFSe v2.0 Documento Auxiliar da NFS-e CHAVE DE ACESSO DA NFS-e 31443002240206420000143000000000003026111548989665 NÚMERO DA NFS-e 30 COMPETÊNCIA DA NFS-e 09/11/2026 DATA E HORA DA EMISSÃO DA NFS-e 19/11/2026 16:11:00 PRESTADOR / FORNECEDOR CNPJ / CPF / NIF 40.206.420/0001-43 Nome / Nome Empresarial DRONEFY - PRESTACAO DE SERVICOS DRONES AGRICOLAS LTDA Município / Sigla UF Nanuque / MG Código IBGE / CEP 31.44300 / 39.860-000 TOMADOR / ADQUIRENTE CNPJ / CPF / NIF 305.558.416-34 Nome / Nome Empresarial AIRSON DE EUGENIO DE FREITAS Município / Sigla UF Nova Viçosa / BA Código IBGE / CEP 29.23001 / 45.920-000 Endereço ARRENDAMENTO FAZENDA NOVA AMÉRICA, 0, ZONA RURAL E-mail nvlcont@gmail.com DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e SERVIÇO PRESTADO Código de Tributação Nacional/Municipal 07.13.01 / - Descrição do Serviço SERVIÇO DE MONITORAMENTO DE PRAGAS AGRÍCOLAS TRIBUTAÇÃO MUNICIPAL (ISSQN) BC ISSQN R$ 567,08 Alíquota Aplicada 5,00 % Retenção do ISSQN Não Retido ISSQN Apurado R$ 28,35 VALOR TOTAL DA NFS-e VALOR DA OPERAÇÃO / SERVIÇO R$ 567,08 VALOR LÍQUIDO DA NFS-e R$ 567,08`, "nota-airson.pdf");
  assert.equal(document.number, "30");
  assert.equal(document.party, "AIRSON DE EUGENIO DE FREITAS");
  assert.equal(document.date, "2026-11-19");
  assert.equal(document.value, 567.08);
  assert.equal(document.type, "Prestação de Serviço");
  assert.equal(document.accessKey, "31443002240206420000143000000000003026111548989665");
  assert.match(document.notes, /CPF\/CNPJ do tomador: 305\.558\.416-34/);
  assert.match(document.notes, /Serviço: SERVIÇO DE MONITORAMENTO DE PRAGAS AGRÍCOLAS/);
  assert.match(document.notes, /ISSQN apurado: R\$\s?28,35/);
});

test("reconhece DANFSe convertida em imagem pela leitura óptica", () => {
  const document = parseFiscalPdfText(`DANFSe v2.0 CHAVE DE ACESSO DA NFS-e 31443002240206420000143000000000003626116266727097 NÚMERO DA NFS-e COMPETÊNCIA DA NFS-e DATA E HORA DA EMISSÃO DA NFS-e AAA 36 23/11/2026 23/11/2026 16:12:37 PRESTADOR / FORNECEDOR CNPJ TCPFTNIF Indicador Municipal 40.206.420/0001-43 Nome / Nome Empresarial Município / Sigla UF Código IBGE | CEP DRONEFY - PRESTACAO DE SERVICOS DRONES AGRICOLAS LTDA Nanuque / MG 31.44300 / 39.860-000 TOMADOR / ADQUIRENTE CNPJ TCPFINIF Indicador Municipal 087.887.047-42 Nome / Nome Empresarial Município / Sigla UF Código IBGE | CEP MILENA SILVA ROCHA Nova Viçosa / BA 29.23001 / 45.920-000 Endereço E-mail ARRENDAMENTO FAZENDA VIÇOSA E BOA VISTA, 0, ZONA RURAL - DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e SERVIÇO PRESTADO Descrição do Serviço SERVIÇO DE MONITORAMENTO DE PRAGAS AGRÍCOLAS TRIBUTAÇÃO MUNICIPAL VALOR TOTAL DA NFS-e VALOR DA OPERAÇÃO / SERVIÇO Desconto Incondicionado Desconto Condicionado R$378,84 - -`, "nota-milena.pdf");
  assert.equal(document.number, "36");
  assert.equal(document.party, "MILENA SILVA ROCHA");
  assert.equal(document.date, "2026-11-23");
  assert.equal(document.value, 378.84);
  assert.equal(document.accessKey, "31443002240206420000143000000000003626116266727097");
  assert.match(document.notes, /CPF\/CNPJ do tomador: 087\.887\.047-42/);
  assert.match(document.notes, /Município do tomador: Nova Viçosa \/ BA/);
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
