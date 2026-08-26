export interface ReportAIInput {
  rangeLabel: string;
  fromISO: string;
  toISO: string;
  daysCount: number;
  total: number;
  count: number;
  avgTicket: number;
  occupancyPct: number;
  workedHours: number;
  idleHours: number;
  revenuePerHour: number;
  trendPct: number | null;
  prevTotal: number;
  bestWeekday: { name: string; revenue: number } | null;
  worstWeekday: { name: string; revenue: number } | null;
  bestHour: { hour: number; revenue: number } | null;
  topService: {
    name: string;
    revenue: number;
    count: number;
    avgTicket: number;
    revenuePerHour: number;
  } | null;
  weeklyScore: number;
  forecast: { min: number; likely: number; max: number };
  weeklyHistory: Array<{
    week_start_date: string;
    total_revenue: number;
    avg_ticket: number;
    avg_occupancy: number;
  }>;
  localDiscoveries: string[];
  localOpportunities: string[];
  localExecutive: { headline: string; bullets: string[] };
}

export interface ReportAIResult {
  executive: { headline: string; bullets: string[] };
  discoveries: string[];
  opportunities: { title: string; description: string }[];
  forecastNarrative: string;
  scoreNarrative: string;
  source: "ai" | "local";
}
