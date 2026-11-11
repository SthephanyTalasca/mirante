"use client";
import clsx from "clsx";
import { Film, LayoutDashboard, ListChecks, LogOut, Menu, Plus, Settings2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Logo } from "./brand";

const NAV = [
  { href: "/painel", label: "Painel", icon: LayoutDashboard },
  { href: "/reunioes", label: "Reuniões", icon: Film },
  { href: "/comportamentos", label: "Comportamentos", icon: ListChecks },
  { href: "/configuracoes", label: "Configurações", icon: Settings2 },
];

const ROLE: Record<string, string> = { admin: "Administração", analista: "Analista", revisor: "Revisão", leitor: "Leitura" };

export function Sidebar({ user, org }: { user: { name: string; role: string }; org: string }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }

  const content = (
    <div className="flex h-full flex-col gap-6 p-5">
      <div className="flex items-center justify-between"><Logo light /><button className="text-white/70 lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu"><X size={20} /></button></div>
      {["admin", "analista"].includes(user.role) && (
        <Link href="/reunioes/nova" onClick={() => setOpen(false)} className="btn justify-center bg-[#3fb6a8] text-ink hover:bg-[#5cc7ba]">
          <Plus size={16} /> Nova análise
        </Link>
      )}
      <nav className="grid gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/reunioes" ? path.startsWith("/reunioes") && path !== "/reunioes/nova" : path.startsWith(href);
          return (
            <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
              className={clsx("flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white")}>
              <Icon size={17} strokeWidth={1.8} /> {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto space-y-3 border-t border-white/10 pt-4">
        <div className="text-sm">
          <div className="truncate font-semibold text-white">{user.name}</div>
          <div className="truncate text-white/55">{org} · {ROLE[user.role] ?? user.role}</div>
        </div>
        <button onClick={logout} className="flex items-center gap-2 text-sm text-white/60 hover:text-white"><LogOut size={15} /> Sair</button>
      </div>
    </div>
  );

  return (
    <>
      <header className="flex items-center justify-between bg-ink px-5 py-3 lg:hidden">
        <Logo light />
        <button onClick={() => setOpen(true)} className="text-white" aria-label="Abrir menu"><Menu size={22} /></button>
      </header>
      {open && <div className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={clsx("fixed inset-y-0 left-0 z-50 w-[260px] bg-ink transition-transform lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full")}>
        {content}
      </aside>
    </>
  );
}
