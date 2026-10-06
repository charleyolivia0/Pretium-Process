export type InkPath = {
  tool: "ink";
  color: string;
  strokeWidth: number;
  points: { x: number; y: number }[];
};

export function recordFromPayload(pages: { pageIndex: number; paths: InkPath[] }[]): Record<number, InkPath[]> {
  const out: Record<number, InkPath[]> = {};
  for (const p of pages) {
    out[p.pageIndex] = p.paths.map((path) => ({
      ...path,
      points: path.points.map((pt) => ({ ...pt })),
    }));
  }
  return out;
}

export function payloadFromRecord(rec: Record<number, InkPath[]>): {
  version: number;
  pages: { pageIndex: number; paths: InkPath[] }[];
} {
  const pages = Object.keys(rec)
    .map((k) => Number(k))
    .sort((a, b) => a - b)
    .map((pageIndex) => ({
      pageIndex,
      paths: (rec[pageIndex] ?? []).map((path) => ({
        ...path,
        points: path.points.map((pt) => ({ ...pt })),
      })),
    }));
  return { version: 1, pages };
}
