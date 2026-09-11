/**
 * CSV writing for exports.
 *
 * Small on purpose, but not naive. Two things a `join(',')` gets wrong:
 *
 * 1. **Quoting.** Any field can contain a comma, a quote or a newline —
 *    addresses and customer notes routinely contain all three.
 * 2. **Formula injection.** A field beginning `=`, `+`, `-`, `@` or a control
 *    character is executed as a formula when the file is opened in Excel,
 *    Sheets or LibreOffice. Every export here contains buyer-supplied text, so
 *    a customer who names themselves `=HYPERLINK("http://evil","refund")` is
 *    writing code that runs on the finance team's laptop. Prefixing a single
 *    quote is the accepted defence: spreadsheets treat the value as text and
 *    hide the quote, and anything reading the CSV as data sees one extra
 *    character rather than a formula.
 */

/** Characters a spreadsheet will interpret as the start of a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''

  let text = String(value)
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`
  }

  // Quote whenever the field could otherwise break the row apart. Doubling the
  // internal quotes is how RFC 4180 escapes them.
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }

  return text
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',')
}

/**
 * A complete document.
 *
 * `\r\n` line endings and a UTF-8 BOM, both for Excel: without the BOM it
 * decodes the file as the system codepage and mangles every non-ASCII name.
 */
export function csvDocument(header: string[], rows: unknown[][]): string {
  const body = [csvRow(header), ...rows.map(csvRow)].join('\r\n')
  return `﻿${body}\r\n`
}

/**
 * Read a CSV document into rows of cells — the symmetric counterpart of the
 * writer above, hand-rolled for the same reasons (a `split(',')` mishandles the
 * exact quoting the writer produces).
 *
 * RFC-4180: quoted fields may contain commas, `\n`/`\r\n`, and `""`-escaped
 * quotes. Tolerates both `\r\n` and bare `\n`, strips a leading UTF-8 BOM, and
 * drops fully blank lines. Note the writer's formula-injection guard (a leading
 * `'`) is intentionally NOT reversed — callers match cells by column, so a value
 * that legitimately starts with `'` is left as the author typed it.
 */
export function csvParse(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  // Flush the final field/row when the file doesn't end in a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}
