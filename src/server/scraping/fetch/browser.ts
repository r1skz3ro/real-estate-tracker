import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright'
import { UA } from './http'
import type { Browser, BrowserContext } from 'playwright'

const STATE_FILE = 'data/browser-state.json'

let browser: Browser | null = null
let context: BrowserContext | null = null

async function getContext() {
  if (context) return context
  browser ??= await chromium.launch()
  context = await browser.newContext({
    userAgent: UA,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    viewport: { width: 1440, height: 900 },
    // Reloading cookies makes OLX see a returning visitor rather than a fresh one every 12 hours.
    storageState: existsSync(STATE_FILE) ? STATE_FILE : undefined,
  })
  return context
}

export async function browserFetch(url: string, waitFor?: string) {
  const page = await (await getContext()).newPage()
  try {
    const res = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    if (waitFor)
      await page
        .waitForSelector(waitFor, { timeout: 15_000 })
        .catch(() => page.waitForTimeout(2_000))
    return {
      html: await page.content(),
      status: res?.status() ?? 0,
      url: page.url(),
    }
  } finally {
    // The page goes, the context stays — that is where the cookies live.
    await page.close()
  }
}

export async function closeBrowser() {
  if (context) {
    mkdirSync('data', { recursive: true })
    await context.storageState({ path: STATE_FILE })
    await context.close()
  }
  await browser?.close()
  context = null
  browser = null
}
