import dynamic from "next/dynamic";
export const metadata = { title: "Resumen del proyecto" };
import { WorkspaceSkeleton } from "@/composition/presentation/workspace-ui";
const Screen = dynamic(
  () =>
    import("@/composition/presentation/overview-screen").then(
      (module) => module.OverviewScreen,
    ),
  { loading: () => <WorkspaceSkeleton /> },
);
/** Route-level code splitting keeps inactive management tools out of the initial bundle. */
export default function Page() {
  return <Screen />;
}
