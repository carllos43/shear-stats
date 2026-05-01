import { createServerFn } from "@tanstack/react-start";

export interface InsightInput {
  total: number;
  goal: number;
  occupancy: number;
  periodLabel?: string;
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function localInsight(d: InsightInput): string {
  const percent = d.goal > 0 ? (d.total / d.goal) * 100 : 0;
  if (d.goal > 0 && percent >= 100) return "Meta batida. Excelente desempenho hoje.";
  if (d.goal > 0 && percent >= 70) return "Você está perto da meta. Continue nesse ritmo.";
  if (d.occupancy < 50) return "Baixa ocupação. Tente reduzir o tempo ocioso.";
  if (d.goal > 0 && percent < 30) return "Faturamento abaixo do esperado. Foque em atrair mais clientes.";
  return "Dia tranquilo. Ainda dá tempo de melhorar o faturamento.";
}

function sanitize(text: string): string {
  // 1 frase curta, sem aspas/markdown.
  const clean = text.replace(/[*_`"#>]/g, "").trim();
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  return firstSentence.length > 180 ? firstSentence.slice(0, 177) + "..." : firstSentence;
}

export const generateInsight = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => {
    const d = (raw ?? {}) as Partial<InsightInput>;
    return {
      total: Number(d.total) || 0,
      goal: Number(d.goal) || 0,
      occupancy: Math.max(0, Math.min(100, Number(d.occupancy) || 0)),
      periodLabel: typeof d.periodLabel === "string" ? d.periodLabel : "hoje",
    } satisfies InsightInput;
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { insight: localInsight(data), source: "local" as const };

    const prompt = `Você é um assistente para barbeiro. Dados (${data.periodLabel}):
Faturamento: R$ ${data.total.toFixed(2)}
Meta: R$ ${data.goal.toFixed(2)}
Ocupação: ${data.occupancy.toFixed(0)}%

Gere UM insight curto (1 frase, máximo 25 palavras), direto, em português, sem aspas e sem markdown.`;

    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: "Responda em português com UMA frase curta, prática e direta." },
            { role: "user", content: prompt },
          ],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        return { insight: localInsight(data), source: "local" as const };
      }
      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) return { insight: localInsight(data), source: "local" as const };
      return { insight: sanitize(text), source: "ai" as const };
    } catch {
      return { insight: localInsight(data), source: "local" as const };
    }
  });
