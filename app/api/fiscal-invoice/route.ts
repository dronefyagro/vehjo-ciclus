import { NextResponse } from "next/server";
import { rejectUnsafeMutation } from "../../lib/api-guard";
import { getRequestSession } from "../../lib/auth";
import { canAccessModule } from "../../lib/access-control";
import { loadPdfReader } from "../../lib/pdf-reader";

export const runtime = "nodejs";
export const maxDuration = 60;

type PdfTextItem = { str?: string; hasEOL?: boolean };
type FiscalDocument = { id: string; number: string; party: string; date: string; value: number; type: string; accessKey: string; notes: string };

const decodeXml = (value = "") => value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const tag = (xml: string, name: string) => decodeXml(xml.match(new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}>`, "i"))?.[1] ?? "");
const money = (value = "") => { const normalized = value.replace(/[^\d,.-]/g, ""); const parsed = Number(normalized.includes(",") ? normalized.replace(/\./g, "").replace(",", ".") : normalized); return Number.isFinite(parsed) ? Math.abs(parsed) : 0; };
const isoDate = (value = "") => { const br = value.match(/(\d{2})\/(\d{2})\/(\d{4})/); if (br) return `${br[3]}-${br[2]}-${br[1]}`; const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/); return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : ""; };
const cleanText = (value = "") => value.replace(/\s+/g, " ").trim();

function parseXml(xml: string, fileName: string): FiscalDocument[] {
  const blocks = [...xml.matchAll(/<(?:[\w-]+:)?NFe\b[\s\S]*?<\/(?:[\w-]+:)?NFe>/gi)].map((match) => match[0]);
  const sources = blocks.length ? blocks : [xml];
  return sources.flatMap((source, index) => {
    const service = /CompNfse|InfNfse|ListaServico|ValoresNfse/i.test(source);
    const number = tag(source, service ? "Numero" : "nNF") || tag(source, "NumeroNfse") || tag(source, "NumeroNota");
    const partyBlock = source.match(/<(?:[\w-]+:)?(?:dest|TomadorServico|Tomador)\b[\s\S]*?<\/(?:[\w-]+:)?(?:dest|TomadorServico|Tomador)>/i)?.[0] ?? source;
    const party = tag(partyBlock, "xNome") || tag(partyBlock, "RazaoSocial") || tag(partyBlock, "NomeRazaoSocial");
    const date = isoDate(tag(source, "dhEmi") || tag(source, "dEmi") || tag(source, "DataEmissao") || tag(source, "Competencia"));
    const value = money(tag(source, "vNF") || tag(source, "ValorLiquidoNfse") || tag(source, "ValorServicos") || tag(source, "ValorNota"));
    const accessKey = source.match(/Id=["']NFe(\d{44})["']/i)?.[1] || tag(source, "chNFe") || tag(source, "CodigoVerificacao");
    if (!number && !accessKey) return [];
    return [{ id: `${fileName}-${accessKey || number}-${index}`, number, party, date, value, type: service ? "Prestação de Serviço" : "Venda", accessKey, notes: `Origem: XML ${fileName}` }];
  });
}

async function parsePdf(file: File): Promise<FiscalDocument[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const { getDocument } = await loadPdfReader();
  const document = await getDocument({ data, useSystemFonts: true }).promise;
  let text = "";
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items as PdfTextItem[]) {
      if (item.str) text += `${item.str} `;
      if (item.hasEOL) text += "\n";
    }
  }
  const compact = cleanText(text);
  const number = compact.match(/(?:n[uú]mero(?:\s+da)?\s+(?:nf|nfs-e|nota)|nota\s+fiscal(?:\s+n[º°o])?|nfs-e\s*n[º°o]?)\s*[:#-]?\s*(\d{1,15})/i)?.[1] || "";
  const digits = compact.replace(/\D/g, "");
  const accessKey = digits.match(/\d{44}/)?.[0] || "";
  const date = isoDate(compact.match(/(?:emiss[aã]o|data\s+de\s+emiss[aã]o)[^\d]{0,30}(\d{2}\/\d{2}\/\d{4})/i)?.[1] || compact.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || "");
  const valueMatch = compact.match(/(?:valor\s+total\s+da\s+nota|valor\s+da\s+nota|valor\s+dos\s+servi[cç]os)[^\d]{0,25}(?:R\$\s*)?([\d.]+,\d{2})/i);
  const partyMatch = compact.match(/(?:destinat[aá]rio(?:\s*\/\s*remetente)?|tomador(?:\s+de\s+servi[cç]os)?)[\s:.-]{0,20}(?:raz[aã]o\s+social|nome)?[\s:.-]*([A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 .&'-]{3,100}?)(?=\s+(?:CNPJ|CPF|ENDERE[CÇ]O|INSCRI[CÇ][AÃ]O|DATA))/i);
  if (!number && !accessKey) throw new Error("Não foi possível identificar o número ou a chave da nota neste PDF.");
  return [{ id: `${file.name}-${accessKey || number}`, number, party: cleanText(partyMatch?.[1] ?? ""), date, value: money(valueMatch?.[1] ?? ""), type: /NFS-e|servi[cç]o/i.test(compact) ? "Prestação de Serviço" : "Venda", accessKey, notes: `Origem: PDF ${file.name}` }];
}

export async function POST(request: Request) {
  const rejected = rejectUnsafeMutation(request, 12 * 1024 * 1024);
  if (rejected) return rejected;
  const session = getRequestSession(request);
  if (!session || !canAccessModule(session.role, "Notas Fiscais")) return NextResponse.json({ error: "Seu perfil não possui acesso às Notas Fiscais." }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo PDF ou XML." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "O arquivo deve ter no máximo 10 MB." }, { status: 413 });
    const extension = file.name.toLocaleLowerCase("pt-BR").split(".").pop();
    const documents = extension === "xml" || /xml/i.test(file.type) ? parseXml(await file.text(), file.name) : extension === "pdf" || file.type === "application/pdf" ? await parsePdf(file) : [];
    if (!documents.length) return NextResponse.json({ error: "Nenhuma nota fiscal reconhecida neste arquivo." }, { status: 422 });
    return NextResponse.json({ fileName: file.name, documents });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível interpretar o documento fiscal." }, { status: 500 });
  }
}

