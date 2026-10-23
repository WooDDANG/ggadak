export function PageControls({
  page,
  totalPages,
  totalElements,
  onPage,
  busy = false,
}: {
  page: number;
  totalPages: number;
  totalElements: number;
  onPage: (page: number) => void;
  busy?: boolean;
}) {
  return (
    <nav aria-label="페이지 이동" className="flex items-center gap-3 text-sm my-3">
      <button disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>
        이전
      </button>
      <span>
        {page} / {Math.max(1, totalPages)} 페이지 · 전체 {totalElements}건
      </span>
      <button disabled={busy || page >= totalPages} onClick={() => onPage(page + 1)}>
        다음
      </button>
    </nav>
  );
}
