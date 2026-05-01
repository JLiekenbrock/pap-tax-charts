import { describe, it, expect } from 'vitest'
import { calculatePapResultFromRE4 } from './pap'
// runtimeRequire uses indirect eval to retrieve the CommonJS `require` at runtime only
// (avoids TS/ESM compile-time errors). Previously this code attempted to call
// `require()` with no arguments which resulted in `require(undefined)` and the
// TypeError seen during tests. Instead fetch the `require` function and call it
// with the requested module id.
const runtimeRequire = (name: string) => {
  const r = eval('typeof require !== "undefined" ? require : null')
  if (!r) return null
  return r.call(null, name)
}
const child_process = runtimeRequire('child_process')
const spawnSync = child_process ? child_process.spawnSync : null
const path = runtimeRequire('path')
const os = runtimeRequire('os')

// Declare `process` for TypeScript so we can read process.env reliably in the test runner.
declare const process: any

// Opt-in test: run only when BMF_TEST=1 in environment. To use the local Java CLI instead
// set LOHSERVICE=1 (and ensure the lohnpap-local.jar + LoService.class are available under tools/lohnservice).
// Example (PowerShell):
// $env:BMF_TEST='1'; $env:LOHSERVICE='1'; npm test
const env = typeof process !== 'undefined' && process.env ? process.env : {}
const bmfEnv = env.BMF_TEST === '1'
const useLocal = env.LOHSERVICE === '1'

// Always allow the test file to be collected by Vitest. The expensive operations
// (remote BMF fetch and local LoService spawn) are gated by `bmfEnv` and
// `useLocal` respectively, so leaving the describe active is safe for normal
// development runs. This avoids "No test files found" when the env flags are
// not set.
const maybeDescribe = describe

// Matrix of incomes (euros) and tax classes to probe. RE4 is encoded as cents for the BMF interface.
const incomes = [20000, 40000, 60000, 100000]
const stklList = [1, 2, 3, 4]

const JAVA_CMD = env.LOHSERVICE_JAVA_CMD || 'java'
// compute jar path relative to repository root (process.cwd() should be project root in tests)
const jarPath = path.resolve(process.cwd(), 'tools', 'lohnservice', 'lohnpap-local.jar')
const isWin = (os && os.platform ? os.platform() : process.platform) === 'win32'
const classpathSep = isWin ? ';' : ':'
const reField = (name: string) => new RegExp(`<ausgabe[^>]*name="${name}"[^>]*value="([^"]+)"`, 'i')
const parseCents = (raw?: RegExpMatchArray | null) => {
  if (!raw) return null
  const v = raw[1]
  const cleaned = String(v).replace(/[^0-9\-]/g, '')
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

maybeDescribe('BMF parity harness (matrix of RE4 x STKL)', () => {
  it('fetches VFRB/WVFRB/LST and compares intermediate values to our helpers', async () => {
    const results: Array<any> = []

    for (const income of incomes) {
      for (const stkl of stklList) {
        const re4 = income * 100 // BMF/LoService expects cents
        const zkf = 0

        // We'll fetch the official BMF endpoint when enabled (bmfEnv). If LOHSERVICE is set,
        // also invoke the local LoService CLI and parse both outputs so we can compare.
        let remoteText: string | null = null
        let localText: string | null = null

        let bmfVfrbRemote: number | null = null
        let bmfWvfrbRemote: number | null = null
        let bmfTaxRemote: number | null = null

        let bmfVfrbLocal: number | null = null
        let bmfWvfrbLocal: number | null = null
        let bmfTaxLocal: number | null = null

        // HTTP wrapper results (if LOHSERVICE_HTTP=1 and server is running)
        let bmfVfrbHttp: number | null = null
        let bmfWvfrbHttp: number | null = null
        let bmfTaxHttp: number | null = null

        if (bmfEnv) {
          const url = `https://www.bmf-steuerrechner.de/interface/2026Version1.xhtml?code=LSt2026ext&LZZ=1&RE4=${re4}&STKL=${stkl}&ZKF=${zkf}`
          const res = await fetch(url)
          remoteText = await res.text()
        }

        if (useLocal && spawnSync) {
          // Ensure the classpath includes the rebuilt PAP jar and the directory
          // containing the LoService.class so Java can locate the LoService main
          // class. The tools/lohnservice directory is where we keep the wrapper
          // class and local jar.
          const toolsDir = path.resolve(process.cwd(), 'tools', 'lohnservice')
          const cp = `${jarPath}${classpathSep}${toolsDir}`
          const args = ['-cp', cp, 'LoService', String(re4), String(stkl), String(zkf)]
          const ev = spawnSync(JAVA_CMD, args, { encoding: 'utf8', windowsHide: true, timeout: 15000 })
          if (ev.error) {
            console.error('LoService spawn error', ev.error)
            localText = null
          } else if (ev.status !== 0) {
            console.error('LoService exit', ev.status, ev.stderr)
            localText = ev.stdout || ''
          } else {
            localText = ev.stdout
          }
        }

        // Optionally call a local HTTP wrapper (LoServiceServer) if requested.
        // Start the server separately; the test will attempt to fetch from it.
        if (env.LOHSERVICE_HTTP === '1') {
          try {
            const url = `http://localhost:${env.LOHSERVICE_HTTP_PORT || '8081'}/calc?re4=${re4}&stkl=${stkl}&zkf=${zkf}`
            const res = await fetch(url)
            const text = await res.text()
            bmfVfrbHttp = parseField(text, 'VFRB')
            bmfWvfrbHttp = parseField(text, 'WVFRB')
            bmfTaxHttp = parseField(text, 'LSTJAHR', 'LSTLZZ')
          } catch (e) {
            console.error('HTTP LoService fetch failed', e)
          }
        }

        if (remoteText) {
          bmfVfrbRemote = parseField(remoteText, 'VFRB')
          bmfWvfrbRemote = parseField(remoteText, 'WVFRB')
          bmfTaxRemote = parseField(remoteText, 'LSTJAHR', 'LSTLZZ')
        }

        if (localText) {
          bmfVfrbLocal = parseField(localText, 'VFRB')
          bmfWvfrbLocal = parseField(localText, 'WVFRB')
          bmfTaxLocal = parseField(localText, 'LSTJAHR', 'LSTLZZ')
        }

        // compute our equivalents using the local TypeScript PAP path (inputs in euros)
        const our = calculatePapResultFromRE4(income, { year: 2026, filing: 'single', children: 0, stkl: stkl as any, solidarity: false, churchRate: 0 })

        results.push({
          income,
          stkl,
          bmfVfrbRemote,
          bmfWvfrbRemote,
          bmfTaxRemote,
          bmfVfrbLocal,
          bmfWvfrbLocal,
          bmfTaxLocal,
          bmfVfrbHttp,
          bmfWvfrbHttp,
          bmfTaxHttp,
          ourVfrb: our.vfrb,
          ourWvfrb: our.wvfrb,
          ourZtabfb: our.ztabfb,
          ourVsp: our.vsp,
          ourZre4vp: our.zre4vp,
          ourVspRenten: our.vspRenten,
          ourVspKrankenPflege: our.vspKrankenPflege,
          ourVspArbeitslosen: our.vspArbeitslosen,
          ourVsphb: our.vsphb,
          ourVspn: our.vspn,
          ourZve: our.zve,
          ourBaseTax: our.baseTax,
          ourSolz: our.solz,
          ourChurch: our.church,
          ourTax: our.tax,
        })
      }
    }

    // Print a compact summary to the test output. Vitest captures console output; this is helpful when run with BMF_TEST=1.
    console.table(results)

    // Save results as CSV for offline analysis (if fs is available)
    try {
      const fs = runtimeRequire('fs')
      if (fs) {
        const csvPath = path.resolve(process.cwd(), 'tools', 'lohnservice', 'bmf_comparison.csv')
        const headers = ['income','stkl','bmfVfrbRemote','bmfWvfrbRemote','bmfTaxRemote','bmfVfrbLocal','bmfWvfrbLocal','bmfTaxLocal','bmfVfrbHttp','bmfWvfrbHttp','bmfTaxHttp','ourVfrb','ourWvfrb','ourZtabfb','ourVsp','ourZre4vp','ourVspRenten','ourVspKrankenPflege','ourVspArbeitslosen','ourVsphb','ourVspn','ourZve','ourBaseTax','ourSolz','ourChurch','ourTax']
        const lines = [headers.join(',')]
        for (const r of results) {
          const row = headers.map(h => {
            const v = (r as any)[h]
            if (v === null || typeof v === 'undefined') return ''
            return String(v)
          }).join(',')
          lines.push(row)
        }
        fs.writeFileSync(csvPath, lines.join('\n'), { encoding: 'utf8' })
        console.log('Saved CSV to', csvPath)
      } else {
        console.log('fs not available; skipping CSV write')
      }
    } catch (e) {
      console.error('Failed to write CSV', e)
    }

    // Basic assertions: ensure remote/local tax values are numbers or null (if that source wasn't used)
    // and ourTax is a number.
    for (const r of results) {
      expect(r.bmfTaxRemote === null || typeof r.bmfTaxRemote === 'number').toBe(true)
      expect(r.bmfTaxLocal === null || typeof r.bmfTaxLocal === 'number').toBe(true)
      expect(typeof r.ourTax).toBe('number')
    }
  }, 60000)
})
