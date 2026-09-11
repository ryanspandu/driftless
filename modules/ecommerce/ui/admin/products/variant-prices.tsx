import { useEffect, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { MoneyInput } from '../../components/money-input'
import { apiErrorMessage } from '~/lib/api-client'
import {
  useSaveVariantPrices,
  useStoreCurrencies,
  useVariantPrices,
  type VariantPriceDto,
} from '../_api'

/**
 * What a variant costs in every currency but the base.
 *
 * Renders nothing for a single-currency store, so the product editor is
 * unchanged for anyone not using this.
 *
 * Each price is entered independently. There is **no conversion** — a blank
 * field means "not sold in this currency", which is the whole safety property:
 * amounts are minor units, so borrowing the base number would read a `1000`
 * meaning $10.00 as ¥1000.
 */
export default function VariantPrices({ variantId }: { variantId: string }) {
  const currencies = useStoreCurrencies()
  const stored = useVariantPrices(variantId)
  const save = useSaveVariantPrices(variantId)

  const [amounts, setAmounts] = useState<Record<string, number | null>>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const others = (currencies.data ?? []).filter((c) => !c.isBase)

  useEffect(() => {
    if (!stored.data) return
    const next: Record<string, number | null> = {}
    for (const row of stored.data) next[row.currency] = row.priceAmount
    setAmounts(next)
  }, [stored.data])

  if (others.length === 0) return null

  async function onSave() {
    setError(null)
    setSaved(false)

    const prices: VariantPriceDto[] = others
      .filter((c) => amounts[c.code] !== null && amounts[c.code] !== undefined)
      .map((c) => ({
        currency: c.code,
        priceAmount: amounts[c.code] as number,
        compareAtAmount: null,
      }))

    try {
      await save.mutateAsync(prices)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2_000)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
      <div>
        <p className="text-sm font-medium">Prices in other currencies</p>
        <p className="text-xs text-muted-foreground">
          Set independently — nothing is converted. Leave one blank and this variant is not sold in
          that currency.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {others.map((currency) => (
          <div key={currency.code} className="space-y-1.5">
            <Label htmlFor={`price-${variantId}-${currency.code}`}>{currency.code}</Label>
            <MoneyInput
              id={`price-${variantId}-${currency.code}`}
              value={amounts[currency.code] ?? null}
              currency={currency.code}
              placeholder="Not sold"
              onChange={(value) => setAmounts((prev) => ({ ...prev, [currency.code]: value }))}
            />
          </div>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={save.isPending}
          onClick={onSave}
        >
          {save.isPending ? 'Saving…' : 'Save prices'}
        </Button>
        {saved ? <span className="text-xs text-emerald-600">Saved</span> : null}
      </div>
    </div>
  )
}
