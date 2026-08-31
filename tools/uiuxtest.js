const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (error) {
  console.error('playwright 패키지가 없습니다. `npm ci` 후 다시 실행하세요.');
  process.exit(2);
}

const ROOT = path.resolve(__dirname, '..');
const ROOT_REAL = fs.realpathSync(ROOT);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.css': 'text/css',
};

function resolveStaticFile(rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(rawUrl.split('?')[0]);
  } catch (error) {
    return null;
  }
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/favicon.ico') pathname = '/icons/icon-192.png';
  const candidate = path.resolve(ROOT, pathname.replace(/^\/+/, ''));
  const rootPrefix = ROOT_REAL + path.sep;
  if (candidate !== ROOT_REAL && !candidate.startsWith(rootPrefix)) return null;
  if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) return null;
  let real;
  try {
    real = fs.realpathSync(candidate);
  } catch (error) {
    return null;
  }
  if (real !== ROOT_REAL && !real.startsWith(rootPrefix)) return null;
  return real;
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filename = resolveStaticFile(req.url);
      if (!filename) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }
      res.setHeader('Content-Type', MIME[path.extname(filename)] || 'application/octet-stream');
      res.end(fs.readFileSync(filename));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function resolveChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM && fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM)) {
    return process.env.PLAYWRIGHT_CHROMIUM;
  }
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const dir of fs.readdirSync(base).filter((name) => name.startsWith('chromium-'))) {
      const executable = path.join(base, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(executable)) return executable;
    }
  } catch (error) {
    return undefined;
  }
  return undefined;
}

let pass = 0;
let fail = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✔ ${label}`);
    pass += 1;
  } else {
    console.log(`  ✘ ${label}${detail ? ` — ${detail}` : ''}`);
    fail += 1;
  }
}

async function load(page, base) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.__test && window.__game), { timeout: 8000 });
  return errors;
}

async function layoutSnapshot(page) {
  return page.evaluate(() => {
    document.body.classList.add('allow-portrait');
    const ids = ['game', 't-stick', 't-a', 't-menu', 't-pause'];
    const elements = Object.fromEntries(ids.map((id) => {
      const element = document.getElementById(id);
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return [id, {
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height, display: style.display,
      }];
    }));
    const card = document.querySelector('#name-overlay .np-card');
    document.getElementById('name-overlay').style.display = 'flex';
    const nameRect = card.getBoundingClientRect();
    document.getElementById('name-overlay').style.display = '';
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      elements,
      nameRect: { left: nameRect.left, top: nameRect.top, right: nameRect.right, bottom: nameRect.bottom },
    };
  });
}

function withinViewport(rect, snapshot) {
  return rect.left >= -0.5 && rect.top >= -0.5 &&
    rect.right <= snapshot.width + 0.5 && rect.bottom <= snapshot.height + 0.5;
}

(async () => {
  console.log('[test-server] 정적 파일 경계');
  check('형제 디렉터리로 나가는 경로를 거부',
    resolveStaticFile(`/../${path.basename(ROOT)}-secret/file`) === null);
  check('잘못 인코딩된 URL을 예외 없이 거부', resolveStaticFile('/%E0%A4%A') === null);
  check('저장소 안의 index.html은 허용', resolveStaticFile('/index.html') === fs.realpathSync(path.join(ROOT, 'index.html')));

  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ executablePath: resolveChromium() });
  try {
    console.log('[accessibility] 브라우저 확대와 하이브리드 터치');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      const errors = await load(page, base);
      const accessibility = await page.evaluate(() => ({
        viewport: document.querySelector('meta[name="viewport"]').content,
        rootTouchAction: getComputedStyle(document.documentElement).touchAction,
        bodyTouchAction: getComputedStyle(document.body).touchAction,
      }));
      check('핀치 확대를 viewport 메타가 차단하지 않음',
        !/user-scalable\s*=\s*no/i.test(accessibility.viewport) &&
        !/maximum-scale\s*=\s*1(?:\.0)?(?:,|$)/i.test(accessibility.viewport), accessibility.viewport);
      check('페이지 전체 touch-action이 확대를 차단하지 않음',
        accessibility.rootTouchAction !== 'none' && accessibility.bodyTouchAction !== 'none',
        `${accessibility.rootTouchAction}/${accessibility.bodyTouchAction}`);
      check('접근성 확인 중 콘솔 오류 없음', errors.length === 0, errors.join(' | '));
      await context.close();
    }
    {
      const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
      await context.addInitScript(() => {
        let proto = window;
        while (proto) {
          try { delete proto.ontouchstart; } catch (error) {}
          proto = Object.getPrototypeOf(proto);
        }
        Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 });
      });
      const page = await context.newPage();
      await load(page, base);
      const detected = await page.evaluate(() => document.body.classList.contains('touch'));
      check('터치 가능한 노트북·태블릿을 maxTouchPoints로 감지', detected);
      await context.close();
    }

    console.log('[orientation] 회전 중 고정 입력 방지');
    {
      const context = await browser.newContext({
        viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true,
      });
      const page = await context.newPage();
      await load(page, base);
      const before = await page.evaluate(() => {
        const button = document.getElementById('t-a');
        const rect = button.getBoundingClientRect();
        const touch = new Touch({
          identifier: 71, target: button,
          clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
        });
        button.dispatchEvent(new TouchEvent('touchstart', {
          changedTouches: [touch], bubbles: true, cancelable: true,
        }));
        return window.__test.heldKeys().includes('action');
      });
      await page.setViewportSize({ width: 390, height: 844 });
      let releasedInTime = true;
      try {
        await page.waitForFunction(() => window.__test.heldKeys().length === 0, { timeout: 1000 });
      } catch (error) {
        releasedInTime = false;
      }
      const after = await page.evaluate(() => window.__test.heldKeys());
      check('회전 전 터치 입력 재현', before);
      check('화면 회전 시 보이지 않는 고정 입력을 해제', releasedInTime && after.length === 0, after.join(','));
      await context.close();
    }

    console.log('[battle-onboarding] 한글 안내 안전 영역');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await load(page, base);
      const layout = await page.evaluate(() => window.__test.prologueTutorialPanelLayout({ x: 200 }));
      check('온보딩 패널이 전투 안내 영역과 16px 이상 떨어짐',
        layout.x + layout.w <= 200 - 16, JSON.stringify(layout));
      check('온보딩 패널 본문에 안전한 내부 폭이 있음', layout.textWidth >= 120, JSON.stringify(layout));
      await context.close();
    }

    console.log('[canvas-headings] 색상 이모지와 한글 제목 겹침 방지');
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await context.addInitScript(() => {
        window.__fillTextLog = [];
        const original = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function fillText(text, x, y, maxWidth) {
          const metrics = this.measureText(String(text));
          window.__fillTextLog.push({ text: String(text), x, y, width: metrics.width });
          if (arguments.length > 3) return original.call(this, text, x, y, maxWidth);
          return original.call(this, text, x, y);
        };
      });
      const page = await context.newPage();
      await load(page, base);
      for (const state of [
        { mode: 'hof', title: '명예의 전당' },
        { mode: 'report', title: '학생 진단 리포트' },
      ]) {
        const entries = await page.evaluate(async ({ mode, title }) => {
          window.__fillTextLog = [];
          window.__game.mode = mode;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return window.__fillTextLog.filter((entry) => entry.y < 70 &&
            (entry.text === title || entry.text.length <= 2));
        }, state);
        const title = entries.find((entry) => entry.text === state.title);
        const icon = entries.find((entry) => entry.text !== state.title && entry.y <= 40);
        const separated = title && icon && title.x - (icon.x + icon.width) >= 8;
        check(`${state.title} 아이콘과 제목을 별도 간격으로 렌더링`, !!separated,
          JSON.stringify(entries.slice(-6)));
      }
      await context.close();
    }

    console.log('[mobile-readability] 작은 세로 화면의 핵심 한글 크기');
    for (const viewport of [
      { name: 'small-phone', width: 320, height: 568 },
      { name: 'phone-portrait', width: 390, height: 844 },
      { name: 'phone-landscape', width: 844, height: 390 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height }, hasTouch: true, isMobile: true,
      });
      await context.addInitScript(() => {
        window.__mobileTextLog = [];
        const original = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function fillText(text, x, y, maxWidth) {
          const match = /([0-9.]+)px/.exec(this.font);
          window.__mobileTextLog.push({
            text: String(text), x, y, fontPx: match ? Number(match[1]) : 0,
          });
          if (arguments.length > 3) return original.call(this, text, x, y, maxWidth);
          return original.call(this, text, x, y);
        };
      });
      const page = await context.newPage();
      await load(page, base);
      const metrics = await page.evaluate(async () => {
        document.body.classList.add('allow-portrait');
        const capture = async (setup) => {
          window.__mobileTextLog = [];
          setup();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return window.__mobileTextLog.slice();
        };
        const scale = document.getElementById('game').getBoundingClientRect().width / 720;
        const route = await capture(() => {
          window.__game.mode = 'title';
          window.__game.titleScreen = 'routechoice';
        });
        const hof = await capture(() => { window.__game.mode = 'hof'; });
        const report = await capture(() => { window.__game.mode = 'report'; });
        const cssPx = (entry) => entry ? entry.fontPx * scale : 0;
        const routeChoice = route.find((entry) => entry.text.startsWith('● '));
        const routeDetail = route.find((entry) => entry.text.includes('프롤로그부터'));
        const routePrompt = route.find((entry) => entry.text === '어떤 시간선으로 시작할까?');
        const hofLabels = hof.filter((entry) => entry.text === '챌린지 최고점');
        const reportRows = report.filter((entry) => entry.y >= 80 && entry.y <= 480 && entry.text.trim());
        return {
          routeChoice: cssPx(routeChoice),
          routeDetail: cssPx(routeDetail),
          routePromptTop: routePrompt ? routePrompt.y - routePrompt.fontPx : 0,
          hofLabel: Math.min(...hofLabels.map(cssPx)),
          reportBody: Math.min(...reportRows.map(cssPx)),
        };
      });
      check(`${viewport.name}: 시간선 선택 글자가 CSS 10px 이상`, metrics.routeChoice >= 10,
        JSON.stringify(metrics));
      check(`${viewport.name}: 시간선 설명이 CSS 8.5px 이상`, metrics.routeDetail >= 8.5,
        JSON.stringify(metrics));
      check(`${viewport.name}: 시간선 질문이 인물 행 아래에서 시작`, metrics.routePromptTop >= 190,
        JSON.stringify(metrics));
      check(`${viewport.name}: 명예의 전당 부문명이 CSS 9px 이상`, metrics.hofLabel >= 9,
        JSON.stringify(metrics));
      check(`${viewport.name}: 진단 리포트 본문이 CSS 9px 이상`, metrics.reportBody >= 9,
        JSON.stringify(metrics));
      await context.close();
    }

    console.log('[responsive] 7개 실사용 화면 크기');
    const viewports = [
      { name: 'desktop', width: 1280, height: 800, mobile: false },
      { name: 'tablet-landscape', width: 1024, height: 768, mobile: true },
      { name: 'tablet-portrait', width: 768, height: 1024, mobile: true },
      { name: 'phone-portrait', width: 390, height: 844, mobile: true },
      { name: 'phone-landscape', width: 844, height: 390, mobile: true },
      { name: 'small-phone', width: 320, height: 568, mobile: true },
      { name: 'wide-desktop', width: 1920, height: 800, mobile: false },
    ];
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        hasTouch: viewport.mobile, isMobile: viewport.mobile,
      });
      const page = await context.newPage();
      const errors = await load(page, base);
      const snapshot = await layoutSnapshot(page);
      const canvasFits = withinViewport(snapshot.elements.game, snapshot) &&
        snapshot.elements.game.width > 0 && snapshot.elements.game.height > 0;
      check(`${viewport.name}: 캔버스가 화면 안에 표시`, canvasFits);
      check(`${viewport.name}: 이름 입력 카드가 화면 안에 표시`, withinViewport(snapshot.nameRect, snapshot));
      check(`${viewport.name}: 문서가 가로·세로로 넘치지 않음`,
        snapshot.scrollWidth <= snapshot.width && snapshot.scrollHeight <= snapshot.height,
        `${snapshot.scrollWidth}x${snapshot.scrollHeight}`);
      if (viewport.mobile) {
        const controls = ['t-stick', 't-a', 't-menu', 't-pause'];
        const allFit = controls.every((id) => {
          const rect = snapshot.elements[id];
          return rect.display !== 'none' && rect.width >= 44 && rect.height >= 44 && withinViewport(rect, snapshot);
        });
        check(`${viewport.name}: 주요 터치 조작이 44px 이상이며 화면 안에 표시`, allFit);
        if (viewport.height > viewport.width) {
          check(`${viewport.name}: 캔버스가 상단 조작 아래 72~104px에서 시작`,
            snapshot.elements.game.top >= 72 && snapshot.elements.game.top <= 104,
            `top=${snapshot.elements.game.top}`);
        }
      }
      check(`${viewport.name}: 콘솔 오류 없음`, errors.length === 0, errors.join(' | '));
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\nUI/UX 브라우저 테스트: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error('UI/UX 테스트 오류:', error);
  process.exit(1);
});
