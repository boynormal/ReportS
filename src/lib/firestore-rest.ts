/** Minimal Firestore REST helpers (avoids Firebase client SDK App Check issues in Node) */

export type FirestoreRestValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreRestValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreRestValue> } };

export function decodeValue(value: FirestoreRestValue | undefined): unknown {
  if (!value) return null;
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return new Date(value.timestampValue);
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map((v) => decodeValue(v));
  }
  if ("mapValue" in value) {
    return decodeFields(value.mapValue.fields ?? {});
  }
  return null;
}

export function decodeFields(fields: Record<string, FirestoreRestValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = decodeValue(value);
  }
  return out;
}

export function documentIdFromName(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1] ?? name;
}

export function toTimestampValue(date: Date): FirestoreRestValue {
  return { timestampValue: date.toISOString() };
}
