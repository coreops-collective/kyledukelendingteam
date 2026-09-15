// Shared paging for Supabase table reads.
//
// PostgREST caps a single response at 1000 rows and gives no signal that it
// truncated — you just get 1000 rows back and the rest silently don't exist.
// task_completions crossed that cap on 2026-08-17 and ~888 of Kim's
// completions vanished from the client, which read as "tasks keep popping
// back up after refresh" (fixed in #86).
//
// Every store that loads a whole table has the same exposure. `loans` is the
// one that matters next: when it crosses 1000, loans start disappearing from
// every view at once.
//
// Deliberately dependency-free so any store can import it without pulling in
// an unrelated module's graph.

export const PAGE_SIZE = 1000;

// Walks fetchPage(from, to) until it returns a short page, and returns
// everything concatenated.
//
// fetchPage MUST throw on error rather than returning what it managed to
// get. Callers replace their in-memory collection wholesale with the result,
// so a partial list reads as "these records were deleted" — which is a worse
// failure than not loading at all.
//
// fetchPage MUST also apply a stable sort. Without an ORDER BY, PostgREST is
// free to return a different slice per request, so paging would both skip
// and repeat rows.
export async function paginateAll(fetchPage, pageSize = PAGE_SIZE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    if (!page || !page.length) break;
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}
