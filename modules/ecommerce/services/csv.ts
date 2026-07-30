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
