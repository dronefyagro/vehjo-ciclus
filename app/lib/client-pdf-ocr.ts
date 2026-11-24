"use client";

export async function recognizeImagePdf(file: File) {
  await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const canvasContext = canvas.getContext("2d", { alpha: false });
  if (!canvasContext) throw new Error("O navegador não conseguiu preparar a leitura óptica deste PDF.");
  await page.render({ canvas, canvasContext, viewport }).promise;

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por");
  try {
    const result = await worker.recognize(canvas);
    const text = result.data.text.trim();
    if (!text) throw new Error("A leitura óptica não encontrou texto nesta nota fiscal.");
    return text;
  } finally {
    await worker.terminate();
    page.cleanup();
    await pdf.destroy();
  }
}
