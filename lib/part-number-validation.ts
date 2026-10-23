const PLACEHOLDER_PART_NUMBERS = new Set(["unknown", "n/a", "na", "none", "not known", "tbc", "tbd", "?", "-"]);

export function getPlaceholderPartNumberMessage(value?: string | null) {
  const partNumber = value?.trim() ?? "";
  if (!partNumber || !PLACEHOLDER_PART_NUMBERS.has(partNumber.toLocaleLowerCase())) return "";
  return `“${partNumber}” is not a unique manufacturer part number. Leave this field blank when the number is unavailable.`;
}

export function isExactPartNumberMatch(numberMatch?: string | null) {
  return Boolean(numberMatch && numberMatch.toLocaleLowerCase().includes("exact"));
}
