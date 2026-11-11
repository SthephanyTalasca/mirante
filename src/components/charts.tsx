"use client";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtTime } from "@/lib/analysis/format";
import { GROUP_COLOR, GROUP_LABEL } from "@/lib/ui";

const AXIS = { fontSize: 12, fill: "#5a6b85" };
const GRID = "#e4e9ef";

function Tip({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-line bg-white px-3 py-2 text-xs shadow-[0_6px_24px_-12px_rgba(20,33,61,.35)]">{children}</div>;
}

export function GroupLegend({ groups }: { groups: string[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate">
      {groups.map((g) => (
        <li key={g} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: GROUP_COLOR[g] }} />{GROUP_LABEL[g]}</li>
      ))}
    </ul>
  );
}

/** Distribuição por comportamento: barras horizontais, cor = grupo, valor rotulado. */
export function CategoryBars({ data, onSelect }: { data: { name: string; count: number; group: string; code?: string }[]; onSelect?: (code: string) => void }) {
  const h = Math.max(120, data.length * 30 + 20);
  const groups = [...new Set(data.map((d) => d.group))];
  return (
    <div className="space-y-3">
      {groups.length > 1 && <GroupLegend groups={groups} />}
      <div style={{ height: h }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={210} tick={{ ...AXIS, fill: "#14213d" }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "#eef1f4" }} content={({ active, payload }) => active && payload?.[0] ? (
              <Tip><div className="font-semibold">{payload[0].payload.name}</div><div className="text-slate">{payload[0].value} ocorrência(s)</div></Tip>
            ) : null} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}
              label={{ position: "right", fontSize: 12, fill: "#14213d" }}
              onClick={(d: any) => d?.code && onSelect?.(d.code)} cursor={onSelect ? "pointer" : undefined}>
              {data.map((d, i) => <Cell key={i} fill={GROUP_COLOR[d.group] ?? "#2a78d6"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Concentração de ocorrências por minuto, com os marcos da apresentação. */
export function DensityChart({ data, markers, onSelect }: {
  data: { minute: number; count: number; analyzed: boolean }[];
  markers: { t_ms: number; label: string }[];
  onSelect?: (ms: number) => void;
}) {
  const rows = data.map((d) => ({ ...d, label: fmtTime(d.minute * 60_000).slice(0, 5) }));
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: -18 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#eef1f4" }} content={({ active, payload }) => active && payload?.[0] ? (
            <Tip>
              <div className="font-semibold">Minuto {payload[0].payload.label}</div>
              <div className="text-slate">{payload[0].payload.analyzed ? `${payload[0].value} ocorrência(s)` : "Sem imagem analisável"}</div>
            </Tip>
          ) : null} />
          {markers.map((m, i) => (
            <ReferenceLine key={i} x={fmtTime(Math.floor(m.t_ms / 60_000) * 60_000).slice(0, 5)} stroke="#b77900" strokeDasharray="3 3"
              label={{ value: m.label, position: "insideTopLeft", fontSize: 11, fill: "#b77900" }} />
          ))}
          <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#0f7b7b" onClick={(d: any) => onSelect?.(d.minute * 60_000)} cursor={onSelect ? "pointer" : undefined}>
            {rows.map((d, i) => <Cell key={i} fill={d.analyzed ? "#0f7b7b" : "#d3dae3"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Comparação entre reuniões: ocorrências por participante analisado (uma série, um eixo). */
export function MeetingsTrend({ data }: { data: { label: string; title: string; value: number }[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#eef1f4" }} content={({ active, payload }) => active && payload?.[0] ? (
            <Tip><div className="font-semibold">{payload[0].payload.title}</div><div className="text-slate">{Number(payload[0].value).toFixed(1).replace(".", ",")} ocorrências por participante</div></Tip>
          ) : null} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="#2a78d6" maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
