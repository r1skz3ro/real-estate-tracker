export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

const HEADERS = {
  'user-agent': UA,
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'accept-language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
  'sec-ch-ua':
    '"Chromium";v="141", "Not?A_Brand";v="24", "Google Chrome";v="141"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
}

export type FetchResult = {
  ok: boolean
  status: number
  html: string
  blocked: boolean
}

const CHALLENGE = /Request blocked|captcha|cf-browser-verification|DataDome/i

// Real search pages ship recaptcha keys, so the marker regex alone false-positives on three of the
// five portals (measured against fixtures/raw). Block pages are tiny — the observed CloudFront one
// is ~900 bytes — so the size gate is what makes the marker usable at all.
const MAX_CHALLENGE_BYTES = 20_000

export async function httpFetch(url: string): Promise<FetchResult> {
  const res = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(25_000),
  })
  const html = await res.text()
  const blocked =
    [403, 429, 503].includes(res.status) ||
    (html.length < MAX_CHALLENGE_BYTES && CHALLENGE.test(html))
  return { ok: res.ok, status: res.status, html, blocked }
}
