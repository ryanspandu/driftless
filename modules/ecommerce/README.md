# E-commerce

First-party module at [`modules/ecommerce/`](../../modules/ecommerce): products, orders,
payments, discounts, affiliates and digital delivery. Checkout is **hosted by Stripe or
PayPal** — card details never reach this server.

> Status: **built and tested end to end**, physical and digital. What has never run is the
> outside world — the gateway drivers are exercised against `FakeGatewayDriver` and no email
> has touched a real relay, so work through
> [the sandbox checklist](#still-to-verify-before-taking-real-money) before enabling live
> keys. See also [Not built yet](#not-built-yet).

## Why a module, not a plugin

Per [modules.md](./modules.md): _optional add-on → plugin; part of the product → module_.
A module gets a first-class sidebar group with sub-items (a plugin gets one flat link) and
may import core freely. Both matter for a surface this size.

## The five rules

If everything else here is forgotten, these five are the module's security:

1. **The client never sends a price.** A checkout request carries variant ids and
   quantities. Every amount is derived server-side from the database. `ecommerce_cart_items`
   deliberately has no price column — there is nothing for a tampered request to influence.
2. **The redirect back never marks an order paid.** Only a signature-verified webhook, or a
   server-initiated pull against a `gateway_payment_id` we stored ourselves, may do that.
   Both go through one function guarded by `UPDATE … WHERE payment_status = 'unpaid'`.
3. **Money is an integer, always.** `BIGINT` minor units, and
   [`services/money.ts`](../../modules/ecommerce/services/money.ts) owns every rounding
   decision. No floating-point arithmetic anywhere in the module.
4. **Buyers and staff are different species.** Different table, different cookie, different
   session store. `ctx.auth.user` means "staff `User`" and can never mean anything else.
5. **The queue is an accelerator, not the source of truth.** Every money-affecting
   transition commits synchronously in whichever process observes it. Kill the worker and
   orders still get paid.

## Money

`BIGINT` minor units (cents), never `NUMERIC` and never a float.

- `DOUBLE PRECISION` — what the CMS `DECIMAL` field type actually maps to. `0.1 + 0.2 !== 0.3`,
  so totals drift. Never model money this way.
- `NUMERIC(12,2)` — correct in the database, but node-postgres returns it as a **string**
  (no `setTypeParser` override exists here) while SQLite has no real NUMERIC. Two runtime
  types for one column, depending on the driver.

`Money` (`services/money.ts`) is the only place rounding happens — in `applyPercent`
(half-up, matching what the gateways do for their own line items) and `allocate`
(largest-remainder, so `sum(allocate(x, r)) === x` always holds). Everything else is exact
integer arithmetic. 100% branch coverage in [`tests/unit/money.spec.ts`](../../tests/unit/money.spec.ts).

Amounts cross the wire as `MoneyDto`:

```ts
{ amount: 1999, currency: 'USD', formatted: '$19.99' }
```

The client formats nothing and computes nothing. `MoneyInput`
([`inertia/components/ui/money-input.tsx`](../../inertia/components/ui/money-input.tsx))
parses typed input into an integer before it leaves the browser — a plain
`<input type="number">` would give a float.

## Multi-currency

**Prices are listed, never converted.** There is no exchange rate anywhere in this module,
and that is the design, not an omission. A merchant states what a variant costs in each
currency they sell in: no rate source to go stale, no floating-point FX arithmetic, and
prices that can be rounded to whatever looks right in each market instead of landing on
€9.37.

### The rule that makes it safe

A variant with no listed price in a currency is **not sellable in that currency**. Pricing
refuses, naming the item; the storefront omits it; a product with no sellable variant is
not listed at all.

Falling back to the base price would be a silent mispricing, and a spectacular one. `Money`
stores minor units, so a stored `1000` means **$10.00** in USD and **¥1000** in JPY — about
a 30% error, applied invisibly, in the one part of the system where being wrong costs real
money. There is no code path that converts between currencies, which is what makes this
structural rather than a rule someone has to remember.

### How a currency is chosen

`?currency=` → the `dl_currency` cookie → the store's base. Anything unrecognised falls back
to base **silently**, so a stale link from when the shop sold in NOK still shows prices.

That silence is safe because the cookie holds a _preference, not a credential_. It selects
which listed price to read and can only name a currency the store already sells in — there
is no value it could hold that produces an amount the merchant did not set. Rule 1 is
untouched: the client sends a **code**, never a price.

### Changing the base currency relabels, never converts

Refused outright once **orders** exist — each order records what it was charged in, and
reconciling two units needs exchange rates this module does not have. With only a catalogue
it asks for confirmation instead, because the bargain is blunt: *the numbers stay, their
value does not.* A variant at `10000` is $100.00 before and Rp10.000 after.

The switch also rewrites **`ecommerce_products.currency`**, in the same transaction. That
column is a denormalised copy of the base — every product is created with `settings.currency`
— so leaving it behind makes the catalogue contradict itself: the product picker formats a
price with the product's own currency while every total uses the store's. A store switched
from USD to IDR showed one item as **"$15.00"** in the picker and **"IDR 15.00"** in the
totals, from the same `1500`. Soft-deleted rows are relabelled too, so one restored later
does not come back claiming the old currency.

Nothing else is touched. `ecommerce_variant_prices` holds explicit non-base listings and is
the merchant's data; a row there for the *new* base is shadowed by `variant.priceAmount` and
should be cleared by hand.

### A basket is single-currency

`ecommerce_carts.currency` is fixed when the cart is created. Mixing listed prices from two
currencies into one total would produce a number that means nothing.

Switching currency re-prices the basket first and is **refused by name** if anything in it
is not sold in the new one. Switching and silently dropping what cannot be priced would
take an item out of someone's basket without telling them — the kind of thing a shopper
notices only after paying. Checkout takes its currency from the **cart**, never from the
request body.

### Schema

| Table                      | Holds                                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ecommerce_currencies`     | Currencies the storefront may be switched to. The base is always available whether or not it has a row, so an **empty table means a single-currency store** — exactly how every existing installation already behaves |
| `ecommerce_variant_prices` | What a variant costs in a **non-base** currency, unique on `(variant_id, currency)`                                                                                                                                   |

The base price stays on `ecommerce_product_variants.price_amount`. The asymmetry is
deliberate: no data migration, and a single-currency store never touches the new table.

Turning a currency off **disables** its row rather than deleting it, so the prices already
listed against it survive a merchant pausing that market for a month.

### Reports are one currency at a time

`AnalyticsService.sales()` filters to a single currency and says which. Summing across
currencies would produce a number that means nothing — there are no rates to do it with —
so instead the report lists `currenciesWithSales` and the dashboard offers a switch. Exports
already carry a currency column per row.

## Permissions

Matching is **literal** (`app/services/permission_ability_service.ts`): only `*` and a
special `cms:manage` case are wildcards, so `ecommerce:manage` would not imply
`ecommerce:orders:read`. Every code is declared in the manifest. The split is by blast
radius, not by screen:

```
ecommerce:dashboard:read
ecommerce:products:read      ecommerce:products:manage
ecommerce:orders:read        ecommerce:orders:manage      ecommerce:orders:refund
ecommerce:customers:read     ecommerce:customers:manage
ecommerce:discounts:read     ecommerce:discounts:manage
ecommerce:affiliates:read    ecommerce:affiliates:manage
ecommerce:commissions:read   ecommerce:commissions:approve
ecommerce:settings:manage    ecommerce:gateways:manage
```

None are granted to any role by the seeder — SUPERADMIN reaches them through `*`, everyone
else needs an explicit grant on the Roles page.

**Page routes use `pagePermission`, API routes use `permission`.** `permission` always
answers JSON, which is right for `/api` and wrong for a browser navigation;
`pagePermission` throws a 404 instead, so a privileged screen is not merely empty but
absent.

## Sidebar

The manifest declares **two** nav groups (`nav` accepts an array):

```
Apps
├─ E-commerce   ShoppingCart   Dashboard · Products · Orders · Customers · Settings
└─ Marketing    Megaphone      Discounts · Affiliates · Commissions
```

Marketing is usually a different person's job than fulfilment, so it gets its own section.
It stays in the same module because discounts and affiliates share the order and customer
tables, and one module may not import another's models.

## Installing

The module ships **`autoEnable: false`** deliberately. `ModulesService.reconcile()` runs on
every boot and would otherwise enable it across the fleet before its tables exist.

Settings → Application → enable the toggle → the install dialog lists the migrations that
will run → apply. No terminal needed. See [modules.md](./modules.md#installing-a-module-from-the-admin)
for how the installer works and why it is shaped that way.

## Schema

30 tables, all prefixed `ecommerce_`, ULID primary keys, soft delete via `deleted_at`.
Migrations start at `1762000100000` (after core's highest, `1761885935500`).

| Group     | Tables                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------ |
| Config    | `settings`, `gateway_credentials`                                                                      |
| Catalogue | `categories`, `products`, `product_variants`, `product_images`, `product_categories`, `digital_assets` |
| Buyers    | `customers`, `customer_sessions`, `addresses`                                                          |
| Carts     | `carts`, `cart_items`                                                                                  |
| Orders    | `orders`, `order_items`, `order_events`                                                                |
| Payments  | `payments`, `refunds`, `webhook_events`, `idempotency_keys`                                            |
| Shipping  | `shipping_zones`, `shipping_methods` — **created but unused**, see [Not built yet](#not-built-yet)     |
| Marketing | `discounts`, `discount_redemptions`, `affiliates`, `affiliate_clicks`, `commissions`                   |
| Delivery  | `download_grants`                                                                                      |
| Currency  | `currencies`, `variant_prices`                                                                         |

Load-bearing constraints — these are not incidental:

- `payments.gateway_payment_id` **unique** — how a duplicate webhook or a
  redirect/webhook race resolves to one payment.
- `webhook_events (gateway, event_id)` **unique** — the idempotency boundary for the whole
  payment flow.
- `commissions.order_id` **unique** — one commission per sale, so a replayed `order.paid`
  cannot pay an affiliate twice.
- `orders.idempotency_key` **unique** — a retried checkout resolves to the same order
  instead of a second charge.
- `cart_items` has **no price column** — see rule 1.
- `download_grants.asset_id` is `ON DELETE RESTRICT` — deleting a product must not revoke a
  download someone paid for.

Order state moves on three independent axes:

```
status:             draft → pending → confirmed → fulfilled → completed
                                 ↘ cancelled
payment_status:     unpaid → authorized → paid → partially_refunded / refunded / failed
fulfillment_status: unfulfilled → partially_fulfilled → fulfilled
```

Collapsing them into one enum is how state machines end up with twenty values and no
invariants.

Two states are currently **unreachable** and are marked as such in
`order_state_machine.ts`: `draft` (checkout and manual orders are both born `pending`)
and `authorized` (hosted checkout settles straight to `paid`). They are kept for
authorise-then-capture and admin draft orders, but nothing should report on them.

### Stage — the derived fourth thing

Three axes are right for correctness and wrong for a list screen: none of them answers
*what do I need to do?* `stageOf(order)` derives that, and it is **never stored** — a
fourth column would be free to disagree with the three it comes from.

| Stage | Means | Who is waiting |
|---|---|---|
| `action` | paid, not yet fulfilled | **you** — this is the work queue |
| `open` | awaiting payment, or sent and inside the refund window | the buyer, or the clock |
| `closed` | completed, cancelled, refunded or failed | nobody |

`closed` is tested first on purpose: an order refunded before it shipped is finished, not
outstanding work.

The Orders list filters on this via `?stage=`, and `OrderQueryService` translates it to
SQL rather than filtering loaded rows — a JavaScript filter would paginate the wrong set.
That SQL is a second implementation of the same rule, so a test asserts the two agree
across every status combination and that the three buckets partition the whole set.

**Digital orders fulfil themselves at payment.** Nobody posts a download, so `markShipped`
is never called for one; without this they would sit in `action` forever. `markOrderPaid`
sets `status`, `fulfillment_status` *and* `fulfilled_at` together — the last one matters
because the refund-window sweep measures from it, so an order missing it never matures.
A mixed basket is **not** auto-fulfilled: the physical half still has to go out.

**`completed` is reached by the maintenance sweep**, not by hand. `completeMatured()`
closes delivered orders once the refund window passes, guarded on the status it read so a
just-cancelled order is not dragged along. Before this, `completed` existed only as an
option in an admin dropdown, which meant every shipped order stayed open forever.

### Affiliate products have no order status

The word "affiliate" covers two unrelated things here, which is worth keeping straight:

- **Outbound** (`ctaMode: 'external'`) — you link *out* to someone else's shop. Both
  `CartService` and `PricingService` refuse these products, so one can never reach an
  order. There is no status because there is no order: the visitor leaves and the sale
  happens somewhere this app cannot see. Click-through tracking for these does not exist.
- **Inbound** (Marketing → Affiliates, `/ref/:code`) — other people send traffic *in*.
  These produce entirely ordinary orders, plus a commission row. Nothing about their
  status differs.

## The payment flow

```
POST /api/shop/checkout
  → price the basket from the database        (pricing_service)
  → reserve stock, conditional UPDATE         (inventory_service)
  → create order (pending / unpaid) + items   (checkout_service)
  → open a hosted gateway session             (gateways/*_driver)
  ↳ all of the above in ONE transaction — a gateway failure rolls back the
    reservation too, so no orphan holds stock nobody can buy

buyer pays on the gateway's own page

  webhook  ─┐
            ├─→ markOrderPaid()  ← the only door to `paid`
  return   ─┘
  page pull
```

### `markOrderPaid` is the only way an order becomes paid

Two properties make it safe, and both live in SQL rather than in JavaScript:

```sql
UPDATE ecommerce_orders SET payment_status = 'paid', …
WHERE id = ? AND payment_status = 'unpaid'
```

Zero rows updated means someone already paid it — a duplicate webhook, a webhook racing
the return page, a replay. The caller gets `changed: false` and every side effect is
skipped. No lock, no read-then-write, no race.

And the amount the gateway reports is compared against what we recorded. A mismatch does
not settle the order; it raises and writes an audit row for a human. Trusting the
gateway's figure blindly would let a tampered session pay a $500 order with $5.

**The return page never marks anything paid.** It calls `confirmFromReturn`, which asks
the gateway what happened using a `gatewayPaymentId` read from our own `payments` row —
never one from the URL — and hands the answer to the same guarded function.

### Webhooks

- `POST /api/webhooks/stripe`, `POST /api/webhooks/paypal` — unauthenticated by necessity,
  so the **signature is the authentication**.
- Verification runs over `request.raw()`, never a re-serialised body: the signature covers
  the exact bytes sent, and a check that fails for benign reasons is one someone
  eventually disables. This was verified before the phase was built, not assumed.
- CSRF-exempt through the predicate in [config/shield.ts](../../config/shield.ts) —
  gateways cannot send a token and have no session to protect.
- Every delivery is recorded **before** it is acted on. `(gateway, event_id)` is unique,
  and that is the idempotency boundary for the whole flow.
- Verification failure → logged and **400**, never processed. It must not fail open.
- Processing failure → **500**, so the gateway retries. The row is already durable, so
  `WebhookService.reconcile()` can re-drive it regardless — the queue is an accelerator,
  not a dependency.

### Stock

Split across two columns: `stock_on_hand` is what is physically there, `stock_reserved`
is what open checkouts are holding. Every mutation is a conditional UPDATE:

```sql
UPDATE … SET stock_reserved = stock_reserved + ?
WHERE id = ? AND (NOT track_inventory OR allow_backorder
                  OR stock_on_hand - stock_reserved >= ?)
```

Zero rows means someone else took the last unit between the read and the write — the
database decided, not us. Reservations are committed off the shelf when the order is
**paid**, not when it ships, so the expiry sweep cannot release stock that has been sold.

### Refunds

The ceiling is a conditional UPDATE too:

```sql
UPDATE … SET refunded_amount = refunded_amount + ?
WHERE id = ? AND refunded_amount + ? <= total_amount
```

Two support agents refunding the same order at the same moment cannot between them return
more than was taken. The gateway call happens after the ceiling is claimed and before the
commit, so a refused refund rolls everything back. A full refund restocks; a partial one
does not, because a partial refund is usually a price adjustment rather than a returned
item. Affiliate commissions on a refunded order are voided.

## Customer identity

Buyers live in `ecommerce_customers`, **not** in `users`, and authenticate through a
separate cookie (`dl_shop`) backed by `ecommerce_customer_sessions` — not an Adonis auth
guard.

That is deliberate. A second guard on the same `ctx.auth` would put a customer one
`auth.use('…')` typo away from being treated as staff. With a separate table, cookie and
code path, `ctx.auth.user` **cannot** hold a customer: there is no row for one in the table
those guards read. The isolation is structural rather than a convention someone has to
remember.

- Only the **hash** of the session token is stored, as `auth_access_tokens` does — a
  database leak must not hand over live sessions.
- `isActive` is re-checked on every request, so blocking a customer takes effect
  immediately rather than at their next login.
- Password changes revoke every session: a reset that leaves the attacker's session alive
  has not locked them out.
- Registration and login are **enumeration-resistant**. Registering an address that already
  has an account returns the same shape as success and no session, and both paths perform a
  scrypt comparison so response timing does not distinguish them.
- Guest checkout creates a customer row with `passwordHash: null`, which cannot be signed
  into. Registering that address later upgrades the same row rather than duplicating it.

### Adding a gateway

Implement `PaymentGatewayDriver`
([gateways/types.ts](../../modules/ecommerce/services/gateways/types.ts)) and add a case to
`gatewayDriver()`. The interface is deliberately narrow — anything outside it is not
something the checkout flow may depend on, which is what keeps every gateway behaving
identically to the caller.

`FakeGatewayDriver` is registered via `overrideGateway()` in tests, so every layer above
the driver runs its real code path without touching a sandbox account.

## Storefront

Unauthenticated, throttled, and behind `moduleEnabled` — a disabled store stops taking
orders. (Webhooks are deliberately exempt from that gate: money already in flight still has
to be recorded.)

| Endpoint                                          | Limit    | Notes                                               |
| ------------------------------------------------- | -------- | --------------------------------------------------- |
| `GET /api/shop/products`, `/:slug`, `/categories` | 120/min  | Active products only                                |
| `POST /api/shop/availability`                     | 120/min  | Live stock for SSG-rendered pages                   |
| `GET /api/shop/cart`                              | 120/min  | Does not create a cart — a crawler cannot mint rows |
| `POST/PUT/DELETE /api/shop/cart/items`            | 60/min   | Cart-flooding is the cheapest table filler          |
| `POST /api/shop/checkout`                         | 8/min    | Creates an order, reserves stock, opens a session   |
| `POST /api/shop/account/{login,register}`         | 10/15min | Each attempt costs a scrypt hash                    |

### A line item's picture falls back to the product

`PricingService.imageFor` reads the **variant's** image first, then the product's first image
by `position`. The variant image exists so a red shirt does not show the blue photograph, but
almost nothing has one: images are uploaded against the *product*, and a variant's
`image_url` stays null unless someone sets it per variant.

Reading the variant alone — which is what it did — left **every** line item pictureless: the
cart, the buyer's order page, the emailed receipt and the admin's order detail, all showing a
grey box while the product page beside them rendered the photograph, because that page reads
`product.images` directly. All four share `PricingService`, so the fallback belongs there and
nowhere else.

The resolved URL is **snapshotted onto `ecommerce_order_items.image_url`** at creation, like
every other line field, so a later image change does not rewrite an old receipt.

### DTOs are built, not filtered

Storefront payloads come from `StorefrontCatalogService` and `CartService`, which construct
their own shapes. They are never derived by stripping fields from the admin DTOs — omission
by construction beats remembering to strip, and
[`ecommerce_storefront.spec.ts`](../../tests/functional/ecommerce_storefront.spec.ts) walks
every public response recursively, failing on any forbidden key at any depth. That single
test catches future DTO regressions without anyone writing a new one.

Availability is a **bucket**, not a number: `in_stock` / `low_stock` / `out_of_stock`, with
a count only below the low-stock threshold. Exact inventory is competitive intelligence;
"only 3 left" is all a shopper needs.

### Cart and order identity

Both live in random tokens, stored only as hashes:

- `dl_cart` — the basket. No guessable id, so there is no "someone else's basket" bug to
  have.
- Order `access_token_hash` — lets a guest see their own order from an emailed link. A bad
  token and a missing order return the same 404, so probing teaches an attacker nothing.

Checkout requires an `Idempotency-Key` header, scoped to the cart cookie so one caller
cannot replay another's stored response. The key hashes **only the client payload** — a
successful checkout empties the cart, so hashing server state would make an identical retry
look like key reuse and be rejected, which is the exact case idempotency exists for.

Return URLs are built from the request's own host, never from anything the client sent.

## Puck blocks

`app/services/block_data_resolvers.ts` is a registry: a block type registers how to spot
its own references and how to fetch them, and the walker dispatches. It replaces the
hard-coded `block.type === 'CollectionList'` check for new blocks (that path still works
unchanged).

The e-commerce resolvers register from the module's `boot(app)` hook, so core never imports
module code — a disabled module simply means no commerce blocks resolve.

**Volatile resolvers are skipped for SSG.** Prices and stock must not be baked into a
snapshot; a cached page promising "in stock" for something sold out an hour ago is worse
than one that says nothing. Those blocks render their shell from the snapshot and hydrate
the live figures through `POST /api/shop/availability`.

`/shop` is a reserved first segment in `pages_public_controller`, so a CMS page cannot be
created at a path the storefront owns.

### Products as a bindable collection

The catalogue is exposed to the page builder as a **built-in collection**, so a
`CollectionList` (and a Collection Template, and the Settings tab's per-record "Get text
from" bindings) can bind to **Products** the same way it binds to CMS **Posts** — the
operator picks "Products" from the collection dropdown and the block renders live catalogue
rows. It shows up in the pickers grouped under **E-commerce**, alongside Content's Posts and
the dynamic CMS collections.

The adapter is [`services/builtin_collection.ts`](../../modules/ecommerce/services/builtin_collection.ts):
`productsCollection` (key `products`, group `E-commerce`) — a **read-only** view over the
`Product` model exposing `title`, `subtitle`, `price`, `image`, `slug`, `url` and a few more
as bindable fields, listing only `active`, non-deleted products. It is a view for _display_,
not the admin editor: products have their own admin pages, so the generic CMS record editor
never writes here.

**It is gated on the module being active, in two places:**

- **Registration** — `registerProductsCollection()` runs from the module's `boot()` hook,
  which only fires for an **enabled** module. Core never imports this file; it owns the
  registry (`app/cms/builtin_collections.ts`) and the module registers _into_ it, so the
  dependency stays one-way.
- **Per call** — `available: () => modules.isEnabled('ecommerce')`. Switching the store off
  at runtime makes "Products" vanish from every picker and its records 404, **without a
  restart** — `listBuiltinCollections()` filters on `available()` on every read, and
  `builtinCollection()` returns null when it fails.

The code path end to end: `boot()` → `registerProductsCollection()` →
`registerBuiltinCollection()` (core registry) → `CmsService.listBindableCollections()` merges
the built-ins ahead of the dynamic collections → `GET /api/admin/pages/collections` (in
`pages_controller`) → the builder's `useBindableCollections()` hook feeds the picker. A
disabled store is simply absent from that list rather than erroring.

One deliberate limit: the bound record carries the **base price in the store currency**, not
a per-shopper converted one — the record is shared across visitors and may be baked into an
SSR snapshot, and there is no currency in a builder binding to key on. A `ProductList` block
(a volatile resolver) remains the place for live, currency-aware pricing and stock; see
[Puck blocks](#puck-blocks) above.

### Product pages: one template, every product

`/shop/p/:slug` renders a **builder page** chosen in Store settings, bound to the URL's
product. The operator designs one page, drops a `ProductDetail` block on it and leaves the
slug field blank; the route fills it in per request. Without this a catalogue needs one
builder page per product, which stops being workable at about the tenth one.

How the binding reaches the block, on both sides:

- **Server.** `PageRenderer` passes a `BlockRenderContext` — the route params plus the
  request's query and cookies, forwarded verbatim — into `resolveBlockData`. A resolver
  reads what it needs; core never interprets any of it, which is how a commerce block
  renders in the shopper's currency without core knowing what a currency is.
- **Client.** The same params are echoed as `page.bindings` and read through
  `BlockBindingsContext`. The two must agree, or an SSR page would show one product and
  hydration would fetch another.

A block with its own slug stays pinned to that product wherever it appears. A blank block on
an ordinary page resolves nothing — it must not guess.

Three things the route refuses rather than fudges: an unknown or unpublished **product**, a
missing or unpublished **template**, and a product **not sold in the chosen currency**.
Each is a 404. Rendering the template with nothing in it would look like the product had
vanished; rendering it with no price would send a shopper to a checkout that cannot serve
them.

**It never snapshots.** The SSG cache is keyed on the page, so storing one product's HTML
would serve it for every other product on the same template — the single worst bug this
feature could have. `skipSnapshot` also forces `Cache-Control: no-store`, so a CDN in front
cannot repeat the mistake either.

The path prefix is a **constant**, not a setting. Routes register once at boot, so a
configurable prefix would need a restart to take effect and could be pointed at `/admin/…`
to shadow the dashboard. The same constant builds the canonical URL, so the served URL and
the declared one cannot drift apart.

### Which surface renders what

|                                    | Where it lives                                  | Why                                                                  |
| ---------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| Catalogue, product pages           | Puck blocks on ordinary builder pages           | It is content — gets SSR/SSG, SEO, and is designable by the operator |
| Cart, checkout, order confirmation | Module UI at `modules/ecommerce/ui/storefront/` | Per-visitor application screens; must never be cached or shared      |

Module UI pages fall through to `PublicLayout` automatically — `layout-shell`'s admin regex
only matches `modules/*/admin/*`.

**A new module folder needs one `npm run build`** before its pages resolve: Vite bundles
module UI through a build-time `import.meta.glob`.

## Marketing

Discounts and affiliates share one module with the rest of commerce — they read orders and
write against order totals, and splitting them would mean one module importing another.
They get their own sidebar group because that is where an operator looks for them, which is
a navigation concern, not an architectural one.

### Discounts

A code is worth whatever its `type` says, and `value` is deliberately overloaded: a
percentage for `percent`, integer minor units for `fixed`, ignored for `free_shipping`.
Anything reading it has to branch on the type first.

Two guarantees hold no matter what is configured:

- **A discount never exceeds the basket.** `validate()` clamps the amount to the subtotal,
  so a 100-off code on a 5 basket takes off 5, not 5 and change owed. A basket that then
  nets to zero checks out for free — see [Free checkout](#free-checkout).
- **Quota is claimed atomically**, never read-then-written:

  ```sql
  UPDATE ecommerce_discounts SET usage_count = usage_count + 1
  WHERE id = ? AND (usage_limit IS NULL OR usage_count < usage_limit)
  ```

  Zero rows affected means the last use was taken between the check and the claim. The
  claim happens while the order is being created and is released by `release()` when an
  unpaid order expires, so an abandoned checkout does not permanently consume a code.

`validate()` returns the **same message** for a code that does not exist and one the caller
is not eligible for. Distinguishing them would turn `POST /api/shop/discount/check` into a
code enumerator, which is why that endpoint also carries the tightest throttle in the module
(10/min/IP).

Enabled and live are separate questions, and the admin list shows both: a code can be
switched on and still not apply because its window has not opened, has closed, or its quota
is spent. `DiscountDto.live` answers "would this work right now", which is what turns "why
isn't my code working?" from a support ticket into a glance.

### Affiliates

`GET /ref/:code` records a click and redirects. Three details are load-bearing:

- It **always redirects**, even for an unknown code. A 404 tells whoever is probing which
  codes exist, and a dead affiliate link is worse than one that simply does not earn.
- The `?to=` destination is treated as a **path only**. An absolute URL would make this an
  open redirect borrowing the shop's own domain.
- `response.redirect().withQs(false)` is required, not cosmetic: `config/app.ts` sets
  `redirect.forwardQueryString: true` globally, so without it the rejected off-site value
  gets re-appended to the destination it was just rejected from.

The referral cookie is only set for an affiliate that can actually earn, and attribution at
checkout comes **from that cookie, never from the request body** — a client-supplied code
would let anyone credit any affiliate, including themselves, for any sale.

Commission is a percentage of the **subtotal**, before tax and shipping, so a change in
shipping rates never changes what a partner is owed. `ecommerce_commissions.order_id` is
unique, which is what makes commission creation idempotent under webhook replay.

The lifecycle is `pending → approved → paid`, with `void` as the exit:

| Transition             | Trigger                                               | Guard                                    |
| ---------------------- | ----------------------------------------------------- | ---------------------------------------- |
| `pending` → `approved` | `approveMatured()`, once the refund window has passed | Status-guarded UPDATE                    |
| `approved` → `paid`    | An operator records a payout                          | `ecommerce:commissions:approve`          |
| any → `void`           | A refund on the referred order                        | Automatic, inside the refund transaction |

Payout details are encrypted at rest with their own `purpose` tag and **never** sent back to
the browser — the DTO carries a mask and a `hasPayoutDetails` boolean. That makes an empty
form field ambiguous, so the admin distinguishes three intents explicitly: omitted keeps
what is stored, an empty string clears it, text replaces it.

`ecommerce:commissions:approve` is separate from `affiliates:manage` on purpose. Editing a
referral rate and recording that money left the building are different jobs.

## Digital delivery

Files live in `storage/protected/ecommerce/`, outside `public/` — the only directory the
static server is pointed at. That is the first line of defence and the one that does not
depend on any of our code being correct: even with every check below removed, there is no
URL that maps to those bytes.

The name on disk is a ULID plus the original extension. The buyer's filename is used only
for `Content-Disposition` and to pick that extension, so it never becomes a path component
and there is nothing to traverse with.

### The grant is the paywall

`ecommerce_download_grants` records one buyer's right to one asset from one paid order.
Note what the table does **not** have: a token of its own. Access is authorised by the
order's existing `access_token_hash`, which means the buyer holds one credential rather
than two — and their download link keeps working as long as their order link does, instead
of dying with the email that carried it.

`GET /shop/download/:id?token=…` resolves it. The authorisation, the payment check and the
quota decrement are **one statement**:

```sql
UPDATE ecommerce_download_grants
SET downloads_count = downloads_count + 1, …
WHERE id = ?
  AND revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at > now)
  AND (max_downloads = 0 OR downloads_count < max_downloads)
  AND order_id IN (
    SELECT id FROM ecommerce_orders
    WHERE access_token_hash = ? AND payment_status IN ('paid','partially_refunded')
  )
```

Two requests arriving together cannot both take the last remaining use, a refunded order
stops downloading even if revocation never ran, and **every** failure returns the identical
404 — a link that fails distinguishably is an oracle for whichever condition distinguishes
it. The counter does not move on a refusal, so guessing cannot drain someone's quota.

Grants are issued inside the `markOrderPaid` transaction, which is what makes a replayed
webhook unable to mint a second set. `max_downloads` is snapshotted from the asset rather
than read through to it: tightening a product's quota later must not shrink what an
existing buyer was sold.

### Other rules worth knowing

- Responses go out as `attachment` with `nosniff`, and `.html`, `.svg`, `.js` and friends
  are refused at upload. A file the store did not author must never render in the store's
  own origin.
- `ecommerce_download_grants.asset_id` is `ON DELETE RESTRICT`. Deleting a product must not
  silently revoke downloads someone paid for, so assets soft-delete and the file is only
  removed from disk when nothing was ever granted from it.
- A **full** refund revokes every grant on the order. A **partial** one deliberately does
  not — that is usually a price adjustment on an order the buyer still has, and withdrawing
  the file over a discount would be the worse bug.
- Revoking sits behind `orders:refund`, not `orders:manage`: taking back something already
  paid for is the same class of decision as moving money.

## Manual orders

`POST /api/admin/ecommerce/orders` creates a sale taken by phone, in person or on an
invoice. It is built on the same `PricingService` and `InventoryService` as a storefront
checkout, so it reserves stock, snapshots its lines, holds a reservation that the expiry
sweep will release, and — when `markPaid` is set — reaches paid through `markOrderPaid` like
everything else. The only things it skips are the cart and the gateway.

Staff **may** set `shippingAmount` and `discountAmount`; a phone order is exactly the case
where the standard rate does not apply. That is not a hole in _the client never sends a
price_: that rule is about buyers. Unit prices still come from the catalogue, the discount
is refused if it exceeds the goods, and every operator-set figure lands in the audit log.

The access token comes back **once**, which is why the admin shows a dedicated screen
rather than redirecting — only the hash is stored, so navigating away loses the buyer's only
link.

### `manual` is not a gateway

`PaymentGateway` is `GatewayName | 'manual'`, and the two are separate on purpose:
`GatewayName` drives driver lookup, so there must be no path on which the code goes looking
for a `manual` driver. Three sites had to be guarded when the type was introduced —
`refund_service`, `webhook_service` and `checkout_service.confirmFromReturn` — and the type
checker found all three. A manual payment refunds by recording the decision and letting the
operator move the cash; everything downstream (the ceiling, the restock, the voided
commission, the revoked downloads) is identical, which is the point of routing it through
the same method rather than a parallel one.

## Free checkout

A discount can take a basket to zero — a 100%-off code, or a fixed amount the clamp brings
down to the whole subtotal. No gateway accepts a zero charge, so that order skips the
gateway session entirely and is settled inline.

What it skips is **only** the gateway. Stock is still reserved and then committed, the
discount's quota is still claimed by the same atomic UPDATE, download grants are still
issued, commission is still recorded, and the receipt still goes out — because it runs
through `markOrderPaid` like everything else, rather than flipping `payment_status` itself.
A free order is indistinguishable from a paid one everywhere downstream.

Three properties worth stating:

- **No client can declare its own basket free.** The total is derived from the catalogue
  and a server-validated discount. There is no amount field in the request to tamper with,
  and an unknown code is refused rather than ignored — the only route to zero is a discount
  the store actually created.
- **The quota still binds.** This is the real risk: a code that costs the store its entire
  margin. It is consumed by the same conditional UPDATE as any other, so one leaked coupon
  with `usage_limit: 1` cannot empty the warehouse. The checkout throttle (8/min/IP) is the
  second bound.
- **A negative total is refused outright**, with `negative_total`. `PricingService` clamps,
  so this is unreachable — but if it ever fires, something upstream is broken and the right
  answer is to refuse, not to hand someone money.

`CheckoutResult.paid` is `true` only for a free order. A real payment is never settled at
checkout — that is rule 2, and it still holds.

A manual order reaches the same conclusion: a comped order settles on creation whatever
`markPaid` says, because leaving it unpaid would mean waiting for a payment that can never
arrive while the expiry sweep took the stock back from under it. Neither path records a
payment row — no money moved, and nothing should claim otherwise.

A pleasant side effect: a shop selling only free downloads needs **no payment credentials
configured at all**. The storefront hides the gateway picker and the submit button stops
being gated on having one.

## The storefront, and how it appears

`/shop` and `/shop/p/:slug` both render a **builder page**, not a fixed template. That
follows from the founding decision that the catalogue is _content_: the operator redesigns
their shop in the page builder like anything else, and gets SSR/SSG and SEO for free.

Both are reserved first segments, so the CMS catch-all will never serve them — the module
registers explicit routes and reads which page to use from
`ecommerce_settings.shop_page_id` and `product_page_id`.

### Seeded on enable, never at boot

A fresh install with no pages would 404 at `/shop`, which reads as broken rather than
unconfigured. So `ModuleManifest.onEnable` — a generic hook, not an e-commerce special case
— fires on the **off→on edge** of `ModulesService.setEnabled` and creates two pages: a shop
front with a `ProductList`, and a product template holding one `ProductDetail` with a
**blank slug**, which is what lets `/shop/p/:slug` bind a product per request.

Not at boot, and the distinction is the whole reason the hook exists where it does.
`reconcile()` runs in every process on every start; creating rows there means concurrent
writes across the fleet on every deploy. Enabling is a deliberate, single, operator action.

Three rules the hook must obey, all tested:

- **Idempotent.** Enabling twice creates nothing the second time.
- **Never overwrites.** An edited shop front survives toggling the module off and on — the
  operator's shop is theirs. It also _adopts_ a page already sitting at the path, rather
  than making a second one nobody can tell apart.
- **Never fatal.** A failure is logged and swallowed. Convenience content is not a reason to
  leave a module half enabled.

The seeded pages are ordinary documents made of ordinary blocks. Nothing about them is
special-cased, which is the point: the default is a starting position, not a template to
work around. Delete them, redesign them, or point the settings at pages of your own.

They are **SSR**, not SSG — both render live prices and stock, and the commerce resolvers
are marked volatile precisely so those never get baked into a snapshot.

## Addresses: country and city

Every address field in the module — store settings, manual orders, shipping zones and the
buyer's own checkout — takes country from a **closed searchable list** and city from a
**searchable list that still accepts anything typed**. The asymmetry is the whole design, so
it is worth saying why rather than leaving it to look like an oversight.

**Country is closed.** Zone matching compares country codes by exact string equality
(`shipping_service.ts`), so `UK` instead of `GB`, or `GBR`, or a stray lowercase, matched no
zone — and matching no zone raises nothing. It quotes no shipping rate, which reads as a
broken checkout rather than a mistyped setting, and days later it is a fulfilment problem
instead of a rejected field.

**City is not closed, and must never become closed.** The dataset stops at settlements of
1,000 inhabitants. Indonesia alone has tens of thousands of *desa* below that line. A picker
that refused an unlisted name would be a checkout nobody in a small village could complete —
far worse than an unaided text box. If you are ever tempted to "finish the job" by validating
city against the list, this paragraph is the reason not to.

### One list, three copies, no drift

| Where | What it is |
|---|---|
| `modules/ecommerce/services/country_codes.ts` | **The authority.** 249 ISO 3166-1 alpha-2 codes, plus `XK` |
| `modules/ecommerce/validators/country.ts` | `countryCode()` — the VineJS rule every country field uses |
| `inertia/lib/countries.ts` | Client copy, so a dropdown needs no round trip |

The client copy exists because `inertia/` has no import path into `modules/`. It only decides
what a menu offers; the server refuses anything off its own list, so a stale copy cannot let a
bad code through. `tests/unit/geo_data.spec.ts` asserts the two stay identical — the failure
mode otherwise is quiet, a country the picker offers and the server rejects.

The list is **not** enumerated from `Intl.DisplayNames`. ICU names 31 region codes that are
not ISO 3166-1 countries: deprecated states (`SU`, `YU`, `AN`), aggregates (`EU`, `EZ`, `UN`)
and two pseudo-locale test codes (`XA`, `XB`). Enumerating it would offer "European Union" and
"Pseudo-Accents" as places to post a parcel. Country *names* do come from `Intl.DisplayNames`,
which localises them for free.

`XK` (Kosovo) is the one deliberate departure from the standard — assigned by the European
Commission, not ISO. Carriers accept it and the city data has Pristina in it; refusing it
would mean a Kosovan buyer cannot enter their own address.

### Where the city data comes from

~124,000 names across 246 countries, from **GeoNames** (CC BY 4.0) via the MIT-licensed
`all-the-cities` package. **CC BY requires attribution** — `public/geo/cities/README.txt`
carries it and must travel with the data.

`all-the-cities` is a **devDependency and must stay one.** Loading it costs 88 MB of RSS,
measured; that is not a price worth paying in the web process for an autocomplete. Instead
`npm run geo:cities` splits it into static per-country files:

```
public/geo/cities/
  index.json        which countries have data — asked first, so we never fetch a 404
  ID.json           1,881 names, 21 KB  ["Jakarta","Surabaya","Medan",…]
  US.json          11,828 names, 150 KB (the largest)
  README.txt        the attribution
```

Names are **deduplicated and ordered by population**, largest first. Both matter: dedup halves
the payload with nothing lost for an address field, and the ordering is why typing "ja" in
Indonesia offers Jakarta before Jailolo. `ComboboxInput` takes `preserveOrder` so it does not
re-sort alphabetically and bury the answer, and `maxVisible` so eleven thousand names do not
each become a DOM node — the menu reports how many it is holding back rather than quietly
showing a short list.

The browser fetches **one country's file, once per session**, then filters locally. That is
the reason for the split rather than a search endpoint: the network is touched once, not once
per keystroke, so there is no debounce to tune.

Regenerate with `npm run geo:cities` after bumping the dataset.

### Components

| Component | Use for |
|---|---|
| `CountrySelect` | one country, closed list |
| `CountryMultiSelect` | a set of countries — shipping zones |
| `CityInput` | a city, suggestions scoped to a country, free text always |

`CountrySelect` and `CountryMultiSelect` both render an **unrecognised stored code as itself**
rather than dropping it. A database that predates these pickers can hold `UK`; if the control
resolved it to nothing the field would read as empty while still holding the bad value, and
the save would fail against a field that looks blank.

**States and provinces are deliberately still free text.** There is no worldwide subdivision
list here, and a half-complete one would be worse than a text box. Note this leaves the same
silent-mismatch shape that the country fix removed: a zone storing `CA` never matches a
destination storing `California`, and nothing reports it.

## Shipping

**Rates are listed, never calculated by a carrier API.** A zone is a set of destinations
that share rates; a method is a flat rate within one, optionally free above a threshold.

Zone matching is most-specific-first: country **and** state beats country alone, which beats
the **catch-all** (a zone with no countries). Ties break on `position`, so overlapping zones
can be ordered deliberately. Nothing matching means the shop does not deliver there, and
checkout says so rather than shipping free.

Three properties worth stating:

- **The client sends a method id, never a rate.** `rateFor` re-derives the amount from the
  destination and basket it was quoted for, and refuses a method belonging to another zone —
  otherwise a tampered request picks the cheapest rate in the shop for any destination.
- **No choice means the cheapest option, not free.** A silent zero is a loss that only shows
  up in the accounts.
- **`freeAboveAmount: null` ≠ `0`.** Null disables free shipping; zero makes everything
  free. The admin form maps an empty field to null for exactly this reason.

Rates follow the same multi-currency rule as prices: `ecommerce_shipping_rates` holds
non-base currencies, and a method with no rate in the order's currency is **not offered**.
Reusing the base rate would charge ¥500 for something priced $5.00.

A shop with **no zones** ships free and checks out normally — every shop worked that way
before this existed, and demanding a choice it cannot offer would lock out every physical
order on upgrade. Digital-only baskets are never charged and never asked.

## Fulfilment

`POST /api/admin/ecommerce/orders/:id/ship` records a carrier, a tracking number and a
tracking URL, sets `fulfillment_status`, and emails the buyer.

- **The email fires once**, on the first save. Correcting a mistyped tracking number records
  an `order.shipment_updated` event and leaves `shipped_at` alone — telling someone their
  parcel shipped twice is worse than a typo.
- **The tracking URL is taken, never built.** Guessing one from a carrier name produces a
  link that 404s. Only `http(s)` is accepted: that URL goes into an email and onto a page
  the buyer clicks, so a `javascript:` link there is stored XSS with extra steps.
- An unpaid order cannot be shipped.

## Customer accounts

`/shop/account`, `/shop/account/login`, `/shop/account/register`. All three are plain CSR
pages with **no server-side auth gate** — safe because they hold nothing: each fetches from
`/api/shop/…`, and those endpoints own the session check. Gating the page too would put the
rule in two places, and give it two places to be wrong.

Guest checkout is unchanged and remains the default. An account only groups order history;
the per-order access link in the confirmation email still works without one, and orders
placed as a guest are **not** retroactively linked to an account with the same address.

## Marketing email and consent

Exactly one message in this module is marketing: the **abandoned-basket reminder**. Receipts,
shipment notices and download links are transactional — the buyer asked for them by buying
something — and consent does not gate them.

That distinction is the whole design. Sending marketing without consent and a working
opt-out is how a domain ends up on a blocklist, which then takes the _receipts_ down with
it. The cost of getting this wrong is not confined to the marketing.

Every guard, and why:

| Guard                                              | Without it                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `acceptsMarketing` **and** no `unsubscribed_at`    | An admin editing a profile silently resurrects consent                                                              |
| Customer must be `active`                          | A blocked account still gets chased                                                                                 |
| Never a guest basket                               | A guest basket carries no consent at all                                                                            |
| Only past the checkout window                      | Someone still shopping is chased mid-decision                                                                       |
| `carts.reminded_at`, stamped **even when skipped** | A nightly sweep with no memory sends the same email every night — and a basket that throws blocks the queue forever |

The opt-out is a per-customer `unsubscribe_token`, minted lazily on first send so existing
customers need no backfill. `/shop/unsubscribe` is unauthenticated, not behind
`moduleEnabled` (someone unsubscribing must succeed even if the shop was switched off), and
**answers identically whether or not the token matched** — distinguishing them would let
someone check which addresses the shop holds. The mail also sets `List-Unsubscribe` and
`List-Unsubscribe-Post`, because a message without them is far likelier to be reported as
spam than unsubscribed from.

Reminders run from `modules:maintenance`, not the queue — same reasoning as the other
sweeps.

## The confirmation email

Sent from `markOrderPaid`, after its transaction commits. Two consequences follow from that
placement and both are deliberate:

- It fires **exactly once per order**. A duplicate webhook returns early at the `changed`
  guard and never reaches the send, so replays cannot produce a second receipt.
- It **can never fail a payment**. `OrderNotifierService.sendOrderConfirmation` catches
  everything and returns a boolean — rule 5 applies directly here. An order that has been
  paid is paid whether or not its receipt went out, and letting a dead SMTP relay raise
  from this point would make the gateway retry a charge already taken.

Context building is split from sending (`buildConfirmation` vs `sendOrderConfirmation`), so
the interesting property — _does the receipt contain a link that actually works_ — is
assertable without an SMTP server. Every amount arrives pre-formatted; the Edge template
performs no arithmetic and no lookups, because it renders in a queue worker with no request
context and a template that queries is a template that fails silently at 3am.

### Why the order token is stored twice

`access_token_hash` is what every lookup matches, and it is what makes a stolen backup
useless for _finding_ an order. But the email is sent from a webhook that never saw the
plaintext, so `access_token_enc` holds a recoverable copy — AES-256-GCM with its own
`purpose` tag, like the gateway secrets and payout details before it.

The trade-off, stated plainly: an attacker holding both the database and `APP_KEY` can read
order links. That is the same exposure the payment credentials already carry, and an order
link is strictly less valuable — it grants read access to one order and its downloads,
nothing more. The alternative, emailing no link at all, is worse for every buyer in
exchange for protection only against an attacker who already holds the key that decrypts
the gateway keys.

Both the hash and the ciphertext are `serializeAs: null`, and a test walks the admin and
buyer order endpoints asserting neither ever appears.

URLs are built from `APP_URL`, never from an incoming request — a host taken from a request
is attacker-controlled, and that is exactly how a confirmation email ends up pointing at
someone else's site.

## Exports

Four CSVs — orders, order lines, customers, products — each behind the permission that
already guards reading the same data on screen. A file is not a lower bar than a list page
because it leaves the building.

Three things they get right that a `join(',')` would not:

- **Formula injection.** A field beginning `=`, `+`, `-`, `@` or a control character
  executes when the file opens in Excel, Sheets or LibreOffice. Every export here contains
  buyer-supplied text, so a customer named `=HYPERLINK("http://evil","refund")` is writing
  code that runs on the finance team's laptop. `csvCell` prefixes a single quote — the
  accepted defence.
- **Amounts as integer minor units** alongside the currency, never a formatted string. A
  spreadsheet should receive a number it can sum. The orders export also carries
  `total_major` for accountants, derived from the same integer so the two cannot disagree.
- **A row cap** (50 000) that _tells_ the caller when it bites rather than silently
  truncating — silent truncation reads as "covered everything" right up until an audit.

The customers export carries no password, no session material and no address. The products
export is the one place `cost_amount` legitimately appears; every other surface treats it as
the field that must never reach a storefront. Every export writes an audit row, because
"who pulled the customer list, and when" cannot be answered after the fact unless it was
recorded at the time.

## Dashboard analytics

`AnalyticsService` backs two panels, both behind `ecommerce:dashboard:read`.

**Revenue over time.** Grouped in SQL, not in JavaScript — pulling every paid order into
memory to bucket it would turn a dashboard into a way to exhaust a worker's heap. Revenue
counts money actually _kept_ (`total - refunded`), so an order that was paid and then
refunded contributes zero rather than its face value; a dashboard that counts refunded
sales as revenue lies in exactly the situation where the truth matters. The series includes
days with no sales, because a chart with gaps draws a straight line across a quiet week and
reads as steady trade rather than none.

Points cross the wire as integer minor units — a chart needs a number to plot — and the
window total is computed **server-side** so the client never sums money.

**Best sellers** group on the order line's snapshot title rather than joining to the
product, so a sale whose product was later deleted still appears. The sale happened; a
report that quietly drops it is wrong about the past.

**Abandoned baskets** are carts still holding items past the checkout window. Deliberately
read-only: emailing someone because they left a basket is a marketing decision with consent
implications, and it needs `accepts_marketing` and an unsubscribe path before it is
anything but a way to get the store's domain blocklisted. They are priced from the
variant's _current_ price — carts have no price column, and inventing one to make a report
prettier would be the first crack in rule 1.

Two dialect notes, both learned the hard way:

- The date-part expression differs (`to_char` vs `strftime`), so `AnalyticsService` is one
  of the few places that branches on the driver.
- `.sum(db.raw(…))` **does not work** in knex — it splits the expression across bogus
  aliases and produces a syntax error. Use `.select(db.raw('SUM(…) as alias'))`.

## Maintenance sweeps — required, not optional

**`node ace modules:maintenance` must run on a schedule.** Every five minutes is fine:

```cron
*/5 * * * * cd /srv/driftless && node ace modules:maintenance >> /var/log/driftless-maintenance.log 2>&1
```

Without it, three things quietly break:

| Sweep                | What happens if it never runs                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expireStaleOrders`  | Stock reserved by an abandoned checkout is held forever. The oversell guard becomes a permanent inventory lock, and a limited discount code can be burned to zero by starting checkouts and walking away |
| `approveMatured`     | Commissions never leave `pending`, so no affiliate is ever paid and the payout screen is permanently empty                                                                                               |
| `webhooks.reconcile` | A delivery that failed its first pass is never retried, which can leave an order unpaid after the money was taken                                                                                        |

Plus `pruneClicks`, which only costs disk.

Deliberately **not** a queue job. This is the work that decides who owns stock and who gets
paid, so it has to keep happening when Redis is down — which is exactly when a queue-based
scheduler would not. Rule 5 in the other direction.

The command is generic: `ModuleManifest.maintenance?()` is a hook any module may declare,
and the command runs it for every _enabled_ one. Disabled modules are skipped rather than
failed, so switching a module off does not turn its cron entry into a recurring error. One
module's failure never stops the next one's sweep, and a failing run exits non-zero so
cron's own reporting fires — otherwise a sweep that has been throwing for a week looks
exactly like one that has been working.

Every sweep is idempotent and safe to run concurrently, because each is a conditional
UPDATE rather than a read-then-write. Overlapping cron runs are expected and harmless.

## Cross-dialect notes

Production is PostgreSQL, the test suite is SQLite. Where they differ, use the shared
column helpers in [`app/models/_columns.ts`](../../app/models/_columns.ts):

- `booleanColumn` — SQLite returns `0`/`1`, pg returns `true`/`false`.
- `moneyColumn` — pg returns `BIGINT` as a **string**.
- `jsonColumn` — pg parses `jsonb`, SQLite returns the raw string.

`citext` does not exist on SQLite, so emails and discount codes are normalised in the
service and indexed plainly.

## Testing

- [`tests/unit/money.spec.ts`](../../tests/unit/money.spec.ts) — the money layer, exhaustively.
- [`tests/functional/ecommerce_catalog.spec.ts`](../../tests/functional/ecommerce_catalog.spec.ts) —
  catalogue CRUD, permission enforcement, exact price round-tripping, audit entries.
- [`tests/functional/ecommerce_payments.spec.ts`](../../tests/functional/ecommerce_payments.spec.ts) —
  the properties that matter: server-side pricing against a tampered payload, stock
  overselling, rollback when the gateway fails, webhook idempotency and signature
  rejection, amount-mismatch refusal, refund ceilings, idempotency-key replay and scoping.
- [`tests/functional/ecommerce_orders_admin.spec.ts`](../../tests/functional/ecommerce_orders_admin.spec.ts) —
  that the permission split is real (`orders:manage` does **not** confer
  `orders:refund`; `settings:manage` does **not** confer `gateways:manage`), that cost
  price never appears in an order payload, and that gateway secrets never leave the server.
- [`tests/functional/ecommerce_customer_auth.spec.ts`](../../tests/functional/ecommerce_customer_auth.spec.ts) —
  that registering a customer touches no `users` row, that email case cannot create a
  second account, enumeration resistance, guest-row upgrade, and session revocation.
- [`tests/functional/ecommerce_storefront.spec.ts`](../../tests/functional/ecommerce_storefront.spec.ts) —
  the recursive leakage sweep over every public endpoint, cart isolation, checkout
  idempotency replay, order access by token, and that a storefront session opens nothing
  in the admin area.
- [`tests/unit/block_data_resolvers.spec.ts`](../../tests/unit/block_data_resolvers.spec.ts) —
  dedup, batching, zone traversal, the volatile/SSG split, and that one failing resolver
  cannot take a page down.
- [`tests/functional/ecommerce_marketing.spec.ts`](../../tests/functional/ecommerce_marketing.spec.ts) —
  discount windows, minimums, percentage caps and the clamp to basket value; that unknown
  and ineligible codes are indistinguishable; quota claim and release; that referral
  attribution comes from the cookie and not the body; commission arithmetic on subtotal;
  the `pending → approved → paid` guards; that a refund voids the commission; and that
  payout details never appear in any response.
- [`tests/functional/ecommerce_fulfilment.spec.ts`](../../tests/functional/ecommerce_fulfilment.spec.ts) —
  that grants appear only for digital lines on paid orders and never twice; that one
  order's token cannot open another's download; download and expiry limits; that a refused
  attempt does not consume quota; full-vs-partial refund revocation; that no response
  carries a storage path; manual-order pricing, stock and the refund-without-a-gateway
  path; CSV formula-injection escaping; and that an export leaks neither a password hash
  nor a permission boundary. Also the confirmation email: that its link round-trips through
  the encrypted token and opens the order, that its download links fetch the actual bytes,
  that a revoked grant is left out, and that neither token form escapes through an ordinary
  endpoint. And free checkout: that a 100% code settles without a gateway, commits stock,
  releases digital goods, spends its quota exactly once, cannot be induced by a tampered
  request, and that a _paid_ order is still never settled at checkout.

Three things about the setup that will otherwise cost an hour:

- **`ModulesService` caches enabled state** process-wide with a short TTL, so a test that
  flips the `modules` row must call `bustCache()` or every route 404s.
- **Module permissions are minted at boot**, but `truncate()` wipes them and the seeder
  only restores core's built-ins. Call `mintPermissions()` in setup.
- **Concurrency tests need PostgreSQL.** `better-sqlite3` is a single synchronous
  connection, so two overlapping write transactions deadlock rather than race — the suite
  hangs instead of failing. Those tests `.skip()` on SQLite; the sequential versions still
  prove the guards work. For the same reason, **never issue a query on the default
  connection from inside a transaction** — pass `trx` through, and write audit entries
  after the commit.

## Roadmap

| Phase | Scope                                                                       | State    |
| ----- | --------------------------------------------------------------------------- | -------- |
| 0     | Core pre-flight security fixes                                              | **Done** |
| 1     | Money, audit log, queue, mailer, schema installer                           | **Done** |
| 2     | Schema, catalogue admin, store settings                                     | **Done** |
| 3     | Checkout, Stripe & PayPal drivers, webhooks, refunds, order & gateway admin | **Done** |
| 4     | Customer identity, storefront API, commerce blocks, storefront pages        | **Done** |
| 5     | Discounts, affiliates, commissions                                          | **Done** |
| 6     | Digital delivery, exports, manual orders                                    | **Done** |

All six phases are built. What remains is the sandbox run below, and the follow-ons in
["Deliberately not built yet"](#deliberately-not-built-yet).

### Not built yet

Listed worst-first. The first two block selling **physical** goods; a digital-only shop is
unaffected by either.

- **Shipping is always zero.** `ecommerce_shipping_zones` and `ecommerce_shipping_methods`
  exist in the schema and **nothing reads them** — `CheckoutService` passes
  `shippingAmount: 0` unconditionally, and `shippingMethodId` is threaded through but never
  populated. A physical store therefore ships free whether it meant to or not. The tables
  being there makes this look finished from the schema alone, which is exactly why it is
  written down here.
- **No fulfilment tracking.** An order can be moved to `fulfilled`, but there is nowhere to
  record a carrier or a tracking number, and no "your order has shipped" email. The buyer
  finds out when it arrives.
- **No customer account screens.** `/api/shop/account/{login,register,logout,orders}` all
  work and are tested, but there is no UI for any of them. Guest checkout is complete; a
  returning buyer has no way to sign in and see their history without one being built.
- **No category management page.** The API is complete and the product editor can _assign_
  existing categories, but there is no screen to create, rename or delete one — today that
  needs an API call.
- **Abandoned-basket emails.** The list exists on the dashboard; sending to it does not.
  That needs `accepts_marketing` respected, an unsubscribe link, and a rate at which it
  stops being a reason to get blocklisted — all real work, none of it started.

### Still to verify before taking real money

- **`http.trustProxy`.** Every IP-keyed rate limit is worthless until this matches the real
  deployment topology — behind an untrusted load balancer the whole fleet shares one
  bucket. Configurable via `TRUST_PROXY`; the default `loopback` is almost certainly wrong
  in production.
- **A live sandbox run.** The drivers are exercised against `FakeGatewayDriver`, which
  proves the flow but not Stripe's or PayPal's actual API shapes. Work through the manual
  checklist — pay, abandon, close the tab before redirect, resend a webhook three times,
  refund twice — against both sandboxes before enabling live keys.
- **The Stripe API version** is pinned in `stripe_driver.ts` and must match the version the
  installed SDK's types were generated against. Bump both together, never one alone.
- **SMTP, end to end.** Confirmation emails are asserted at the context level — the link
  and the download URLs are proven to work — but nothing in the suite talks to a real relay.
  Configure SMTP in Settings → Email, use "Send test email", then place a sandbox order and
  confirm the receipt arrives and its links open.

## Related

- [modules.md](./modules.md) · [mail.md](./mail.md) · [auth-and-permissions.md](./auth-and-permissions.md)
- [pages-builder.md](./pages-builder.md) — the storefront blocks in phase 4 plug into this.
