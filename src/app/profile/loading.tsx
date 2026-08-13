import { Skeleton } from "@/shared/presentation/components/ui";
export default function Loading(){return <div className="mx-auto max-w-[1460px]"><Skeleton className="h-10 w-52"/><Skeleton className="mt-3 h-4 w-[34rem] max-w-full"/><Skeleton className="mt-8 h-28"/><div className="mt-5 grid gap-5 xl:grid-cols-2"><Skeleton className="h-80"/><Skeleton className="h-80"/></div></div>;}
