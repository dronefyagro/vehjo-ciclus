export type FiscalDocument = {
  id: string;
  number: string;
  party: string;
  date: string;
  value: number;
  type: string;
  accessKey: string;
  notes: string;
};

const cleanText = (value = "") => value.replace(/\s+/g, " ").trim();
const money = (value = "") => {
  const normalized = value.replace(/[^\d,.-]/g, "");
  const parsed = Number(normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
};
const isoDate = (value = "") => {
  const brazilian = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (brazilian) return `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}`;
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : "";
};
const first = (value: string, patterns: RegExp[]) => patterns.map((pattern) => value.match(pattern)?.[1] ?? "").find(Boolean) ?? "";
const section = (value: string, start: RegExp, end: RegExp) => {
  const startMatch = start.exec(value);
  if (!startMatch || startMatch.index === undefined) return "";
  const contentStart = startMatch.index + startMatch[0].length;
  const remainder = value.slice(contentStart);
  const endMatch = end.exec(remainder);
  return remainder.slice(0, endMatch?.index ?? remainder.length).trim();
};
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function parseFiscalPdfText(text: string, fileName: string): FiscalDocument {
  const compact = cleanText(text);
  const nationalNfse = /DANFSe\s*v?2\.0|CHAVE DE ACESSO DA NFS-e|N[ÚU]MERO DA NFS-e/i.test(compact);
  const number = first(compact, [
    /N[ÚU]MERO DA NFS-e\s*[:#-]?\s*(\d{1,15})(?!\d)/i,
    /(?:n[uú]mero(?:\s+da)?\s+(?:nf|nfs-e|nota)|nota\s+fiscal(?:\s+n[º°o])?|nfs-e\s*n[º°o]?)\s*[:#-]?\s*(\d{1,15})/i,
  ]);
  const accessKey = first(compact, [
    /CHAVE DE ACESSO DA NFS-e\s*[:#-]?\s*((?:\d{50}|\d{44}))(?!\d)/i,
    /N[°ºo]\s*NFS-e\s*\/\s*CHAVE NFS-e\s*\d{1,15}\s*\/\s*((?:\d{50}|\d{44}))(?!\d)/i,
    /(?:^|\D)((?:\d{50}|\d{44}))(?!\d)/,
  ]);
  const date = isoDate(first(compact, [
    /DATA(?:\s+E\s+HORA)?\s+DA\s+EMISS[AÃ]O\s+DA\s+NFS-e\s*(\d{2}\/\d{2}\/\d{4})/i,
    /(?:emiss[aã]o|data\s+de\s+emiss[aã]o)[^\d]{0,30}(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})/,
  ]));
  const competence = first(compact, [/COMPET[EÊ]NCIA DA NFS-e\s*(\d{2}\/\d{2}\/\d{4})/i]);
  const grossValue = money(first(compact, [
    /VALOR DA OPERA[CÇ][AÃ]O\s*\/\s*SERVI[CÇ]O\s*(?:R\$\s*)?([\d.]+,\d{2})/i,
    /(?:valor\s+total\s+da\s+nota|valor\s+da\s+nota|valor\s+dos\s+servi[cç]os)[^\d]{0,25}(?:R\$\s*)?([\d.]+,\d{2})/i,
  ]));
  const netValue = money(first(compact, [/VALOR L[IÍ]QUIDO DA NFS-e\s*(?:R\$\s*)?([\d.]+,\d{2})/i]));

  const partySection = section(compact, /TOMADOR\s*\/\s*ADQUIRENTE/i, /DESTINAT[AÁ]RIO DA OPERA[CÇ][AÃ]O|INTERMEDI[AÁ]RIO DA OPERA[CÇ][AÃ]O|SERVI[CÇ]O PRESTADO/i);
  const providerSection = section(compact, /PRESTADOR\s*\/\s*FORNECEDOR/i, /TOMADOR\s*\/\s*ADQUIRENTE/i);
  const serviceSection = section(compact, /SERVI[CÇ]O PRESTADO/i, /TRIBUTA[CÇ][AÃ]O MUNICIPAL/i);
  const party = cleanText(first(partySection || compact, [
    /Nome\s*\/\s*Nome Empresarial\s+(.+?)(?=\s+Munic[ií]pio\s*\/\s*Sigla UF)/i,
    /(?:destinat[aá]rio(?:\s*\/\s*remetente)?|tomador(?:\s+de\s+servi[cç]os)?)[\s:.-]{0,20}(?:raz[aã]o\s+social|nome)?[\s:.-]*([A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 .&'-]{3,100}?)(?=\s+(?:CNPJ|CPF|ENDERE[CÇ]O|INSCRI[CÇ][AÃ]O|DATA))/i,
  ]));
  const partyDocument = first(partySection, [/CNPJ\s*\/\s*CPF\s*\/\s*NIF\s+([\d./-]{11,20})/i]);
  const partyLocation = cleanText(first(partySection, [/Munic[ií]pio\s*\/\s*Sigla UF\s+(.+?)(?=\s+C[oó]digo IBGE\s*\/\s*CEP)/i]));
  const partyAddress = cleanText(first(partySection, [/Endere[cç]o\s+(.+?)(?=\s+E-mail)/i]));
  const partyEmail = first(partySection, [/E-mail\s+([^\s]+@[^\s]+)/i]);
  const provider = cleanText(first(providerSection, [/Nome\s*\/\s*Nome Empresarial\s+(.+?)(?=\s+Munic[ií]pio\s*\/\s*Sigla UF)/i]));
  const serviceDescription = cleanText(first(serviceSection, [/Descri[cç][aã]o do Servi[cç]o\s+(.+?)(?=$)/i]));
  const serviceCode = first(serviceSection, [/C[oó]digo de Tributa[cç][aã]o Nacional\/Municipal\s+([\d.]+(?:\s*\/\s*[^\s]+)?)/i]);
  const taxBase = money(first(compact, [/BC ISSQN\s*(?:R\$\s*)?([\d.]+,\d{2})/i]));
  const taxRate = first(compact, [/Al[ií]quota Aplicada\s*([\d.,]+\s*%)/i]);
  const taxValue = money(first(compact, [/ISSQN Apurado\s*(?:R\$\s*)?([\d.]+,\d{2})/i]));
  const taxWithholding = first(compact, [/Reten[cç][aã]o do ISSQN\s+(.+?)(?=\s+ISSQN Apurado|\s+TRIBUTA[CÇ][AÃ]O FEDERAL)/i]);

  if (!number && !accessKey) throw new Error("Não foi possível identificar o número ou a chave da nota neste PDF.");
  const details = [
    nationalNfse ? "Modelo: DANFSe Nacional v2.0" : "Modelo fiscal reconhecido",
    competence && `Competência: ${competence}`,
    provider && `Prestador: ${provider}`,
    partyDocument && `CPF/CNPJ do tomador: ${partyDocument}`,
    partyLocation && `Município do tomador: ${partyLocation}`,
    partyAddress && `Endereço do tomador: ${partyAddress}`,
    partyEmail && `E-mail do tomador: ${partyEmail}`,
    serviceCode && `Código do serviço: ${serviceCode}`,
    serviceDescription && `Serviço: ${serviceDescription}`,
    grossValue > 0 && `Valor bruto: ${brl(grossValue)}`,
    netValue > 0 && `Valor líquido: ${brl(netValue)}`,
    taxBase > 0 && `BC ISSQN: ${brl(taxBase)}`,
    taxRate && `Alíquota ISSQN: ${taxRate}`,
    taxValue > 0 && `ISSQN apurado: ${brl(taxValue)}`,
    taxWithholding && `Retenção ISSQN: ${cleanText(taxWithholding)}`,
    `Origem: PDF ${fileName}`,
  ].filter(Boolean);

  return {
    id: `${fileName}-${accessKey || number}`,
    number,
    party,
    date,
    value: netValue || grossValue,
    type: nationalNfse || /NFS-e|servi[cç]o/i.test(compact) ? "Prestação de Serviço" : "Venda",
    accessKey,
    notes: details.join("; "),
  };
}
