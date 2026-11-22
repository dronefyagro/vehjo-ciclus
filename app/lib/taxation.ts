export type OfficialTaxEngine = {
  id: "regular" | "simples" | "danfse";
  name: string;
  scope: string;
  repository: string;
  observedVersion: string;
  observedAt: string;
  runtime: string;
  license: "MIT";
  status: "pending-homologation";
};

export const OFFICIAL_TAX_ENGINES: readonly OfficialTaxEngine[] = [
  {
    id: "regular",
    name: "Calculadora RTC — Regime Regular",
    scope: "CBS, IBS e Imposto Seletivo nas operações do regime regular",
    repository: "https://github.com/ReceitaFederal/calculadora-rtc-regime-regular",
    observedVersion: "1.7.2",
    observedAt: "18/11/2026",
    runtime: "Java 25 · Spring Boot 4.1.2 · SQLite/Flyway",
    license: "MIT",
    status: "pending-homologation",
  },
  {
    id: "simples",
    name: "Calculadora RTC — Simples Nacional",
    scope: "CBS e IBS nas operações do Simples Nacional; não substitui o PGDAS-D",
    repository: "https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional",
    observedVersion: "1.0.2",
    observedAt: "18/11/2026",
    runtime: "Java 25 · Spring Boot 4.1.2 · SQLite/Flyway",
    license: "MIT",
    status: "pending-homologation",
  },
  {
    id: "danfse",
    name: "Gerador oficial de DANFSe",
    scope: "Geração do PDF da DANFSe a partir do XML da NFS-e; não emite nem autoriza a nota",
    repository: "https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse",
    observedVersion: "Sem release versionada",
    observedAt: "22/11/2026",
    runtime: "Go 1.27+ · serviço HTTP em contêiner",
    license: "MIT",
    status: "pending-homologation",
  },
] as const;

export const TAX_CONFIGURATION_KIND = "Configuração Tributária";

export const TAX_CONFIGURATION_FIELDS = [
  "Tipo de registro",
  "Razão social",
  "CNPJ",
  "Inscrição estadual",
  "Inscrição municipal",
  "CNAE principal",
  "CNAEs secundários",
  "Regime tributário",
  "Enquadramento no Simples",
  "UF",
  "Município",
  "Tipo de operação",
  "Tratamento especial",
  "Responsável contábil",
  "Início da vigência",
  "Registrado em",
] as const;

