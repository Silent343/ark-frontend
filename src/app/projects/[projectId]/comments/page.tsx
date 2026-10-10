import dynamic from "next/dynamic";
export const metadata = { title: "Conversaciones" };
import {WorkspaceSkeleton} from "@/composition/presentation/workspace-ui";
const Screen=dynamic(()=>import("@/bounded-contexts/collaboration/presentation/comments-screen").then(m=>m.CommentsScreen),{loading:()=> <WorkspaceSkeleton/>});
/** Lazy project module; shared workspace boundaries handle loading and failures. */
export default function Page(){return <Screen/>;}
