import { useEffect, useState } from 'react'
import { Globe, Plus, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { CountryMultiSelect } from '../../components/country-multi-select'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import { MoneyInput } from '../../components/money-input'
import { apiErrorMessage } from '~/lib/api-client'
import {
  useSaveShipping,
  useShipping,
  useStoreCurrencies,
  type ShippingMethodDto,
  type ShippingZoneDto,
} from '../_api'

function emptyMethod(): ShippingMethodDto {
  return {
    name: 'Standard',
    description: null,
    rateAmount: 0,
    freeAboveAmount: null,
    minDeliveryDays: null,
    maxDeliveryDays: null,
    enabled: true,
    rates: [],
  }
}

function emptyZone(): ShippingZoneDto {
  return { name: 'New zone', countries: [], states: [], enabled: true, methods: [emptyMethod()] }
}

/**
 * Where the shop delivers and what it charges.
 *
 * Saved wholesale rather than row by row: zones, methods and rates only make
 * sense together, and a half-applied edit could leave the shop quoting a rate it
 * no longer means.
 */
export default function ShippingPanel() {
  const query = useShipping()
  const save = useSaveShipping()
  const currencies = useStoreCurrencies()

  const [zones, setZones] = useState<ShippingZoneDto[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const base = currencies.data?.find((c) => c.isBase)?.code ?? 'USD'
  const others = (currencies.data ?? []).filter((c) => !c.isBase)

  useEffect(() => {
    if (query.data) setZones(query.data)
  }, [query.data])

  function patchZone(index: number, patch: Partial<ShippingZoneDto>) {
    setZones((prev) => prev.map((zone, i) => (i === index ? { ...zone, ...patch } : zone)))
  }

  function patchMethod(zoneIndex: number, methodIndex: number, patch: Partial<ShippingMethodDto>) {
    setZones((prev) =>
      prev.map((zone, i) =>
        i === zoneIndex
          ? {
              ...zone,
              methods: zone.methods.map((method, j) =>
                j === methodIndex ? { ...method, ...patch } : method
              ),
            }
          : zone
      )
    )
  }

  function patchRate(
    zoneIndex: number,
    methodIndex: number,
    currency: string,
    amount: number | null
  ) {
    setZones((prev) =>
      prev.map((zone, i) => {
        if (i !== zoneIndex) return zone
        return {
          ...zone,
          methods: zone.methods.map((method, j) => {
            if (j !== methodIndex) return method
            const rates = method.rates.filter((rate) => rate.currency !== currency)
            // A blank field removes the rate, which means "not offered here".
            if (amount !== null) rates.push({ currency, rateAmount: amount, freeAboveAmount: null })
            return { ...method, rates }
          }),
        }
      })
    )
  }

  async function onSave() {
    setError(null)
    setSaved(false)
    try {
      await save.mutateAsync(zones)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2_000)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shipping</CardTitle>
        <CardDescription>
          A zone is a set of destinations that share rates. A zone with{' '}
          <strong>no countries</strong> is the catch-all — used only when no other zone matches.
          With no zones at all, physical orders ship free.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {zones.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8">
            <Globe className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">No delivery zones</p>
            <p className="text-xs text-muted-foreground">Physical orders currently ship free.</p>
          </div>
        ) : null}

        {zones.map((zone, zoneIndex) => (
          <div key={zoneIndex} className="space-y-4 rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor={`zone-${zoneIndex}`}>Zone name</Label>
                <Input
                  id={`zone-${zoneIndex}`}
                  value={zone.name}
                  onChange={(e) => patchZone(zoneIndex, { name: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 pt-7">
                <Switch
                  checked={zone.enabled}
                  onCheckedChange={(checked) => patchZone(zoneIndex, { enabled: checked })}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive hover:text-destructive"
                  onClick={() => setZones((prev) => prev.filter((_, i) => i !== zoneIndex))}
                >
                  <Trash2 className="size-4" aria-hidden />
                  <span className="sr-only">Remove {zone.name}</span>
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`countries-${zoneIndex}`}>Countries</Label>
                {/*
                 * Empty is a meaningful value here, not a missing one, so the
                 * placeholder names the catch-all rather than prompting a search.
                 */}
                <CountryMultiSelect
                  id={`countries-${zoneIndex}`}
                  value={zone.countries}
                  placeholder="Everywhere else"
                  onChange={(countries) => patchZone(zoneIndex, { countries })}
                />
                <p className="text-xs text-muted-foreground">Leave empty for the catch-all zone.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`states-${zoneIndex}`}>States / provinces</Label>
                {/*
                 * Stays free text: there is no worldwide subdivision list to close it
                 * against, and a half-complete one would reject valid destinations.
                 */}
                <Input
                  id={`states-${zoneIndex}`}
                  value={zone.states.join(', ')}
                  placeholder="Optional — narrows the countries above"
                  className="uppercase"
                  onChange={(e) =>
                    patchZone(zoneIndex, {
                      states: e.target.value
                        .split(',')
                        .map((code) => code.trim().toUpperCase())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-3 border-t pt-3">
              {zone.methods.map((method, methodIndex) => (
                <div key={methodIndex} className="space-y-3 rounded-md bg-muted/40 p-3">
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Label htmlFor={`m-${zoneIndex}-${methodIndex}`}>Option</Label>
                      <Input
                        id={`m-${zoneIndex}-${methodIndex}`}
                        value={method.name}
                        onChange={(e) =>
                          patchMethod(zoneIndex, methodIndex, { name: e.target.value })
                        }
                      />
                    </div>
                    <div className="w-36 space-y-1.5">
                      <Label htmlFor={`r-${zoneIndex}-${methodIndex}`}>Rate ({base})</Label>
                      <MoneyInput
                        id={`r-${zoneIndex}-${methodIndex}`}
                        value={method.rateAmount}
                        currency={base}
                        onChange={(value) =>
                          patchMethod(zoneIndex, methodIndex, { rateAmount: value ?? 0 })
                        }
                      />
                    </div>
                    <div className="w-36 space-y-1.5">
                      <Label htmlFor={`f-${zoneIndex}-${methodIndex}`}>Free above</Label>
                      <MoneyInput
                        id={`f-${zoneIndex}-${methodIndex}`}
                        value={method.freeAboveAmount}
                        currency={base}
                        placeholder="Never"
                        onChange={(value) =>
                          patchMethod(zoneIndex, methodIndex, { freeAboveAmount: value })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="mb-0.5 size-8 shrink-0 text-destructive hover:text-destructive"
                      onClick={() =>
                        patchZone(zoneIndex, {
                          methods: zone.methods.filter((_, j) => j !== methodIndex),
                        })
                      }
                    >
                      <Trash2 className="size-4" aria-hidden />
                      <span className="sr-only">Remove {method.name}</span>
                    </Button>
                  </div>

                  {others.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {others.map((currency) => {
                        const rate = method.rates.find((r) => r.currency === currency.code)
                        return (
                          <div key={currency.code} className="space-y-1.5">
                            <Label htmlFor={`rate-${zoneIndex}-${methodIndex}-${currency.code}`}>
                              Rate ({currency.code})
                            </Label>
                            <MoneyInput
                              id={`rate-${zoneIndex}-${methodIndex}-${currency.code}`}
                              value={rate?.rateAmount ?? null}
                              currency={currency.code}
                              placeholder="Not offered"
                              onChange={(value) =>
                                patchRate(zoneIndex, methodIndex, currency.code, value)
                              }
                            />
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ))}

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() =>
                  patchZone(zoneIndex, { methods: [...zone.methods, emptyMethod()] })
                }
              >
                <Plus className="size-4" aria-hidden />
                Add option
              </Button>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => setZones((prev) => [...prev, emptyZone()])}
        >
          <Plus className="size-4" aria-hidden />
          Add zone
        </Button>

        {others.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            A blank rate in another currency means the option is <strong>not offered</strong> for
            orders in it. Nothing is converted — set each one deliberately.
          </p>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex items-center gap-3">
          <Button type="button" disabled={save.isPending} onClick={onSave}>
            {save.isPending ? 'Saving…' : 'Save shipping'}
          </Button>
          {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}
