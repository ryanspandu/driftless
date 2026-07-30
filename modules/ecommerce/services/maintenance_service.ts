import OrderService from '#modules/ecommerce/services/order_service'
import AffiliateService from '#modules/ecommerce/services/affiliate_service'
import WebhookService from '#modules/ecommerce/services/webhook_service'

const orders = new OrderService()
const affiliates = new AffiliateService()
const webhooks = new WebhookService()

export interface MaintenanceSummary extends Record<string, number> {
  /**
   * Abandoned checkouts cancelled. Each one releases its stock reservation and
   * hands back its discount use, both inside `expireStaleOrders`' own
   * transaction — there is deliberately no separate step for either, because a
   * second pass would release them twice.
   */
  ordersExpired: number
  /** Delivered orders closed out once their refund window passed. */
  ordersCompleted: number
  /** Commissions moved from `pending` to `approved`. */
  commissionsApproved: number
  /** Stored webhook events re-driven to completion. */
  webhooksProcessed: number
  /** Webhook events that failed again this pass. */
  webhooksFailed: number
  /** Old affiliate click rows deleted. */
  clicksPruned: number
  /** Abandoned-basket reminders sent. Only ever to customers who opted in. */
  basketReminders: number
}

/**
 * The periodic sweeps this module needs to stay correct.
 *
 * These are not optional housekeeping. Without them, stock reserved by an
 * abandoned checkout is held forever — the oversell guard turns into a
 * permanent inventory lock — affiliate commissions never leave `pending` so
 * nobody is ever paid, and a webhook that failed its first pass is never
 * retried, which can leave an order unpaid after the money was taken.
 *
 * Run by `node ace modules:maintenance`, from cron, and deliberately **not**
 * from the queue: this is exactly the work that must keep happening when Redis
 * is down.
 */
export default class MaintenanceService {
  /**
   * Every sweep, in order, each isolated from the others.
   *
   * One failing step must not stop the rest — a webhook that keeps throwing
   * should never be the reason stock stays locked. Each is individually safe to
   * run concurrently, because each is a conditional UPDATE rather than a
   * read-then-write, so an overlapping cron run is harmless.
   */
  async runAll(): Promise<MaintenanceSummary> {
    const summary: MaintenanceSummary = {
      ordersExpired: 0,
      ordersCompleted: 0,
      commissionsApproved: 0,
      webhooksProcessed: 0,
      webhooksFailed: 0,
      clicksPruned: 0,
      basketReminders: 0,
    }

    summary.ordersExpired = await this.step(() => orders.expireStaleOrders())
    summary.ordersCompleted = await this.step(() => orders.completeMatured())
    summary.commissionsApproved = await this.step(() => affiliates.approveMatured())

    const webhookResult = await this.stepResult(() => webhooks.reconcile(), {
      processed: 0,
      failed: 0,
    })
    summary.webhooksProcessed = webhookResult.processed
    summary.webhooksFailed = webhookResult.failed

    summary.clicksPruned = await this.step(() => affiliates.pruneClicks())

    /**
     * Last, and isolated like the rest. This is the only step that emails
     * anyone who did not ask — every guard for that lives in
     * `sendBasketReminders`, not here.
     */
    summary.basketReminders = await this.step(async () => {
      const { default: OrderNotifierService } = await import(
        '#modules/ecommerce/services/order_notifier_service'
      )
      return new OrderNotifierService().sendBasketReminders()
    })

    return summary
  }

  private async step(run: () => Promise<number>): Promise<number> {
    try {
      return await run()
    } catch (error) {
      console.error('[ecommerce] maintenance step failed', { error: (error as Error).message })
      return 0
    }
  }

  private async stepResult<T>(run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run()
    } catch (error) {
      console.error('[ecommerce] maintenance step failed', { error: (error as Error).message })
      return fallback
    }
  }
}
