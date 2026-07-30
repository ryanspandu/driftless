import { Head } from '@inertiajs/react'

/**
 * Shown after a one-click opt-out.
 *
 * Deliberately says the same thing whether or not the token matched. A page
 * that distinguished them would let someone check which addresses the shop
 * holds, and there is nothing useful to tell a person whose link went stale.
 */
export default function UnsubscribedPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <Head title="Unsubscribed" />
      <h1 className="text-2xl font-semibold tracking-tight">You're unsubscribed</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        We won't email you about offers or baskets again. You will still get receipts and
        delivery updates for anything you buy — those are not marketing.
      </p>
      <a href="/" className="mt-8 inline-block text-sm underline">
        Back to the shop
      </a>
    </div>
  )
}
