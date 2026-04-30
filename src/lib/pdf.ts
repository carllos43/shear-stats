import jsPDF from "jspdf";
import type { Appointment } from "@/store/app-store";

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

// Paleta
const COLOR = {
  ink: [20, 20, 24] as const,
  textMuted: [110, 110, 120] as const,
  border: [225, 225, 230] as const,
  rowAlt: [248, 248, 250] as const,
  headerBg: [24, 24, 28] as const,
  headerText: [245, 245, 247] as const,
  gold: [184, 134, 11] as const, // faturamento
  green: [22, 134, 87] as const, // barbeiro
  amber: [202, 119, 0] as const, // dono
  cardBg: [250, 250, 252] as const,
};

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

  // ===== Cabeçalho =====
  const drawHeader = () => {
    // Banda escura no topo
    doc.setFillColor(...COLOR.headerBg);
    doc.rect(0, 0, pageWidth, 90, "F");

    // Nome da barbearia (grande)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...COLOR.headerText);
    doc.text(barbershopName || "BarberMetrics", marginX, 45);

    // Subtítulo
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(190, 190, 200);
    doc.text("Relatório de Atendimentos", marginX, 62);

    // Período + emissão (direita)
    doc.setFontSize(8.5);
    doc.setTextColor(180, 180, 190);
    doc.text(
      `Período: ${rangeLabel}  ·  ${fmtDate(from)} – ${fmtDate(to)}`,
      pageWidth - marginX,
      45,
      { align: "right" },
    );
    doc.text(
      `Emitido em ${new Date().toLocaleString("pt-BR")}`,
      pageWidth - marginX,
      62,
      { align: "right" },
    );

    // Linha separadora dourada
    doc.setDrawColor(...COLOR.gold);
    doc.setLineWidth(1.2);
    doc.line(marginX, 82, pageWidth - marginX, 82);
  };

  drawHeader();

  // ===== Resumo em cartões =====
  const cardTop = 110;
  const cardH = 70;
  const cardGap = 10;
  const cardW = (usableWidth - cardGap * 3) / 4;

  const drawCard = (
    x: number,
    label: string,
    value: string,
    accent: readonly [number, number, number],
  ) => {
    // fundo
    doc.setFillColor(...COLOR.cardBg);
    doc.roundedRect(x, cardTop, cardW, cardH, 6, 6, "F");
    // barra de acento esquerda
    doc.setFillColor(...accent);
    doc.roundedRect(x, cardTop, 4, cardH, 2, 2, "F");
    // label
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR.textMuted);
    doc.text(label.toUpperCase(), x + 12, cardTop + 18);
    // valor
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...accent);
    doc.text(value, x + 12, cardTop + 46);
  };

  drawCard(marginX + (cardW + cardGap) * 0, "Atendimentos", String(sorted.length), COLOR.ink);
  drawCard(marginX + (cardW + cardGap) * 1, "Faturamento", `R$ ${fmtBRL(total)}`, COLOR.gold);
  drawCard(
    marginX + (cardW + cardGap) * 2,
    `Barbeiro (${barberPercentage}%)`,
    `R$ ${fmtBRL(totalBarber)}`,
    COLOR.green,
  );
  drawCard(
    marginX + (cardW + cardGap) * 3,
    `Dono (${ownerPercentage}%)`,
    `R$ ${fmtBRL(totalOwner)}`,
    COLOR.amber,
  );

  let y = cardTop + cardH + 18;

  // ===== Métricas de tempo (horas trabalhadas / ociosas / ocupação) =====
  // Agrupa por dia para tratar 1 dia ou período (semana/mês) somando os valores.
  const byDay = new Map<string, Appointment[]>();
  for (const a of sorted) {
    const key = new Date(a.started_at).toISOString().slice(0, 10);
    const arr = byDay.get(key);
    if (arr) arr.push(a);
    else byDay.set(key, [a]);
  }
  let workedSec = 0;
  let totalSec = 0;
  for (const [, arr] of byDay) {
    const w = arr.reduce((s, a) => s + (a.duration_seconds ?? 0), 0);
    workedSec += w;
    if (arr.length > 0) {
      const starts = arr.map((a) => new Date(a.started_at).getTime());
      const ends = arr.map((a) => new Date(a.ended_at).getTime());
      const span = Math.max(...ends) - Math.min(...starts);
      totalSec += Math.max(span / 1000, w);
    }
  }
  const idleSec = Math.max(0, totalSec - workedSec);
  const occupancy = totalSec > 0 ? (workedSec / totalSec) * 100 : 0;
  const fmtH = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${String(m).padStart(2, "0")}m`;
  };

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.textMuted);
  const metricsLine = `Horas trabalhadas: ${fmtH(workedSec)}   ·   Horas ociosas: ${fmtH(idleSec)}   ·   Ocupação: ${occupancy.toFixed(1)}%`;
  doc.text(metricsLine, marginX, y + 4);
  y += 22;

  // Título seção tabela
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLOR.ink);
  doc.text("Detalhamento", marginX, y);
  y += 14;

  // ===== Tabela =====
  const dataW = 60;
  const svcW = 170;
  const valW = 80;
  const barberW = 90;
  const ownerW = usableWidth - (dataW + svcW + valW + barberW);
  const cols = [
    { label: "Data", w: dataW, align: "left" as const },
    { label: "Serviço", w: svcW, align: "left" as const },
    { label: "Valor (R$)", w: valW, align: "right" as const },
    { label: `Barbeiro ${barberPercentage}%`, w: barberW, align: "right" as const },
    { label: `Dono ${ownerPercentage}%`, w: ownerW, align: "right" as const },
  ];

  const headerH = 22;
  const drawTableHeader = (yy: number) => {
    doc.setFillColor(...COLOR.headerBg);
    doc.roundedRect(marginX, yy, usableWidth, headerH, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR.headerText);
    let x = marginX + 10;
    for (const c of cols) {
      const tx = c.align === "right" ? x + c.w - 14 : x;
      doc.text(c.label, tx, yy + 14, { align: c.align });
      x += c.w;
    }
  };

  drawTableHeader(y);
  y += headerH;

  // Linhas
  const rowHeight = 20;
  const bottomLimit = pageHeight - 50;

  for (let i = 0; i < sorted.length; i++) {
    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      drawHeader();
      y = 110;
      drawTableHeader(y);
      y += headerH;
    }
    const a = sorted[i];
    const date = new Date(a.started_at);
    const values = [
      fmtDate(date),
      a.service_name.length > 36 ? a.service_name.slice(0, 34) + "…" : a.service_name,
      fmtBRL(a.price),
      fmtBRL(a.barber_share ?? 0),
      fmtBRL(a.owner_share ?? 0),
    ];
    if (i % 2 === 1) {
      doc.setFillColor(...COLOR.rowAlt);
      doc.rect(marginX, y, usableWidth, rowHeight, "F");
    }

    let x = marginX + 10;
    for (let j = 0; j < cols.length; j++) {
      const c = cols[j];
      doc.setFont("helvetica", j === 1 ? "bold" : "normal");
      doc.setFontSize(9);
      // Cor por coluna de valor
      if (j === 2) doc.setTextColor(...COLOR.gold);
      else if (j === 3) doc.setTextColor(...COLOR.green);
      else if (j === 4) doc.setTextColor(...COLOR.amber);
      else doc.setTextColor(...COLOR.ink);
      const tx = c.align === "right" ? x + c.w - 14 : x;
      doc.text(values[j], tx, y + 13, { align: c.align });
      x += c.w;
    }
    // Borda inferior sutil
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.3);
    doc.line(marginX, y + rowHeight, pageWidth - marginX, y + rowHeight);
    y += rowHeight;
  }

  // ===== Total final destacado =====
  const totalH = 42;
  if (y + totalH + 10 > bottomLimit) {
    doc.addPage();
    drawHeader();
    y = 110;
  }
  y += 10;
  doc.setFillColor(...COLOR.headerBg);
  doc.roundedRect(marginX, y, usableWidth, totalH, 6, 6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLOR.headerText);
  doc.text("TOTAL", marginX + 14, y + 26);

  // Valores alinhados às colunas (direita)
  let xt = marginX + dataW + svcW + 10;
  doc.setFontSize(12);
  doc.setTextColor(...COLOR.gold);
  doc.text(`R$ ${fmtBRL(total)}`, xt + valW - 14, y + 26, { align: "right" });
  xt += valW;
  doc.setTextColor(...COLOR.green);
  doc.text(`R$ ${fmtBRL(totalBarber)}`, xt + barberW - 14, y + 26, { align: "right" });
  xt += barberW;
  doc.setTextColor(...COLOR.amber);
  doc.text(`R$ ${fmtBRL(totalOwner)}`, pageWidth - marginX - 14, y + 26, { align: "right" });

  // ===== Rodapé =====
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.4);
    doc.line(marginX, pageHeight - 32, pageWidth - marginX, pageHeight - 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 150);
    doc.text(
      "Relatório gerado automaticamente pelo BarberMetrics",
      pageWidth / 2,
      pageHeight - 20,
      { align: "center" },
    );
    doc.text(`Página ${i} de ${pages}`, pageWidth - marginX, pageHeight - 20, { align: "right" });
  }

  // Download
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
    try {
      const dataUri = doc.output("datauristring");
      window.open(dataUri, "_blank");
    } catch {
      console.error("Falha ao gerar PDF", err);
      throw err;
    }
  }
}
