// 주제별 문제 목록 생성기 (Node.js)
// 사용법: node tools/quizlist.js
// src/data.js의 QUIZZES·MONSTERS를 읽어 교사용 인쇄 문서(docs/주제별-문제-목록.md)를
// 자동으로 만든다. 데이터가 바뀌면 다시 실행하면 문서가 항상 최신으로 맞춰진다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = {
  window: undefined,
  document: { createElement: () => ({ getContext: () => null }) },
  console, Math, Set, Map, JSON, Object,
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['src/sprites.js', 'src/audio.js', 'src/data.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
}
// 주제 라벨은 data.js의 TOPIC_LABEL을 단일 출처로 공유한다.
const { QUIZZES, MONSTERS, TOPIC_LABEL } = vm.runInContext('({ QUIZZES, MONSTERS, TOPIC_LABEL })', ctx);
function topicLabel(t) { return TOPIC_LABEL[t] || t; }

// 주제 → 그 주제를 담당하는 몬스터 이름들
const monByTopic = {};
for (const [, m] of Object.entries(MONSTERS)) {
  const topics = Array.isArray(m.topic) ? m.topic : [m.topic];
  for (const t of topics) (monByTopic[t] = monByTopic[t] || []).push(m.name);
}

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

const topics = Object.keys(QUIZZES);
let totalQ = 0;
const out = [];
out.push('# 주제별 문제 목록');
out.push('');
out.push('> 이 문서는 `node tools/quizlist.js`로 **자동 생성**됩니다. 직접 고치지 말고,');
out.push('> 문제를 바꾸려면 `src/data.js`의 `QUIZZES`를 수정한 뒤 다시 생성해 주세요.');
out.push('');
out.push(`- 주제 수: **${topics.length}개**`);
for (const t of topics) totalQ += QUIZZES[t].length;
out.push(`- 전체 문항 수: **${totalQ}문항**`);
out.push('');
out.push('---');
out.push('');

for (const t of topics) {
  const qs = QUIZZES[t];
  const mons = monByTopic[t] ? ` · 관련 몬스터: ${monByTopic[t].join(', ')}` : '';
  out.push(`## ${topicLabel(t)}  \`${t}\`  (${qs.length}문항)${mons}`);
  out.push('');
  qs.forEach((q, i) => {
    out.push(`**${i + 1}. ${oneLine(q.q)}**`);
    out.push('');
    q.a.forEach((opt, j) => {
      const mark = j === q.c ? ' ✅' : '';
      out.push(`- ${String.fromCharCode(9312 + j)} ${oneLine(opt)}${mark}`);
    });
    if (q.why) {
      out.push('');
      out.push(`  > 💡 ${oneLine(q.why)}`);
    }
    out.push('');
  });
  out.push('---');
  out.push('');
}

const dir = path.join(__dirname, '..', 'docs');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, '주제별-문제-목록.md');
fs.writeFileSync(file, out.join('\n'), 'utf8');
console.log(`✔ 생성됨: docs/주제별-문제-목록.md  (${topics.length}개 주제, ${totalQ}문항)`);
