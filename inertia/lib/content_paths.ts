import { usePage } from '@inertiajs/react'

/**
 * Where the built-in Content screens live (Website settings → URLs). The server
 * shares the effective prefixes as the `contentPaths` Inertia prop on every
 * render (SSR included); the defaults here are the historical routes and only
 * matter for a page rendered without it. Mirrors `app/services/content_paths.ts`.
 */
export interface ContentPaths {
  archive: string
  detail: string
  category: string
  tag: string
}

export const DEFAULT_CONTENT_PATHS: ContentPaths = {
  archive: 'blog',
  detail: 'posts',
  category: 'category',
  tag: 'tag',
}

export type ContentPathKind = keyof ContentPaths

export function useContentPaths() {
  const shared = usePage().props as { contentPaths?: Partial<ContentPaths> }
  const paths: ContentPaths = { ...DEFAULT_CONTENT_PATHS, ...shared.contentPaths }
  return {
    ...paths,
    /** `/insights/hello` (or `/insights` for the archive, which takes no slug). */
    url: (kind: ContentPathKind, slug?: string) =>
      slug ? `/${paths[kind]}/${slug}` : `/${paths[kind]}`,
  }
}
