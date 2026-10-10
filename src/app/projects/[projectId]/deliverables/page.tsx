import dynamic from "next/dynamic";
export const metadata = { title: "Entregables" };
import {WorkspaceSkeleton} from "@/composition/presentation/workspace-ui";
const Screen=dynamic(()=>import("@/bounded-contexts/delivery-management/presentation/deliverables-screen").then(m=>m.DeliverablesScreen),{loading:()=> <WorkspaceSkeleton/>});
/** Lazy project module; shared workspace boundaries handle loading and failures. */
export default function Page(){return <Screen/>;}
