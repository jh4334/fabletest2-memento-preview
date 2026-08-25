const fs = require('fs');
const path = require('path');
const vm = require('vm');

const swSource = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
let pass = 0;
let fail = 0;

function check(name, condition) {
  if (condition) {
    console.log('  ✔ ' + name);
    pass += 1;
  } else {
    console.log('  ✘ ' + name);
    fail += 1;
  }
}

function fakeResponse(body, status = 200) {
  return {
    body,
    status,
    type: 'basic',
    clone() { return fakeResponse(body, status); },
    text() { return Promise.resolve(body); },
  };
}

function loadWorker(options = {}) {
  const listeners = {};
  const writes = [];
  const cache = {
    addAll: options.addAll || (() => Promise.resolve()),
    add: options.add || (() => Promise.resolve()),
    put(request, response) { writes.push({ request, response }); return Promise.resolve(); },
    keys: () => Promise.resolve([]),
  };
  const context = {
    URL,
    console,
    fetch: options.fetch || (() => Promise.reject(new Error('network unavailable'))),
    caches: {
      open: () => Promise.resolve(cache),
      match: options.match || (() => Promise.resolve(undefined)),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
    },
    self: {
      location: { origin: 'https://example.test' },
      addEventListener(type, handler) { listeners[type] = handler; },
      skipWaiting: () => Promise.resolve(),
      clients: {
        claim: () => Promise.resolve(),
        matchAll: () => Promise.resolve([]),
      },
    },
  };
  vm.runInNewContext(swSource, context, { filename: 'sw.js' });
  return { listeners, writes };
}

async function dispatchInstall(listener) {
  let completion;
  listener({ waitUntil(value) { completion = Promise.resolve(value); } });
  try {
    await completion;
    return true;
  } catch (error) {
    return false;
  }
}

async function dispatchFetch(listener, request) {
  let response;
  listener({
    request,
    respondWith(value) { response = Promise.resolve(value); },
  });
  return response;
}

(async () => {
  console.log('[SW-1] core 요청이 HTTP 오류면 마지막 정상 캐시로 폴백');
  const cached = fakeResponse('cached-game');
  const worker = loadWorker({
    fetch: () => Promise.resolve(fakeResponse('maintenance', 503)),
    match: () => Promise.resolve(cached),
  });
  const result = await dispatchFetch(worker.listeners.fetch, {
    method: 'GET',
    mode: 'same-origin',
    url: 'https://example.test/src/game.js',
  });
  check('HTTP 503 core 응답 대신 마지막 정상 캐시를 반환', result === cached);

  console.log('[SW-2] optional icon 실패가 core shell 설치를 막지 않음');
  const batches = [];
  const workerWithMissingIcon = loadWorker({
    addAll: (assets) => {
      batches.push(Array.from(assets));
      return assets.some((asset) => /icons\//.test(asset))
        ? Promise.reject(new Error('optional icon missing'))
        : Promise.resolve();
    },
    add: (asset) => /icons\//.test(asset)
      ? Promise.reject(new Error('optional icon missing'))
      : Promise.resolve(),
  });
  const installed = await dispatchInstall(workerWithMissingIcon.listeners.install);
  check('optional icon 1개가 없어도 worker 설치 완료', installed);
  check('core shell batch에는 index와 game.js가 포함',
    batches.some((assets) => assets.includes('./index.html') && assets.includes('./src/game.js')));

  if (fail) {
    console.error(`\n서비스워커 테스트: ${pass} 통과 / ${fail} 실패`);
    process.exitCode = 1;
  } else {
    console.log(`\n✔ 서비스워커 테스트 통과 (${pass}개 검사)`);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
