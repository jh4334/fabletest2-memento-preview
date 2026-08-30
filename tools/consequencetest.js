const { createGameSandbox } = require('./lib/game-sandbox');

const env = createGameSandbox();
const g = env.boot();
env.step(4);
const T = env.windowObj.__test || {};

let passed = 0;
function check(name, cond) {
  if (!cond) { console.error('  ✘ ' + name); process.exit(1); }
  console.log('  ✔ ' + name); passed += 1;
}
function snapshotCore() {
  return JSON.stringify({
    defeated: g.flags.defeated,
    mercyChoice: g.flags.mercyChoice,
    mercy: g.flags.mercy,
    chapter: [g.flags.chapter1Clear, g.flags.chapter2Clear, g.flags.chapter3Clear,
      g.flags.chapter4Clear, g.flags.chapter5Clear],
    correctCount: g.flags.correctCount,
    battleCount: g.flags.battleCount,
    pStats: g.flags.pStats || null,
    learning: Array.from(env.storage.entries())
      .filter(([key]) => /(?:stats|mistakes|meta|dex)/.test(key))
      .sort(([a], [b]) => a.localeCompare(b)),
  });
}

console.log('[C-1] D-1 캠페인 런타임 API');
for (const name of [
  'consequenceRuntime', 'recordConsequencePastChoice', 'beginConsequencePresent',
  'completeConsequenceRepair', 'beginConsequenceFinale', 'completeStagePersuasion',
  'creationJournalRows', 'resumeConsequenceCampaign', 'interactConsequenceProp',
  'consequenceEffortProjection',
]) check(name + ' 훅이 존재', typeof T[name] === 'function');
const manualEffort = T.consequenceEffortProjection('visual_manual');
const assistedEffort = T.consequenceEffortProjection('audio_licensed');
const instantEffort = T.consequenceEffortProjection('text_instant');
check('과거 선택 노력은 수동 3/도움 2/즉시 1단계', manualEffort.steps === 3 &&
  assistedEffort.steps === 2 && instantEffort.steps === 1);
check('노력 단계는 정답 판정이 아닌 확인 행동', manualEffort.labels.every((label) => !/[OX]|정답|오답/.test(label)) &&
  assistedEffort.labels.every((label) => !/[OX]|정답|오답/.test(label)));

console.log('[C-2] 새 슬롯에서 과거 선택은 방 순서와 무관하고 한 번만 저장');
T.startNewGameForRoute(0, '기록이', 'consequence-pairs');
env.advanceDialog();
check('creationhall 과거 시작', g.map === 'creationhall' && T.consequenceRuntime().phase === 'past' &&
  T.consequenceRuntime().checkpoint === 'past_start');
env.step();
check('과거 목표가 aria-live에 안내', /과거, 현재보다 1일 전/.test(T.srLiveText()));
check('장부는 세 방 전까지 잠김', T.recordConsequencePastChoice('ledger', 'partial') === false);
check('오디오 먼저 선택', T.recordConsequencePastChoice('audio', 'audio_instant') === true);
check('같은 방 재선택 거부', T.recordConsequencePastChoice('audio', 'audio_reply') === false &&
  T.consequenceRuntime().pastChoices.audio === 'audio_instant');
check('텍스트·그림 선택', T.recordConsequencePastChoice('text', 'text_excerpt') === true &&
  T.recordConsequencePastChoice('visual', 'visual_manual') === true);
check('3/3 뒤 past_rooms', T.consequenceRuntime().checkpoint === 'past_rooms');
check('장부 선택은 past_done을 원자 저장', T.recordConsequencePastChoice('ledger', 'partial') === true &&
  T.consequenceRuntime().checkpoint === 'past_done' && T.consequenceRuntime().pastChoices.ledger === 'partial');

console.log('[C-3] 같은 좌표 현재 전환과 파생 수리');
env.setPlayer(20, 11, 'left');
check('현재 전환', T.beginConsequencePresent() === true && T.consequenceRuntime().phase === 'present' &&
  T.consequenceRuntime().checkpoint === 'present_start' && g.player.x === 20 && g.player.y === 11);
check('과거 종료 안내와 27프레임 전환이 시작', g.consequenceTransition &&
  g.consequenceTransition.duration === 27 && /\[과거 종료\]/.test(g.notice.text));
env.step(14);
check('현재 시작 안내가 과거 종료 뒤 표시', g.consequenceTransition &&
  g.consequenceTransition.announcedCurrent && /\[현재 시작\]/.test(T.srLiveText()));
env.step(13);
check('현재 목표가 aria-live에 안내', /현재, 공동 창작관/.test(T.srLiveText()));
check('혼합 경로는 정확히 두 파생 수리', JSON.stringify(T.consequenceRuntime().requiredRepairIds) ===
  JSON.stringify(['visual_panel', 'music_cue', 'text_panel', 'music_license_review', 'ledger_blank']));
const rows = T.creationJournalRows();
check('일지는 선택 사실과 현재 수리를 분리', rows.some((r) => r.kind === 'past-choice' && r.id === 'audio_instant') &&
  rows.some((r) => r.kind === 'repair' && r.id === 'ledger_blank'));
for (const id of T.consequenceRuntime().requiredRepairIds) check(id + ' 수리', T.completeConsequenceRepair(id) === true);
check('마지막 수리는 repairs_done일 뿐 배틀을 자동 시작하지 않음',
  T.consequenceRuntime().checkpoint === 'repairs_done' && g.mode === 'world');

console.log('[C-4] 무대 시작·장소형 완료는 본편 통계를 오염시키지 않음');
const coreBefore = snapshotCore();
check('무대 시작은 finale_start/segment0 원자 기록', T.beginConsequenceFinale({ skipIntro: true }) === true &&
  T.consequenceRuntime().phase === 'finale' && T.consequenceRuntime().checkpoint === 'finale_start' &&
  T.consequenceRuntime().finale.segment === 0 && g.mode === 'battle' &&
  g.battle.p.subjectKind === 'place' && g.battle.p.completionMode === 'stage');
for (let i = 1; i <= 3; i++) {
  T.retreatPersuasion();
  if (i === 2) check('두 번째 물러남은 구간 단서를 표시', g.dialog.lines.some((line) => /\[구간 도움\]/.test(line)));
  if (i === 3) check('세 번째 물러남은 느린 파도 상태를 표시', g.dialog.lines.some((line) => /\[도움 켜짐\].*25%/s.test(line)));
  env.advanceDialog();
  check(`부드러운 물러남 ${i}/3 저장`, T.consequenceRuntime().finale.assistLevel === i && g.mode === 'world');
  T.restartConsequenceStage();
}
check('세 번 물러나면 선택 가능한 25% 느린 파도 보정', T.consequenceRuntime().finale.slowWaveEnabled === true);
g.battle.pState = 'shaken';
T.enterBattleWave();
check('첫 실제 패턴 파도는 무피해 연습이고 느린 속도 적용',
  g.battle.wave.practice === true && Math.abs(g.battle.arena.sf - 0.54) < 0.001);
g.battle.wave = null;
g.battle.phase = 'menu';
g.battle.gauge = g.battle.gaugeMax;
g.battle.spareReady = true;
g.battle.menuIdx = 3;
env.tap('z');
check('실제 안아 주기 입력은 자비·랭크 없이 결과 대사와 허브로 직행',
  g.mode === 'dialog' && g.map === 'timelinehub' && g.battle === null &&
  T.consequenceRuntime().phase === 'result' && T.consequenceRuntime().checkpoint === 'complete' &&
  T.consequenceRuntime().complete === true);
check('완료 ID는 유일', JSON.stringify(g.flags.consequenceCampaign.completedPairIds) === JSON.stringify(['d1_copyright']));
check('장소형 완료가 본편 통계를 바꾸지 않음', snapshotCore() === coreBefore);

console.log('[C-5] 허브 잠금·재현 및 체크포인트 복원');
const hub = T.consequenceHubProjection();
check('D-1 완료/재현 뒤 D-3만 순차 해금', hub[0].complete && hub[0].replay &&
  !hub[1].locked && hub.slice(2).every((p) => p.locked));
for (const checkpoint of ['past_start', 'past_rooms', 'past_done', 'present_start', 'repairs_done', 'finale_start', 'complete']) {
  const result = T.resumeConsequenceCampaign('d1_copyright', checkpoint);
  check(checkpoint + ' 결정적 복원', result && result.checkpoint === checkpoint &&
    (checkpoint === 'complete' ? g.map === 'timelinehub' : g.map === 'creationhall') &&
    (checkpoint === 'repairs_done' ? g.mode === 'world' : true));
  if (checkpoint === 'past_done') {
    T.interactConsequenceProp(env.run("MAP_PROPS.creationhall.find((prop) => prop.kind === 'd1_ledger')"));
    env.advanceDialog();
    check('past_done 복원 뒤 장부에서 현재로 계속', T.consequenceRuntime().checkpoint === 'present_start');
  }
  if (checkpoint === 'finale_start') {
    T.restartConsequenceStage();
    check('저장된 무대 segment에서 재개', g.battle.claimIdx === 3 &&
      g.battle.gauge === g.battle.gaugeMax && g.battle.spareReady === true);
  }
}
const resumedSlice = g.flags.copyrightSlice;
resumedSlice.complete = false;
resumedSlice.stageRestored = false;
resumedSlice.phase = 'finale';
resumedSlice.checkpoint = 'finale_start';
resumedSlice.finale.segment = 2;
g.flags.consequenceCampaign.activePairId = 'd1_copyright';
const repairsBeforeResume = JSON.stringify({
  base: resumedSlice.baseRepairs,
  added: resumedSlice.addedRepairs,
});
const normalResume = T.resumeConsequenceCampaign();
check('override 없는 finale_start 재개는 저장 segment의 실제 무대로 진입', normalResume &&
  g.mode === 'battle' && g.battle.consequenceStage === true && g.battle.claimIdx === 2 &&
  g.battle.gauge > 0 && g.battle.gauge < g.battle.gaugeMax);
check('무대 재개가 이미 마친 수리를 초기화하지 않음', repairsBeforeResume === JSON.stringify({
  base: resumedSlice.baseRepairs,
  added: resumedSlice.addedRepairs,
}));

console.log('[C-6] 최소·혼합·최대 파생 수리 조합');
const combos = [
  [['visual_manual', 'audio_reply', 'text_new', 'complete'], 3],
  [['visual_manual', 'audio_instant', 'text_excerpt', 'partial'], 5],
  [['visual_instant', 'audio_instant', 'text_instant', 'missing'], 7],
];
for (const [choices, count] of combos) {
  const ids = T.consequenceRepairIds({ visual: choices[0], audio: choices[1], text: choices[2], ledger: choices[3] });
  check(choices.join('/') + ' 수리 수 ' + count, ids.length === count && new Set(ids).size === ids.length);
}

console.log('[C-7] 순차 허브 잠금과 D-3/D-5/D-7/D-10 범용 여정');
check('허브는 공개된 순차 쌍 시작 훅을 제공', typeof T.startConsequencePair === 'function');
check('D-7 관리자 서명 확인 훅을 제공', typeof T.revealConsequenceIdentity === 'function');

const genericJourneys = [
  {
    pairId: 'd3_consent', mapId: 'synthesis_broadcast_room',
    choices: [['likeness', 'likeness_manual'], ['voice', 'voice_assisted'], ['scene', 'scene_instant'], ['consent', 'consent_partial']],
  },
  {
    pairId: 'd5_recommendation', mapId: 'recommendation_alley',
    choices: [['echo', 'echo_manual'], ['sample', 'sample_assisted'], ['route', 'route_instant'], ['recommendationNote', 'recommendation_note_partial']],
  },
  {
    pairId: 'd7_misinformation', mapId: 'newsroom_repair',
    choices: [['tip', 'tip_manual'], ['context', 'context_assisted'], ['bulletin', 'bulletin_instant'], ['audit', 'audit_partial']],
  },
  {
    pairId: 'd10_judgment', mapId: 'cozy_control_room',
    choices: [['call', 'call_manual'], ['safety', 'safety_assisted'], ['comfort', 'comfort_instant'], ['authority', 'authority_partial']],
  },
];
const legacyBeforeGenericPairs = snapshotCore();
const d1StateBeforeGenericPairs = JSON.stringify(g.flags.copyrightSlice);
const outOfOrderBefore = JSON.stringify({
  map: g.map, mode: g.mode, campaign: g.flags.consequenceCampaign,
  consent: g.flags.consentSlice, recommendation: g.flags.recommendationSlice,
});
check('D-1 뒤에는 D-3만 열리고 D-5 직접 시작은 상태를 바꾸지 않고 거부',
  T.consequenceHubProjection()[0].complete && !T.consequenceHubProjection()[1].locked &&
  T.consequenceHubProjection().slice(2).every((pair) => pair.locked) &&
  T.startConsequencePair('d5_recommendation') === false &&
  outOfOrderBefore === JSON.stringify({
    map: g.map, mode: g.mode, campaign: g.flags.consequenceCampaign,
    consent: g.flags.consentSlice, recommendation: g.flags.recommendationSlice,
  }));

for (let index = 0; index < genericJourneys.length; index++) {
  const journey = genericJourneys[index];
  const priorState = JSON.stringify(g.flags[genericJourneys[index - 1] &&
    genericJourneys[index - 1].pairId === 'd3_consent' ? 'consentSlice' :
    genericJourneys[index - 1] && genericJourneys[index - 1].pairId === 'd5_recommendation' ? 'recommendationSlice' :
    genericJourneys[index - 1] && genericJourneys[index - 1].pairId === 'd7_misinformation' ? 'misinformationSlice' :
    'copyrightSlice']);
  const completedIds = genericJourneys.slice(0, index).map((pair) => pair.pairId);
  check(journey.pairId + '는 열린 허브에서 고유 지도 과거 시작으로 진입',
    T.startConsequencePair(journey.pairId) === true && g.map === journey.mapId &&
    T.consequenceRuntime().pairId === journey.pairId && T.consequenceRuntime().phase === 'past' &&
    T.consequenceRuntime().checkpoint === 'past_start');
  for (const [station, choice] of journey.choices.slice(0, 3)) {
    check(journey.pairId + ' ' + station + ' 과거 선택을 한 번 기록',
      T.recordConsequencePastChoice(station, choice) === true);
  }
  check(journey.pairId + ' 세 방 뒤 past_rooms 검사점', T.consequenceRuntime().checkpoint === 'past_rooms');
  const [disclosureStation, disclosureChoice] = journey.choices[3];
  check(journey.pairId + ' 공개 선택은 past_done 검사점',
    T.recordConsequencePastChoice(disclosureStation, disclosureChoice) === true &&
    T.consequenceRuntime().checkpoint === 'past_done');
  check(journey.pairId + ' 현재 전환은 고유 지도와 present_start를 보존',
    T.beginConsequencePresent() === true && g.map === journey.mapId &&
    T.consequenceRuntime().phase === 'present' && T.consequenceRuntime().checkpoint === 'present_start');
  const repairs = T.consequenceRuntime().requiredRepairIds.slice();
  for (const repairId of repairs) check(journey.pairId + ' ' + repairId + ' 현재 수리',
    T.completeConsequenceRepair(repairId) === true);
  check(journey.pairId + ' 필요한 수리 뒤 repairs_done 검사점',
    T.consequenceRuntime().checkpoint === 'repairs_done');
  if (journey.pairId === 'd7_misinformation') {
    check('D-7은 관리자 서명을 확인하기 전 무대 진입을 막음',
      T.beginConsequenceFinale({ skipIntro: true }) === false &&
      T.consequenceRuntime().checkpoint === 'repairs_done');
    check('D-7 관리자 서명은 플레이어 이름과 제한된 사실만 공개',
      T.revealConsequenceIdentity() === true &&
      T.consequenceRuntime().checkpoint === 'identity_revealed' &&
      g.dialog.lines.some((line) => line === '[관리자 서명] 기록이') &&
      g.dialog.lines.some((line) => line === '확인된 사실: 과거 관리자는 나였다') &&
      g.dialog.lines.every((line) => !/반디.*영이|기억.*지웠|고요.*비상/.test(line)));
    env.advanceDialog();
  } else {
    check(journey.pairId + '에는 관리자 서명 단계가 없음',
      T.revealConsequenceIdentity() === false &&
      T.consequenceRuntime().checkpoint === 'repairs_done');
  }
  check(journey.pairId + ' 장소형 무대는 stage 완료 계약으로 진입',
    T.beginConsequenceFinale({ skipIntro: true }) === true && g.mode === 'battle' &&
    T.consequenceRuntime().checkpoint === 'finale_start' && g.battle.p.subjectKind === 'place' &&
    g.battle.p.completionMode === 'stage');
  check(journey.pairId + ' 완료는 중복 없는 ID와 다음 쌍만 해금',
    T.completeStagePersuasion() === true &&
    JSON.stringify(g.flags.consequenceCampaign.completedPairIds) === JSON.stringify(['d1_copyright'].concat(completedIds, journey.pairId)) &&
    new Set(g.flags.consequenceCampaign.completedPairIds).size === g.flags.consequenceCampaign.completedPairIds.length &&
    T.consequenceHubProjection().slice(index + 3).every((pair) => pair.locked) &&
    (index === genericJourneys.length - 1 || !T.consequenceHubProjection()[index + 2].locked));
  check(journey.pairId + ' 완료는 앞선 쌍 상태와 D-1 상태를 바꾸지 않음',
    d1StateBeforeGenericPairs === JSON.stringify(g.flags.copyrightSlice) &&
    priorState === JSON.stringify(g.flags[genericJourneys[index - 1] &&
      genericJourneys[index - 1].pairId === 'd3_consent' ? 'consentSlice' :
      genericJourneys[index - 1] && genericJourneys[index - 1].pairId === 'd5_recommendation' ? 'recommendationSlice' :
      genericJourneys[index - 1] && genericJourneys[index - 1].pairId === 'd7_misinformation' ? 'misinformationSlice' :
      'copyrightSlice']));
}

const completedBeforeReplay = JSON.stringify(g.flags.consequenceCampaign.completedPairIds);
const replayCoreBefore = snapshotCore();
const replayStarted = T.startConsequencePair('d10_judgment');
check('완료한 D-10 재현은 과거 맵에서 실제 플레이로 시작하고 완료 ID를 보존',
  replayStarted === true && g.map === 'cozy_control_room' && g.mode === 'world' &&
  T.consequenceRuntime().pairId === 'd10_judgment' && T.consequenceRuntime().phase === 'past' &&
  T.consequenceRuntime().checkpoint === 'past_start' && T.consequenceRuntime().complete === false &&
  completedBeforeReplay === JSON.stringify(g.flags.consequenceCampaign.completedPairIds));
if (T.consequenceRuntime().pairId === 'd10_judgment' && T.consequenceRuntime().phase === 'past') {
  for (const [station, choice] of genericJourneys[genericJourneys.length - 1].choices) {
    T.recordConsequencePastChoice(station, choice);
  }
  T.beginConsequencePresent();
  for (const repairId of T.consequenceRuntime().requiredRepairIds) T.completeConsequenceRepair(repairId);
  T.beginConsequenceFinale({ skipIntro: true });
  T.completeStagePersuasion();
}
check('완료한 D-10 재현을 다시 마쳐도 완료 ID와 본편 통계는 중복·오염되지 않음',
  completedBeforeReplay === JSON.stringify(g.flags.consequenceCampaign.completedPairIds) &&
  new Set(g.flags.consequenceCampaign.completedPairIds).size === g.flags.consequenceCampaign.completedPairIds.length &&
  T.consequenceHubProjection()[4].complete && T.consequenceHubProjection()[4].replay &&
  replayCoreBefore === snapshotCore());
check('범용 쌍 여정도 본편 장·배틀 통계를 오염시키지 않음', snapshotCore() === legacyBeforeGenericPairs);

console.log('[C-8] 실제 월드 조사 입력과 저장 왕복');
T.startNewGameForRoute(1, '걷는이', 'consequence-pairs');
env.advanceDialog();
env.setPlayer(4, 4, 'up');
env.tap('z');
check('그림 작업대 앞 Z가 실제 3지 선택창을 연다', g.mode === 'choice' && g.choice.options.length === 3);
env.tap('z');
check('수동 선택은 바로 저장하지 않고 1/3 확인 행동을 연다', g.mode === 'choice' &&
  /작업 1\/3/.test(g.choice.prompt) && T.consequenceRuntime().pastChoices.visual === null);
env.tap('z');
check('두 번째 확인 단계 전에도 아직 선택을 저장하지 않음', g.mode === 'choice' &&
  /작업 2\/3/.test(g.choice.prompt) && T.consequenceRuntime().pastChoices.visual === null);
env.tap('x');
check('마지막 단계 전 취소는 월드로 돌아가고 선택을 바꾸지 않음', g.mode === 'world' &&
  T.consequenceRuntime().pastChoices.visual === null);
const cancelledSave = JSON.parse(env.storage.get('fabletest2-memento-preview-slot-1'));
check('취소 뒤 슬롯에도 과거 선택이 기록되지 않음', cancelledSave.flags.copyrightSlice.checkpoint === 'past_start' &&
  cancelledSave.flags.copyrightSlice.pastChoices.visual === null);
env.tap('z');
env.tap('z');
env.tap('z');
env.tap('z');
env.tap('z');
env.advanceDialog();
check('선택창 결정이 visual 선택을 한 번 기록', T.consequenceRuntime().pastChoices.visual === 'visual_manual');
const saved = JSON.parse(env.storage.get('fabletest2-memento-preview-slot-1'));
check('past_rooms 체크포인트가 V11 슬롯에 즉시 저장', saved.v === 11 &&
  saved.flags.copyrightSlice.checkpoint === 'past_rooms' &&
  saved.flags.copyrightSlice.pastChoices.visual === 'visual_manual');

console.log('[C-9] 다섯 쌍 뒤 수동 시간선 결합과 누적 엔딩');
for (const name of [
  'startConsequenceTimeline', 'placeConsequenceTimelineCard', 'undoConsequenceTimelineCard',
  'submitConsequenceTimeline', 'advanceConsequenceRestoration', 'chooseConsequenceEnding',
  'openTimelineLab', 'setTimelineLabJourney', 'setTimelineLabFinalChoice',
  'previewTimelineLabEnding', 'resetTimelineLab', 'closeTimelineLab',
]) check(name + ' 훅이 존재', typeof T[name] === 'function');

T.startNewGameForRoute(2, '잇는이', 'consequence-pairs');
env.advanceDialog();
const fullPairFixtures = [
  ['d1_copyright', 'copyrightSlice', { visual: 'visual_manual', audio: 'audio_reply', text: 'text_new', ledger: 'complete' }],
  ['d3_consent', 'consentSlice', { likeness: 'likeness_manual', voice: 'voice_manual', scene: 'scene_manual', consent: 'consent_complete' }],
  ['d5_recommendation', 'recommendationSlice', { echo: 'echo_manual', sample: 'sample_manual', route: 'route_manual', recommendationNote: 'recommendation_note_complete' }],
  ['d7_misinformation', 'misinformationSlice', { tip: 'tip_manual', context: 'context_manual', bulletin: 'bulletin_manual', audit: 'audit_complete' }],
  ['d10_judgment', 'judgmentSlice', { call: 'call_manual', safety: 'safety_manual', comfort: 'comfort_manual', authority: 'authority_complete' }],
];
for (const [pairId, stateKey, pastChoices] of fullPairFixtures) {
  Object.assign(g.flags[stateKey], {
    pastChoices, phase: 'result', checkpoint: 'complete', stageRestored: true, complete: true,
  });
  g.flags.consequenceCampaign.completedPairIds.push(pairId);
}
g.flags.consequenceCampaign.activePairId = null;
g.map = 'timelinehub'; g.mode = 'world';
check('다섯 쌍 완료 뒤 파이널 시간선에 진입', T.startConsequenceTimeline() === true &&
  g.mode === 'consequenceorder' && g.flags.consequenceCampaign.timelineRestored === false);
check('파이널 카드에 날짜·장소·의도·결과가 모두 있음',
  g.consequenceTimeline.cards.length === 5 && g.consequenceTimeline.cards.every((card) =>
    card.daysAgo && card.title && card.intention && card.consequence));
check('파이널 선택 문구가 책임·의존·단절 계약을 보존',
  JSON.stringify(T.consequenceFinalChoices().map((choice) => choice.label)) === JSON.stringify([
    '함께 기록을 복원한다', '기억을 다시 잠근다',
    '앞으로의 결정을 AI에 맡긴다', 'AI 연결을 모두 끊는다',
  ]));
const wrongOrder = ['d1_copyright', 'd3_consent', 'd5_recommendation', 'd7_misinformation', 'd10_judgment'];
for (const pairId of wrongOrder) check('오답 카드 배치 ' + pairId, T.placeConsequenceTimelineCard(pairId) === true);
check('오답은 배열을 보존하고 횟수만 올림', T.submitConsequenceTimeline() === false &&
  g.flags.consequenceCampaign.finalTimelineWrong === 1 &&
  JSON.stringify(g.flags.consequenceCampaign.finalTimelineDraft) === JSON.stringify(wrongOrder) &&
  g.flags.consequenceCampaign.timelineRestored === false);
g.consequenceTimeline.feedback = null;
check('두 번째 오답은 인과 질문을 제공', T.submitConsequenceTimeline() === false &&
  g.flags.consequenceCampaign.finalTimelineWrong === 2 && /편리한 의도/.test(g.consequenceTimeline.feedback));
g.consequenceTimeline.feedback = null;
check('세 번째 오답은 날짜 테두리 힌트를 제공', T.submitConsequenceTimeline() === false &&
  g.flags.consequenceCampaign.finalTimelineWrong === 3 && /날짜 테두리/.test(g.consequenceTimeline.feedback));
for (let i = 0; i < wrongOrder.length; i++) T.undoConsequenceTimelineCard();
const chronologicalOrder = ['d10_judgment', 'd7_misinformation', 'd5_recommendation', 'd3_consent', 'd1_copyright'];
for (const pairId of chronologicalOrder) T.placeConsequenceTimelineCard(pairId);
check('정답 제출만 시간선을 원자 결합', T.submitConsequenceTimeline() === true &&
  g.flags.consequenceCampaign.timelineRestored === true &&
  g.flags.consequenceCampaign.finalTimelineDraft.length === 0 && g.mode === 'consequencerestore');
check('복원 장면 건너뛰기는 네 파이널 선택으로 이동', T.advanceConsequenceRestoration(true) === true &&
  g.mode === 'consequencechoice');
check('누적 복원 여정은 함께 복원 선택으로 기존 home 장면에 도달',
  T.chooseConsequenceEnding('restore_together') === true && g.mode === 'ending' &&
  g.flags.endingId === 'home' && g.flags.trueEnding === true &&
  g.flags.consequenceCampaign.canonicalEndingId === 'home' &&
  g.flags.consequenceCampaign.canonicalEndingBasis.ruleVersion === 'ending-rule-v1' &&
  g.flags.consequenceCampaign.timelineLabUnlocked === true);

console.log('[C-10] 불완전·잘못된 입력 거부와 canonical freeze');
const frozenCanonical = JSON.stringify({
  id: g.flags.consequenceCampaign.canonicalEndingId,
  basis: g.flags.consequenceCampaign.canonicalEndingBasis,
});
g.flags.consentSlice.complete = false;
check('첫 canonical 뒤 다른 선택은 다시 계산하지 않음', T.chooseConsequenceEnding('reset_again') === false &&
  frozenCanonical === JSON.stringify({
    id: g.flags.consequenceCampaign.canonicalEndingId,
    basis: g.flags.consequenceCampaign.canonicalEndingBasis,
  }));
g.flags.consequenceCampaign.canonicalEndingId = null;
g.flags.consequenceCampaign.canonicalEndingBasis = null;
g.flags.endingId = null; g.flags.trueEnding = false;
check('pair state 하나가 불완전하면 완료 ID가 있어도 엔딩 계산 거부',
  T.chooseConsequenceEnding('restore_together') === false &&
  g.flags.consequenceCampaign.canonicalEndingId === null && g.flags.endingId === null);
g.flags.consentSlice.complete = true;
check('고정 네 ID 밖 선택은 엔딩 계산 거부', T.chooseConsequenceEnding('unknown_choice') === false &&
  g.flags.consequenceCampaign.canonicalEndingId === null && g.flags.endingId === null);

console.log('[C-11] 시간선 실험실은 원본 슬롯을 한 바이트도 쓰지 않음');
check('유효한 canonical을 다시 한 번 만들 수 있음', T.chooseConsequenceEnding('restore_together') === true &&
  g.flags.consequenceCampaign.canonicalEndingId === 'home');
g.mode = 'world'; g.map = 'timelinehub';
const storageBeforeLab = JSON.stringify(Array.from(env.storage.entries()).sort(([a], [b]) => a.localeCompare(b)));
const canonicalBeforeLab = JSON.stringify({
  id: g.flags.consequenceCampaign.canonicalEndingId,
  basis: g.flags.consequenceCampaign.canonicalEndingBasis,
  pairs: fullPairFixtures.map(([, stateKey]) => g.flags[stateKey]),
  map: g.map, x: g.player.x, y: g.player.y,
});
check('첫 엔딩 뒤 시간선 실험실 진입', T.openTimelineLab() === true && g.mode === 'timelinelab' &&
  /첫 시간선은 바뀌지 않습니다/.test(T.srLiveText()));
check('실험실에서 D-5 여정을 의존으로 변경', T.setTimelineLabJourney('d5_recommendation', 'depend') === true);
check('실험실에서 파이널 선택을 AI 위임으로 변경', T.setTimelineLabFinalChoice('delegate_all') === true);
const labResult = T.previewTimelineLabEnding();
check('실험 결과는 기존 네 ID 하나를 보여 줌', labResult && ['home', 'silent', 'dawn', 'farewell'].includes(labResult.endingId));
check('실험 중에도 localStorage는 바뀌지 않음', storageBeforeLab ===
  JSON.stringify(Array.from(env.storage.entries()).sort(([a], [b]) => a.localeCompare(b))));
check('실험실 처음으로는 canonical 가정만 메모리에서 복원', T.resetTimelineLab() === true &&
  g.timelineLab.result === null && g.timelineLab.finalChoiceId === 'restore_together' &&
  g.timelineLab.journeys.find((item) => item.pairId === 'd5_recommendation').profile === 'restore' &&
  storageBeforeLab === JSON.stringify(Array.from(env.storage.entries()).sort(([a], [b]) => a.localeCompare(b))));
check('실험실 나가기는 허브로 돌아감', T.closeTimelineLab() === true && g.mode === 'world' && g.map === 'timelinehub');
check('실험 뒤 슬롯·canonical·pair·위치가 그대로', storageBeforeLab ===
  JSON.stringify(Array.from(env.storage.entries()).sort(([a], [b]) => a.localeCompare(b))) &&
  canonicalBeforeLab === JSON.stringify({
    id: g.flags.consequenceCampaign.canonicalEndingId,
    basis: g.flags.consequenceCampaign.canonicalEndingBasis,
    pairs: fullPairFixtures.map(([, stateKey]) => g.flags[stateKey]),
    map: g.map, x: g.player.x, y: g.player.y,
  }));

console.log('[C-12] 허브의 실제 조사 동선으로 파이널과 실험실 진입');
const finalCampaignSnapshot = JSON.parse(JSON.stringify(g.flags.consequenceCampaign));
Object.assign(g.flags.consequenceCampaign, {
  timelineRestored: false, finalTimelineDraft: [], canonicalEndingId: null,
  canonicalEndingBasis: null, finalChoiceId: null, timelineLabUnlocked: false,
});
g.mode = 'world'; g.map = 'timelinehub'; g.dialog = null;
env.setPlayer(10, 14, 'up');
env.tap('z');
check('다섯 시간을 잇는 문 앞 실제 Z 조사가 수동 시간선을 연다', g.mode === 'consequenceorder');
g.consequenceTimeline = null;
g.flags.consequenceCampaign = finalCampaignSnapshot;
g.mode = 'world'; g.map = 'timelinehub'; g.dialog = null;
env.setPlayer(14, 14, 'up');
env.tap('z');
check('첫 결말 뒤 시간선 실험실 앞 실제 Z 조사가 무저장 실험을 연다', g.mode === 'timelinelab');
T.closeTimelineLab();

console.log(`\n✔ consequence runtime ${passed} assertions passed`);
