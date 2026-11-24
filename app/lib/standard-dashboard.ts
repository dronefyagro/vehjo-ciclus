import type { VehjoData } from "./google-sheets";

export type StandardDashboardSummary = {
  monthLabel: string;
  receivableCurrentMonth: number;
  payableCurrentMonth: number;
  contractsExpiring: number;
  contractsExpired: number;
  clients: number;
  farms: number;
  hectares: number;
  stockItems: number;
  stockLow: number;
  stockSituation: "Sem cadastro" | "Regular" | "Atenção";
};

const normalize = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
const numberValue = (value = "") => {
  const raw = String(value).replace(/[^\d,.-]/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  return Number(normalized) || 0;
};
const isoDate = (value = "") => {
  const raw = String(value).trim();
  if (/^\d{5}$/.test(raw)) return new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86400000).toISOString().slice(0, 10);
  const brazilian = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return brazilian ? `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}` : raw.slice(0, 10);
};
const todayInBrazil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const sheetView = (data: VehjoData, name: string) => {
  const sheet = data.sheets[name] ?? [];
  const headers = sheet[0] ?? [];
  const records = sheet.slice(1).filter((row) => row.some(Boolean));
  const index = (...patterns: RegExp[]) => headers.findIndex((header) => patterns.some((pattern) => pattern.test(normalize(header))));
  return { records, index };
};
const uniqueCount = (records: string[][], primary: number, fallback: number) => new Set(records.map((row) => normalize((primary >= 0 ? row[primary] : "") || (fallback >= 0 ? row[fallback] : "") || "")).filter(Boolean)).size;

export function buildStandardDashboardSummary(data: VehjoData): StandardDashboardSummary {
  const todayIso = todayInBrazil();
  const monthKey = todayIso.slice(0, 7);
  const today = new Date(`${todayIso}T12:00:00-03:00`);
  const expirationLimit = new Date(today.getTime() + 45 * 86400000).toISOString().slice(0, 10);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" }).format(today);

  const financialTotal = (name: "Contas a Receber" | "Contas a Pagar") => {
    const view = sheetView(data, name);
    const date = view.index(/^data$/, /vencimento/, /data prevista/);
    const value = view.index(/^valor$/, /valor total/, /saldo/);
    const status = view.index(/^status$/, /^situacao$/);
    if (date < 0 || value < 0) return 0;
    return view.records.reduce((sum, row) => {
      const rowStatus = status >= 0 ? normalize(row[status]) : "";
      if (/cancelad|estornad/.test(rowStatus) || isoDate(row[date]).slice(0, 7) !== monthKey) return sum;
      return sum + Math.abs(numberValue(row[value]));
    }, 0);
  };

  const contracts = sheetView(data, "Contratos");
  const contractEnd = contracts.index(/data fim/, /termino/, /vigencia final/);
  const contractStatus = contracts.index(/^status$/, /^situacao$/);
  const validContracts = contracts.records.filter((row) => !/cancelad/.test(normalize(row[contractStatus] ?? "")) && contractEnd >= 0 && isoDate(row[contractEnd]));
  const contractsExpiring = validContracts.filter((row) => {
    const end = isoDate(row[contractEnd]);
    return end >= todayIso && end <= expirationLimit && !/encerrad/.test(normalize(row[contractStatus] ?? ""));
  }).length;
  const contractsExpired = validContracts.filter((row) => isoDate(row[contractEnd]) < todayIso).length;

  const clients = sheetView(data, "Clientes");
  const clientCode = clients.index(/^codigo$/);
  const clientName = clients.index(/razao social/, /^nome$/);
  const farms = sheetView(data, "Fazendas");
  const farmCode = farms.index(/^codigo$/);
  const farmName = farms.index(/nome da fazenda/, /^fazenda$/);
  const farmArea = farms.index(/^area total/, /^hectares$/);

  const stock = sheetView(data, "Estoque");
  const stockCurrent = stock.index(/^estoque atual$/, /saldo atual/, /quantidade atual/);
  const stockMinimum = stock.index(/^estoque minimo$/, /^minimo$/);
  const stockLow = stock.records.filter((row) => stockCurrent >= 0 && stockMinimum >= 0 && numberValue(row[stockCurrent]) <= numberValue(row[stockMinimum])).length;

  return {
    monthLabel,
    receivableCurrentMonth: financialTotal("Contas a Receber"),
    payableCurrentMonth: financialTotal("Contas a Pagar"),
    contractsExpiring,
    contractsExpired,
    clients: uniqueCount(clients.records, clientCode, clientName),
    farms: uniqueCount(farms.records, farmCode, farmName),
    hectares: farmArea >= 0 ? farms.records.reduce((sum, row) => sum + numberValue(row[farmArea]), 0) : 0,
    stockItems: stock.records.length,
    stockLow,
    stockSituation: stock.records.length === 0 ? "Sem cadastro" : stockLow > 0 ? "Atenção" : "Regular",
  };
}
