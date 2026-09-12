type TableSkeletonProps = {
  cols: number;
  rows?: number;
};

export default function TableSkeleton({ cols, rows = 5 }: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="animate-pulse">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-4 py-3">
              <div className="h-4 rounded bg-slate-200" style={{ width: `${45 + ((r + c) % 4) * 12}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}