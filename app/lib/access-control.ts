export type UserRole = "admin" | "supervisor" | "user";

export type SessionUser = {
  username: string;
  name: string;
  role: UserRole;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  user: "Usuário padrão",
};

const STANDARD_MODULES = new Set([
  "Contas a Receber",
  "Contas a Pagar",
  "Fornecedores",
  "Orçamento",
  "Notas Fiscais",
  "Estoque",
  "Recursos Humanos",
  "Patrimônio",
  "Relatórios Gestão",
]);

const SUPERVISOR_BLOCKED = new Set(["Configurações", "Usuários e Acessos"]);

export function canAccessModule(role: UserRole, moduleName: string) {
  if (role === "admin") return true;
  if (role === "supervisor") return !SUPERVISOR_BLOCKED.has(moduleName);
  return STANDARD_MODULES.has(moduleName);
}

export function defaultModuleForRole(role: UserRole) {
  return role === "user" ? "Contas a Receber" : "Visão geral";
}

const SHEET_MODULE: Record<string, string> = {
  Clientes: "Clientes",
  Fazendas: "Fazendas",
  Contratos: "Contratos",
  "Contas a Receber": "Contas a Receber",
  "Contas a Pagar": "Contas a Pagar",
  "Contas Bancárias": "Contas Bancárias",
  Fornecedores: "Fornecedores",
  "Plano de Contas": "Plano de Contas",
  Orçamento: "Orçamento",
  Transferências: "Transferências",
  "Fluxo de Caixa": "Fluxo de Caixa",
  "Faturamento e DER": "Faturamento e DER",
  "Notas Fiscais": "Notas Fiscais",
  Estoque: "Estoque",
  "Recursos Humanos": "Recursos Humanos",
  Patrimônio: "Patrimônio",
  Configurações: "Configurações",
  "Análise de Faturas": "Análise de Faturas",
};

export function canAccessSheet(role: UserRole, sheet: string) {
  const moduleName = SHEET_MODULE[sheet];
  return Boolean(moduleName && canAccessModule(role, moduleName));
}

export const USER_RECORD_KIND = "Usuário Plataforma";

