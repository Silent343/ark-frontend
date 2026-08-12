import { Skeleton } from "@/shared/presentation/components/ui";

export default function DashboardLoading() {
  return <div className="mx-auto max-w-[1500px]"><Skeleton className="h-5 w-28"/><Skeleton className="mt-4 h-10 w-72"/><Skeleton className="mt-3 h-4 w-[32rem] max-w-full"/><div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[0,1,2].map((item)=><Skeleton key={item} className="h-[390px]"/>)}</div></div>;
}
