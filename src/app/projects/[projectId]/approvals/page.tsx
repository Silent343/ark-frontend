import dynamic from "next/dynamic";
export const metadata = { title: "Revisión del cliente" };
import { WorkspaceSkeleton } from "@/composition/presentation/workspace-ui";
const Screen = dynamic(
  () =>
    import("@/bounded-contexts/client-approvals/presentation/approvals-screen").then(
      (module) => module.ApprovalsScreen,
    ),
  { loading: () => <WorkspaceSkeleton /> },
);
/** Route-level code splitting keeps inactive management tools out of the initial bundle. */
export default function Page() {
  return <Screen />;
}
