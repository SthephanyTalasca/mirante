"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface VideoHandle { seek: (ms: number) => void }

/** Player com URL assinada de curta duração (renovada ao expirar). */
export const VideoPanel = forwardRef<VideoHandle, { meetingId: string; available: boolean; onTime: (ms: number) => void }>(
  function VideoPanel({ meetingId, available, onTime }, ref) {
    const video = useRef<HTMLVideoElement>(null);
    const [url, setUrl] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(available ? null : "O vídeo foi excluído pela política de retenção. Os resultados continuam disponíveis.");
    const pending = useRef<number | null>(null);
    const retried = useRef(0);

    async function load() {
      const res = await fetch(`/api/meetings/${meetingId}/video`);
      const j = await res.json();
      if (!res.ok) setErr(j.error ?? "Não foi possível carregar o vídeo.");
      else setUrl(j.url);
    }
    useEffect(() => { if (available) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [meetingId, available]);

    useImperativeHandle(ref, () => ({
      seek(ms) {
        const v = video.current;
        if (!v) return;
        const t = Math.max(0, ms / 1000 - 1); // 1 s antes, para ver a transição
        if (v.readyState >= 1) { v.currentTime = t; v.play().catch(() => {}); }
        else pending.current = t;
      },
    }));

    if (err) return <div className="flex aspect-video items-center justify-center rounded-[10px] bg-ink/90 p-6 text-center text-sm text-white/75">{err}</div>;
    return (
      <video ref={video} src={url ?? undefined} controls preload="metadata" className="aspect-video w-full rounded-[10px] bg-ink"
        onLoadedMetadata={() => { if (pending.current != null && video.current) { video.current.currentTime = pending.current; pending.current = null; } }}
        onTimeUpdate={(e) => onTime(e.currentTarget.currentTime * 1000)}
        onError={() => { if (retried.current++ < 2) { setUrl(null); load(); } else setErr("O navegador não conseguiu reproduzir este vídeo."); }} />
    );
  },
);
