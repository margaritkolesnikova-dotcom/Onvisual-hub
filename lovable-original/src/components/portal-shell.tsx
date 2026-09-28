import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { CalendarDays, CheckSquare, ChevronRight, Files, Menu, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const navigation = [
  { n: "00", label: "START HERE", to: "/" },
  { n: "01", label: "ONVISUAL", to: "/onvisual" },
  { n: "02", label: "SALES", to: "/sales" },
  { n: "03", label: "MULTIVERSE", to: "/multiverse" },
  { n: "04", label: "MULTIVERSE_NUMBERS", to: "/multiverse-numbers" },
  { n: "05", label: "TEAM", to: "/team" },
  { n: "06", label: "TASKS", to: "/tasks" },
  { n: "07", label: "CALENDAR", to: "/calendar" },
  { n: "08", label: "FILES", to: "/files" },
] as const;

const searchItems = [
  ...navigation.map((item) => ({ title: item.label, subtitle: `Раздел ${item.n}`, to: item.to })),
  { title: "Шоурил ONVISUAL", subtitle: "Видео", to: "/onvisual" },
  { title: "Продукты и услуги", subtitle: "ONVISUAL", to: "/onvisual" },
  { title: "История лидогенерации", subtitle: "ONVISUAL", to: "/onvisual" },
  { title: "База компаний", subtitle: "SALES", to: "/sales" },
  { title: "Зипики", subtitle: "MULTIVERSE", to: "/multiverse" },
  { title: "Сопуны", subtitle: "MULTIVERSE", to: "/multiverse" },
  { title: "Облачковые люди", subtitle: "MULTIVERSE", to: "/multiverse" },
];

export function PortalShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => query.trim() ? searchItems.filter((item) => `${item.title} ${item.subtitle}`.toLowerCase().includes(query.toLowerCase())).slice(0, 7) : [], [query]);

  return (
    <div className="min-h-screen bg-background text-foreground md:grid md:grid-cols-[272px_minmax(0,1fr)]">
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-border bg-sidebar transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ${mobileOpen ? "mobile-panel-open" : "mobile-panel-closed"}`}>
        <div className="flex h-20 items-center justify-between border-b border-border px-6">
          <Link to="/" className="font-display text-lg font-semibold tracking-normal">ONVISUAL<span className="text-muted-foreground">®</span></Link>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(false)} aria-label="Закрыть меню"><X /></Button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-6" aria-label="Основная навигация">
          {navigation.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return <Link key={item.n} to={item.to} onClick={() => setMobileOpen(false)} className={`group mb-1 grid grid-cols-[32px_1fr_auto] items-center gap-2 rounded-md px-3 py-3 text-xs transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"}`}>
              <span className="font-mono text-[10px]">{item.n}</span><span className="truncate font-medium">{item.label}</span><ChevronRight className={`h-3.5 w-3.5 transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
            </Link>;
          })}
        </nav>
        <div className="border-t border-border p-5 text-[10px] uppercase text-muted-foreground">Internal workspace · 2026</div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-7">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Открыть меню"><Menu /></Button>
          <div className="relative ml-auto w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по базе" aria-label="Поиск по базе" className="h-10 w-full rounded-md border border-border bg-secondary pl-10 pr-10 text-sm outline-none placeholder:text-muted-foreground focus:border-ring" />
            {query && <Button variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setQuery("")} aria-label="Очистить поиск"><X /></Button>}
            {query && <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-md border border-border bg-popover shadow-2xl">
              {results.length ? results.map((item) => <Link key={`${item.title}-${item.subtitle}`} to={item.to} onClick={() => setQuery("")} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-0 hover:bg-accent"><span className="text-sm">{item.title}</span><span className="text-[10px] uppercase text-muted-foreground">{item.subtitle}</span></Link>) : <p className="px-4 py-6 text-sm text-muted-foreground">Ничего не найдено</p>}
            </div>}
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-8 sm:px-7 lg:px-10 lg:py-12">{children}</main>
      </div>
      {mobileOpen && <button className="fixed inset-0 z-40 bg-overlay md:hidden" onClick={() => setMobileOpen(false)} aria-label="Закрыть меню" />}
    </div>
  );
}

export function PageHeader({ index, eyebrow, title, description }: { index: string; eyebrow: string; title: string; description?: string }) {
  return <header className="mb-10 border-b border-border pb-8"><div className="mb-5 flex items-center gap-3 text-[10px] uppercase text-muted-foreground"><span className="font-mono">{index}</span><span className="h-px w-8 bg-border"/><span>{eyebrow}</span></div><h1 className="max-w-5xl font-display text-4xl font-semibold leading-none tracking-normal sm:text-6xl lg:text-7xl">{title}</h1>{description && <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>}</header>;
}

export function Tabs({ items, active, onChange }: { items: string[]; active: string; onChange: (value: string) => void }) {
  return <div className="scrollbar-none mb-10 flex gap-1 overflow-x-auto border-b border-border" role="tablist">{items.map((item) => <Button key={item} variant="ghost" onClick={() => onChange(item)} className={`h-11 shrink-0 rounded-none border-b px-3 text-xs ${active === item ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"}`} role="tab" aria-selected={active === item}>{item}</Button>)}</div>;
}

export function SectionTitle({ index, title, note }: { index?: string; title: string; note?: string }) {
  return <div className="mb-5 flex items-end justify-between gap-4"><div><div className="mb-2 font-mono text-[10px] text-muted-foreground">{index}</div><h2 className="font-display text-2xl font-medium tracking-normal sm:text-3xl">{title}</h2></div>{note && <span className="text-xs text-muted-foreground">{note}</span>}</div>;
}

export function EmptyState({ title = "Материалы будут добавлены", detail }: { title?: string; detail?: string }) {
  return <div className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-border bg-card px-6 text-center"><div className="mb-4 h-2 w-2 rounded-full bg-muted-foreground"/><p className="text-sm">{title}</p>{detail && <p className="mt-2 text-xs text-muted-foreground">{detail}</p>}</div>;
}

export const workspaceIcons = { team: Users, tasks: CheckSquare, calendar: CalendarDays, files: Files };