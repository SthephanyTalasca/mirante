"use client";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { Category } from "@/lib/analysis/types";
import { api, GROUP_COLOR, GROUP_LABEL } from "@/lib/ui";

type Draft = Partial<Category> & { code?: string };
const EMPTY: Draft = { name: "", code: "", group_key: "acao", description: "", criteria: "", min_confidence: null, min_frames: 2, min_duration_ms: 2000, merge_gap_ms: 3000, active: true };

export function BehaviorCatalog({ initial, canEdit }: { initial: Category[]; canEdit: boolean }) {
  const [cats, setCats] = useState(initial);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ kind: "erro" | "ok"; text: string } | null>(null);
  const groups = ["expressao", "acao", "engajamento"] as const;

  async function save() {
    if (!edit) return;
    setMsg(null);
    try {
      const body = { ...edit };
      const saved = edit.id
        ? await api<Category>(`/api/behaviors/${edit.id}`, { method: "PATCH", json: body })
        : await api<Category>("/api/behaviors", { method: "POST", json: body });
      setCats((cs) => (edit.id ? cs.map((c) => (c.id === saved.id ? saved : c)) : [...cs, saved]));
      setEdit(null); setMsg({ kind: "ok", text: "Comportamento salvo. Vale a partir da próxima análise." });
    } catch (e) { setMsg({ kind: "erro", text: (e as Error).message }); }
  }

  async function remove(c: Category) {
    setMsg(null);
    try {
      const r = await api<{ deactivated?: boolean; message?: string }>(`/api/behaviors/${c.id}`, { method: "DELETE" });
      if (r.deactivated) { setCats((cs) => cs.map((x) => (x.id === c.id ? { ...x, active: false } : x))); setMsg({ kind: "ok", text: r.message! }); }
      else setCats((cs) => cs.filter((x) => x.id !== c.id));
      setEdit(null);
    } catch (e) { setMsg({ kind: "erro", text: (e as Error).message }); }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <div className="space-y-6">
        {msg && <p role="status" className={clsx("text-sm", msg.kind === "erro" ? "text-crit" : "text-good")}>{msg.text}</p>}
        {groups.map((g) => (
          <section key={g} className="panel overflow-hidden">
            <header className="flex items-center justify-between px-5 py-3.5">
              <h2 className="flex items-center gap-2 font-semibold"><span className="size-2.5 rounded-sm" style={{ background: GROUP_COLOR[g] }} />{GROUP_LABEL[g]}</h2>
              {g === "engajamento"
                ? <span className="text-xs text-slate">Calculados a partir das ocorrências</span>
                : canEdit && <button className="btn btn-ghost h-8 text-xs" onClick={() => setEdit({ ...EMPTY, group_key: g })}><Plus size={14} />Novo</button>}
            </header>
            <ul className="divide-y divide-line-soft border-t border-line-soft">
              {cats.filter((c) => c.group_key === g).map((c) => (
                <li key={c.id}>
                  <button disabled={!canEdit} onClick={() => setEdit({ ...c })}
                    className={clsx("grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 px-5 py-3 text-left enabled:hover:bg-paper/60", edit?.id === c.id && "bg-lagoa-wash/50")}>
                    <span className="min-w-0">
                      <span className={clsx("font-medium", !c.active && "text-mute line-through")}>{c.name}</span>
                      <span className="mt-0.5 block truncate text-sm text-slate">{c.description}</span>
                    </span>
                    <span className="self-center text-right text-xs text-mute">
                      {c.detection === "visual" ? <>mín. {c.min_frames} quadro(s){c.min_duration_ms ? ` · ${c.min_duration_ms / 1000}s` : ""}</> : "indicador"}
                      {!c.active && <span className="block text-ambar">inativo</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <aside className="xl:sticky xl:top-8 xl:h-fit">
        {edit ? (
          <form className="panel space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <h2 className="font-semibold">{edit.id ? "Editar comportamento" : "Novo comportamento"}</h2>
            <label className="field"><span>Nome (o sinal visível)</span>
              <input className="input" required value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Ex.: Braços cruzados" />
            </label>
            {!edit.id && (
              <label className="field"><span>Código</span>
                <input className="input font-mono" required value={edit.code ?? ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} placeholder="bracos_cruzados" />
              </label>
            )}
            {edit.detection !== "derivado" && (
              <label className="field"><span>Grupo</span>
                <select className="input" value={edit.group_key} onChange={(e) => setEdit({ ...edit, group_key: e.target.value as Category["group_key"] })}>
                  <option value="expressao">{GROUP_LABEL.expressao}</option>
                  <option value="acao">{GROUP_LABEL.acao}</option>
                </select>
              </label>
            )}
            <label className="field"><span>Descrição</span>
              <textarea className="input" rows={2} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </label>
            {edit.detection !== "derivado" && (<>
              <label className="field"><span>Critérios de identificação (enviados à IA)</span>
                <textarea className="input" rows={4} value={edit.criteria ?? ""} onChange={(e) => setEdit({ ...edit, criteria: e.target.value })}
                  placeholder="Descreva o que precisa estar visível: posição dos braços, mãos, olhar…" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="field"><span>Quadros mínimos</span><input className="input" type="number" min={1} value={edit.min_frames ?? 1} onChange={(e) => setEdit({ ...edit, min_frames: Number(e.target.value) })} /></label>
                <label className="field"><span>Duração mínima (s)</span><input className="input" type="number" min={0} step={0.5} value={(edit.min_duration_ms ?? 0) / 1000} onChange={(e) => setEdit({ ...edit, min_duration_ms: Number(e.target.value) * 1000 })} /></label>
                <label className="field"><span>Juntar se o intervalo for até (s)</span><input className="input" type="number" min={0} step={0.5} value={(edit.merge_gap_ms ?? 0) / 1000} onChange={(e) => setEdit({ ...edit, merge_gap_ms: Number(e.target.value) * 1000 })} /></label>
                <label className="field"><span>Confiança mínima</span>
                  <input className="input" type="number" min={0} max={1} step={0.05} placeholder="padrão da organização" value={edit.min_confidence ?? ""} onChange={(e) => setEdit({ ...edit, min_confidence: e.target.value === "" ? null : Number(e.target.value) })} />
                </label>
              </div>
            </>)}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#0f7b7b]" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Ativo</label>
            <p className="text-xs leading-relaxed text-mute">Nomes e critérios devem descrever o que se vê. Termos de emoção, intenção ou personalidade são recusados.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary">Salvar</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>Cancelar</button>
              {edit.id && edit.detection !== "derivado" && <button type="button" className="btn btn-danger ml-auto" onClick={() => remove(edit as Category)}>Excluir</button>}
            </div>
          </form>
        ) : (
          <div className="panel p-6 text-sm leading-relaxed text-slate">
            <h2 className="mb-2 text-base font-semibold text-ink">Como o catálogo é usado</h2>
            Cada comportamento ativo do tipo visual vira uma instrução para a IA com seus critérios. Depois, a consolidação aplica
            os quadros mínimos, a duração mínima e o intervalo de junção para evitar registros duplicados ou passageiros.
            {canEdit ? " Escolha um item para editar." : " Apenas administradores podem editar."}
          </div>
        )}
      </aside>
    </div>
  );
}
