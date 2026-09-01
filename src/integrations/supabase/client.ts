import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn("Supabase env vars ausentes. Verifique .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

export type DbAppointment = {
  id: string;
  user_id: string;
  service_id: string | null;
  service_name: string;
  price: number;
  barber_share: number;
  owner_share: number;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  note: string | null;
  payment_method: "pix" | "cash" | null;
  created_at?: string;
};

export type DbService = {
  id: string;
  user_id: string;
  name: string;
  price: number;
  duration_minutes: number | null;
  is_active: boolean;
};

export type DbProfile = {
  id: string;
  barbershop_name: string;
  daily_goal: number;
  barber_percentage: number;
  updated_at?: string;
};
