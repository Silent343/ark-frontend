import { Skeleton } from "@/shared/presentation/components/ui";
export default function Loading(){return <div className="mx-auto max-w-[1460px]"><Skeleton className="h-10 w-64"/><Skeleton className="mt-3 h-4 w-[36rem] max-w-full"/><div className="mt-8 space-y-5"><Skeleton className="h-48"/><Skeleton className="h-44"/><Skeleton className="h-64"/></div></div>;}
