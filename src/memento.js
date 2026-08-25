const MEMENTO_RECORDS = [
  {
    id: 'reset_after', daysAgo: 1, title: '남겨 둔 한 문장',
    pages: [
      '[손상된 기록]\n현재보다 1일 전',
      '기억 초기화가 끝났다.\n열린 안내문은 한 장뿐이다.',
      '"영이가 코어를 망가뜨렸다.\n반디를 믿고 마음 조각을 모아라."',
      '최초 입력자: 확인할 수 없음.\n한 문장만으로는 알 수 없다.',
    ],
  },
  {
    id: 'reset_before', daysAgo: 2, title: '잠근 사람',
    pages: [
      '[손상된 기록]\n현재보다 2일 전',
      '관리자 기록: 잠금 예약됨.\n기억 초기화: 실행 대기.',
      '사유: 영이와 고요의 오류를\n막기 위해.',
      '승인자 이름은 손상되어 있다.\n잠근 사람은 아직 보이지 않는다.',
    ],
  },
  {
    id: 'city_failure', daysAgo: 3, title: '닫힌 문이 막은 것',
    pages: [
      '[손상된 기록]\n현재보다 3일 전',
      '다섯 거리의 경고등이\n한꺼번에 켜진다.',
      '비상 정지 장치 고요:\n코어 연결을 잠시 끊는다.',
      '확산 범위가 멈춘다.\n원인 입력자는 확인할 수 없음.',
    ],
  },
  {
    id: 'yeongi_warning', daysAgo: 5, title: '한 번만 더',
    pages: [
      '[손상된 기록]\n현재보다 5일 전',
      '영이: "편리해졌지만,\n사람들이 확인할 틈이 없어."',
      '영이: "결정까지 내가\n대신하면 안 돼."',
      '관리자: "한 번만 더 지켜보자.\n모두 좋아하고 있잖아."',
    ],
  },
  {
    id: 'first_approval', daysAgo: 7, title: '편리함 승인',
    pages: [
      '[손상된 기록]\n현재보다 7일 전',
      '관리자 이름: [플레이어 이름]\n다섯 설정을 승인한다.',
      '동의는 짧게. 추천은 비슷한 것만.\n출처 확인은 빠르게.',
      '머물게 하는 장치와 관계 도움도 켠다.\n이유: 모두가 덜 힘들었으면 해서.',
    ],
  },
];

const RESTORED_TIMELINE = [
  {
    recordId: 'first_approval', daysAgo: 7, title: '처음의 승인',
    pages: ['7일 전 · 나는 편리함을 서두르며\n다섯 설정을 함께 승인했다.'],
    summary: '좋은 뜻이었지만, 확인할 시간을 빼앗았다.',
  },
  {
    recordId: 'yeongi_warning', daysAgo: 5, title: '영이의 경고',
    pages: ['5일 전 · 영이는 사람의 판단이\n밀려난다고 나를 멈춰 세웠다.'],
    summary: '경고는 이미 곁에 있었다.',
  },
  {
    recordId: 'city_failure', daysAgo: 3, title: '고요의 정지',
    pages: ['3일 전 · 고요는 더 번지지 않게\n문과 코어 연결을 잠시 닫았다.'],
    summary: '닫힌 문은 공격이 아니라 안전을 위한 멈춤이었다.',
  },
  {
    recordId: 'reset_before', daysAgo: 2, title: '숨긴 기록',
    pages: ['2일 전 · 나는 두려워 기록을 잠그고\n영이와 고요를 원인처럼 적었다.'],
    summary: '두려움은 이야기의 일부만 남겼다.',
  },
  {
    recordId: 'reset_after', daysAgo: 1, title: '한쪽짜리 안내',
    pages: ['1일 전 · 초기화 뒤에는\n내가 남긴 한 문장만 열렸다.'],
    summary: '이제 나는 기억을 벌이 아닌 약속으로 고른다.',
  },
];

const MEMENTO_CLUES = [
  {
    id: 'bandi_decision', beforeFinal: true,
    text: '반디는 프롤로그 끝에서 "나는 길을 비출게. 어느 길로 갈지는 네가 정해."라고 말한다.',
  },
  {
    id: 'unknown_author', beforeFinal: true,
    text: '손상된 기록마다 최초 입력자의 이름이 비어 있어, 한쪽짜리 안내문을 그대로 믿기 어렵다.',
  },
  {
    id: 'goyo_stop', beforeFinal: true,
    text: '고요의 뜰 입구와 기록 3에 같은 "비상 정지" 표식이 남아 있다.',
  },
  {
    id: 'same_voice', beforeFinal: true,
    text: '반디와 영이는 확인하고 스스로 결정하라는 같은 뜻의 말을 남긴다.',
  },
];

const MEMENTO_POST_RECORD_LINES = {
  reset_after: '반디: 길은 맞아. 그래도 누가 쓴 문장인지는 아직 몰라.\n…빈칸은 빈칸으로 두자.',
};

const MEMENTO_ENDING_THEMES = {
  home: 'restore',
  silent: 'repeat',
  dawn: 'depend',
  farewell: 'disconnect',
};

const MEMENTO_ROUTES = Object.freeze([
  Object.freeze({ id: 'original', label: '원래 모험 시작' }),
  Object.freeze({ id: 'memento', label: '메멘토 시간선 체험' }),
]);

const MEMENTO_TERMINAL = Object.freeze({
  id: 'admin-terminal',
  title: '현재 · 관리자 단말',
  prompt: '손상된 기록과 비교하면, 이 안내문에서 지금 확인된 것은?',
  locked: '기록에 빈칸이 있다. 먼저 「남겨 둔 한 문장」을 끝까지 확인하자.',
  choices: Object.freeze([
    Object.freeze({ id: 'blame-yeongi', label: '영이가 코어를 망가뜨렸다', correct: false }),
    Object.freeze({ id: 'author-unknown', label: '쓴 사람은 아직 확인할 수 없다', correct: true }),
    Object.freeze({ id: 'trust-bandi', label: '반디의 말은 모두 정답이다', correct: false }),
  ]),
  correctText: '확인 전 기록으로 표시했다. 출구 잠금이 풀린다.',
  wrongText: '그 결론은 아직 기록으로 확인되지 않았다. 빈칸을 다시 보자.',
});

const MEMENTO_CHRONOLOGICAL_IDS = RESTORED_TIMELINE.map((item) => item.recordId);

function mementoRecordForChapter(chapter) {
  const record = Number.isInteger(chapter) ? MEMENTO_RECORDS[chapter - 1] : null;
  return record ? record.id : null;
}

function mementoAxisProjection(unlockedIds) {
  const unlocked = new Set(Array.isArray(unlockedIds) ? unlockedIds : []);
  const nodes = MEMENTO_RECORDS.map((record) => ({
    id: record.id,
    daysAgo: record.daysAgo,
    unlocked: unlocked.has(record.id),
  }));
  return {
    direction: 'present-to-past',
    label: `현재 ◀ ${nodes.map((node) => `${node.unlocked ? '●' : '○'}${node.daysAgo}`).join(' · ')}일 ◀ 과거`,
    nodes,
  };
}

function mementoOrderingCards() {
  return MEMENTO_CHRONOLOGICAL_IDS.map((id) => {
    const record = MEMENTO_RECORDS.find((item) => item.id === id);
    return { id: record.id, daysAgo: record.daysAgo, title: record.title };
  });
}

function isMementoChronologicalOrder(ids) {
  return Array.isArray(ids) && ids.length === MEMENTO_CHRONOLOGICAL_IDS.length &&
    ids.every((id, index) => id === MEMENTO_CHRONOLOGICAL_IDS[index]);
}
