import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'
import { apiErrorMessage } from '~/lib/api-client'
import { currencyOptions } from '../../lib/currencies'
import {
  useStoreCurrencies,
  useStoreSettings,
  useUpdateStoreCurrencies,
  useUpdateStoreSettings,
} from '../_api'

/**
 * Which currencies the shop sells in.
 *
 * The base currency is set with the rest of the store details and is always
 * sold in, so it appears here as a fixed badge rather than something to remove.
 */
export default function CurrenciesPanel() {
  const query = useStoreCurrencies()
  const save = useUpdateStoreCurrencies()
  const settings = useStoreSettings()
  const saveSettings = useUpdateStoreSettings()

  const [codes, setCodes] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  /**
   * The base is edited here rather than only in Store details, because this is
   * where someone thinking about currencies actually looks.
   */
  const [baseDraft, setBaseDraft] = useState('')
  const [baseError, setBaseError] = useState<string | null>(null)
  /** Set when the server says the change would reprice an existing catalogue. */
  const [repriceWarning, setRepriceWarning] = useState<string | null>(null)

  const base = query.data?.find((c) => c.isBase)

  useEffect(() => {
    if (query.data) setCodes(query.data.filter((c) => !c.isBase).map((c) => c.code))
  }, [query.data])

  useEffect(() => {
    if (settings.data) setBaseDraft(settings.data.currency)
  }, [settings.data])

  /**
   * `confirm` is passed through on the second attempt only. The server decides
   * whether it is needed — this never guesses, it just relays the answer.
   */
  async function saveBase(confirm: boolean) {
    setBaseError(null)
    try {
      await saveSettings.mutateAsync({ currency: baseDraft, confirmRepricing: confirm })
      setRepriceWarning(null)
    } catch (err) {
      const message = apiErrorMessage(err)
      // The repricing refusal is a question, not a failure — show it as one.
      if (/reinterprets/i.test(message)) setRepriceWarning(message)
      else setBaseError(message)
    }
  }

  /**
   * Options exclude the base and anything already added, so the picker cannot
   * offer a choice that would immediately be rejected. That leaves no
   * validation for this function to do beyond ignoring an empty selection.
   */
  const options = currencyOptions({
    exclude: [...(base ? [base.code] : []), ...codes],
  })

  function add() {
    const code = draft.trim().toUpperCase()
    if (!code) return

    setError(null)
    setCodes((prev) => [...prev, code])
    setDraft('')
  }

  async function onSave() {
    setError(null)
    setSaved(false)
    try {
      await save.mutateAsync(codes)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2_000)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Currencies</CardTitle>
        <CardDescription>
          Prices are <strong>listed</strong>, never converted — there are no exchange rates here.
          Set what each product costs in each currency on the product page. Anything without a price
          in a currency is simply not sold in it.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="base-currency">Base currency</Label>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <AppSelect
                id="base-currency"
                value={baseDraft}
                onChange={(value) => {
                  setBaseDraft(value)
                  setRepriceWarning(null)
                  setBaseError(null)
                }}
                options={currencyOptions()}
                placeholder="Search a currency…"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={
                saveSettings.isPending || !baseDraft || baseDraft === settings.data?.currency
              }
              onClick={() => saveBase(false)}
            >
              {saveSettings.isPending ? 'Saving…' : 'Change'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Every product's main price is in this currency, and reports default to it. It is
            locked once the first order exists.
          </p>

          {repriceWarning ? (
            <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm text-amber-700">{repriceWarning}</p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={saveSettings.isPending}
                  onClick={() => saveBase(true)}
                >
                  Change anyway
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRepriceWarning(null)
                    setBaseDraft(settings.data?.currency ?? '')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {baseError ? <p className="mt-2 text-sm text-destructive">{baseError}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="currency-code">Also sell in</Label>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              {/*
                A picker, not a text field. Free text lets a typo become a
                currency the shop then prices a catalogue in, and the mistake
                only surfaces when a buyer cannot pay. Searchable by code and by
                name, so "rupiah" finds IDR.
              */}
              <AppSelect
                id="currency-code"
                value={draft}
                onChange={setDraft}
                options={options}
                placeholder="Search a currency…"
                isClearable
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 gap-2"
              disabled={!draft}
              onClick={add}
            >
              <Plus className="size-4" aria-hidden />
              Add
            </Button>
          </div>
        </div>

        {codes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {codes.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-sm"
              >
                {code}
                <button
                  type="button"
                  onClick={() => setCodes((prev) => prev.filter((c) => c !== code))}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="size-3.5" aria-hidden />
                  <span className="sr-only">Stop selling in {code}</span>
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Selling in one currency only. Add another to price your products for a second market.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Removing a currency stops the storefront offering it. Prices you already set in it are
          kept, so putting it back does not mean entering them again.
        </p>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex items-center gap-3">
          <Button type="button" disabled={save.isPending} onClick={onSave}>
            {save.isPending ? 'Saving…' : 'Save currencies'}
          </Button>
          {saved ? <span className="text-sm text-emerald-600">Saved</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}
