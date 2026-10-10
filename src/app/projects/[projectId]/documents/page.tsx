import dynamic from "next/dynamic";
export const metadata = { title: "Documentos" };
import { WorkspaceSkeleton } from "@/composition/presentation/workspace-ui";
const Screen = dynamic(
  () =>
    import("@/bounded-contexts/document-management/presentation/documents-screen").then(
      (module) => module.DocumentsScreen,
    ),
  { loading: () => <WorkspaceSkeleton /> },
);
/** Route-level code splitting keeps inactive management tools out of the initial bundle. */
export default function Page() {
  return <Screen />;
}
