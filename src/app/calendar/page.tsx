import dynamic from "next/dynamic";
export const metadata = { title: "Calendario del estudio" };
import { WorkspaceSkeleton } from "@/composition/presentation/workspace-ui";
const Screen = dynamic(
  () =>
    import("@/bounded-contexts/project-scheduling/presentation/studio-calendar-screen").then(
      (m) => m.StudioCalendarScreen,
    ),
  { loading: () => <WorkspaceSkeleton /> },
);
export default function Page() {
  return <Screen />;
}
