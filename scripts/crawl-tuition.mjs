#!/usr/bin/env node
// Crawls the UW graduate tuition Tableau dashboard into a JSON table.
//
// The dashboard draws its dollar figures on a canvas, so they exist only as
// pixels: no DOM text, no accessibility text. This script clicks a fixed set
// of dropdown combinations, screenshots each result, and has a vision model
// read the figures. A reading is kept only if the fee lines add up to the
// grand total shown on the same screen; anything else is recorded as failed.
//
//   node --env-file=.env.local scripts/crawl-tuition.mjs            # all 24 combinations
//   node --env-file=.env.local scripts/crawl-tuition.mjs --limit 2  # quick test
//
// Output: netlify/functions/mcp/tuition-table.json. A person reviews the diff
// before it is merged; the readings are image reads, not source data.

import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DASHBOARD = 'https://tableau.washington.edu/views/Graduate-ProfessionalTuitionandFees/AnnualTuition?%3Aembed=y&%3AapiID=embhost0'
const VISION_MODEL = process.env.GROQ_VISION_MODEL ?? 'qwen/qwen3.8-27b'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'netlify/functions/mcp/tuition-table.json')
const SHOTS = resolve(ROOT, 'screenshots/tuition-crawl')

const CAMPUSES = ['Seattle Campus', 'Bothell Campus', 'Tacoma Campus']
const RESIDENCIES = ['Resident', 'Nonresident']
const LEVELS = ['Masters', 'Doctoral', 'Professional', 'EducationalSpecialist']

const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg === -1 ? Infinity : Number(process.argv[limitArg + 1])

if (!process.env.GROQ_API_KEY) {
  console.error('GROQ_API_KEY is not set')
  process.exit(2)
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function selectFilter(page, title, value) {
  const combo = page
    .locator('.CategoricalFilter', { has: page.locator('.FilterTitle', { hasText: title }) })
    .locator('.tabComboBox')
  if ((await combo.innerText()).trim() === value) return
  await combo.click()
  await page
    .locator('.tabMenuItemName, [role=option]')
    .filter({ hasText: new RegExp(`^${escapeRe(value)}$`) })
    .first()
    .click()
  await page.waitForTimeout(4000) // the viz redraws after every filter change
}

// Tableau shows a filter value in parentheses when it no longer applies to the
// other selections, and the table stays empty until a valid one is chosen.
async function chooseFirstIfStale(page, title) {
  const value = await currentValue(page, title)
  if (!/^\(.*\)$/.test(value) || value === '(All)') return
  const combo = page
    .locator('.CategoricalFilter', { has: page.locator('.FilterTitle', { hasText: title }) })
    .locator('.tabComboBox')
  await combo.click()
  const first = page.locator('.tabMenuItemName, [role=option]').first()
  try {
    await first.waitFor({ timeout: 4000 })
  } catch {
    // Tableau shows "No Items." when nothing exists for this campus and level.
    throw new NoData(`${title} has no options for this selection`)
  }
  await first.click()
  await page.waitForTimeout(4000)
}

class NoData extends Error {}

async function currentValue(page, title) {
  return (await page
    .locator('.CategoricalFilter', { has: page.locator('.FilterTitle', { hasText: title }) })
    .locator('.tabComboBox')
    .innerText()).trim()
}

const PROMPT = `This is a screenshot of a tuition dashboard. Read the "ANNUAL FEE BREAKDOWN" table.
Reply with JSON only, no prose, in exactly this shape:
{"year":"2026-2027","category":"<the column heading above the amounts>","fees":{"<Fee Name>":<integer dollars>},"grandTotal":<integer dollars>}
"fees" must list every fee row above "Grand Total", using the fee names exactly as printed.
If the table is empty or you cannot read a figure, reply {"error":"<why>"}.`

async function readScreenshot(png) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${png.toString('base64')}` } },
          ],
        }],
      }),
    })
    if (res.status === 429) {
      const waitS = Math.min(Number(res.headers.get('retry-after')) || 20, 60) + 1
      console.error(`  [rate limited, waiting ${waitS}s]`)
      await new Promise(r => setTimeout(r, waitS * 1000))
      continue
    }
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const text = (await res.json()).choices[0].message.content ?? ''
    const json = text.match(/\{[\s\S]*\}/)
    if (!json) throw new Error(`no JSON in model reply: ${text.slice(0, 200)}`)
    return JSON.parse(json[0])
  }
  throw new Error('still rate limited after 5 attempts')
}

// The only check available: the screen states its own total, so a misread
// digit in any line breaks the sum.
function verify(reading) {
  if (reading.error) return `model could not read it: ${reading.error}`
  const amounts = Object.values(reading.fees ?? {})
  if (amounts.length === 0) return 'no fee rows read'
  if (!amounts.every(Number.isInteger) || !Number.isInteger(reading.grandTotal)) return 'non-integer amount'
  const sum = amounts.reduce((a, b) => a + b, 0)
  if (sum !== reading.grandTotal) return `fees sum to ${sum}, screen total reads ${reading.grandTotal}`
  return null
}

const combos = []
for (const campus of CAMPUSES) for (const residency of RESIDENCIES) for (const level of LEVELS) {
  combos.push({ campus, residency, level })
}

mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch()
// 2x rendering: at 1x the vision model misreads single digits in the fee column.
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 })
page.setDefaultTimeout(15000)

async function loadDashboard() {
  await page.goto(DASHBOARD, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByText('Select Campus').first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(4000)
  // The dashboard dims every row but one to pale grey. Darken before raising
  // contrast, or the pale figures clip to white and disappear.
  await page.addStyleTag({ content: 'canvas { filter: grayscale(1) brightness(0.6) contrast(4); }' })
}
await loadDashboard()

// Category row plus the fee table, without the filters and footnotes.
const TABLE_CLIP = { x: 130, y: 250, width: 1140, height: 420 }

const rows = []
for (const combo of combos.slice(0, LIMIT)) {
  const label = `${combo.campus} / ${combo.residency} / ${combo.level}`
  const row = { ...combo, status: 'failed' }
  try {
    // Start every row from the dashboard's default state, so which program a
    // row lands on never depends on what the previous row left selected.
    if (rows.length > 0) await loadDashboard()
    await selectFilter(page, 'Select Campus', combo.campus)
    await selectFilter(page, 'Select Residency', combo.residency)
    await selectFilter(page, 'Select Student Level', combo.level)
    await chooseFirstIfStale(page, 'Select Graduate Program')
    await chooseFirstIfStale(page, 'Select TAs and RAs Receiving Waivers')
    row.program = await currentValue(page, 'Select Graduate Program')
    row.waivers = await currentValue(page, 'Select TAs and RAs Receiving Waivers')

    const png = await page.screenshot({ clip: TABLE_CLIP })
    const file = `${combo.campus}-${combo.residency}-${combo.level}.png`.replace(/\s+/g, '_')
    writeFileSync(resolve(SHOTS, file), png)
    row.screenshot = `screenshots/tuition-crawl/${file}`

    const reading = await readScreenshot(png)
    const problem = verify(reading)
    if (problem) {
      row.reason = problem
      row.rawReading = reading
    } else {
      Object.assign(row, { status: 'ok', year: reading.year, category: reading.category, fees: reading.fees, grandTotal: reading.grandTotal })
    }
  } catch (err) {
    if (err instanceof NoData) row.status = 'no-data'
    row.reason = err instanceof Error ? err.message.split('\n')[0] : String(err)
    // A half-open dropdown would break every following row; record the state and start clean.
    const file = `FAILED-${combo.campus}-${combo.residency}-${combo.level}.png`.replace(/\s+/g, '_')
    await page.screenshot({ path: resolve(SHOTS, file) }).catch(() => {})
    await loadDashboard().catch(() => {})
  }
  console.error(`${row.status.padEnd(7)} ${label}${row.status === 'ok' ? `  $${row.grandTotal}` : `  (${row.reason})`}`)
  rows.push(row)
}
await browser.close()

const table = {
  source: DASHBOARD,
  crawledAt: new Date().toISOString(),
  method: `screenshot read by ${VISION_MODEL}; kept only when fee lines sum to the on-screen total`,
  rows,
}
writeFileSync(OUT, JSON.stringify(table, null, 2) + '\n')
const count = status => rows.filter(r => r.status === status).length
console.error(`\n${count('ok')} read, ${count('no-data')} with no data, ${count('failed')} failed -> ${OUT}`)
process.exit(count('failed') === 0 ? 0 : 1)
