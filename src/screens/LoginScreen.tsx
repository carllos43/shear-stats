import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/haptics";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) return;
    setStatus("sending");
    setErrorMsg(null);
    haptic(15);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-black text-white">
      <div className="flex flex-1 flex-col justify-center px-7 pb-32 pt-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10 flex flex-col items-center text-center"
        >
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-amber-300 shadow-lg shadow-primary/30">
            <Sparkles size={28} className="text-black" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">BarberMetrics</h1>
          <p className="mt-2 text-sm text-gray-400">Seu sócio virtual de bolso</p>
        </motion.div>

        {status !== "sent" ? (
          <motion.form
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            onSubmit={submit}
            className="space-y-3"
          >
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
              E-mail
            </label>
            <div className="flex items-center gap-3 rounded-2xl bg-[#1C1C1E] px-4 py-4 ring-1 ring-white/5 focus-within:ring-primary/60">
              <Mail size={18} className="text-gray-500" />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                className="w-full bg-transparent text-base outline-none placeholder:text-gray-600"
              />
            </div>

            {errorMsg && (
              <p className="text-xs text-destructive">{errorMsg}</p>
            )}

            <motion.button
              whileTap={{ scale: 0.97 }}
              type="submit"
              disabled={status === "sending" || !email.includes("@")}
              className="mt-2 w-full rounded-2xl bg-primary py-4 text-base font-bold tracking-tight text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-40"
            >
              {status === "sending" ? "Enviando..." : "Receber link mágico"}
            </motion.button>

            <p className="pt-3 text-center text-[11px] leading-relaxed text-gray-500">
              Enviamos um link seguro para seu e-mail.
              <br />
              Sem senha, sem complicação.
            </p>
          </motion.form>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl bg-[#1C1C1E] p-6 text-center ring-1 ring-white/5"
          >
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
              <Mail size={24} className="text-primary" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">Verifique seu e-mail</h2>
            <p className="mt-2 text-sm text-gray-400">
              Enviamos um link mágico para <span className="text-white">{email}</span>.
              Toque nele para entrar.
            </p>
            <button
              onClick={() => {
                setStatus("idle");
                setEmail("");
              }}
              className="mt-5 text-sm font-semibold text-primary"
            >
              Usar outro e-mail
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
