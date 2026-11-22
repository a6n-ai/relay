import { redirect } from "next/navigation";

export default async function ClientRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/settings/clients/${id}`);
}
