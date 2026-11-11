"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Logo } from "@/components/brand";
import { supabaseBrowser } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/painel";
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [form, setForm] = useState({ email: "", password: "", full_name: "", org_name: "" });
  const [msg, setMsg] = useState<{ kind: "erro" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const sb = supabaseBrowser();
    if (mode === "entrar") {
      const { error } = await sb.auth.signInWithPassword({ email: form.email, password: form.password });
      if (error) setMsg({ kind: "erro", text: "E-mail ou senha incorretos." });
      else { router.replace(next); router.refresh(); }
    } else {
      const { error } = await sb.auth.signUp({
        email: form.email, password: form.password,
        options: { data: { full_name: form.full_name, org_name: form.org_name }, emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) setMsg({ kind: "erro", text: error.message });
      else setMsg({ kind: "ok", text: "Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre." });
    }
    setBusy(false);
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo light />
        <div className="max-w-md">
          <h1 className="text-[2.5rem] font-bold leading-[1.08] tracking-[-0.03em]">O que a sala mostrou enquanto você apresentava.</h1>
          <p className="mt-5 text-[1.05rem] leading-relaxed text-white/70">
            O Mirante percorre a gravação, deixa o host de fora e registra sinais visuais dos participantes
            ao longo do tempo: para você revisar, com o trecho do vídeo ao lado.
          </p>
        </div>
        <Lanes />
      </section>

      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div className="lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-bold tracking-[-0.02em]">{mode === "entrar" ? "Entrar" : "Criar conta da organização"}</h2>
          {mode === "criar" && (
            <>
              <label className="field"><span>Seu nome</span><input className="input" value={form.full_name} onChange={set("full_name")} required /></label>
              <label className="field"><span>Organização</span><input className="input" value={form.org_name} onChange={set("org_name")} required /></label>
            </>
          )}
          <label className="field"><span>E-mail</span><input className="input" type="email" autoComplete="email" value={form.email} onChange={set("email")} required /></label>
          <label className="field"><span>Senha</span><input className="input" type="password" minLength={8} autoComplete={mode === "entrar" ? "current-password" : "new-password"} value={form.password} onChange={set("password")} required /></label>
          {msg && <p role="status" className={`text-sm ${msg.kind === "erro" ? "text-crit" : "text-good"}`}>{msg.text}</p>}
          <button className="btn btn-primary w-full justify-center" disabled={busy}>{mode === "entrar" ? "Entrar" : "Criar conta"}</button>
          <button type="button" className="text-sm text-slate underline-offset-4 hover:underline" onClick={() => { setMode(mode === "entrar" ? "criar" : "entrar"); setMsg(null); }}>
            {mode === "entrar" ? "Primeiro acesso? Criar conta da organização" : "Já tenho conta"}
          </button>
          <p className="border-t border-line pt-4 text-xs leading-relaxed text-mute">
            Convidado por alguém da sua equipe? Use o link do convite enviado ao seu e-mail.
          </p>
        </form>
      </section>
    </main>
  );
}

/** Ilustração: três faixas de participantes com sinais ao longo do tempo. */
function Lanes() {
  const lanes = [
    [[4, 22], [30, 12], [58, 26]],
    [[10, 8], [24, 30], [70, 14]],
    [[2, 40], [50, 9], [64, 30]],
  ];
  return (
    <svg viewBox="0 0 100 34" className="w-full max-w-lg" aria-hidden>
      {lanes.map((segs, i) => (
        <g key={i} transform={`translate(0 ${i * 11})`}>
          <line x1="0" x2="100" y1="4" y2="4" stroke="white" strokeOpacity=".12" strokeWidth=".5" />
          {segs.map(([x, w], j) => (
            <rect key={j} x={x} y="2" width={w} height="4" rx="1" fill={j % 2 ? "#eb6834" : "#3987e5"} fillOpacity=".85" />
          ))}
        </g>
      ))}
      <line x1="47" x2="47" y1="0" y2="30" stroke="#e8b44b" strokeWidth=".5" strokeDasharray="1 1" />
    </svg>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
