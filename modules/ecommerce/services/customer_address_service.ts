import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { newUlid } from '#services/ulid_service'
import { publicError } from '#exceptions/public_error'
import CustomerAddress from '#modules/ecommerce/models/customer_address'

export interface AddressInput {
  label?: string | null
  firstName?: string | null
  lastName?: string | null
  company?: string | null
  line1: string
  line2?: string | null
  city: string
  state?: string | null
  postalCode?: string | null
  country: string
  phone?: string | null
  isDefaultShipping?: boolean
  isDefaultBilling?: boolean
}

export interface AddressDto {
  id: string
  label: string | null
  firstName: string | null
  lastName: string | null
  company: string | null
  line1: string
  line2: string | null
  city: string
  state: string | null
  postalCode: string | null
  country: string
  phone: string | null
  isDefaultShipping: boolean
  isDefaultBilling: boolean
}

export function toAddressDto(a: CustomerAddress): AddressDto {
  return {
    id: a.id,
    label: a.label,
    firstName: a.firstName,
    lastName: a.lastName,
    company: a.company,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    postalCode: a.postalCode,
    country: a.country,
    phone: a.phone,
    isDefaultShipping: a.isDefaultShipping,
    isDefaultBilling: a.isDefaultBilling,
  }
}

/**
 * A customer's saved address book.
 *
 * Every method is scoped by `accountId` — an address id alone is never enough
 * to read or change one, so a customer can only ever touch their own. At most
 * one default shipping and one default billing address exist per customer; the
 * flip is done in a transaction so two addresses can never both claim it.
 */
export default class CustomerAddressService {
  async list(accountId: string): Promise<AddressDto[]> {
    const rows = await CustomerAddress.query()
      .where('account_id', accountId)
      .whereNull('deleted_at')
      .orderBy('is_default_shipping', 'desc')
      .orderBy('created_at', 'desc')
    return rows.map(toAddressDto)
  }

  async create(accountId: string, input: AddressInput): Promise<AddressDto> {
    // The first address a customer saves becomes their default for both roles —
    // there is nothing else it could sensibly defer to.
    const count = await CustomerAddress.query()
      .where('account_id', accountId)
      .whereNull('deleted_at')
      .count('* as total')
    const isFirst =
      Number((count[0] as unknown as { $extras: { total: number } }).$extras.total) === 0

    // The only address a customer has is always their default — there is
    // nothing else it could defer to, so `isFirst` forces it on regardless of
    // what the form's (unchecked) default boxes sent.
    const isDefaultShipping = isFirst || (input.isDefaultShipping ?? false)
    const isDefaultBilling = isFirst || (input.isDefaultBilling ?? false)

    const address = await db.transaction(async (trx) => {
      if (isDefaultShipping) await this.clearDefault(accountId, 'shipping', null, trx)
      if (isDefaultBilling) await this.clearDefault(accountId, 'billing', null, trx)

      return CustomerAddress.create(
        {
          id: newUlid(),
          accountId,
          ...this.fields(input),
          isDefaultShipping,
          isDefaultBilling,
        },
        { client: trx }
      )
    })

    return toAddressDto(address)
  }

  async update(accountId: string, id: string, input: Partial<AddressInput>): Promise<AddressDto> {
    const address = await this.owned(accountId, id)

    await db.transaction(async (trx) => {
      address.useTransaction(trx)

      const assign = this.fields(input, true)
      Object.assign(address, assign)

      if (input.isDefaultShipping === true) {
        await this.clearDefault(accountId, 'shipping', id, trx)
        address.isDefaultShipping = true
      } else if (input.isDefaultShipping === false) {
        address.isDefaultShipping = false
      }
      if (input.isDefaultBilling === true) {
        await this.clearDefault(accountId, 'billing', id, trx)
        address.isDefaultBilling = true
      } else if (input.isDefaultBilling === false) {
        address.isDefaultBilling = false
      }

      await address.save()
    })

    return toAddressDto(address)
  }

  async remove(accountId: string, id: string): Promise<void> {
    const address = await this.owned(accountId, id)
    address.deletedAt = DateTime.now()
    await address.save()
  }

  /** The address, or a 404 — never leaks that an id exists under another owner. */
  private async owned(accountId: string, id: string): Promise<CustomerAddress> {
    const address = await CustomerAddress.query()
      .where('id', id)
      .where('account_id', accountId)
      .whereNull('deleted_at')
      .first()
    if (!address) throw publicError.notFound('Address not found.', 'address_not_found')
    return address
  }

  private async clearDefault(
    accountId: string,
    role: 'shipping' | 'billing',
    exceptId: string | null,
    trx: TransactionClientContract
  ): Promise<void> {
    const column = role === 'shipping' ? 'is_default_shipping' : 'is_default_billing'
    const query = CustomerAddress.query({ client: trx })
      .where('account_id', accountId)
      .where(column, true)
    if (exceptId) query.whereNot('id', exceptId)
    await query.update({ [column]: false })
  }

  /** The address columns from an input, trimmed. `partial` keeps `undefined` keys out. */
  private fields(input: Partial<AddressInput>, partial = false) {
    const out: Record<string, unknown> = {}
    const set = (key: string, value: unknown) => {
      if (!partial || value !== undefined) out[key] = value
    }
    set('label', input.label?.trim() || null)
    set('firstName', input.firstName?.trim() || null)
    set('lastName', input.lastName?.trim() || null)
    set('company', input.company?.trim() || null)
    if (input.line1 !== undefined) out.line1 = input.line1.trim()
    set('line2', input.line2?.trim() || null)
    if (input.city !== undefined) out.city = input.city.trim()
    set('state', input.state?.trim() || null)
    set('postalCode', input.postalCode?.trim() || null)
    if (input.country !== undefined) out.country = input.country.trim().toUpperCase()
    set('phone', input.phone?.trim() || null)
    return out
  }
}
