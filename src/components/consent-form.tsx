"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, CONSENT_METHOD_LABEL } from "@/lib/ui";

export function ConsentForm({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [method, setMethod] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try { await api(`/api/meetings/${meetingId}/consent`, { method: "POST", json: { method, confirm } }); router.refresh(); }
    catch (x) { setErr((x as Error).message); }
  }

  return (
    <form onSubmit={submit} className="panel mb-6 flex flex-wrap items-end gap-3 p-5">
      <div className="min-w-[220px] flex-1">
        <h2 className="font-semibold">Registre o consentimento</h2>
        <p className="text-sm text-slate">Sem esse registro a reunião não pode ser processada.</p>
      </div>
      <select className="input w-auto" required value={method} onChange={(e) => setMethod(e.target.value)}>
        <option value="" disabled>Como foram informados</option>
        {Object.entries(CONSENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" required checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="accent-[#0f7b7b]" />Participantes informados</label>
      <button className="btn btn-primary">Registrar</button>
      {err && <p className="w-full text-sm text-crit">{err}</p>}
    </form>
  );
}
