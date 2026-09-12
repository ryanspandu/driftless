import type { FC } from 'react'
import { Search } from 'lucide-react'
import { Input } from '~/components/ui/input'

interface PostSearchFormProps {
  /** Current query, to prefill the box so a submitted search stays visible. */
  query?: string
  placeholder?: string
}

/**
 * A plain `method="GET"` form — no `action`, so submitting it reloads the
 * CURRENT url with `?q=<value>` appended. That is deliberate: it needs no
 * client JS to work, and the resulting URL is what makes a search result
 * shareable and crawlable — the server renders real results for it (see
 * PublicController#blog/category/tag), which is the whole point of doing this
 * server-side instead of filtering the already-loaded list in the browser.
 */
export const PostSearchForm: FC<PostSearchFormProps> = ({
  query = '',
  placeholder = 'Search posts…',
}) => (
  <form method="GET" role="search" className="relative mt-6">
    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    <Input
      type="search"
      name="q"
      defaultValue={query}
      placeholder={placeholder}
      aria-label="Search posts"
      className="pl-9"
    />
  </form>
)
