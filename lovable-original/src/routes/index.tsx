import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, CalendarDays, ChevronRight, Film, Users } from "lucide-react";
import onvisualImage from "@/assets/onvisual-cinematic.jpg";
import salesImage from "@/assets/sales-cinematic.jpg";
import multiverseImage from "@/assets/multiverse-cinematic.jpg";
import numbersImage from "@/assets/numbers-cinematic.jpg";
import { PageHeader, SectionTitle } from "@/components/portal-shell";

export const Route = createFileRoute("/")({ head: () => ({ meta: [{ title: "ONVISUAL HUB — Рабочее пространство" }, { name: "description", content: "База знаний, проекты, продажи и команда ONVISUAL в одном месте." }, { property: "og:title", content: "ONVISUAL HUB" }, { property: "og:description", content: "База знаний, проекты, продажи и команда в одном месте." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: Index });
const cards = [
  { n: "01", title: "ONVISUAL", text: "Компания, продукты, кейсы и материалы", to: "/onvisual", image: onvisualImage },
  { n: "02", title: "SALES", text: "База, контакты и воронка продаж", to: "/sales", image: salesImage },
  { n: "03", title: "MULTIVERSE", text: "Герои, миры и концепции", to: "/multiverse", image: multiverseImage },
  { n: "04", title: "NUMBERS", text: "Стратегия, метрики и экономика", to: "/multiverse-numbers", image: numbersImage },
  { n: "05", title: "TEAM", text: "Команда, роли и процессы", to: "/team", image: onvisualImage },
] as const;
function Index() { return <>
  <PageHeader index="00" eyebrow="START HERE" title="ONVISUAL HUB" description="База знаний, проекты, продажи и команда в одном месте." />
  <section className="mb-16 grid grid-cols-1 gap-4 lg:grid-cols-2">
    {cards.map((card, index) => <Link key={card.n} to={card.to} className={`cinematic-card group block min-h-[310px] ${index === 0 ? "lg:col-span-2 lg:min-h-[430px]" : ""}`}>
      <img src={card.image} alt="" width={1408} height={912} loading={index === 0 ? "eager" : "lazy"} className="absolute inset-0 h-full w-full object-cover grayscale transition duration-700 group-hover:scale-[1.025] group-hover:grayscale-0"/>
      <div className="image-shade absolute inset-0"/><div className="absolute inset-0 flex flex-col justify-between p-6 sm:p-8"><div className="flex justify-between font-mono text-xs"><span>{card.n}</span><ArrowUpRight className="h-5 w-5"/></div><div><h2 className="font-display text-4xl font-medium sm:text-5xl">{card.title}</h2><p className="mt-2 text-sm text-muted-foreground">{card.text}</p></div></div>
    </Link>)}
  </section>
  <section className="mb-16"><SectionTitle index="QUICK ACCESS" title="Быстрые ссылки"/><div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">{[
    { icon: Film, title: "Шоурил", to: "/onvisual" }, { icon: Users, title: "Команда", to: "/team" }, { icon: CalendarDays, title: "Календарь", to: "/calendar" }
  ].map((item) => <Link key={item.title} to={item.to} className="flex items-center gap-4 bg-card p-5 hover:bg-accent"><item.icon className="h-5 w-5 text-muted-foreground"/><span className="text-sm">{item.title}</span><ChevronRight className="ml-auto h-4 w-4 text-muted-foreground"/></Link>)}</div></section>
  <div className="grid gap-10 lg:grid-cols-2"><section><SectionTitle index="UPDATES" title="Последние обновления"/><div className="border-t border-border py-8 text-sm text-muted-foreground">Обновления пока не добавлены.</div></section><section><SectionTitle index="ONBOARDING" title="Маршрут адаптации"/><div className="divide-y divide-border border-y border-border">{["Познакомиться с ONVISUAL", "Изучить продукты и услуги", "Посмотреть Multiverse", "Познакомиться с командой"].map((item, i) => <div key={item} className="flex items-center gap-4 py-4"><span className="font-mono text-[10px] text-muted-foreground">0{i+1}</span><BookOpen className="h-4 w-4 text-muted-foreground"/><span className="text-sm">{item}</span></div>)}</div></section></div>
</>; }