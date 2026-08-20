import { MachineDetails } from "../../../components/machine-details";

export default async function MachinePage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <MachineDetails machineId={id}/>; }
