"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, CircleHelp, ExternalLink, Mail, MessageSquare, MessagesSquare, Rocket, Search, Send, Sparkles } from "lucide-react";
import type { SupportCategory } from "@/bounded-contexts/workspace-administration/domain/entities/workspace-administration";
import { useSupportCenter } from "@/bounded-contexts/workspace-administration/presentation/hooks/use-workspace-administration";
import { workspaceAdministration } from "@/bounded-contexts/workspace-administration/public";
import { ErrorState, PageHeader, Panel, Skeleton } from "@/shared/presentation/components/ui";

const categoryIcons = { Rocket, Book: BookOpen, Question: CircleHelp, Sparkles } as const;
const channelIcons = { Mail, Message: MessageSquare, Community: MessagesSquare } as const;

/** Searchable local help center and frontend-only ticket composer. */
export function SupportScreen() {
  const { data, loading, error, reload } = useSupportCenter();
  const [query,setQuery] = useState("");
  const [category,setCategory] = useState("Bug / Error técnico");
  const [message,setMessage] = useState("");
  const [ticketState,setTicketState] = useState<{success?:string;error?:string}>({});
  const filteredArticles = useMemo(()=>data?.articles.filter((article)=>`${article.category} ${article.title}`.toLowerCase().includes(query.toLowerCase())) ?? [],[data,query]);

  if (loading) return <SupportSkeleton/>;
  if (error || !data) return <ErrorState message={error ?? "No se pudo cargar el centro de ayuda."} onRetry={reload}/>;

  const submitTicket = async (event: React.FormEvent) => {
    event.preventDefault(); setTicketState({});
    try { const ticket = await workspaceAdministration.submitTicket.execute({category,message}); setMessage(""); setTicketState({success:`Solicitud ${ticket.id.replace("ticket-", "#")} guardada localmente.`}); }
    catch (submitError) { setTicketState({error:submitError instanceof Error ? submitError.message : "No se pudo preparar la solicitud."}); }
  };

  return (
    <div className="mx-auto max-w-[1460px]">
      <PageHeader eyebrow="Guías y asistencia" title="Centro de ayuda" description="Encuentra tutoriales, respuestas frecuentes y canales de soporte para tu espacio arquitectónico." actions={<span className="inline-flex items-center gap-2 rounded-full border border-[#dce2db] bg-[#fbfbf7] px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-wider text-[#2f8f62]"><span className="size-2 rounded-full bg-[#39a76f]"/> Online</span>}/>

      <label className="relative mt-6 block"><Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#718079]"/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Buscar en la ayuda..." className="h-13 w-full rounded-2xl border border-[#d9ddd4] bg-white pl-12 pr-4 text-sm outline-none transition focus:border-[#758177] focus:ring-4 focus:ring-[#596151]/10"/></label>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{data.categories.map((item)=><CategoryCard key={item.id} category={item}/>)}</div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <Panel className="p-5 sm:p-6"><h2 className="text-base font-semibold">Artículos populares</h2><div className="mt-4 divide-y divide-[#e1e4dd]">{filteredArticles.length ? filteredArticles.map((article)=><button key={article.id} className="group flex w-full items-center gap-3 py-3 text-left"><span className="shrink-0 rounded-md bg-[#e5edff] px-2 py-1 text-[9px] font-semibold text-[#2d62d3]">{article.category}</span><span className="min-w-0 flex-1 truncate text-xs text-[#33413b]">{article.title}</span><ArrowRight size={14} className="shrink-0 text-[#819087] transition group-hover:translate-x-1"/></button>) : <div className="py-12 text-center text-xs text-[#87918b]">No encontramos artículos con “{query}”.</div>}</div></Panel>

        <Panel className="p-5 sm:p-6"><h2 className="text-base font-semibold">Contactar soporte</h2><div className="mt-5 grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(240px,.85fr)]"><form onSubmit={submitTicket}><h3 className="text-xs font-semibold">Enviar una solicitud</h3><p className="mt-1 text-[10px] leading-4 text-[#839088]">Cuéntanos sobre un inconveniente técnico o una duda comercial.</p><label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-semibold">Categoría</span><select value={category} onChange={(event)=>setCategory(event.target.value)} className="h-11 w-full rounded-xl border border-[#dce0d8] bg-white px-3 text-[11px] outline-none"><option>Bug / Error técnico</option><option>Consulta de facturación</option><option>Uso del editor 2D</option><option>Visualización 3D</option><option>Simulación sísmica</option></select></label><label className="mt-4 block"><span className="mb-1.5 block text-[10px] font-semibold">Mensaje</span><textarea value={message} onChange={(event)=>setMessage(event.target.value)} rows={5} placeholder="Describe brevemente el problema técnico o la consulta..." className="w-full resize-none rounded-xl border border-[#dce0d8] bg-white p-3 text-[11px] leading-5 outline-none focus:border-[#596151]"/></label>{ticketState.error && <p className="mt-2 text-[10px] font-semibold text-[#c3483c]">{ticketState.error}</p>}{ticketState.success && <p className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-[#2f8f62]"><CheckCircle2 size={13}/>{ticketState.success}</p>}<button type="submit" className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#3268e8] px-4 text-xs font-semibold text-white"><Send size={14}/> Preparar solicitud</button></form><div className="border-t border-[#e1e4dd] pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0"><h3 className="text-xs font-semibold">Otros canales</h3><p className="mt-1 text-[10px] leading-4 text-[#839088]">Canales de ejemplo para la futura integración de soporte.</p><div className="mt-5 space-y-4">{data.channels.map((channel)=>{const Icon=channelIcons[channel.icon];return <div key={channel.id} className="flex items-start gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#edf0ea] text-[#50605a]"><Icon size={16}/></div><div><p className="text-[11px] font-semibold">{channel.title}</p><p className="mt-1 text-[10px] text-[#7f8b85]">{channel.detail}</p></div><ExternalLink size={12} className="ml-auto text-[#9aa39e]"/></div>;})}</div></div></div></Panel>
      </div>
      <p className="mt-8 text-center font-mono text-[9px] tracking-wider text-[#8c9691]">Versión {data.version} · Última actualización: {data.lastUpdated}</p>
    </div>
  );
}

function CategoryCard({category}:{category:SupportCategory}){const Icon=categoryIcons[category.icon];return <Panel className="group p-5 transition hover:-translate-y-0.5 hover:border-[#b9c1b8] hover:shadow-[0_12px_30px_rgba(17,24,21,.07)]"><div className="grid size-10 place-items-center rounded-xl bg-[#dce8ff] text-[#2f67df]"><Icon size={19}/></div><h2 className="mt-4 text-sm font-semibold">{category.title}</h2><p className="mt-2 text-[11px] leading-5 text-[#69766f]">{category.description}</p></Panel>;}
function SupportSkeleton(){return <div className="mx-auto max-w-[1460px]"><Skeleton className="h-10 w-64"/><Skeleton className="mt-3 h-4 w-[38rem] max-w-full"/><Skeleton className="mt-8 h-13"/><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({length:4},(_,index)=><Skeleton key={index} className="h-44"/>)}</div><div className="mt-6 grid gap-5 xl:grid-cols-2"><Skeleton className="h-96"/><Skeleton className="h-96"/></div></div>;}
