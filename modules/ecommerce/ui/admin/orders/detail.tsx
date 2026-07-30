import { useEffect, useState } from 'react'
import { Link, usePage } from '@inertiajs/react'
import { ArrowLeft, Ban, PackageCheck, Undo2 } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { MoneyInput } from '../../components/money-input'
import { PageHeader } from '~/components/admin/page-header'
import { Can } from '~/components/providers/ability-provider'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { apiErrorMessage } from '~/lib/api-client'
import {
  useCancelOrder,
  useOrder,
  useMarkShipped,
  useOrderGrants,
  useRefundOrder,
  useRevokeGrant,
  useUpdateOrderNote,
  useUpdateOrderStatus,
  type AddressSnapshot,
  type OrderDetailDto,
} from '../_api'
import { PaymentBadge } from './index'

interface PageProps {
  orderId: string
}

function formatAddress(address: AddressSnapshot): string[] {
  const name = [address.firstName, address.lastName].filter(Boolean).join(' ')
  return [
    name,
    address.company,
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(', '),
    address.postalCode,
    address.country,
    address.phone,
  ].filter((line): line is string => Boolean(line && line.trim()))
}

/** Money always renders from the server-formatted string, never re-computed. */
function TotalsRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className={bold ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-medium' : ''}`}>{value}</span>
    </div>
  )
}

function RefundDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderDetailDto
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const refund = useRefundOrder()
  const [amount, setAmount] = useState<number | null>(order.refundable.amount)
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setAmount(order.refundable.amount)
      setReason('')
      setRestock(true)
      setError(null)
    }
  }, [open, order.refundable.amount])

  async function onConfirm() {
    if (!amount || amount <= 0) {
      setError('Enter an amount to refund.')
      return
    }
    setError(null)
    try {
      await refund.mutateAsync({
        orderId: order.id,
        input: { amount, reason: reason.trim() || null, restock },
      })
      onOpenChange(false)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to issue the refund'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Refund {order.number}</DialogTitle>
          <DialogDescription>
            {order.refundable.formatted} of {order.total.formatted} is still refundable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="refund-amount">Amount</Label>
            {/* Emits integer minor units; the server enforces the ceiling. */}
            <MoneyInput
              id="refund-amount"
              value={amount}
              currency={order.total.currency}
              onChange={setAmount}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="refund-reason">Reason</Label>
            <Input
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional — shown in the order timeline"
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">Restock items</p>
              <p className="text-xs text-muted-foreground">
                Only applies to a full refund — a partial one is usually a price adjustment, not a
                return.
              </p>
            </div>
            <Switch checked={restock} onCheckedChange={setRestock} />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={refund.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={refund.isPending}>
            {refund.isPending ? 'Refunding…' : 'Issue refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function OrderDetailPage() {
  const { orderId } = usePage<{ props: PageProps }>().props as unknown as PageProps
  const query = useOrder(orderId)
  const updateStatus = useUpdateOrderStatus()
  const cancelOrder = useCancelOrder()
  const updateNote = useUpdateOrderNote()

  const [refundOpen, setRefundOpen] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const order = query.data

  useEffect(() => {
    if (order) setNote(order.internalNote ?? '')
  }, [order])

  if (!order) {
    return (
      <div className="space-y-6">
        <PageHeader title="Order" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(apiErrorMessage(err, 'Action failed'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          render={<Link href="/admin/ecommerce/orders" />}
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="sr-only">Back to orders</span>
        </Button>
        <PageHeader
          title={order.number}
          subtitle={`${order.email} · placed ${new Date(order.createdAt).toLocaleString()}`}
          className="flex-1"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <PaymentBadge status={order.paymentStatus} />
              <Badge variant="secondary" className="capitalize">
                {order.status}
              </Badge>
            </div>
          }
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="size-full object-cover" />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[item.variantTitle, item.sku].filter(Boolean).join(' · ')}
                      {item.sku || item.variantTitle ? ' · ' : ''}
                      {item.quantity} × {item.unit.formatted}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums">{item.total.formatted}</span>
                </div>
              ))}

              <div className="border-t pt-3">
                <TotalsRow label="Subtotal" value={order.subtotal.formatted} />
                {order.discount.amount > 0 ? (
                  <TotalsRow label="Discount" value={`−${order.discount.formatted}`} />
                ) : null}
                {order.shipping.amount > 0 ? (
                  <TotalsRow label="Shipping" value={order.shipping.formatted} />
                ) : null}
                {order.tax.amount > 0 ? (
                  <TotalsRow label="Tax" value={order.tax.formatted} />
                ) : null}
                <TotalsRow label="Total" value={order.total.formatted} bold />
                {order.refunded.amount > 0 ? (
                  <TotalsRow label="Refunded" value={`−${order.refunded.formatted}`} />
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
              <CardDescription>
                Every transition, who caused it, and when. Append-only.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {order.events.map((event) => (
                  <li key={event.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{event.type}</p>
                      {event.message ? (
                        <p className="text-xs text-muted-foreground">{event.message}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()} ·{' '}
                        {event.actorLabel ?? event.actorType}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <ShipmentPanel order={order} orderId={orderId} />

          <DownloadsPanel orderId={orderId} />

          {order.payments.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {order.payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium capitalize">
                        {payment.gateway}{' '}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({payment.mode})
                        </span>
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {payment.gatewayPaymentId}
                      </p>
                      {payment.failureMessage ? (
                        <p className="text-xs text-destructive">{payment.failureMessage}</p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums">{payment.amount.formatted}</p>
                      <p className="text-xs capitalize text-muted-foreground">{payment.status}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Can permission="ecommerce:orders:manage">
                {order.status === 'confirmed' ? (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    disabled={updateStatus.isPending}
                    onClick={() =>
                      run(() =>
                        updateStatus.mutateAsync({
                          orderId: order.id,
                          input: { status: 'fulfilled' },
                        })
                      )
                    }
                  >
                    <PackageCheck className="size-4" aria-hidden />
                    Mark fulfilled
                  </Button>
                ) : null}

                {order.status !== 'cancelled' && order.status !== 'completed' ? (
                  <Button
                    variant="outline"
                    className="w-full gap-2 text-destructive hover:text-destructive"
                    disabled={cancelOrder.isPending}
                    onClick={() =>
                      run(() =>
                        cancelOrder.mutateAsync({ orderId: order.id, input: { reason: null } })
                      )
                    }
                  >
                    <Ban className="size-4" aria-hidden />
                    Cancel order
                  </Button>
                ) : null}
              </Can>

              {/* Refund sits behind its own permission — moving money out is a
                  different job from updating a fulfilment status. */}
              <Can permission="ecommerce:orders:refund">
                {order.refundable.amount > 0 ? (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setRefundOpen(true)}
                  >
                    <Undo2 className="size-4" aria-hidden />
                    Refund {order.refundable.formatted}
                  </Button>
                ) : null}
              </Can>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{order.email}</p>

              {formatAddress(order.shippingAddress).length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Shipping</p>
                  {formatAddress(order.shippingAddress).map((line, i) => (
                    <p key={i} className="text-sm">
                      {line}
                    </p>
                  ))}
                </div>
              ) : null}

              {order.customerNote ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Customer note</p>
                  <p className="text-sm">{order.customerNote}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Can permission="ecommerce:orders:manage">
            <Card>
              <CardHeader>
                <CardTitle>Internal note</CardTitle>
                <CardDescription>Staff only — never shown to the customer.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={updateNote.isPending}
                  onClick={() =>
                    run(() =>
                      updateNote.mutateAsync({
                        orderId: order.id,
                        input: { internalNote: note.trim() || null },
                      })
                    )
                  }
                >
                  {updateNote.isPending ? 'Saving…' : 'Save note'}
                </Button>
              </CardContent>
            </Card>
          </Can>
        </div>
      </div>

      <RefundDialog order={order} open={refundOpen} onOpenChange={setRefundOpen} />
    </div>
  )
}

/**
 * Files this order released, and the ability to take them back.
 *
 * Renders nothing when there are none, which is most orders — a physical-only
 * store should never see an empty "Downloads" card.
 */
function DownloadsPanel({ orderId }: { orderId: string }) {
  const grants = useOrderGrants(orderId)
  const revoke = useRevokeGrant(orderId)
  const confirmDelete = useConfirmDelete()

  const rows = grants.data ?? []
  if (rows.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Downloads</CardTitle>
        <CardDescription>
          Released when the order was paid. Revoking one takes back something already paid for, so
          it sits behind the refund permission.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((grant) => (
          <div
            key={grant.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{grant.filename}</p>
              <p className="text-xs text-muted-foreground">
                {grant.downloadsCount}
                {grant.maxDownloads > 0 ? ` of ${grant.maxDownloads}` : ''} downloaded
                {grant.expiresAt
                  ? ` · until ${new Date(grant.expiresAt).toLocaleDateString()}`
                  : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {grant.live ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Badge variant="outline">Closed</Badge>
              )}
              <Can permission="ecommerce:orders:refund">
                {grant.live ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={async () => {
                      const confirmed = await confirmDelete({
                        title: `Revoke ${grant.filename}?`,
                        description: 'The buyer loses access immediately. This cannot be undone.',
                      })
                      if (confirmed) revoke.mutate(grant.id)
                    }}
                  >
                    Revoke
                  </Button>
                ) : null}
              </Can>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/**
 * Carrier and tracking, plus the notification that goes with them.
 *
 * Hidden for a downloads-only order — there is nothing to ship, and a form
 * asking for a courier would just be noise. The email fires once, on the first
 * save: correcting a mistyped tracking number must not tell the buyer their
 * parcel shipped a second time.
 */
function ShipmentPanel({ order, orderId }: { order: OrderDetailDto; orderId: string }) {
  const ship = useMarkShipped(orderId)
  const [carrier, setCarrier] = useState(order.carrier ?? '')
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber ?? '')
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl ?? '')
  const [error, setError] = useState<string | null>(null)

  const physical = order.items.some((item) => item.productType === 'physical')
  if (!physical) return null

  const alreadyShipped = Boolean(order.shippedAt)

  async function onSave() {
    setError(null)
    try {
      await ship.mutateAsync({
        carrier: carrier.trim() || null,
        trackingNumber: trackingNumber.trim() || null,
        trackingUrl: trackingUrl.trim() || null,
      })
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shipment</CardTitle>
        <CardDescription>
          {alreadyShipped
            ? `Marked as shipped on ${new Date(order.shippedAt!).toLocaleDateString()}. Saving again updates the details without emailing the buyer a second time.`
            : 'Saving marks the order shipped and emails the buyer their tracking details.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {order.shippingMethodLabel ? (
          <p className="text-sm text-muted-foreground">
            Buyer chose <span className="font-medium text-foreground">{order.shippingMethodLabel}</span>.
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="carrier">Carrier</Label>
            <Input
              id="carrier"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="Royal Mail"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tracking">Tracking number</Label>
            <Input
              id="tracking"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              className="font-mono"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tracking-url">Tracking link</Label>
          <Input
            id="tracking-url"
            value={trackingUrl}
            onChange={(e) => setTrackingUrl(e.target.value)}
            placeholder="https://…"
          />
          <p className="text-xs text-muted-foreground">
            Paste the carrier's own link. Nothing is guessed — a made-up URL just 404s for the
            buyer.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Can permission="ecommerce:orders:manage">
          <Button type="button" disabled={ship.isPending} onClick={onSave}>
            {ship.isPending
              ? 'Saving…'
              : alreadyShipped
                ? 'Update shipment'
                : 'Mark as shipped'}
          </Button>
        </Can>
      </CardContent>
    </Card>
  )
}
