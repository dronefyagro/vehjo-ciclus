type IdentificationInput = {
  text: string;
  fileName: string;
  extension: string;
};

const normalized = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const BANKS: Array<{ name: string; pattern: RegExp }> = [
  { name: "Nubank", pattern: /\bnubank\b|\bnu pagamentos\b|\bnu financeiro\b/ },
  { name: "Cora", pattern: /\bcora\b/ },
  { name: "Sicredi", pattern: /\bsicredi\b/ },
  { name: "Sicoob", pattern: /\bsicoob\b/ },
  { name: "Itaú", pattern: /\bitau\b/ },
  { name: "Santander", pattern: /\bsantander\b/ },
  { name: "Bradesco", pattern: /\bbradesco\b/ },
  { name: "Banco do Brasil", pattern: /\bbanco do brasil\b|\bbanco brasil\b/ },
  { name: "Caixa", pattern: /\bcaixa economica\b|\bcaixa tem\b/ },
  { name: "Inter", pattern: /\bbanco inter\b/ },
  { name: "Mercado Pago", pattern: /\bmercado pago\b/ },
  { name: "PagBank", pattern: /\bpagbank\b|\bpagseguro\b/ },
];

const BANK_BY_ID: Record<string, string> = {
  "1": "Banco do Brasil", "001": "Banco do Brasil", "33": "Santander", "033": "Santander", "77": "Inter", "077": "Inter",
  "104": "Caixa", "237": "Bradesco", "260": "Nubank", "290": "PagBank", "323": "Mercado Pago", "341": "Itaú",
  "403": "Cora", "0403": "Cora", "748": "Sicredi", "756": "Sicoob",
};

const firstTag = (text: string, name: string) => text.match(new RegExp(`<${name}>\\s*([^<\\r\\n]+)`, "i"))?.[1]?.trim() ?? "";

const bankMention = (source: string) => {
  const value = normalized(source);
  return BANKS.map((bank) => ({ bank: bank.name, index: value.search(bank.pattern) }))
    .filter((match) => match.index >= 0)
    .sort((left, right) => left.index - right.index)[0]?.bank ?? "";
};

const cleanAccount = (value: string, bank: string) => {
  const account = value.trim().replace(/[^\d.-]/g, "").replace(/^[.-]+|[.-]+$/g, "");
  const accountDigits = account.replace(/\D/g, "");
  if (bank === "Nubank" && /^\d{9}$/.test(accountDigits)) return `${accountDigits.slice(0, 8)}-${accountDigits.slice(8)}`;
  return accountDigits.length >= 4 && accountDigits.length <= 24 ? account : "";
};

const headerExcerpt = (text: string, extension: string) => {
  if (/^(ofx|qfx)$/i.test(extension)) return text.slice(0, Math.min(text.length, 12000));
  const boundary = normalized(text).search(/\bmovimenta(?:cao|coes)\b|\blancamentos\b|\btransactions?\b/i);
  return text.slice(0, boundary >= 200 ? boundary : Math.min(text.length, 6000));
};

export const identifyBankAccount = ({ text, fileName, extension }: IdentificationInput) => {
  const bankId = firstTag(text, "BANKID").replace(/\D/g, "");
  const officialBank = BANK_BY_ID[bankId] || bankMention(`${firstTag(text, "ORG")} ${firstTag(text, "FID")}`);
  const fileBank = bankMention(fileName);
  const header = headerExcerpt(text, extension);
  const headerBank = bankMention(header) || (/\bnu\b/i.test(header.slice(0, 1200)) ? "Nubank" : "");
  const bodyBank = bankMention(text.slice(0, 12000));
  const bank = officialBank || fileBank || headerBank || bodyBank || "Banco não identificado";

  const taggedAccount = firstTag(text, "ACCTID");
  const fileAccount = fileName.match(/(?:conta|account)[^\d]{0,12}([\d.-]{4,})/i)?.[1] ?? "";
  const headerAccount = header.match(/(?:conta|account)(?:\s+(?:corrente|pagamento))?[^\d]{0,12}([\d.-]{4,})/i)?.[1] ?? "";
  const account = cleanAccount(taggedAccount || fileAccount || headerAccount, bank);
  return { bank, account, accountLabel: [bank, account ? `Conta ${account}` : ""].filter(Boolean).join(" · ") };
};
