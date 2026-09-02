import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { newUlid } from '#services/ulid_service'
import Account from '#modules/ecommerce/models/account'
import Commission from '#modules/ecommerce/models/commission'
import AffiliateWithdrawal from '#modules/ecommerce/models/affiliate_withdrawal'
import AffiliateService from '#modules/ecommerce/services/affiliate_service'
import StoreSettingsService from '#modules/ecommerce/services/settings_service'

const svc = () => new AffiliateService()

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

async function makeAccount(email = 'partner@example.com') {
  return Account.create({
    id: newUlid(),
    email,
    passwordHash: null,
    firstName: 'Pat',
    lastName: 'Partner',
    status: 'active',
    acceptsMarketing: false,
    ordersCount: 0,
    totalSpentAmount: 0,
  })
}

let orderSeq = 0

/** Insert a minimal paid order so a commission has a real `order_id` to point at. */
async function seedOrder(): Promise<string> {
  const id = newUlid()
  orderSeq += 1
  await db.table('ecommerce_orders').insert({
    id,
    number: `T-${orderSeq}-${id.slice(-6)}`,
    email: 'buyer@example.com',
    currency: 'USD',
    created_at: DateTime.now().toSQL(),
    updated_at: DateTime.now().toSQL(),
  })
  return id
}

/** Insert a commission directly in a given state for balance tests. */
async function seedCommission(
  affiliateId: string,
  amount: number,
  status: Commission['status'],
  withdrawalId: string | null = null
) {
  return Commission.create({
    id: newUlid(),
    affiliateId,
    orderId: await seedOrder(),
    amount,
    currency: 'USD',
    orderSubtotalAmount: amount * 10,
    ratePercentMilli: 10_000,
    status,
    withdrawalId,
  })
}

test.group('E-commerce | affiliate accounts', (group) => {
  group.each.setup(async () => resetDatabase())

  test('apply creates a pending affiliate that cannot earn yet', async ({ assert }) => {
    const account = await makeAccount()
    const affiliate = await svc().apply(account)

    assert.equal(affiliate.status, 'pending')
    assert.equal(affiliate.accountId, account.id)
    assert.isNotEmpty(affiliate.code)
    assert.isFalse(affiliate.isEarning)
  })

  test('one affiliate per account', async ({ assert }) => {
    const account = await makeAccount()
    await svc().apply(account)
    await assert.rejects(() => svc().apply(account))
  })

  test('a rejected applicant can re-apply with a message; pending cannot', async ({ assert }) => {
    const account = await makeAccount()
    const applied = await svc().apply(account, 'first try')

    // Pending cannot re-apply.
    await assert.rejects(() => svc().apply(account, 'again'))

    await svc().reject(applied.id, 'not now')
    const reapplied = await svc().apply(account, 'here is why you should reconsider')
    assert.equal(reapplied.status, 'pending')
    assert.equal(reapplied.applicantMessage, 'here is why you should reconsider')
    assert.equal(reapplied.id, applied.id) // same row, not a duplicate
  })

  test('approve activates and reject rejects', async ({ assert }) => {
    const account = await makeAccount()
    const applied = await svc().apply(account)

    const approved = await svc().approve(applied.id, { commissionPercent: 15 })
    assert.equal(approved.status, 'active')
    assert.equal(approved.commissionPercent, 15)

    const other = await svc().apply(await makeAccount('two@example.com'))
    const rejected = await svc().reject(other.id, 'no thanks')
    assert.equal(rejected.status, 'rejected')
  })

  test('balances are computed from the ledger', async ({ assert }) => {
    const affiliate = await svc().apply(await makeAccount())
    await svc().approve(affiliate.id)

    await seedCommission(affiliate.id, 1_000, 'pending')
    await seedCommission(affiliate.id, 2_000, 'approved') // available
    await seedCommission(affiliate.id, 500, 'paid')
    await seedCommission(affiliate.id, 300, 'void')

    const b = await svc().computeBalances(affiliate.id)
    assert.equal(b.pending, 1_000)
    assert.equal(b.available, 2_000)
    assert.equal(b.paid, 500)
    assert.equal(b.inWithdrawal, 0)
  })

  test('withdrawal bundles available commissions and gates on the minimum', async ({ assert }) => {
    await new StoreSettingsService().update({ affiliateMinWithdrawalAmount: 5_000 })

    const affiliate = await svc().apply(await makeAccount())
    await svc().approve(affiliate.id)
    await svc().setPayoutMethod(affiliate, { type: 'paypal', email: 'pay@example.com' })

    await seedCommission(affiliate.id, 2_000, 'approved')

    // Below the 5,000 minimum → rejected.
    await assert.rejects(() => svc().requestWithdrawal(affiliate), /minimum/i)

    await seedCommission(affiliate.id, 4_000, 'approved')
    const withdrawal = await svc().requestWithdrawal(affiliate)
    assert.equal(withdrawal.amount, 6_000)
    assert.equal(withdrawal.status, 'requested')

    // Both commissions are now reserved, so available drops to zero.
    const b = await svc().computeBalances(affiliate.id)
    assert.equal(b.available, 0)
    assert.equal(b.inWithdrawal, 6_000)
  })

  test('withdrawal requires a payout method', async ({ assert }) => {
    const affiliate = await svc().apply(await makeAccount())
    await svc().approve(affiliate.id)
    await seedCommission(affiliate.id, 9_000, 'approved')
    await assert.rejects(() => svc().requestWithdrawal(affiliate), /payout method/i)
  })

  test('paying a withdrawal marks its commissions paid; rejecting unlinks them', async ({
    assert,
  }) => {
    const affiliate = await svc().apply(await makeAccount())
    await svc().approve(affiliate.id)
    await svc().setPayoutMethod(affiliate, { type: 'paypal', email: 'pay@example.com' })
    await seedCommission(affiliate.id, 7_000, 'approved')

    const w1 = await svc().requestWithdrawal(affiliate)
    await svc().processWithdrawal(w1.id, 1, 'paid')

    const afterPaid = await svc().computeBalances(affiliate.id)
    assert.equal(afterPaid.paid, 7_000)
    assert.equal(afterPaid.available, 0)
    const reloaded1 = await AffiliateWithdrawal.findOrFail(w1.id)
    assert.equal(reloaded1.status, 'paid')

    // A second cycle, this time rejected → commissions return to available.
    await seedCommission(affiliate.id, 3_000, 'approved')
    const w2 = await svc().requestWithdrawal(affiliate)
    await svc().processWithdrawal(w2.id, 1, 'reject', 'bad details')

    const afterReject = await svc().computeBalances(affiliate.id)
    assert.equal(afterReject.available, 3_000)
    assert.equal(afterReject.inWithdrawal, 0)
    const reloaded2 = await AffiliateWithdrawal.findOrFail(w2.id)
    assert.equal(reloaded2.status, 'rejected')
    const unlinked = await db
      .from('ecommerce_commissions')
      .where('withdrawal_id', w2.id)
      .count('* as total')
      .first()
    assert.equal(Number(unlinked?.total ?? 0), 0)
  })

  test('a processed withdrawal cannot be processed again', async ({ assert }) => {
    const affiliate = await svc().apply(await makeAccount())
    await svc().approve(affiliate.id)
    await svc().setPayoutMethod(affiliate, { type: 'paypal', email: 'pay@example.com' })
    await seedCommission(affiliate.id, 8_000, 'approved')
    const w = await svc().requestWithdrawal(affiliate)
    await svc().processWithdrawal(w.id, 1, 'paid')
    await assert.rejects(() => svc().processWithdrawal(w.id, 1, 'paid'), /already.*processed/i)
  })

  test('overview reflects state and never leaks payout details', async ({ assert }) => {
    const account = await makeAccount()

    const none = await svc().overviewForAccount(account)
    assert.equal(none.state, 'none')

    const affiliate = await svc().apply(account)
    const pending = await svc().overviewForAccount(account)
    assert.equal(pending.state, 'pending')

    await svc().approve(affiliate.id)
    await svc().setPayoutMethod(affiliate, {
      type: 'bank',
      bankName: 'NatWest',
      accountNumber: '60161331926819',
      accountHolder: 'Pat Partner',
    })
    const active = await svc().overviewForAccount(account)
    assert.equal(active.state, 'active')
    assert.isNotNull(active.referralPath)
    assert.equal(active.payoutMethod?.type, 'bank')
    // The masked summary must not contain the full account number.
    assert.notInclude(JSON.stringify(active), '60161331926819')
  })
})
