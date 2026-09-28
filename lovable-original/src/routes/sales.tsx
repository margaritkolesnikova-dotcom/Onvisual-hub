import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { EmptyState, PageHeader, SectionTitle, Tabs } from "@/components/portal-shell";
export const Route = createFileRoute("/sales")({ head: () => ({ meta: [{ title: "SALES — ONVISUAL HUB" }, { name: "description", content: "Продажи, база компаний и воронка ONVISUAL." }, { property: "og:title", content: "SALES — ONVISUAL HUB" }, { property: "og:description", content: "Рабочая область продаж ONVISUAL." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: Sales });
const tabs = ["Обзор", "База компаний", "Контакты", "Кому писали", "Статусы", "Воронка", "Мероприятия", "Лидген", "Скрипты"];
function Sales() {
  const [active, setActive] = useState("Обзор");
  const stages = ["Новый лид", "Контакт найден", "Написали", "Ответ", "Встреча", "КП", "Сделка"];
  return <>
    <PageHeader index="02" eyebrow="SALES" title="Продажи" description="Компании, контакты, коммуникации и движение по воронке."/>
    <Tabs items={tabs} active={active} onChange={setActive}/>
    {active === "Обзор" ? <>
      <div className="mb-14 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{["Компании", "Контакты", "Встречи", "Сделки"].map(x => <div className="rounded-md border border-border bg-card p-5" key={x}><p className="text-xs text-muted-foreground">{x}</p><p className="mt-8 font-display text-4xl">—</p><p className="mt-2 text-[10px] uppercase text-muted-foreground">Данные не добавлены</p></div>)}</div>
      <SectionTitle title="Воронка" index="PIPELINE"/>
      <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4 xl:grid-cols-7">{stages.map((x,i)=><div key={x} className="min-h-28 bg-card p-4"><span className="font-mono text-[10px] text-muted-foreground">0{i+1}</span><p className="mt-5 text-xs">{x}</p><p className="mt-2 text-xl">—</p></div>)}</div>
    </> : active === "База компаний" ? <>
      <SectionTitle title="База компаний"/>
      <div className="overflow-x-auto rounded-md border border-border"><table className="w-full min-w-[800px] text-left text-xs"><thead className="bg-secondary text-muted-foreground"><tr>{["Компания","Индустрия","Контакт","Статус","Следующее действие","Ответственный"].map(x=><th className="p-4 font-medium" key={x}>{x}</th>)}</tr></thead><tbody><tr>{Array.from({length:6}).map((_,i)=><td className="border-t border-border p-4 text-muted-foreground" key={i}>—</td>)}</tr></tbody></table></div>
    </> : active === "Воронка" ? <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">{stages.map(x=><div key={x} className="min-h-64 rounded-md border border-border bg-card p-4"><p className="text-xs">{x}</p><p className="mt-8 text-center text-sm text-muted-foreground">—</p></div>)}</div> : <EmptyState/>}
  </>;
}