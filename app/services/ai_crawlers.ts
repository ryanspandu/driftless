/**
 * AI-crawler groups for robots.txt (3-category model: matches Cloudflare's
 * Sept-2026 default split and common SEO-tool categorisation). Each group is
 * independently toggleable from Website settings → Site & SEO; ON emits a
 * `User-agent: <bot>\nDisallow: /` block per bot. Lists are best-effort, not
 * exhaustive — new crawlers appear regularly; update here only.
 */
export const AI_CRAWLER_GROUPS = {
  /** Scrape content to train foundation models. */
  training: [
    'GPTBot',
    'CCBot',
    'ClaudeBot',
    'Google-Extended',
    'Bytespider',
    'anthropic-ai',
    'cohere-ai',
    'Meta-ExternalAgent',
    'Applebot-Extended',
    'Amazonbot',
    'PetalBot',
    'Diffbot',
  ],
  /** Crawl to power AI search/answer products (citation, not training). */
  search: ['OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot'],
  /** Fetch a page live on behalf of a user's own prompt/agent action. */
  agents: ['ChatGPT-User', 'Claude-User', 'Perplexity-User'],
} as const

export type AiCrawlerGroup = keyof typeof AI_CRAWLER_GROUPS

/** Render one group as robots.txt blocks, or '' if the group is empty. */
export function renderAiCrawlerBlock(group: AiCrawlerGroup): string {
  return AI_CRAWLER_GROUPS[group].map((bot) => `User-agent: ${bot}\nDisallow: /`).join('\n\n')
}
