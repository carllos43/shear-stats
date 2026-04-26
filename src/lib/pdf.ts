import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Appointment } from "@/store/app-store";
import { formatHourMinute } from "@/lib/dates";

interface Args {
  barbershopName: string;
  from: Date;
  to: Date;
  rangeLabel: string;
  appointments: Appointment[];
}

export function generateReportPdf({ barbershopName, from, to, rangeLabel, appointments }: Args) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text(barbershopName || "BarberMetrics", 40, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text("Relatório de Atendimentos", 40, 68);

  const fmtDate = (d: Date) => d.toLocaleDateString("pt-BR");
  doc.text(`Período: ${rangeLabel} (${fmtDate(from)} – ${fmtDate(to)})`, 40, 84);
  doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 40, 98);

  // separator
  doc.setDrawColor(229);
  doc.setLineWidth(0.5);
  doc.line(40, 110, pageWidth - 40, 110);

  // Table
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
  );

  const rows = sorted.map((a) => {
    const date = new Date(a.started_at);
    const minutes = Math.round(a.duration_seconds / 60);
    return [
      date.toLocaleDateString("pt-BR"),
      `${formatHourMinute(a.started_at)} → ${formatHourMinute(a.ended_at)}`,
      a.service_name,
      `${minutes} min`,
      a.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    ];
  });

  const total = sorted.reduce((s, a) => s + a.price, 0);

  autoTable(doc, {
    startY: 124,
    head: [["Data", "Horário", "Serviço", "Duração", "Valor (R$)"]],
    body: rows,
    foot: [
      [
        { content: "Total", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
        {
          content: total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          styles: { halign: "right", fontStyle: "bold" },
        },
      ],
    ],
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 6,
      lineColor: [229, 229, 229],
      lineWidth: 0.4,
      textColor: 30,
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: 30,
      fontStyle: "bold",
      lineColor: [229, 229, 229],
      lineWidth: 0.4,
    },
    footStyles: {
      fillColor: [250, 250, 250],
      textColor: 30,
      lineColor: [229, 229, 229],
      lineWidth: 0.4,
    },
    columnStyles: {
      3: { halign: "right" },
      4: { halign: "right" },
    },
    margin: { left: 40, right: 40 },
  });

  // Footer
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `BarberMetrics 2.0 · Página ${i} de ${pages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: "center" },
    );
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  doc.save(`BarberMetrics_Relatorio_${dateStr}.pdf`);
}
