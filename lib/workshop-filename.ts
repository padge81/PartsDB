export type RepairFilenameSource = { machine_name: string; title: string };

const filenamePart = (value: string, maximum: number) => value.trim().replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,maximum);

export function repairPdfFilename(log: RepairFilenameSource) {
  const machine = filenamePart(log.machine_name,50);
  const title = filenamePart(log.title,70) || 'repair-log';
  return `${machine ? machine + '_' : ''}${title}-guide.pdf`;
}
