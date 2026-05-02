/**
 * Opt-in parity: TypeScript {@link calculatePapResultFromRE4} (year 2021) vs **local Java**
 * (`tools/lohnservice/LoService.java`), using the same multi-year `Lohnsteuer.getInstance(Date)` selection as the
 * codegen under `lohnsteuer/.../pap/Lohnsteuer2021.java`.
 *
 * **`LoService`** accepts an optional **4th argument `papYear`** (here `2021`) so the factory returns
 * `Lohnsteuer2021` instead of the current calendar year’s class.
 *
 * Default JAR path matches `validate_bmf.test.ts`: `tools/lohnservice/lohnpap-local.jar`. Override with **`PAP_JAVA_JAR`**
 * Without **`java`** on `PATH`, or without the JAR, Vitest **skips** this file.
 *
 * Recompile the CLI after editing: `javac -encoding UTF-8 tools/lohnservice/LoService.java`
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'
import { calculatePapResultFromRE4 } from './pap'

const JAVA_CMD = process.env.LOHSERVICE_JAVA_CMD || 'java'

const cwd = process.cwd()
const defaultJarPath = path.join(cwd, 'tools', 'lohnservice', 'lohnpap-local.jar')
const jarPath = process.env.PAP_JAVA_JAR || process.env.PAP_2021_JAR || defaultJarPath
const jarsOk = jarPath.length > 0 && fs.existsSync(jarPath)

const isWin = os.platform() === 'win32'
const classpathSep = isWin ? ';' : ':'

const reField = (name: string) => new RegExp(`<ausgabe[^>]*name="${name}"[^>]*value="([^"]+)"`, 'i')
const parseCentsToEur = (raw?: RegExpMatchArray | null) => {
  if (!raw) return null
  const cleaned = String(raw[1]).replace(/[^0-9\-]/g, '')
  if (!cleaned || cleaned === '-') return null
  const n = Number(cleaned)
  if (Number.isNaN(n)) return null
  return Math.round(n / 100)
}

const parseField = (text: string, name: string, fallbackName?: string) => {
  const value = parseCentsToEur(text.match(reField(name)))
  if (value !== null || !fallbackName) return value
  return parseCentsToEur(text.match(reField(fallbackName)))
}

const incomes = [20_000, 40_000, 60_000, 100_000]
const stklList: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4]

const javaProbe = spawnSync(JAVA_CMD, ['-version'], { encoding: 'utf8', windowsHide: true })
const javaOk = javaProbe.error == null && javaProbe.signal == null

const harnessOk = jarsOk && javaOk

describe.skipIf(!harnessOk)('PAP 2021 — TypeScript vs local Java LoService', () => {
  it('matches LSTJAHR / VFRB / WVFRB to within 1 EUR (small matrix)', () => {
    const toolsDir = path.join(cwd, 'tools', 'lohnservice')
    const cp = `${jarPath}${classpathSep}${toolsDir}`

    for (const income of incomes) {
      for (const stkl of stklList) {
        const re4 = income * 100
        const zkf = 0
        const ev = spawnSync(
          JAVA_CMD,
          ['-cp', cp, 'LoService', String(re4), String(stkl), String(zkf), '2021'],
          {
          encoding: 'utf8',
          windowsHide: true,
            timeout: 20_000,
          },
        )
        if (ev.error) throw ev.error
        expect(ev.status, `year=2021 income=${income} stkl=${stkl}: ${ev.stderr}`).toBe(0)

        const ref = ev.stdout
        const javaVfrb = parseField(ref, 'VFRB')
        const javaWvfrb = parseField(ref, 'WVFRB')
        const javaTax = parseField(ref, 'LSTJAHR', 'LSTLZZ')

        const our = calculatePapResultFromRE4(income, {
          year: 2021,
          filing: 'single',
          children: 0,
          stkl,
          solidarity: false,
          churchRate: 0,
          investmentIncome: 0,
        })

        if (javaVfrb !== null) {
          expect(our.vfrb, `VFRB income=${income} stkl=${stkl}`).toBe(javaVfrb)
        }
        if (javaWvfrb !== null) {
          expect(our.wvfrb, `WVFRB income=${income} stkl=${stkl}`).toBe(javaWvfrb)
        }
        if (javaTax !== null) {
          const diff = Math.abs(our.tax - javaTax)
          expect(
            diff,
            `tax income=${income} stkl=${stkl}: ours=${our.tax} java=${javaTax}`,
          ).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})
