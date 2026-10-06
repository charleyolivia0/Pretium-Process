import { jsPDF } from "jspdf";

const LETTER_W = 612;
const LETTER_H = 792;
const MARGIN = 48;

function weekStartToFilename(weekLabel: string): string {
  const slug = weekLabel.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
  return `weekly-update-${slug || "export"}`;
}

export function downloadWeeklyUpdateTxt(weekLabel: string, text: string): void {
  const header = `Weekly Update — ${weekLabel}\n${"=".repeat(40)}\n\n`;
  const blob = new Blob([header + text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${weekStartToFilename(weekLabel)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildWeeklyUpdatePdf(weekLabel: string, text: string): jsPDF {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = LETTER_W;
  const pageH = LETTER_H;
  const maxW = pageW - MARGIN * 2;
  const lineH = 14;
  const topY = MARGIN + 52;
  const bottomY = pageH - MARGIN;
  const maxLines = Math.max(1, Math.floor((bottomY - topY) / lineH));

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("Weekly Update", MARGIN, MARGIN + 18);
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.text(weekLabel, MARGIN, MARGIN + 36);

  const lines = (pdf.splitTextToSize(text, maxW) as string[]) ?? [text];
  let idx = 0;
  let isFirstPage = true;

  while (idx < lines.length) {
    if (!isFirstPage) {
      pdf.addPage("letter");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.text("Weekly Update (continued)", MARGIN, MARGIN + 18);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
    }
    isFirstPage = false;

    let y = topY;
    for (let i = 0; i < maxLines && idx < lines.length; i++, idx++) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(lines[idx], MARGIN, y);
      y += lineH;
    }
  }

  return pdf;
}

export function downloadWeeklyUpdatePdf(weekLabel: string, text: string): void {
  const pdf = buildWeeklyUpdatePdf(weekLabel, text);
  pdf.save(`${weekStartToFilename(weekLabel)}.pdf`);
}

export async function copyWeeklyUpdateToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
