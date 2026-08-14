import { AdminRequestEditor } from "../../../../components/admin-request-editor";

export default async function AdminRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminRequestEditor requestId={id} />;
}
