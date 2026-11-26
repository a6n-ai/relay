export function withParam(prev: Record<string, unknown>, key: string, value: string, resetCursor: boolean): Record<string, unknown> {
  const { cursor, offset, [key]: _old, ...rest } = prev;
  const next = value.trim();
  const kept = resetCursor ? rest : { ...rest, cursor, offset };
  return next ? { ...kept, [key]: next } : kept;
}
