import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, Sparkles, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/haptics";

type Mode = "signin" | "signup";

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const valid = email.includes("@") && password.length >= 6;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setErrorMsg(null);
    setInfo(null);
    haptic(15);

    const creds = { email: email.trim().toLowerCase(), password };

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword(creds);
        if (error) {
          // tenta cadastrar automaticamente se a conta não existe
          if (/invalid login credentials/i.test(error.message)) {
            const { data, error: signErr } = await supabase.auth.signUp({
              ...creds,
              options: { emailRedirectTo: window.location.origin },
            });
            if (signErr) {
              setErrorMsg(signErr.message);
            } else if (data.session) {
              // login automático (confirmação de e-mail desativada)
              return;
            } else {
              setMode("signup");
              setInfo("Conta criada. Verifique seu e-mail para confirmar e entrar.");
            }
          } else {
            setErrorMsg(error.message);
          }
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          ...creds,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) {
          setErrorMsg(error.message);
        } else if (!data.session) {
          setInfo("Conta criada. Verifique seu e-mail para confirmar e entrar.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-black text-white">
      <div className="flex flex-1 flex-col justify-center px-7 pb-24 pt-16">
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

        <div className="mb-5 flex rounded-2xl bg-[#1C1C1E] p-1 ring-1 ring-white/5">
          {(["signin", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setErrorMsg(null);
                setInfo(null);
              }}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                mode === m ? "bg-primary text-primary-foreground" : "text-gray-400"
              }`}
            >
              {m === "signin" ? "Entrar" : "Criar conta"}
            </button>
          ))}
        </div>

        <motion.form
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          onSubmit={submit}
          className="space-y-3"
        >
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

          <div className="flex items-center gap-3 rounded-2xl bg-[#1C1C1E] px-4 py-4 ring-1 ring-white/5 focus-within:ring-primary/60">
            <Lock size={18} className="text-gray-500" />
            <input
              type={showPwd ? "text" : "password"}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha (mín. 6 caracteres)"
              className="w-full bg-transparent text-base outline-none placeholder:text-gray-600"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="text-gray-500"
              aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
          {info && <p className="text-xs text-primary">{info}</p>}

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={loading || !valid}
            className="mt-2 w-full rounded-2xl bg-primary py-4 text-base font-bold tracking-tight text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-40"
          >
            {loading
              ? "Aguarde..."
              : mode === "signin"
                ? "Entrar"
                : "Criar conta"}
          </motion.button>

          <p className="pt-3 text-center text-[11px] leading-relaxed text-gray-500">
            Ao continuar você concorda com os Termos.
            <br />
            Sem links por e-mail. Acesso direto e seguro.
          </p>
        </motion.form>
      </div>
    </div>
  );
}
