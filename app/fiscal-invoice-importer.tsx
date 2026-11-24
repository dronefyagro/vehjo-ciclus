"use client";

import { useState } from "react";

type FiscalDocument = { id: string; number: string; party: string; date: string; value: number; type: string; accessKey: string; notes: string; selected: boolean };
type Props = { headers: string[]; onClose: () => void; onImported: (rows: string[][]) => void };

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function rowFromDocument(headers: string[], document: FiscalDocument) {
  return headers.map((header) => {
    const key = normalized(header);
    if (/codigo$/.test(key)) return "";
    if (/numero nf|numero da nf/.test(key)) return document.number;
    if (/^tipo$|classificacao/.test(key)) return document.type;
    if (/cliente|fornecedor/.test(key)) return document.party;
    if (/emissao|data da nf/.test(key)) return document.date;
    if (/^valor$|valor da nota|valor total/.test(key)) return brl(document.value);
    if (/^status$|situacao/.test(key)) return "Importada";
    if (/chave/.test(key)) return document.accessKey;
    if (/observa/.test(key)) return document.notes;
    if (/ano de exercicio|^ano$/.test(key)) return document.date.slice(0, 4);
    return "";
  });
}

export default function FiscalInvoiceImporter({ headers, onClose, onImported }: Props) {
  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const chooseFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (files.length > 30) return setError("Selecione no máximo 30 arquivos por conferência.");
    setLoading(true); setError("");
    const found: FiscalDocument[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/fiscal-invoice", { method: "POST", body: form });
      const result = await response.json() as { documents?: Omit<FiscalDocument, "selected">[]; error?: string };
      if (response.ok) found.push(...(result.documents ?? []).map((document) => ({ ...document, selected: true })));
      else errors.push(`${file.name}: ${result.error ?? "falha na leitura"}`);
    }
    setDocuments(found); setError(errors.join(" · ")); setLoading(false);
  };
  const update = (id: string, field: keyof FiscalDocument, value: string | number | boolean) => setDocuments((current) => current.map((document) => document.id === id ? { ...document, [field]: value } : document));
  const selected = documents.filter((document) => document.selected);
  const confirm = async () => {
    if (!selected.length) return setError("Marque ao menos uma nota para importar.");
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "bulk-create", sheet: "Notas Fiscais", rows: selected.map((document) => rowFromDocument(headers, document)) }) });
      const result = await response.json() as { rows?: string[][]; imported?: number; skipped?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível importar as notas.");
      onImported(result.rows ?? []);
      window.alert(`${result.imported ?? 0} nota(s) importada(s). ${result.skipped ?? 0} duplicidade(s) ignorada(s).`);
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao importar."); } finally { setSaving(false); }
  };
  return <div className="modal-backdrop"><section className="invoice-import-modal" role="dialog" aria-modal="true" aria-labelledby="fiscal-import-title"><div className="modal-head"><div><span>NOTAS FISCAIS</span><h3 id="fiscal-import-title">Importar PDF ou XML</h3></div><button onClick={onClose} aria-label="Fechar">×</button></div><div className="fiscal-upload"><label><strong>{loading ? "Analisando documentos..." : "Selecione notas fiscais"}</strong><span>Arquivos PDF ou XML · até 10 MB por arquivo</span><input type="file" accept=".pdf,.xml,application/pdf,text/xml,application/xml" multiple disabled={loading} onChange={(event) => void chooseFiles(event.target.files)}/></label><div><strong>{documents.length}</strong><span>documento(s) reconhecido(s)</span><strong>{brl(selected.reduce((sum, document) => sum + document.value, 0))}</strong><span>valor selecionado</span></div></div>{error && <div className="import-error" role="alert">{error}</div>}{documents.length > 0 && <><div className="fiscal-select-all"><label><input type="checkbox" checked={selected.length === documents.length} onChange={(event) => setDocuments((current) => current.map((document) => ({ ...document, selected: event.target.checked })))}/> Marcar todos</label><span>Revise os dados antes de confirmar.</span></div><div className="fiscal-preview"><table><thead><tr><th>Importar</th><th>Número NF</th><th>Cliente/Fornecedor</th><th>Emissão</th><th>Classificação</th><th>Valor</th><th>Chave de acesso</th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td><input type="checkbox" checked={document.selected} onChange={(event) => update(document.id, "selected", event.target.checked)}/></td><td><input value={document.number} onChange={(event) => update(document.id, "number", event.target.value)}/></td><td><input value={document.party} onChange={(event) => update(document.id, "party", event.target.value)}/></td><td><input type="date" value={document.date} onChange={(event) => update(document.id, "date", event.target.value)}/></td><td><select value={document.type} onChange={(event) => update(document.id, "type", event.target.value)}><option>Venda</option><option>Prestação de Serviço</option><option>Mercadoria</option><option>Locação</option></select></td><td><input inputMode="decimal" value={document.value || ""} onChange={(event) => update(document.id, "value", Number(event.target.value.replace(",", ".")) || 0)}/></td><td><input value={document.accessKey} onChange={(event) => update(document.id, "accessKey", event.target.value)}/></td></tr>)}</tbody></table></div></>}<div className="modal-actions"><button className="cancel-action" onClick={onClose}>Cancelar</button><button className="save-action" disabled={saving || !selected.length} onClick={() => void confirm()}>{saving ? "Importando..." : `Importar ${selected.length} nota(s)`}</button></div></section></div>;
}

