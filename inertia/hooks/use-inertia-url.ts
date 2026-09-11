import { router, usePage } from '@inertiajs/react'
import { useMemo } from 'react'

export type ReadonlyURLSearchParams = URLSearchParams

type VisitOptions = {
  scroll?: boolean
}

export function usePathname(): string {
  const { url } = usePage()
  return new URL(url, 'http://local').pathname
}

export function useSearchParams(): URLSearchParams {
  const { url } = usePage()
  return useMemo(() => new URL(url, 'http://local').searchParams, [url])
}

export function useRouter() {
  return {
    push: (href: string, options?: VisitOptions) =>
      router.visit(href, { preserveScroll: options?.scroll !== false }),
    replace: (href: string, options?: VisitOptions) =>
      router.visit(href, {
        preserveState: true,
        preserveScroll: options?.scroll !== false,
        replace: true,
      }),
  }
}
