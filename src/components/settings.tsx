"use client";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OrgSettings } from "@/lib/analysis/types";
import { api } from "@/lib/ui";

const ROLE_LABEL: Record<string, string> = { admin: "Administração", analista: "Analista", revisor: "Revisão", leitor: "Leitura" };
const ROLE_HINT: Record<string, string> = {
  admin: "tudo, inclusive catálogo, configurações e exclusões",
  analista: "envia vídeos, configura e processa reuniões, revisa",
  revisor: "revisa ocorrências e marca momentos",
  leitor: "só consulta",
};

export function SettingsForm({ orgName, settings, canEdit }: { orgName: string; settings: OrgSettings; canEdit: boolean }) {
  const [s, setS] = useState({ ...settings, org_name: orgName });
  const [msg, setMsg] = useState<{ kind: "erro" | "ok"; text: string } | null>(null);
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS({ ...s, [k]: v });

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { await api("/api/settings", { method: "PATCH", json: s }); setMsg({ kind: "ok", text: "Configurações salvas. Valem a partir da próxima análise." }); }
    catch (x) { setMsg({ kind: "erro", text: (x as Error).message }); }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <fieldset disabled={!canEdit} className="panel space-y-4 p-6">
        <legend className="sr-only">Análise</legend>
        <h2 className="font-semibold">Análise</h2>
        <label className="field"><span>Nome da organização</span><input className="input" value={s.org_name} onChange={(e) => set("org_name", e.target.value)} /></label>
        <label className="field">
          <span>Confiança mínima para registrar: <strong className="tabular text-ink">{Math.round(s.min_confidence * 100)}%</strong></span>
          <input type="range" min={0.3} max={0.95} step={0.05} value={s.min_confidence} onChange={(e) => set("min_confidence", Number(e.target.value))} className="accent-[#0f7b7b]" />
          <small className="text-mute">Cada comportamento pode ter um limiar próprio no catálogo.</small>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field"><span>Quadros por segundo analisados</span>
            <select className="input" value={s.sample_fps} onChange={(e) => set("sample_fps", Number(e.target.value))}>
              <option value={0.5}>0,5 (mais barato)</option><option value={1}>1 (recomendado)</option><option value={2}>2 (mais preciso, ~2× custo)</option>
            </select>
          </label>
          <label className="field"><span>Tamanho da janela (s)</span>
            <input className="input" type="number" min={4} max={16} value={s.window_seconds} onChange={(e) => set("window_seconds", Number(e.target.value))} />
          </label>
          <label className="field"><span>Provedor de IA</span>
            <select className="input" value={s.ai_provider} onChange={(e) => set("ai_provider", e.target.value as OrgSettings["ai_provider"])}>
              <option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI</option><option value="mock">Simulado (testes, sem custo)</option>
            </select>
          </label>
          <label className="field"><span>Modelo (opcional)</span>
            <input className="input font-mono" placeholder="padrão do servidor" value={s.ai_model ?? ""} onChange={(e) => set("ai_model", e.target.value || null)} />
          </label>
        </div>
      </fieldset>

      <fieldset disabled={!canEdit} className="panel space-y-4 p-6">
        <legend className="sr-only">Privacidade</legend>
        <h2 className="font-semibold">Privacidade e retenção</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field"><span>Apagar vídeos após (dias)</span><input className="input" type="number" min={1} max={365} value={s.retention_video_days} onChange={(e) => set("retention_video_days", Number(e.target.value))} /></label>
          <label className="field"><span>Apagar quadros de referência após (dias)</span><input className="input" type="number" min={1} max={365} value={s.retention_frames_days} onChange={(e) => set("retention_frames_days", Number(e.target.value))} /></label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 accent-[#0f7b7b]" checked={s.store_reference_frames} onChange={(e) => set("store_reference_frames", e.target.checked)} />
          <span>Guardar um quadro de referência por ocorrência <span className="text-slate">(só o recorte do participante, nunca o quadro inteiro)</span></span>
        </label>
        <label className="field"><span>Versão do aviso de consentimento</span><input className="input w-32" value={s.consent_policy_version} onChange={(e) => set("consent_policy_version", e.target.value)} /></label>
        <p className="text-xs leading-relaxed text-mute">Ocorrências, relatórios e auditoria permanecem após a exclusão do vídeo. Para apagar tudo de uma reunião, use "Excluir reunião".</p>
      </fieldset>

      {canEdit && <div className="flex items-center gap-3"><button className="btn btn-primary">Salvar configurações</button>
        {msg && <span className={clsx("text-sm", msg.kind === "erro" ? "text-crit" : "text-good")}>{msg.text}</span>}</div>}
    </form>
  );
}

export function TeamPanel({ me, team, invites, canEdit }: {
  me: string; team: { id: string; full_name: string | null; role: string }[]; invites: { email: string; role: string }[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("revisor");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <section className="panel p-6">
      <h2 className="mb-3 font-semibold">Equipe</h2>
      <ul className="divide-y divide-line-soft">
        {team.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="font-medium">{t.full_name ?? "Sem nome"}{t.id === me && <span className="ml-1 font-normal text-mute">(você)</span>}</span>
            {canEdit && t.id !== me ? (
              <select className="input h-8 w-auto text-xs" defaultValue={t.role} onChange={async (e) => { await api("/api/team", { method: "PATCH", json: { id: t.id, role: e.target.value } }); router.refresh(); }}>
                {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            ) : <span className="text-slate">{ROLE_LABEL[t.role]}</span>}
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.email} className="flex justify-between py-2.5 text-sm text-slate"><span>{i.email}</span><span>convite pendente · {ROLE_LABEL[i.role]}</span></li>
        ))}
      </ul>
      {canEdit && (
        <form className="mt-4 space-y-2 border-t border-line-soft pt-4" onSubmit={async (e) => {
          e.preventDefault(); setMsg(null);
          try { await api("/api/team", { method: "POST", json: { email, role } }); setEmail(""); setMsg("Convite enviado."); router.refresh(); }
          catch (x) { setMsg((x as Error).message); }
        }}>
          <div className="flex gap-2">
            <input className="input" type="email" required placeholder="email@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <button className="btn btn-primary">Convidar</button>
          </div>
          <p className="text-xs text-mute">{ROLE_LABEL[role]}: {ROLE_HINT[role]}.</p>
          {msg && <p className="text-sm text-slate">{msg}</p>}
        </form>
      )}
    </section>
  );
}
