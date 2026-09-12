import { Skeleton } from "@/shared/presentation/components/ui";

export default function NewProjectLoading() {
  return (
    <div className="mx-auto max-w-[1280px]">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="mt-3 h-4 w-[34rem] max-w-full" />
      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_.72fr]">
        <Skeleton className="h-[590px]" />
        <Skeleton className="h-[500px]" />
      </div>
    </div>
  );
}
