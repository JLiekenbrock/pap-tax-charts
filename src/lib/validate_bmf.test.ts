import { describe, it, expect } from 'vitest'
import { calculatePapResultFromRE4 } from './pap'

// runtimeRequire uses an indirect eval to retrieve the CommonJS `require` at
// runtime only (avoids TS/ESM compile-time errors). Returns null when running
// in a pure ESM environment.
const runtimeRequire = (name: string) => {
  const r = eval('typeof require !== "undefined" ? require : null')
  if (!r) return null
  return r.call(null, name)
}
const child_process = runtimeRequire('child_process')
const spawnSync = child_process ? child_process.spawnSync : null
const path = runtimeRequire('path')
const os = runtimeRequire('os')
const fs = runtimeRequire('fs')

declare const process: any

// PAP parity test against the official Lohnsteuerrechner reference. This
// guards the heart of the app — `calculatePapResultFromRE4` — from silent
// regressions vs. bmf-steuerrechner.de.
//
// Defaults to running the remote BMF parity check on every `npm test`. If
// the network is unavailable the test cleanly *skips* with a warning rather
// than failing, so offline development still works.
//
// Override via env:
//   BMF_SKIP=1        — disable parity entirely (fastest CI lane)
//   LOHSERVICE=1      — use the local Java LoService CLI instead (jar in tools/)
//   LOHSERVICE_HTTP=1 — use a locally running LoService HTTP server
//   BMF_TEST=1        — explicit opt-in (no-op when default is on; kept for clarity)
//
// PowerShell:  $env:BMF_SKIP='1'; npm test
//
// Remote BMF only covers **2025** and **2026** (`/interface/2025Version1.xhtml` …).
// There is no public **2021** Lohnsteuerrechner endpoint; for **UPTAB 2021** vs Java use
// `pap_java_2021_parity.test.ts` with `PAP_2021_JAR` or `tools/lohnservice/lohnpap-2021.jar`.
const env = typeof process !== 'undefined' && process.env ? process.env : {}
const skipExplicit = env.BMF_SKIP === '1'
const useLocal = env.LOHSERVICE === '1'
const useHttp = env.LOHSERVICE_HTTP === '1'
// Default to the remote BMF endpoint unless the user explicitly opts out
// or has selected a different harness source.
const useRemote = !skipExplicit && !useLocal && !useHttp
const harnessEnabled = useRemote || useLocal || useHttp

const maybeDescribe = harnessEnabled ? describe : describe.skip

/** PAP years exercised against the active harness. Remote BMF exposes 2025 + 2026; local LoService jar is 2026-only. */
const papYearsForHarness: readonly number[] = useRemote ? [2025, 2026] : [2026]

/** BMF `/interface/{X}Version1.xhtml` segment: selects which PAP the server uses (same `code=LSt2026ext` for both). */
function bmfInterfaceVersion(papYear: number): string {
  if (papYear === 2025) return '2025Version1'
  if (papYear === 2026) return '2026Version1'
  throw new Error(`No BMF interface mapping for PAP year ${papYear}`)
}

// Matrix of incomes (euros) and tax classes to probe. RE4 is encoded as cents
// for the BMF interface. Keep the matrix small to stay within polite
// rate-limits when hitting the official endpoint.
const incomes = [20000, 40000, 60000, 100000]
const stklList: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4]

const JAVA_CMD = env.LOHSERVICE_JAVA_CMD || 'java'
const jarPath = path && process ? path.resolve(process.cwd(), 'tools', 'lohnservice', 'lohnpap-local.jar') : ''
const isWin = (os && os.platform ? os.platform() : process.platform) === 'win32'
const classpathSep = isWin ? ';' : ':'

const reField = (name: string) => new RegExp(`<ausgabe[^>]*name="${name}"[^>]*value="([^"]+)"`, 'i')
const parseCents = (raw?: RegExpMatchArray | null) => {
  if (!raw) return null
  const cleaned = String(raw[1]).replace(/[^0-9\-]/g, '')
  if (!cleaned || cleaned === '-') return null
  const n = Number(cleaned)
  if (Number.isNaN(n)) return null
  return Math.round(n / 100)
}
const parseField = (text: string, name: string, fallbackName?: string) => {
  const value = parseCents(text.match(reField(name)))
  if (value !== null || !fallbackName) return value
  return parseCents(text.match(reField(fallbackName)))
}

type ParityRow = {
  income: number
  stkl: number
  source: 'bmf-remote' | 'lohnservice-local' | 'lohnservice-http'
  bmfVfrb: number | null
  bmfWvfrb: number | null
  bmfTax: number | null
  ourVfrb: number
  ourWvfrb: number
  ourBaseTax: number
  ourTax: number
}

// Single fetch with a per-call timeout so a hanging BMF endpoint cannot
// stall the whole test run. Returns null if the request fails for any
// reason (offline, timeout, 5xx) so the caller can skip the test.
async function safeFetch(url: string, timeoutMs = 5000): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) return null
      return await res.text()
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

for (const papYear of papYearsForHarness) {
  maybeDescribe(`PAP parity vs. BMF reference (matrix of RE4 x STKL, year ${papYear})`, () => {
    it('matches BMF VFRB / WVFRB / annual tax to within 1 EUR for every (income, stkl) pair', async (ctx) => {
      const rows: ParityRow[] = []

      for (const income of incomes) {
        for (const stkl of stklList) {
          const re4 = income * 100
          const zkf = 0

          // Choose a single source per row, with priority remote > http > local.
          // Whichever of those three is enabled provides the reference values
          // we compare against. We deliberately do *not* mix sources to keep
          // assertion semantics unambiguous when several harnesses are on.
          let source: ParityRow['source'] | null = null
          let referenceText: string | null = null

          if (useRemote) {
            source = 'bmf-remote'
            const iface = bmfInterfaceVersion(papYear)
            const url = `https://www.bmf-steuerrechner.de/interface/${iface}.xhtml?code=LSt2026ext&LZZ=1&RE4=${re4}&STKL=${stkl}&ZKF=${zkf}`
            referenceText = await safeFetch(url)
            if (referenceText === null) {
              // Network down / BMF unreachable — degrade gracefully instead of
              // failing the whole test suite on offline machines.
              console.warn('[BMF parity] skipping: bmf-steuerrechner.de unreachable. Set BMF_SKIP=1 to silence this warning.')
              ctx.skip()
              return
            }
          } else if (useHttp) {
            source = 'lohnservice-http'
            const port = env.LOHSERVICE_HTTP_PORT || '8081'
            referenceText = await safeFetch(`http://localhost:${port}/calc?re4=${re4}&stkl=${stkl}&zkf=${zkf}`)
            if (referenceText === null) {
              console.warn(`[BMF parity] skipping: local LoService HTTP server on port ${port} unreachable.`)
              ctx.skip()
              return
            }
          } else if (useLocal && spawnSync) {
            source = 'lohnservice-local'
            const toolsDir = path.resolve(process.cwd(), 'tools', 'lohnservice')
            const cp = `${jarPath}${classpathSep}${toolsDir}`
            const args = ['-cp', cp, 'LoService', String(re4), String(stkl), String(zkf)]
            const ev = spawnSync(JAVA_CMD, args, { encoding: 'utf8', windowsHide: true, timeout: 15000 })
            if (ev.error) throw new Error(`LoService spawn error: ${ev.error}`)
            if (ev.status !== 0) throw new Error(`LoService exited ${ev.status}: ${ev.stderr}`)
            referenceText = ev.stdout
          }

        if (!source || !referenceText) {
          throw new Error('No parity source produced output (this should not happen with harnessEnabled)')
        }

        const bmfVfrb = parseField(referenceText, 'VFRB')
        const bmfWvfrb = parseField(referenceText, 'WVFRB')
        const bmfTax = parseField(referenceText, 'LSTJAHR', 'LSTLZZ')

        const our = calculatePapResultFromRE4(income, {
          year: papYear,
          filing: 'single',
          children: 0,
          stkl,
          solidarity: false,
          churchRate: 0,
          investmentIncome: 0,
        })

        rows.push({
          income, stkl, source,
          bmfVfrb, bmfWvfrb, bmfTax,
          ourVfrb: our.vfrb,
          ourWvfrb: our.wvfrb,
          ourBaseTax: our.baseTax,
          ourTax: our.tax,
        })

        // Tight per-field assertions. ±1 EUR tolerates harmless cent-level
        // rounding differences between BMF integer-cent path and ours.
        if (bmfVfrb !== null) {
          expect(our.vfrb, `VFRB mismatch at year=${papYear}, income=${income}, stkl=${stkl}`).toBe(bmfVfrb)
        }
        if (bmfWvfrb !== null) {
          expect(our.wvfrb, `WVFRB mismatch at year=${papYear}, income=${income}, stkl=${stkl}`).toBe(bmfWvfrb)
        }
        if (bmfTax !== null) {
          // BMF returns the *annual income tax* (LSTJAHR). With solidarity=off
          // and church=0 in our settings, our `tax` equals our `baseTax`
          // (no soli, no church, no capital-gains). Use ±1 EUR tolerance.
          const diff = Math.abs(our.tax - bmfTax)
          expect(diff, `tax mismatch at year=${papYear}, income=${income}, stkl=${stkl}: ours=${our.tax}, bmf=${bmfTax}, diff=${diff}`).toBeLessThanOrEqual(1)
        }
        }
      }

      // Side-effects (table dump + CSV) are only useful as audit artifacts
      // when the harness was actually run, hence guarded by `harnessEnabled`.
      if (harnessEnabled) {
        console.table(rows)
        try {
          if (fs && path && process) {
            const csvPath = path.resolve(process.cwd(), 'tools', 'lohnservice', `bmf_comparison_${papYear}.csv`)
            const headers = ['income', 'stkl', 'source', 'bmfVfrb', 'bmfWvfrb', 'bmfTax', 'ourVfrb', 'ourWvfrb', 'ourBaseTax', 'ourTax']
            const lines = [headers.join(',')]
            for (const r of rows) {
              lines.push(headers.map((h) => {
                const v = (r as any)[h]
                return v === null || typeof v === 'undefined' ? '' : String(v)
              }).join(','))
            }
            fs.writeFileSync(csvPath, lines.join('\n'), { encoding: 'utf8' })
          }
        } catch (e) {
          console.error('Failed to write parity CSV', e)
        }
      }
    }, 60000)
  })
}
