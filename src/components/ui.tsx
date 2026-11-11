import clsx from "clsx";
import { STATUS_LABEL } from "@/lib/ui";

export function PageHeader({ title, subtitle, actions, back }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && <div className="mb-2 text-sm text-slate">{back}</div>}
        <h1 className="text-[1.75rem] font-bold leading-tight tracking-[-0.025em]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-[68ch] text-[0.95rem] text-slate">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

const STATUS_STYLE: Record<string, string> = {
  rascunho: "bg-line-soft text-slate",
  aguardando_configuracao: "bg-ambar-wash text-ambar",
  na_fila: "bg-lagoa-wash text-lagoa-ink",
  processando: "bg-lagoa-wash text-lagoa-ink",
  concluida: "bg-[#e7f3e8] text-good",
  erro: "bg-[#fbeaea] text-crit",
  expirada: "bg-line-soft text-mute",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLE[status])}>
      {status === "processando" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Número de destaque com legenda. `hint` explica como o número é calculado. */
export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-sm text-slate">{label}</div>
      <div className="tabular mt-0.5 text-[1.65rem] font-bold tracking-[-0.02em]">{value}</div>
      {hint && <div className="text-xs text-mute">{hint}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="panel flex flex-col items-start gap-3 p-8">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="max-w-[60ch] text-sm leading-relaxed text-slate">{children}</div>}
      {action}
    </div>
  );
}

/** Aviso fixo de uso: sinais visuais não são emoções nem base para decisões automáticas. */
export function UsageNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p className={clsx("rounded-md border border-line bg-white/60 text-slate", compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm leading-relaxed")}>
      Os registros descrevem <strong className="font-semibold text-ink">sinais visuais observáveis</strong>, identificados automaticamente e sujeitos a erro.
      Não indicam emoções, intenção, interesse ou personalidade e não devem ser usados, sozinhos, para decisões sobre pessoas.
    </p>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-2" title={`Confiança na identificação do sinal: ${pct}%`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-line-soft">
        <span className="block h-full rounded-full bg-ink-2" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular text-xs text-slate">{pct}%</span>
    </span>
  );
}
