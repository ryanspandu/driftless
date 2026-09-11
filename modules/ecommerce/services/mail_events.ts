import { registerMailEvent } from '#services/mail_events'

/**
 * The emails this module sends, declared so an operator can see and govern
 * them from Settings → Email → Notifications.
 *
 * Registered from the module's `boot()` hook, like its block resolvers — core
 * never imports this file, so a disabled e-commerce module simply means these
 * three rows disappear from that screen.
 */
export const ECOMMERCE_MAIL_EVENTS = {
  orderConfirmation: 'ecommerce.order_confirmation',
  orderShipped: 'ecommerce.order_shipped',
  basketReminder: 'ecommerce.basket_reminder',
} as const

export function registerEcommerceMailEvents(): void {
  registerMailEvent({
    key: ECOMMERCE_MAIL_EVENTS.orderConfirmation,
    owner: 'ecommerce',
    label: 'Order confirmation',
    description: "The receipt, sent once when a payment is confirmed by the gateway's webhook.",
    trigger: 'webhook',
    category: 'transactional',
    /**
     * Disableable, unlike a password reset: a shop may legitimately send its
     * own receipts from an external fulfilment system, and a buyer who gets no
     * receipt still has their order page. The default is on because a silent
     * purchase is alarming.
     */
    canDisable: true,
    defaultEnabled: true,
    defaults: {
      subject: '{{siteName}} order {{number}}',
      heading: 'Thank you for your order',
      intro: 'Order {{number}} is confirmed and paid.',
      buttonLabel: 'View your order',
      outro: 'Keep this email — that link is how you reach your order without an account.',
    },
    variables: ['siteName', 'number', 'total'],
  })

  registerMailEvent({
    key: ECOMMERCE_MAIL_EVENTS.orderShipped,
    owner: 'ecommerce',
    label: 'Shipment notice',
    description: 'Sent when an order is marked shipped, with the carrier and tracking number.',
    trigger: 'admin',
    category: 'transactional',
    canDisable: true,
    defaultEnabled: true,
    defaults: {
      subject: '{{siteName}} order {{number}} has shipped',
      heading: 'Your order is on its way',
      intro: 'Order {{number}} has shipped.',
      buttonLabel: 'Track your parcel',
      outro: '',
    },
    variables: ['siteName', 'number', 'carrier', 'trackingNumber'],
  })

  registerMailEvent({
    key: ECOMMERCE_MAIL_EVENTS.basketReminder,
    owner: 'ecommerce',
    label: 'Abandoned basket reminder',
    description:
      'Sent by the maintenance cron to shoppers who left items behind and opted into marketing.',
    trigger: 'cron',
    /**
     * Marketing, not transactional: nothing the recipient did asks for it.
     * That is why it already checks per-customer consent — this toggle is the
     * store-wide switch on top of that, not a replacement for it.
     */
    category: 'marketing',
    canDisable: true,
    /**
     * Off by default. Every other email here answers something the recipient
     * did; this one arrives unbidden, and turning it on is a decision an
     * operator should make deliberately rather than discover having made.
     */
    defaultEnabled: false,
    defaults: {
      subject: 'You left something at {{siteName}}',
      heading: 'Still thinking it over?',
      intro: 'The items below are still in your basket.',
      buttonLabel: 'Return to your basket',
      outro: '',
    },
    variables: ['siteName', 'total'],
  })
}
