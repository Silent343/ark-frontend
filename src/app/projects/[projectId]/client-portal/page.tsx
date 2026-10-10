import dynamic from "next/dynamic";
export const metadata = { title: "Portal del cliente" };
import {WorkspaceSkeleton} from "@/composition/presentation/workspace-ui";
const Screen=dynamic(()=>import("@/bounded-contexts/client-approvals/presentation/approvals-screen").then(m=>m.ApprovalsScreen),{loading:()=> <WorkspaceSkeleton/>});
/** Lazy project module; shared workspace boundaries handle loading and failures. */
export default function Page(){return <Screen/>;}
