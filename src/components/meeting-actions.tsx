"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/ui";

export function RetryButton({ meetingId, label = "Tentar de novo" }: { meetingId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button className="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setErr(null);
        try { await api(`/api/meetings/${meetingId}/process`, { method: "POST" }); router.refresh(); }
        catch (e) { setErr((e as Error).message); setBusy(false); }
      }}>{label}</button>
      {err && <span className="text-sm text-crit">{err}</span>}
    </span>
  );
}

export function DeleteMeetingButton({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <button className="btn btn-danger" onClick={() => setConfirming(true)}>Excluir reunião</button>;
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      Apagar vídeo, frames e resultados?
      <button className="btn btn-danger" onClick={async () => { await api(`/api/meetings/${meetingId}`, { method: "DELETE" }); router.push("/reunioes"); router.refresh(); }}>Excluir</button>
      <button className="btn btn-ghost" onClick={() => setConfirming(false)}>Cancelar</button>
    </span>
  );
}
