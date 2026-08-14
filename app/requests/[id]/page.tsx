import { RequestSummary } from "../../../components/request-summary";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequestSummary requestId={id} />;
}
