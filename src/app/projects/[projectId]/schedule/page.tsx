import dynamic from "next/dynamic";
export const metadata = { title: "Planificación" };
import {WorkspaceSkeleton} from "@/composition/presentation/workspace-ui";
const Screen=dynamic(()=>import("@/bounded-contexts/project-scheduling/presentation/scheduling-screen").then(m=>m.SchedulingScreen),{loading:()=> <WorkspaceSkeleton/>});
/** Lazy project module; shared workspace boundaries handle loading and failures. */
export default function Page(){return <Screen/>;}
