import { PartDetails } from "../../../components/part-details";

export default async function PartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PartDetails partId={id} />;
}
