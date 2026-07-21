type IndexedItem<T> = { index: number; item: T };

/**
 * Processes each key sequentially while allowing independent keys to run in
 * parallel. Results retain the original input order.
 */
export async function mapKeyedSequential<T, R>(
  items: readonly T[],
  concurrency: number,
  keyOf: (item: T) => string,
  worker: (item: T, index: number) => Promise<R>,
) {
  if (!items.length) return [] as R[];

  const partitions = new Map<string, IndexedItem<T>[]>();
  items.forEach((item, index) => {
    const key = keyOf(item);
    const partition = partitions.get(key) ?? [];
    partition.push({ index, item });
    partitions.set(key, partition);
  });

  const queue = [...partitions.values()];
  const results = new Array<R>(items.length);
  let nextPartition = 0;
  const workers = Array.from(
    { length: Math.min(queue.length, Math.max(1, Math.floor(concurrency))) },
    async () => {
      while (nextPartition < queue.length) {
        const partitionIndex = nextPartition;
        nextPartition += 1;

        for (const entry of queue[partitionIndex]) {
          results[entry.index] = await worker(entry.item, entry.index);
        }
      }
    },
  );

  await Promise.all(workers);
  return results;
}
