// D1 takes at most 100 bound parameters per statement, so an id list goes out in sequential chunks of at most 90.
export async function inChunks<T, R>(ids: T[], fn: (part: T[]) => Promise<R>, size = 90): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(await fn(ids.slice(i, i + size)));
  return out;
}
