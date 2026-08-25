const fs = require('fs');
const path = require('path');
const { createGameSandbox } = require('./lib/game-sandbox');

const env = createGameSandbox();
const g = env.boot();
env.step(5);
const T = env.windowObj.__test || {};

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    console.log('  ✔ ' + name);
    passed += 1;
  } else {
    console.error('  ✘ ' + name);
    failed += 1;
  }
}

function data(expr, fallback) {
  try {
    const raw = env.run(`JSON.stringify(${expr})`);
    return raw === undefined ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function has(name) { return typeof T[name] === 'function'; }

const REVEAL_IDS = ['reset_after', 'reset_before', 'city_failure', 'yeongi_warning', 'first_approval'];
const CHRONOLOGICAL_IDS = REVEAL_IDS.slice().reverse();
const designContract = fs.readFileSync(path.join(__dirname, '..', 'DESIGN.md'), 'utf8');

console.log('[M-1] 장 종료 기록은 과거 시간상 역순으로 공개된다');
const records = data('typeof MEMENTO_RECORDS === "undefined" ? null : MEMENTO_RECORDS', []) || [];
const restored = data('typeof RESTORED_TIMELINE === "undefined" ? null : RESTORED_TIMELINE', []) || [];
check('손상된 기록 5개 데이터가 존재', records.length === 5);
check('공개 순서: 초기화 직후→직전→도시 이상→영이 경고→최초 승인',
  records.map((r) => r.id).join(',') === REVEAL_IDS.join(','));
check('시간 표시는 현재에서 더 먼 과거로 1·2·3·5·7일',
  records.map((r) => r.daysAgo).join(',') === '1,2,3,5,7');
check('파이널 복원은 실제 시간순으로 정확히 뒤집힘',
  restored.map((r) => r.recordId).join(',') === CHRONOLOGICAL_IDS.join(','));
check('기록마다 20~40초 분량의 짧은 페이지 3~4개',
  records.length === 5 && records.every((r) => Array.isArray(r.pages) && r.pages.length >= 3 && r.pages.length <= 4));

console.log('[M-2] 장별 기록 해금은 한 번만 저장된다');
check('장 번호→기록 ID 매핑 API 존재', has('recordForChapter'));
if (has('recordForChapter')) {
  check('1~5장 매핑이 공개 순서와 일치',
    [1, 2, 3, 4, 5].map((n) => T.recordForChapter(n)).join(',') === REVEAL_IDS.join(','));
}
check('기록 해금 API 존재', has('unlockDamagedRecord'));
if (has('unlockDamagedRecord')) {
  g.currentSlot = 0;
  g.flags = T.newFlags();
  T.unlockDamagedRecord(1);
  T.unlockDamagedRecord(1);
  const saved = JSON.parse(env.storage.get('ai-ethics-adventure-slot-0') || 'null');
  check('1장 기록은 중복 없이 한 번 해금',
    g.flags.damagedRecords.length === 1 && g.flags.damagedRecords[0] === 'reset_after');
  check('해금 직후 pendingRecord와 슬롯 저장이 함께 남음',
    g.flags.pendingRecord === 'reset_after' && saved && saved.flags.pendingRecord === 'reset_after');
}

console.log('[M-3] 건너뛰기와 일지 재열람이 진행을 보존한다');
check('손상 기록 장면 시작 API 존재', has('startDamagedRecord'));
if (has('startDamagedRecord') && has('unlockDamagedRecord')) {
  g.currentSlot = 0;
  g.flags = T.newFlags();
  T.unlockDamagedRecord(1);
  T.startDamagedRecord('reset_after', { ret: 'world' });
  check('최초 기록 장면은 record 모드로 진입', g.mode === 'record');
  check('최초 공개는 본문 전에 복원 여부를 고르는 발견 단계로 진입',
    g.record && g.record.discovery === true);
  env.tap('x');
  const skippedSave = JSON.parse(env.storage.get('ai-ethics-adventure-slot-0') || 'null');
  check('X 건너뛰기 뒤 월드로 복귀하고 완료·건너뜀 상태 저장',
    g.mode === 'world' && g.flags.viewedRecords.reset_after === true &&
    g.flags.skippedRecords.reset_after === true && g.flags.pendingRecord === null &&
    skippedSave && skippedSave.flags.skippedRecords.reset_after === true);

  g.flags.skippedRecords.reset_after = false;
  const before = g.flags.damagedRecords.slice();
  T.startDamagedRecord('reset_after', { ret: 'journal', replay: true });
  env.tap('x');
  check('일지 재열람을 닫으면 일지로 돌아감', g.mode === 'journal');
  check('재열람 건너뛰기는 최초 건너뜀 표식을 새로 만들지 않음', g.flags.skippedRecords.reset_after === false);
  check('재열람은 기록을 중복 해금하지 않음',
    g.flags.damagedRecords.join(',') === before.join(','));

  g.flags = T.newFlags();
  T.unlockDamagedRecord(1);
  T.startDamagedRecord('reset_after', { ret: 'world' });
  env.tap('z');
  check('복원하기를 고르면 같은 기록의 첫 페이지가 시작됨',
    g.mode === 'record' && g.record && g.record.discovery === false && g.record.page === 0);
  for (let i = 0; i < 4; i++) env.tap('z');
  check('첫 기록을 읽으면 입력자 공백을 짚는 반디 복선이 실제 대화로 이어짐',
    g.mode === 'dialog' && g.dialog && /누가 쓴 문장인지는 아직 몰라/.test(g.dialog.lines[0]));
}

console.log('[M-4] 마음 일지는 사실의 신뢰도가 단계적으로 변한다');
check('일지 기록 단계 계산 API 존재', has('journalRecordStage'));
if (has('journalRecordStage')) {
  const make = (ids, done) => Object.assign(T.newFlags(), { damagedRecords: ids, timelineRestored: !!done });
  const early = T.journalRecordStage(make(REVEAL_IDS.slice(0, 1), false));
  const middle = T.journalRecordStage(make(REVEAL_IDS.slice(0, 3), false));
  const late = T.journalRecordStage(make(REVEAL_IDS, false));
  const final = T.journalRecordStage(make(REVEAL_IDS, true));
  check('초반은 [확인된 사실]', early.label === '[확인된 사실]' && /영이가 코어를 망가뜨렸다/.test(early.text));
  check('중반은 [확인된 사실?] + 최초 입력자 공백', middle.label === '[확인된 사실?]' && /최초 입력자/.test(middle.text));
  check('후반은 [내가 믿고 싶었던 이야기]', late.label === '[내가 믿고 싶었던 이야기]' && /영이가 모든 문제/.test(late.text));
  check('복원 뒤는 [복원된 사실] + 나의 참여와 영이의 경고',
    final.label === '[복원된 사실]' && /나도 이 결정에 참여/.test(final.text) && /영이는 나를 멈추려/.test(final.text));
}

console.log('[M-5] 파이널은 두 시간선을 결합하고 건너뛰어도 막히지 않는다');
check('시간순 복원 시작 API 존재', has('startTimelineRestoration'));
if (has('startTimelineRestoration')) {
  g.currentSlot = 0;
  g.flags = Object.assign(T.newFlags(), { damagedRecords: REVEAL_IDS.slice(), timelineMerged: false, timelineRestored: false });
  T.startTimelineRestoration({ ret: 'world' });
  check('복원 시작 시 결합 표식과 실제 시간순 record 모드',
    g.flags.timelineMerged === true && g.mode === 'record' && g.record && g.record.restored === true &&
    g.record.ids.join(',') === CHRONOLOGICAL_IDS.join(','));
  env.tap('x');
  const finalSave = JSON.parse(env.storage.get('ai-ethics-adventure-slot-0') || 'null');
  check('복원 건너뛰기도 완료 상태 저장 후 다음 흐름으로 복귀',
    g.flags.timelineRestored === true && g.mode === 'world' && finalSave && finalSave.flags.timelineRestored === true);
}

console.log('[M-6] 기존 세이브는 V9로 안전하게 옮겨진다');
check('V9 마이그레이션 API 존재', has('migrateSlotV9'));
if (has('migrateSlotV9')) {
  const migrated = T.migrateSlotV9({ v: 8, name: '구세이브', flags: { shrineDone: false, defeated: {} } });
  check('V8→V9와 새 필드 기본값', migrated.v === 9 && Array.isArray(migrated.flags.damagedRecords) &&
    Object.keys(migrated.flags.viewedRecords).length === 0 && Object.keys(migrated.flags.skippedRecords).length === 0 &&
    migrated.flags.pendingRecord === null && migrated.flags.timelineMerged === false && migrated.flags.timelineRestored === false);
  const completed = T.migrateSlotV9({ v: 8, flags: { shrineDone: true, defeated: { yeongi: true } } });
  check('이미 코어를 끝낸 구세이브는 새 파이널을 강제로 반복하지 않음',
    completed.flags.timelineMerged === true && completed.flags.timelineRestored === true);
  check('완료된 구세이브는 기록이 비어 있어도 복원된 시간순 다시보기가 보임',
    has('journalRecordItems') && T.journalRecordItems(completed.flags).map((item) => item.id).join(',') === 'restored');
  const chapterSave = T.migrateSlotV9({ v: 8, flags: {
    chapter1Clear: true, chapter2Clear: true, shrineDone: false, defeated: {},
  } });
  check('완료한 장이 있는 구세이브는 해당 손상 기록을 새 기록으로 보충',
    chapterSave.flags.damagedRecords.join(',') === 'reset_after,reset_before' &&
    Object.keys(chapterSave.flags.viewedRecords).length === 0 && chapterSave.flags.pendingRecord === null);
  const defeatedOnly = T.migrateSlotV9({ v: 8, flags: {
    shrineDone: false,
    defeated: { sujipmon: true, pyeonhyangmon: true, hwangakmon: true, yuhokmon: true, hollimmon: true },
  } });
  check('일반 전투 완료 표식만으로 장 기록을 잘못 보충하지 않음',
    defeatedOnly.flags.damagedRecords.length === 0 && defeatedOnly.flags.pendingRecord === null);
}
const fresh = has('newFlags') ? T.newFlags() : {};
check('신규 세이브의 기록 상태 기본값', Array.isArray(fresh.damagedRecords) && fresh.damagedRecords.length === 0 &&
  fresh.viewedRecords && fresh.skippedRecords && fresh.pendingRecord === null &&
  fresh.timelineMerged === false && fresh.timelineRestored === false);

console.log('[M-6b] 손상 기록 진행은 첫 장부터 HUD와 다시보기 동선에 드러난다');
check('손상 기록 HUD 문구 API 존재', has('recordHudText'));
if (has('recordHudText')) {
  check('해금 전 HUD가 장 끝의 새 기록 목표를 예고', /0\/5/.test(T.recordHudText(T.newFlags(), false)));
  const oneRecord = Object.assign(T.newFlags(), { damagedRecords: ['reset_after'] });
  check('해금 뒤 키보드 HUD가 기록 수와 J 다시보기를 안내',
    /1\/5/.test(T.recordHudText(oneRecord, false)) && /J/.test(T.recordHudText(oneRecord, false)));
  check('해금 뒤 터치 HUD가 기록 수와 메뉴 다시보기를 안내',
    /1\/5/.test(T.recordHudText(oneRecord, true)) && /메뉴/.test(T.recordHudText(oneRecord, true)));
}

console.log('[M-7] 네 엔딩은 기존 ID와 누적 여정을 보존해 새 주제에 연결된다');
const endingThemes = data('typeof MEMENTO_ENDING_THEMES === "undefined" ? null : MEMENTO_ENDING_THEMES', {}) || {};
const computeEnding = env.run('computeEnding');
check('기존 엔딩 ID 4개 보존', Object.keys(endingThemes).sort().join(',') === 'dawn,farewell,home,silent');
check('집으로=복원, 침묵=반복, 새벽=의존, 먼 길=단절 주제',
  endingThemes.home === 'restore' && endingThemes.silent === 'repeat' &&
  endingThemes.dawn === 'depend' && endingThemes.farewell === 'disconnect');
check('마지막 선택 하나가 아니라 앞선 자비 누적이 집으로를 가름',
  computeEnding('mercy', 7) === 'home' && computeEnding('mercy', 6) === 'farewell');
check('의존 엔딩도 앞선 자비 누적이 필요',
  computeEnding('neutral', 5) === 'dawn' && computeEnding('neutral', 4) === 'farewell');
check('낮은 자비 누적은 마지막 선택과 무관하게 반복 엔딩',
  computeEnding('mercy', 2) === 'silent' && computeEnding('neutral', 2) === 'silent');
if (has('endingScene')) {
  const endingText = (id) => T.endingScene(id).lines.join('\n');
  check('집으로는 기록실과 사람의 확인을 되살림', /기록실/.test(endingText('home')) && /확인한 사람/.test(endingText('home')));
  check('침묵은 초기화와 같은 안내문의 반복을 보여 줌', /초기화/.test(endingText('silent')) && /같은 안내문/.test(endingText('silent')));
  check('새벽은 판단을 맡긴 뒤 선택 칸이 비는 결과를 보여 줌', /결정을 영이에게 맡겼다/.test(endingText('dawn')) && /이유」 칸은 계속 비었다/.test(endingText('dawn')));
  check('작별은 모든 AI와 도움 가능성이 함께 꺼지는 결과를 보여 줌', /모든 AI를 껐다/.test(endingText('farewell')) && /돕던 창도 꺼졌다/.test(endingText('farewell')));
}

console.log('[M-8] 공정한 복선·금지 문구·기존 본편 순서를 지킨다');
const clues = data('typeof MEMENTO_CLUES === "undefined" ? null : MEMENTO_CLUES', []) || [];
check('반전 전에 재해석 가능한 복선 최소 3개', clues.length >= 3 && clues.every((c) => c.beforeFinal === true));
const liveClues = data(`({
  prologue: BANDI_BOSS_LINES.prologue,
  afterFirstRecord: MEMENTO_POST_RECORD_LINES.reset_after,
  quietYard: COMPANION_LINES.quietyard,
  warningRecord: MEMENTO_RECORDS.find((record) => record.id === 'city_failure').pages.join('\\n')
})`, {}) || {};
check('프롤로그 결정권·첫 기록 입력자·고요 비상 정지 복선이 실제 대사에 배치됨',
  /어느 길로 갈지는 네가 정해/.test(liveClues.prologue.mercy) &&
  /누가 쓴 문장인지는 아직 몰라/.test(liveClues.afterFirstRecord) &&
  /비상 정지/.test(liveClues.quietYard) && /비상 정지/.test(liveClues.warningRecord));
const endingScenes = has('endingScene')
  ? ['home', 'silent', 'dawn', 'farewell'].map((id) => T.endingScene(id)) : [];
const screenText = JSON.stringify({ records, restored, endingThemes, endingScenes, clues, liveClues });
check('새 화면 문구에 금지 어휘·-몬식 이름 없음', !/(몬스터|도감|증표|[가-힣]+몬)/.test(screenText));
const maps = data('Object.keys(MAPS)', []);
check('프롤로그→다섯 거리→고요의 뜰→코어 맵이 모두 보존',
  ['introlab', 'forest', 'freestreet', 'tiltstreet', 'rumorstreet', 'arcade', 'cozyhome', 'quietyard', 'coreroom']
    .every((id) => maps.includes(id)));
check('장 번호 1~5만 기록에 연결되어 본편 순서를 바꾸지 않음',
  has('recordForChapter') && T.recordForChapter(0) === null && T.recordForChapter(6) === null);

console.log('[M-9] 새 기록·엔딩 문구는 화면낭독기와 TTS가 읽을 수 있다');
if (has('journalAnnouncement')) {
  g.currentSlot = 0;
  g.flags = Object.assign(T.newFlags(), {
    damagedRecords: ['reset_after'],
    viewedRecords: { reset_after: true },
  });
  T.writeSlot(0, { v: 9, name: '테스트', map: 'freestreet', x: 1, y: 1, flags: g.flags });
  g.journal.slot = 0;
  g.journal.tab = 'records';
  g.journal.recordCursor = 0;
  const journalSpeech = T.journalAnnouncement();
  check('일지 낭독문에 현재 탭·기록 수·선택 항목·상태가 포함됨',
    /손상된 기록 탭/.test(journalSpeech) && /1개 중 1번째/.test(journalSpeech) &&
    /현재보다 1일 전/.test(journalSpeech) && /읽음/.test(journalSpeech));
} else {
  check('일지 낭독문 API 존재', false);
}
if (has('endingAnnouncement')) {
  check('네 엔딩 낭독문에 제목과 화면의 모든 문장이 포함됨',
    ['home', 'silent', 'dawn', 'farewell'].every((id) => {
      const scene = T.endingScene(id);
      const speech = T.endingAnnouncement(id);
      return speech.includes(scene.title) && scene.lines.filter(Boolean).every((line) => speech.includes(line));
    }));
} else {
  check('엔딩 낭독문 API 존재', false);
}

console.log('[M-10] 순행 컬러·역행 회색 시각 문법이 시간선과 함께 움직인다');
check('시간선 시각 모드 API 존재', has('timelineVisualMode'));
check('기록 비네트 명세 API 존재', has('recordDioramaSpec'));
check('월드 인물 팔레트 API 존재', has('worldFigureProfile'));
if (has('timelineVisualMode')) {
  const reverseMode = T.timelineVisualMode({ restored: false });
  const restoredMode = T.timelineVisualMode({ restored: true });
  const presentMode = T.timelineVisualMode(null);
  check('손상 기록은 회색빛 역행 모드', reverseMode.id === 'reverse' && reverseMode.grayscale === true && reverseMode.direction === 'backward');
  check('손상 기록 비네트는 네 단계 회색 명도만 사용',
    new Set(['surface', 'floor', 'floorAlt', 'wall', 'mortar', 'light', 'accent', 'warm']
      .map((key) => reverseMode[key])).size === 4);
  const damagedRecordContract = (designContract.split('### 손상된 기록 장면')[1] || '').split('### 월드 HUD 기록 진행')[0];
  check('손상 기록 카드의 설계 토큰과 런타임 팔레트가 일치',
    reverseMode.surface === '#17191d' && reverseMode.accent === '#c7c9cc' &&
    damagedRecordContract.includes('`reverse-surface`') && damagedRecordContract.includes('`reverse-light`'));
  check('실제 시간순 복원은 컬러 순행 모드', restoredMode.id === 'restored' && restoredMode.grayscale === false && restoredMode.direction === 'forward');
  check('현재 월드는 컬러 순행 모드', presentMode.id === 'present' && presentMode.grayscale === false && presentMode.direction === 'forward');
}
if (has('recordDioramaSpec')) {
  const ids = REVEAL_IDS.slice();
  const reverseSpecs = ids.map((id) => T.recordDioramaSpec(id, false));
  const restoredSpecs = ids.map((id) => T.recordDioramaSpec(id, true));
  check('다섯 기록 모두 서로 구별되는 핵심 소품을 가짐',
    reverseSpecs.every(Boolean) && new Set(reverseSpecs.map((spec) => spec.focus)).size === ids.length);
  check('역행과 복원은 사건별 방 배치를 바꾸지 않고 팔레트만 바꿈',
    reverseSpecs.every((spec, i) => spec.layout === restoredSpecs[i].layout && spec.focus === restoredSpecs[i].focus &&
      spec.palette === 'reverse' && restoredSpecs[i].palette === 'restored'));
}
if (has('worldFigureProfile')) {
  const figure = T.worldFigureProfile();
  check('플레이어는 청록 상의·어두운 외곽·바닥 그림자로 배경과 분리',
    /^#[0-9a-f]{6}$/i.test(figure.player.r) && figure.outline === '#0a0d12' && figure.shadow === true && figure.outlinePx >= 2);
}

if (failed > 0) {
  console.error(`\n✘ 메멘토 테스트 실패 (${failed}개 실패, ${passed}개 통과)`);
  process.exit(1);
}
console.log(`\n✔ 메멘토 테스트 통과 (${passed}개 검사)`);
