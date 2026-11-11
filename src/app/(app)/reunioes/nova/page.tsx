"use client";
import { UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/ui";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { api, CONSENT_METHOD_LABEL, MEETING_TYPE_LABEL } from "@/lib/ui";

function uploadWithProgress(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "video/mp4");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Envio falhou (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Conexão interrompida durante o envio."));
    xhr.send(file);
  });
}

export default function NovaReuniao() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ title: "", meeting_type: "apresentacao_comercial", recorded_at: "", method: "", notes: "", confirm: false });
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Escolha o arquivo de vídeo.");
    setError(null); setProgress(0);
    try {
      const { meeting, upload } = await api<{ meeting: { id: string }; upload: { path: string; token: string } }>("/api/meetings", {
        method: "POST", json: { title: form.title, meeting_type: form.meeting_type, recorded_at: form.recorded_at || null, file_name: file.name },
      });
      await api(`/api/meetings/${meeting.id}/consent`, { method: "POST", json: { method: form.method, notes: form.notes, confirm: form.confirm } });
      const url = `${SUPABASE_URL}/storage/v1/object/upload/sign/recordings/${upload.path}?token=${upload.token}`;
      await uploadWithProgress(url, file, setProgress);
      await api(`/api/meetings/${meeting.id}/uploaded`, { method: "POST" });
      router.push(`/reunioes/${meeting.id}/configurar`);
    } catch (err) {
      setError((err as Error).message); setProgress(null);
    }
  }

  const busy = progress !== null;
  return (
    <>
      <PageHeader title="Nova análise" subtitle="Envie a gravação. Na próxima etapa você marca quem é o host e quem será analisado." />
      <form onSubmit={submit} className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="panel space-y-4 p-6">
            <h2 className="font-semibold">Gravação</h2>
            <button type="button" onClick={() => input.current?.click()} disabled={busy}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
              className="flex w-full flex-col items-center gap-2 rounded-[10px] border-2 border-dashed border-line bg-paper/50 px-6 py-10 text-center transition-colors hover:border-lagoa">
              <UploadCloud className="text-lagoa" size={28} />
              {file ? (
                <><span className="font-semibold">{file.name}</span><span className="text-sm text-slate">{(file.size / 1024 / 1024).toFixed(0)} MB · clique para trocar</span></>
              ) : (
                <><span className="font-semibold">Arraste o vídeo ou clique para escolher</span><span className="text-sm text-slate">MP4, MOV, WEBM ou MKV, até 5 GB. Prefira gravações em modo galeria.</span></>
              )}
            </button>
            <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mkv,.m4v" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {busy && (
              <div aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full bg-line-soft"><div className="h-full bg-lagoa transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} /></div>
                <p className="mt-1 text-sm text-slate">Enviando… {Math.round((progress ?? 0) * 100)}%</p>
              </div>
            )}
          </section>

          <section className="panel grid gap-4 p-6 sm:grid-cols-2">
            <h2 className="font-semibold sm:col-span-2">Sobre a reunião</h2>
            <label className="field sm:col-span-2"><span>Título</span>
              <input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Demonstração para a equipe financeira da Acme" />
            </label>
            <label className="field"><span>Tipo</span>
              <select className="input" value={form.meeting_type} onChange={(e) => setForm({ ...form, meeting_type: e.target.value })}>
                {Object.entries(MEETING_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field"><span>Data da gravação</span>
              <input className="input" type="date" value={form.recorded_at} onChange={(e) => setForm({ ...form, recorded_at: e.target.value })} />
            </label>
          </section>
        </div>

        <aside className="panel h-fit space-y-4 p-6">
          <h2 className="font-semibold">Consentimento e transparência</h2>
          <p className="text-sm leading-relaxed text-slate">
            Imagens de pessoas são dados pessoais. Antes de analisar, registre como os participantes foram informados
            de que a gravação passaria por análise automática de sinais visuais.
          </p>
          <label className="field"><span>Como foram informados</span>
            <select className="input" required value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="" disabled>Escolha</option>
              {Object.entries(CONSENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field"><span>Observações (opcional)</span>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ex.: termo enviado por e-mail em 10/11" />
          </label>
          <label className="flex items-start gap-2.5 text-sm leading-snug">
            <input type="checkbox" className="mt-0.5 size-4 accent-[#0f7b7b]" required checked={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.checked })} />
            Confirmo que os participantes foram informados e que a análise não será usada, sozinha, para decisões sobre pessoas.
          </label>
          {error && <p role="alert" className="text-sm text-crit">{error}</p>}
          <button className="btn btn-primary w-full justify-center" disabled={busy}>{busy ? "Enviando…" : "Enviar e continuar"}</button>
        </aside>
      </form>
    </>
  );
}
