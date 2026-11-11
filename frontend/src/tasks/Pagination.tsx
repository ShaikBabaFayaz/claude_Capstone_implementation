interface PaginationProps {
  page: number
  totalPages: number
  onPage: (page: number) => void
}

export default function Pagination({ page, totalPages, onPage }: PaginationProps) {
  const lastPage = Math.max(totalPages - 1, 0)
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" disabled={page <= 0} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="pagination-status">
        Page {page + 1} of {lastPage + 1}
      </span>
      <button type="button" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </nav>
  )
}
