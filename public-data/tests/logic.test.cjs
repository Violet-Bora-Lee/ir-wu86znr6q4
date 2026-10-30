'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let logic = {};
try { logic = require('../logic.js'); } catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}
const item = (overrides = {}) => ({
  id: 'test-only', title: '테스트 전용 공고', type: 'hackathon', organizer: '테스트 기관',
  summary: '공공데이터 활용', publicDataRelevance: '공공데이터 필수',
  eligibility: '누구나', region: '전국', benefits: ['멘토링'],
  applicationStart: '2026-10-01', deadline: '2026-10-30', deadlineTime: null,
  eventDate: '원문 확인', sourceUrl: 'https://example.org/notice', sourceType: 'official',
  sourceTitle: '테스트 공식 원문', verifiedAt: '2026-10-30T00:00:00Z', notes: [],
  statusAtVerification: 'open', ...overrides
});

test('KST 자정 이후에는 날짜가 지난 공고를 종료로 판정한다', () => {
  assert.equal(typeof logic.getStatus, 'function', 'getStatus must be implemented');
  assert.equal(logic.getStatus(item(), '2026-10-30T15:00:00Z').code, 'closed');
});

test('마감 정밀도에 맞춰 KST 시각 경계와 당일 시간미상을 구분한다', () => {
  const exact = item({ deadlineTime: '14:00' });
  assert.equal(logic.getStatus(exact, '2026-10-30T04:59:59Z').code, 'open');
  assert.equal(logic.getStatus(exact, '2026-10-30T05:00:00Z').code, 'closed');
  const dateOnly = logic.getStatus(item(), '2026-10-30T04:00:00Z');
  assert.equal(dateOnly.code, 'unknown');
  assert.match(dateOnly.label, /마감일 당일.*시간 확인/);
});

test('원문 종료와 불확실한 정보는 미래 마감일이어도 접수중으로 되돌리지 않는다', () => {
  const now = '2026-10-30T04:00:00Z';
  const future = { deadline: '2026-11-30' };
  assert.equal(logic.getStatus(item({ ...future, statusAtVerification: 'closed' }), now).code, 'closed');
  assert.equal(logic.getStatus(item({ ...future, statusAtVerification: 'unknown' }), now).code, 'unknown');
  assert.equal(logic.getStatus(item({ deadline: null }), now).code, 'unknown');
  assert.equal(logic.getStatus(item({ ...future, applicationStart: '2026-11-01' }), now).code, 'unknown');
  const old = logic.getStatus(item({ ...future, verifiedAt: '2026-10-23T03:59:59Z' }), now);
  assert.equal(old.code, 'unknown');
  assert.equal(old.stale, true);
  assert.match(old.label, /오래된 확인/);
  assert.equal(logic.getStatus(item({ ...future, verifiedAt: '2026-10-23T04:00:00Z' }), now).code, 'open');
  assert.equal(logic.getStatus(item({ ...future, verifiedAt: 'not-a-date' }), now).code, 'unknown');
  assert.equal(logic.getStatus(item({ ...future, verifiedAt: '2026-11-01T00:00:00Z' }), now).code, 'unknown');
});

test('탐색은 기본 종료숨김·유형·공공데이터 검색·마감순과 실제 개수를 함께 계산한다', () => {
  assert.equal(typeof logic.explore, 'function', 'explore must be implemented');
  const rows = [
    item({ id: 'later', title: '나중 공고', deadline: '2026-11-10' }),
    item({ id: 'closed', type: 'startup', statusAtVerification: 'closed' }),
    item({ id: 'unknown', type: 'competition', deadline: null, publicDataRelevance: '교통 API' }),
    item({ id: 'first', type: 'startup', deadline: '2026-11-01', organizer: '데이터진흥원' })
  ];
  const now = '2026-10-30T04:00:00Z';
  const result = logic.explore(rows, {}, now);
  assert.equal(result.total, 4);
  assert.equal(result.resultCount, 3);
  assert.equal(result.hiddenClosed, 1);
  assert.deepEqual(result.items.map(row => row.item.id), ['first', 'later', 'unknown']);
  assert.deepEqual(logic.explore(rows, { type: 'startup' }, now).items.map(row => row.item.id), ['first']);
  assert.equal(logic.explore(rows, { query: '교통 api' }, now).resultCount, 1);
  assert.equal(logic.explore(rows, { query: '데이터진흥원' }, now).resultCount, 1);
  assert.equal(logic.explore(rows, { includeClosed: true }, now).resultCount, 4);
  assert.deepEqual(logic.explore(rows, { status: 'closed' }, now).items.map(row => row.item.id), ['closed']);
  assert.deepEqual(logic.explore(rows, { sort: 'verified' }, now).items.map(row => row.item.id), ['later', 'unknown', 'first']);
  assert.equal(rows[0].id, 'later', 'source array must not be mutated');
});

const dataset = (items = [item()]) => ({ schemaVersion: 1, updatedAt: '2026-10-30T00:00:00Z', scopeNote: '테스트 전용 범위', items });
test('공식 데이터 계약을 검증하며 문자열 배열과 빈 목록을 보존한다', () => {
  assert.equal(typeof logic.validateDataset, 'function', 'validateDataset must be implemented');
  assert.equal(logic.validateDataset(dataset()).items[0].id, 'test-only');
  assert.equal(logic.validateDataset(dataset([])).items.length, 0);
  assert.equal(logic.validateDataset(dataset([item({ eligibility: ['학생', '일반인'], benefits: '상금', notes: '원문 확인' })])).items.length, 1);
  assert.equal(logic.validateDataset(dataset([item({ eventDate: null })])).items.length, 1, '부모의 실제 데이터는 행사일 미확인을 null로 제공한다');
  for (const bad of [
    { ...dataset(), schemaVersion: 2 },
    { ...dataset(), updatedAt: '2026-10-30' },
    dataset([item(), item()]),
    dataset([item({ sourceType: 'blog' })]),
    dataset([item({ type: 'ai' })]),
    dataset([item({ deadline: '2026-02-31' })]),
    dataset([item({ deadlineTime: '25:00' })]),
    dataset([item({ benefits: { html: 'no' } })])
  ]) assert.throws(() => logic.validateDataset(bad), /데이터/);
});

test('링크는 자격증명 없는 절대 HTTP(S)만 허용하고 원래 문자열을 보존한다', () => {
  assert.equal(typeof logic.safeUrl, 'function', 'safeUrl must be implemented');
  for (const url of ['https://example.org/공고?q=1', 'http://example.org/notice']) {
    assert.equal(logic.safeUrl(url), url);
    assert.equal(logic.validateDataset(dataset([item({ sourceUrl: url })])).items.length, 1);
  }
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '//example.org', 'https://user:password@example.org/', 'https://example.org\\@evil.test', ' https://example.org', 'file:///etc/passwd', 'not-a-url']) {
    assert.equal(logic.safeUrl(url), null);
    assert.throws(() => logic.validateDataset(dataset([item({ sourceUrl: url })])), /데이터/);
  }
});

const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const browserTest = process.env.PUBLICDATA_BROWSER_TEST === '1';
const browserFixture = () => ({
  schemaVersion: 1, updatedAt: new Date().toISOString(), scopeNote: '테스트 전용 데이터입니다.',
  items: [
    item({ id: 'browser-open', title: '공공데이터 해커톤 테스트', deadline: '2099-11-10', verifiedAt: new Date().toISOString(), notes: ['원문에서 참가자격 확인'], benefits: ['멘토링', '시상'] }),
    item({ id: 'browser-unknown', title: '교통 데이터 경진대회 테스트', type: 'competition', deadline: null, verifiedAt: new Date().toISOString(), publicDataRelevance: '교통 API 활용', eligibility: ['학생', '일반인'] }),
    item({ id: 'browser-closed', title: '종료 창업 프로그램 테스트', type: 'startup', statusAtVerification: 'closed', deadline: '2099-12-31', verifiedAt: new Date().toISOString() }),
    item({ id: 'browser-xss', title: '<img src=x onerror="window.__xss=1">', type: 'startup', deadline: '2099-12-10', verifiedAt: new Date().toISOString(), summary: '<script>window.__xss=1</script>' })
  ]
});
async function runBrowser(code, fixture = 'success') {
  const directory = path.resolve(__dirname, '..');
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/public-data/data.json') {
      const ref = new URL(request.headers.referer || 'http://localhost');
      const scenario = ref.searchParams.get('fixture');
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (scenario === 'error') { response.writeHead(503); response.end('{"error":"test-only"}'); return; }
      const data = scenario === 'empty' ? dataset([]) : scenario === 'malformed' ? { schemaVersion: 9 } : browserFixture();
      setTimeout(() => response.end(JSON.stringify(data)), 180);
      return;
    }
    const filename = url.pathname === '/public-data/' ? 'index.html' : url.pathname.split('/').pop();
    if (!['index.html', 'style.css', 'logic.js', 'app.js'].includes(filename)) { response.writeHead(404); response.end('not found'); return; }
    const full = path.join(directory, filename);
    if (!fs.existsSync(full)) { response.writeHead(404); response.end('UI not implemented'); return; }
    response.setHeader('Content-Type', filename.endsWith('.css') ? 'text/css' : filename.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8');
    response.end(fs.readFileSync(full));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/public-data/?fixture=${fixture}`;
  const script = `console.log("browser harness entered"); const assert = (await import("node:assert/strict")).default;
    const task = await taskSpace("publicdata-ui-20261030");
    console.log("browser task", task.spaceId);
    const page = task.page("p1");
    await page.goto(${JSON.stringify(url)});
    console.log("browser navigated");
    ${code}`;
  try {
    const running = exec('ego-browser', ['nodejs', '-e', script], { timeout: 25000, maxBuffer: 200000 });
    running.child.stdin.end();
    const { stdout, stderr } = await running;
    console.log(stdout);
    if (stderr) console.log(stderr);
  } catch (error) {
    console.log(error.stdout || '');
    console.log(error.stderr || '');
    throw error;
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('브라우저에서 공고를 안전하게 렌더하고 실제 개수와 원문 링크를 표시한다', { skip: !browserTest }, async () => {
  assert.equal(fs.existsSync(path.resolve(__dirname, '../index.html')), true, '탐색 UI index.html이 필요합니다');
  await runBrowser(`
    assert.equal(await page.evaluate(() => document.querySelector("h1")?.textContent), "공공데이터 기회 노트");
    await page.waitForFunction(() => document.querySelectorAll(".opportunity").length === 3);
    const result = await page.evaluate(() => ({
      total: document.getElementById("total-count").textContent,
      count: document.getElementById("result-count").textContent,
      cards: document.querySelectorAll(".opportunity").length,
      links: [...document.querySelectorAll(".source-link")].map(a => ({ target: a.target, rel: a.rel })),
      hasXssText: document.body.textContent.includes('<img src=x onerror="window.__xss=1">'),
      executed: Boolean(window.__xss),
      dynamicImages: document.querySelectorAll(".opportunity img, .opportunity script").length
    }));
    assert.match(result.total, /4/);
    assert.match(result.count, /3/);
    assert.equal(result.cards, 3);
    assert.equal(result.hasXssText, true);
    assert.equal(result.executed, false);
    assert.equal(result.dynamicImages, 0);
    assert.equal(result.links.length, 3);
    for (const link of result.links) { assert.equal(link.target, "_blank"); assert.match(link.rel, /noopener/); assert.match(link.rel, /noreferrer/); }
    console.log(JSON.stringify({ browser: "render + XSS + links", result }));
  `);
});

test('브라우저 검색·유형·종료 포함·상태·정렬·초기화가 실제 목록에 반영된다', { skip: !browserTest }, async () => {
  await runBrowser(`
    await page.waitForFunction(() => document.querySelectorAll(".opportunity").length === 3);
    console.log(await page.snapshot());
    await page.fill("#search", "교통 API");
    await page.waitForFunction(() => document.querySelectorAll(".opportunity").length === 1, undefined, { timeout: 1500 });
    assert.match(await page.evaluate(() => document.querySelector(".card-title").textContent), /교통/);
    await page.click("#reset-filters");
    await page.click("#include-closed");
    assert.equal(await page.evaluate(() => document.querySelectorAll(".opportunity").length), 4);
    await page.click("[data-type=startup]");
    assert.equal(await page.evaluate(() => document.querySelectorAll(".opportunity").length), 2);
    await page.selectOption("#status-filter", "closed");
    assert.equal(await page.evaluate(() => document.querySelectorAll(".opportunity").length), 1);
    assert.match(await page.evaluate(() => document.querySelector(".card-title").textContent), /종료 창업/);
    assert.equal(await page.evaluate(() => document.getElementById("include-closed").disabled), true);
    await page.click("#reset-filters");
    assert.equal(await page.evaluate(() => document.querySelectorAll(".opportunity").length), 3);
    assert.equal(await page.evaluate(() => document.getElementById("include-closed").checked), false);
    await page.selectOption("#sort", "title");
    const titles = await page.evaluate(() => [...document.querySelectorAll(".card-title")].map(node => node.textContent));
    assert.deepEqual(titles, [...titles].sort((a, b) => a.localeCompare(b, "ko")));
    assert.equal(await page.evaluate(() => document.querySelector("[data-type=all]").getAttribute("aria-pressed")), "true");
    console.log(JSON.stringify({ browser: "filters", count: titles.length, titleSorted: true }));
  `);
});

test('앱은 빈 데이터와 네트워크 오류를 숨기지 않고 복구 안내를 보여준다', async () => {
  const vm = require('node:vm');
  for (const scenario of ['empty', 'error']) {
    const nodes = new Map();
    const get = id => {
      if (!nodes.has(id)) nodes.set(id, {
        textContent: '', hidden: false, disabled: true, checked: false,
        value: id === 'status-filter' ? 'all' : id === 'sort' ? 'deadline' : '',
        addEventListener() {}, setAttribute() {}, replaceChildren() {}
      });
      return nodes.get(id);
    };
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../app.js'), 'utf8'), {
      window: { PublicDataLogic: logic },
      document: { getElementById: get, querySelectorAll: () => [] },
      fetch: async () => scenario === 'error' ? { ok: false } : { ok: true, json: async () => dataset([]) },
      Intl, Date, console
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(get('feedback').hidden, false);
    assert.match(get('feedback-title').textContent, scenario === 'empty' ? /등록된 공고/ : /불러오지 못/);
    if (scenario === 'error') assert.equal(get('retry').hidden, false);
  }
});
