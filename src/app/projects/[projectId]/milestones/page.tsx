import dynamic from "next/dynamic";
export const metadata = { title: "Hitos" };
import { WorkspaceSkeleton } from "@/composition/presentation/workspace-ui";
const Screen = dynamic(
  () =>
    import("@/bounded-contexts/project-planning/presentation/milestones-screen").then(
      (module) => module.MilestonesScreen,
    ),
  { loading: () => <WorkspaceSkeleton /> },
);
/** Route-level code splitting keeps inactive management tools out of the initial bundle. */
export default function Page() {
  return <Screen />;
}
