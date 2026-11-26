import { readFile } from "node:fs/promises";
import { classifyBankMigration, extractBankDocument, reconcileRelatedBankPairs } from "../app/lib/bank-migration.ts";

const filePath = process.argv[2];
if (!filePath) throw new Error("Informe o caminho de um arquivo OFX para simulação.");
const bytes = await readFile(filePath);
const text = new TextDecoder("windows-1252").decode(bytes);
const tag = (block, name) => block.match(new RegExp(`<${name}>\\s*([^<\\r\\n]+)`, "i"))?.[1]?.trim() ?? "";
const isoDate = (value) => value.replace(/^(\d{4})(\d{2})(\d{2}).*$/, "$1-$2-$3");
const account = tag(text, "ACCTID");
const bank = tag(text, "BANKID") === "756" ? "Sicoob" : tag(text, "ORG") || "Banco não identificado";
const accountLabel = `${bank} · Conta ${account}`;
const transactions = reconcileRelatedBankPairs([...text.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi)].map((match) => {
  const block = match[1];
  const signed = Number(tag(block, "TRNAMT"));
  const name = tag(block, "NAME");
  const memo = tag(block, "MEMO");
  const description = [name, memo].filter(Boolean).join(" · ");
  return classifyBankMigration({ date: isoDate(tag(block, "DTPOSTED")), amount: Math.abs(signed), movement: signed >= 0 ? "credit" : "debit", description, counterparty: name || memo || "Não identificado", document: extractBankDocument(description), externalId: tag(block, "FITID") }, accountLabel, "40206420000143", new Map());
}));

const byTarget = Object.fromEntries(["Contas a Receber", "Contas a Pagar", "Transferências", "Ignorar"].map((target) => {
  const selected = transactions.filter((item) => item.target === target);
  return [target, { count: selected.length, total: Number(selected.reduce((sum, item) => sum + item.amount, 0).toFixed(2)) }];
}));
const byCategory = [...transactions.reduce((map, item) => map.set(item.category, Number(((map.get(item.category) ?? 0) + item.amount).toFixed(2))), new Map()).entries()].sort((left, right) => right[1] - left[1]);
console.log(JSON.stringify({ bank, account, transactions: transactions.length, byTarget, reviewRequired: transactions.filter((item) => item.reviewRequired).length, unselected: transactions.filter((item) => !item.selected).length, byCategory }, null, 2));
