import { AdminPartEditor } from "../../../../../components/admin-part-editor";

export default async function EditPartPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <AdminPartEditor partId={id}/>; }
