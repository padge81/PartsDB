export type CircleField = 'radius' | 'diameter' | 'circumference';
export type CircleUnit = 'mm' | 'cm' | 'm' | 'in';

export const circleUnits: ReadonlyArray<{ value: CircleUnit; label: string; millimetres: number }> = [
  { value: 'mm', label: 'Millimetres (mm)', millimetres: 1 },
  { value: 'cm', label: 'Centimetres (cm)', millimetres: 10 },
  { value: 'm', label: 'Metres (m)', millimetres: 1000 },
  { value: 'in', label: 'Inches (in)', millimetres: 25.4 },
];

export type CircleMeasurements = Record<CircleField, number>;

export function calculateCircle(source: CircleField, value: number): CircleMeasurements {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError('Enter a measurement greater than zero.');
  const radius = source === 'radius' ? value : source === 'diameter' ? value / 2 : value / (2 * Math.PI);
  return { radius, diameter: radius * 2, circumference: radius * 2 * Math.PI };
}

export function convertMeasurement(value: number, from: CircleUnit, to: CircleUnit) {
  const fromFactor = circleUnits.find(unit => unit.value === from)?.millimetres;
  const toFactor = circleUnits.find(unit => unit.value === to)?.millimetres;
  if (!fromFactor || !toFactor) throw new RangeError('Unsupported measurement unit.');
  return value * fromFactor / toFactor;
}

export function formatMeasurement(value: number, decimals = 3) {
  return value.toFixed(decimals).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '').replace(/\.$/, '');
}
