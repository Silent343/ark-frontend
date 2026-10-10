import dynamic from "next/dynamic";
export const metadata = { title: "Presupuesto" };
import { WorkspaceSkeleton } from "@/composition/presentation/workspace-ui";
const Screen = dynamic(
  () =>
    import("@/bounded-contexts/cost-management/presentation/budget-screen").then(
      (module) => module.BudgetScreen,
    ),
  { loading: () => <WorkspaceSkeleton /> },
);
/** Route-level code splitting keeps inactive management tools out of the initial bundle. */
export default function Page() {
  return <Screen />;
}
