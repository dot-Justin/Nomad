import SessionClient from "./SessionClient";

export default async function Page({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  return <SessionClient serverId={serverId} />;
}
