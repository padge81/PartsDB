export const UNKNOWN_SUPPLY_TYPE = 'unknown';
export const missingUnknownMessage = 'The built-in Unknown supply type is missing or inactive. Apply the latest database update, then reload this page.';

export function hasUnknownSupplyType(types: Array<{code: string; is_active: boolean}>) {
  return types.some(type => type.code === UNKNOWN_SUPPLY_TYPE && type.is_active);
}

/** Supply types are referenced by code. Preserve the receiving database's default
 * ID, including when an older archive omitted or deactivated the default. */
export function portableSupplyTypes(rows: Record<string, unknown>[], defaultId: string) {
  if (rows.some(row => row.id === defaultId && row.code !== UNKNOWN_SUPPLY_TYPE)) {
    throw new Error('A supply type in this backup conflicts with the built-in default ID. No data was cleared.');
  }
  return rows.map(row => row.code === UNKNOWN_SUPPLY_TYPE ? {...row, id: defaultId, is_active: true} : {...row});
}
