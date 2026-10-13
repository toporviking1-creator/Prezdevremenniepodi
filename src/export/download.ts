import { Packer, type Document } from 'docx';

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadDocx(doc: Document, fileName: string) {
  downloadBlob(await Packer.toBlob(doc), fileName.endsWith('.docx') ? fileName : `${fileName}.docx`);
}

export function downloadJson(data: unknown, fileName: string) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), fileName);
}
