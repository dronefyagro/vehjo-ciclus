import "server-only";

export async function loadPdfReader() {
  const { default: DOMMatrix } = await import("@thednp/dommatrix");
  const browserGlobals = globalThis as Record<string, unknown>;
  browserGlobals.DOMMatrix ??= DOMMatrix;
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}
