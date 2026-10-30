// 어댑터 템플릿: 실제 뮬 DOM/검색 파라미터 검증 전에는 실행할 수 없다.
// Node.js 22+, npm install playwright; npx playwright install chromium
// 준비된 검색 URL 목록을 순차 방문해 원시 후보를 JSON으로 출력한다.
// 모델 매칭, DB upsert, Redis 갱신, 스케줄링은 기술 문서에 명시한 후속 작업이다.
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

if (process.env.MULE_COLLECTION_ENABLED !== 'true') {
  throw new Error('Collection disabled: enable only after access-policy and adapter review');
}
const config = JSON.parse(await readFile(process.env.MULE_ADAPTER_CONFIG ?? '', 'utf8'));
const requiredSelectors = ['ready', 'row', 'link', 'title', 'price', 'status', 'empty', 'blocked'];
if (!Array.isArray(config.searchUrls) || config.searchUrls.length === 0 ||
    config.searchUrls.length > 3 || !config.parserVersion || !config.userAgent ||
    !requiredSelectors.every(key => typeof config.selectors?.[key] === 'string' &&
      config.selectors[key].trim())) throw new Error('Incomplete adapter config');
const allowedHost = 'www.mule.co.kr';
const checkUrl = value => {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.hostname !== allowedHost || u.port || u.username || u.password) {
    throw new Error('Unexpected URL');
  }
  return u;
};
config.searchUrls.forEach(checkUrl);
if (!config.listingIdParam) throw new Error('Verified listingIdParam required');

const browser = await chromium.launch({ headless: true });
const results = new Map();
try {
  const context = await browser.newContext({
    userAgent: config.userAgent, // 서비스명/연락처가 포함된 정직한 UA
    locale: 'ko-KR', timezoneId: 'Asia/Seoul',
  });
  // 예제는 동일 호스트 탐색만 허용. 실제 배포에서는 egress allowlist도 적용.
  await context.route('**/*', async route => {
    const request = route.request();
    if (request.isNavigationRequest()) {
      try { checkUrl(request.url()); } catch { await route.abort(); return; }
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  for (const url of config.searchUrls) {
    // page 요청 간 부하 조절 예시. 운영에서는 모든 워커에 공유되는 host limiter 적용.
    await delay(5000 + Math.floor(Math.random() * 3000));
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!response) throw new Error('No document response');
    if ([401, 403, 429].includes(response.status())) {
      throw new Error(`SOURCE_BLOCKED:${response.status()}:retry-after=${response.headers()['retry-after'] ?? ''}`);
    }
    if (!response.ok()) throw new Error(`HTTP_${response.status()}`);
    checkUrl(page.url());
    const s = config.selectors;
    await page.waitForSelector(`${s.ready}, ${s.empty}, ${s.blocked}`, { state: 'visible' });
    if (await page.locator(s.blocked).count()) throw new Error('SOURCE_BLOCKED:challenge');
    const rows = await page.locator(s.row).evaluateAll((nodes, selectors) => nodes.map(node => ({
      href: node.querySelector(selectors.link)?.getAttribute('href') ?? '',
      title: node.querySelector(selectors.title)?.textContent?.trim() ?? '',
      rawPrice: node.querySelector(selectors.price)?.textContent?.trim() ?? '',
      rawStatus: node.querySelector(selectors.status)?.textContent?.trim() ?? '',
    })), s);
    if (!rows.length && !(await page.locator(s.empty).count())) {
      throw new Error('PARSER_DRIFT:zero rows without verified empty marker');
    }
    for (const row of rows) {
      if (!row.href || !row.title) throw new Error('PARSER_DRIFT:missing title/url');
      const listingUrl = checkUrl(new URL(row.href, page.url()).href);
      const sourceListingId = listingUrl.searchParams.get(config.listingIdParam);
      if (!sourceListingId) throw new Error('PARSER_DRIFT:missing source ID');
      // 제목 숫자는 가격으로 파싱하지 않는다. 구조화된 가격 셀만 보수적으로 처리.
      const priceText = row.rawPrice.replace(/\s+/g, '').replace(/원$/, '');
      const numeric = /^(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(priceText)
        ? Number(priceText.replaceAll(',', '')) : null;
      const priceKrw = Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
      const normalizedStatus = row.rawStatus.normalize('NFKC').replace(/\s+/g, '');
      const saleStatus = config.statusMap?.[normalizedStatus] ?? 'unknown';
      if (!['active', 'reserved', 'sold', 'deleted', 'unknown'].includes(saleStatus)) {
        throw new Error('Invalid statusMap');
      }
      results.set(sourceListingId, {
        sourceListingId, title: row.title, listingUrl: listingUrl.href,
        priceKrw, rawPrice: row.rawPrice, saleStatus,
        observedAt: new Date().toISOString(), parserVersion: config.parserVersion,
      });
    }
  }
  // 중간 페이지 실패 시 전체 배치를 게시하지 않는다.
  console.log(JSON.stringify({ candidates: [...results.values()] }, null, 2));
} finally {
  await browser.close();
}
