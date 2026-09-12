import { InvitationScreen } from "@/bounded-contexts/identity-access/presentation/invitation-screen";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return <InvitationScreen token={(await params).token} />;
}
