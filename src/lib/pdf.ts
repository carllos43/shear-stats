import jsPDF from "jspdf";
import type { Appointment } from "@/store/app-store";
import { formatHourMinute } from "@/lib/dates";

interface Args {
  barbershopName: string;
  from: Date;
  to: Date;
  rangeLabel: string;
  appointments: Appointment[];
  barberPercentage: number;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR");

export function generateReportPdf({
  barbershopName,
  from,
  to,
  rangeLabel,
  appointments,
  barberPercentage,
}: Args) {
  const ownerPercentage = Math.max(0, 100 - barberPercentage);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const usableWidth = pageWidth - marginX * 2;

  const sorted = [...appointments].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
  );
  const total = sorted.reduce((s, a) => s + a.price, 0);
  const totalBarber = sorted.reduce((s, a) => s + (a.barber_share ?? 0), 0);
  const totalOwner = sorted.reduce((s, a) => s + (a.owner_share ?? 0), 0);
  const totalSecs = sorted.reduce((s, a) => s + a.duration_seconds, 0);

  // Cabeçalho
  const drawHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(20);
    doc.text(barbershopName || "BarberMetrics", marginX, 50);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text("Relatório de Atendimentos", marginX, 68);
    doc.text(`Período: ${rangeLabel} (${fmtDate(from)} – ${fmtDate(to)})`, marginX, 84);
    doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, marginX, 98);

    doc.setDrawColor(229);
    doc.setLineWidth(0.5);
    doc.line(marginX, 110, pageWidth - marginX, 110);
  };

  drawHeader();

  // Resumo
  let y = 128;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text("Resumo", marginX, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60);
  doc.text(`Atendimentos: ${sorted.length}`, marginX, y);
  doc.text(`Faturamento: R$ ${fmtBRL(total)}`, marginX + 180, y);
  const hours = totalSecs / 3600;
  doc.text(`Horas trabalhadas: ${hours.toFixed(1)}h`, marginX + 360, y);
  y += 22;

  // Cabeçalho da tabela
  const cols = [
    { label: "Data", w: 70 },
    { label: "Horário", w: 95 },
    { label: "Serviço", w: 175 },
    { label: "Duração", w: 65, align: "right" as const },
    { label: "Valor (R$)", w: usableWidth - (70 + 95 + 175 + 65), align: "right" as const },
  ];

  const drawTableHeader = (yy: number) => {
    doc.setFillColor(245, 245, 245);
    doc.rect(marginX, yy - 12, usableWidth, 20, "F");
    doc.setDrawColor(229);
    doc.setLineWidth(0.4);
    doc.line(marginX, yy + 8, pageWidth - marginX, yy + 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30);
    let x = marginX + 6;
    for (const c of cols) {
      const tx = c.align === "right" ? x + c.w - 12 : x;
      doc.text(c.label, tx, yy + 2, { align: c.align ?? "left" });
      x += c.w;
    }
  };

  drawTableHeader(y);
  y += 18;

  // Linhas
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(40);

  const rowHeight = 18;
  const bottomLimit = pageHeight - 50;

  for (let i = 0; i < sorted.length; i++) {
    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      drawHeader();
      y = 128;
      drawTableHeader(y);
      y += 18;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(40);
    }
    const a = sorted[i];
    const date = new Date(a.started_at);
    const minutes = Math.round(a.duration_seconds / 60);
    const values = [
      fmtDate(date),
      `${formatHourMinute(a.started_at)} → ${formatHourMinute(a.ended_at)}`,
      a.service_name.length > 40 ? a.service_name.slice(0, 38) + "…" : a.service_name,
      `${minutes} min`,
      fmtBRL(a.price),
    ];
    if (i % 2 === 1) {
      doc.setFillColor(250, 250, 250);
      doc.rect(marginX, y - 12, usableWidth, rowHeight, "F");
    }
    let x = marginX + 6;
    for (let j = 0; j < cols.length; j++) {
      const c = cols[j];
      const tx = c.align === "right" ? x + c.w - 12 : x;
      doc.text(values[j], tx, y, { align: c.align ?? "left" });
      x += c.w;
    }
    doc.setDrawColor(238);
    doc.setLineWidth(0.3);
    doc.line(marginX, y + 6, pageWidth - marginX, y + 6);
    y += rowHeight;
  }

  // Total
  if (y + 26 > bottomLimit) {
    doc.addPage();
    drawHeader();
    y = 128;
  }
  doc.setFillColor(240, 240, 240);
  doc.rect(marginX, y - 12, usableWidth, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20);
  doc.text("Total", marginX + 6, y + 2);
  doc.text(`R$ ${fmtBRL(total)}`, pageWidth - marginX - 6, y + 2, { align: "right" });

  // Rodapé
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `BarberMetrics 2.0 · Página ${i} de ${pages}`,
      pageWidth / 2,
      pageHeight - 20,
      { align: "center" },
    );
  }

  // Download via Blob — funciona em iOS/Android/PWA mesmo quando doc.save falha
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `BarberMetrics_Relatorio_${dateStr}.pdf`;

  try {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (err) {
    // Fallback iOS Safari: abre em nova aba (usuário usa "Compartilhar → Salvar")
    try {
      const dataUri = doc.output("datauristring");
      window.open(dataUri, "_blank");
    } catch {
      console.error("Falha ao gerar PDF", err);
      throw err;
    }
  }
}
