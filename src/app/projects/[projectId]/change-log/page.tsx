import dynamic from "next/dynamic";
import {WorkspaceSkeleton} from "@/composition/presentation/workspace-ui";
const Screen=dynamic(()=>import("@/bounded-contexts/change-control/presentation/history-screen").then(m=>m.HistoryScreen),{loading:()=> <WorkspaceSkeleton/>});
/** Lazy project module; shared workspace boundaries handle loading and failures. */
export default function Page(){return <Screen/>;}
