import { useState } from 'react';

import dynastyData from '../../data/dynasty.json';
import { ENDING_YEAR, STARTING_YEAR, endingYearOf } from '../../core/constants';
import { findEvent } from '../../core/events';
import type { Difficulty, GameState, ProvinceId, Scenario, ScoreResult } from '../../core/types';
import {
  DIFFICULTY_LABELS,
  RULER_NAME_MAX_LENGTH,
  SCENARIO_LABELS,
  FACTION_LABELS,
  GENERAL_END_LABELS,
  PROVINCE_LABELS,
  SUCCESSION_LABELS,
} from '../catalogue';

/** 名前が空のまま始めたときに使う既定名。データ側の初期君主に合わせる */
const DEFAULT_RULER_NAME = dynastyData.ruler.name;
/** 世界線の説明。史実が本編で、統一は「もし東を併合できたら」の別枠 */
const SCENARIO_DETAIL: Record<Scenario, { title: string; detail: string }> = {
  historical: {
    title: '史実 — 延命',
    detail: '395年から476年まで、帝国を1年でも長く保たせる。拡大の手段はない',
  },
  reunification: {
    title: '統一 — ローマ再統一',
    detail:
      '東ローマに宣戦し、東方属州を併合してローマを統一する。' +
      'ローマ同士の内戦を見たサーサーン朝ペルシアが背後から介入し、' +
      '6世紀にはユスティニアヌス1世がベリサリウスとナルセスを送り込んでくる。' +
      '565年まで、全170ターン',
  },
};

const DIFFICULTY_DETAIL: Record<Difficulty, string> = {
  beginner: '税収に余裕があり、蛮族の圧力と傭兵の要求も緩い',
  standard: '基準となるバランス',
  veteran: '税収が細り、蛮族は強く、傭兵の要求は速く膨らむ',
};

export function TitleScreen({
  onStart,
  onLoad,
  loadError,
}: {
  onStart: (difficulty: Difficulty, rulerName: string, scenario: Scenario) => void;
  onLoad: (file: File) => void;
  loadError: string | null;
}) {
  // 空のまま始めても遊べるよう、データの既定名を初期値にする
  const [rulerName, setRulerName] = useState(DEFAULT_RULER_NAME);
  const [scenario, setScenario] = useState<Scenario>('historical');
  return (
    <div className="min-h-dvh flex flex-col justify-center px-5 py-10 max-w-lg mx-auto">
      <div className="roman-meander" />
      <h1 className="roman-title text-2xl mt-5 text-center">西ローマ帝国末期</h1>
      <p className="text-center text-[11px] tracking-[0.3em] text-[color:var(--gold)] mt-1">
        S · P · Q · R
      </p>
      <div className="roman-rule mt-3" />
      <p className="text-sm mt-4" style={{ color: 'var(--ink-soft)' }}>
        {STARTING_YEAR}年から{ENDING_YEAR}年まで、全{ENDING_YEAR - STARTING_YEAR}ターン
        （統一の世界線だけは{endingYearOf('reunification')}年まで続く）。
        帝国を1年でも長く保たせることが目的で、拡大は目的ではない。
      </p>
      <p className="text-xs mt-3" style={{ color: 'var(--ink-soft)' }}>
        1年に選べる手は2つまで。何を諦めるかを選ぶことになる。
      </p>

      <label className="mt-6 block">
        <span className="roman-heading text-xs">皇帝の名前</span>
        <input
          type="text"
          value={rulerName}
          maxLength={RULER_NAME_MAX_LENGTH}
          onChange={(e) => setRulerName(e.target.value)}
          placeholder={DEFAULT_RULER_NAME}
          className="roman-tablet mt-1 w-full rounded-sm px-3 py-2 text-sm"
        />
        <span className="mt-1 block text-[11px]" style={{ color: 'var(--ink-soft)' }}>
          代替わりした皇帝の名は自動で付く。在位中はいつでも改名できる
        </span>
      </label>

      <div className="mt-6">
        <span className="roman-heading text-xs">世界線</span>
        <div className="mt-1 space-y-2">
          {(['historical', 'reunification'] as Scenario[]).map((id) => (
            <button
              key={id}
              onClick={() => setScenario(id)}
              className="roman-panel w-full text-left rounded-sm px-4 py-2.5 transition"
              style={
                scenario === id
                  ? {
                      borderColor: 'var(--gold-bright)',
                      boxShadow: '0 0 0 2px rgba(216, 171, 60, 0.45)',
                    }
                  : undefined
              }
            >
              <div className="roman-heading text-sm">{SCENARIO_DETAIL[id].title}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
                {SCENARIO_DETAIL[id].detail}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {(['beginner', 'standard', 'veteran'] as Difficulty[]).map((difficulty) => (
          <button
            key={difficulty}
            onClick={() => onStart(difficulty, rulerName.trim() || DEFAULT_RULER_NAME, scenario)}
            className="roman-panel w-full text-left rounded-sm px-4 py-3 transition"
          >
            <div className="roman-heading text-base">{DIFFICULTY_LABELS[difficulty]}</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
              {DIFFICULTY_DETAIL[difficulty]}
            </div>
          </button>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="roman-heading text-xs">セーブデータから再開</span>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onLoad(file);
            e.target.value = '';
          }}
          className="mt-1 block w-full text-xs file:mr-3 file:rounded-sm file:border-0 file:bg-[color:var(--purple)] file:px-3 file:py-2 file:text-[color:var(--parchment)]"
          style={{ color: 'var(--ink-soft)' }}
        />
        {loadError && (
          <span className="block text-xs mt-1" style={{ color: 'var(--oxblood)' }}>
            {loadError}
          </span>
        )}
      </label>
      <div className="roman-meander mt-6" />
    </div>
  );
}

export function ResultScreen({
  score,
  state,
  onRestart,
}: {
  score: ScoreResult;
  state: GameState;
  onRestart: () => void;
}) {
  const unified = state.unifiedYear !== null;
  const survived = score.status === 'survived';
  const won = unified || survived;
  return (
    <div className="min-h-dvh flex flex-col justify-center px-5 py-10 max-w-lg mx-auto">
      <div className="roman-meander" />
      <div
        className="roman-title text-3xl mt-5 text-center"
        style={{ color: won ? 'var(--purple-deep)' : 'var(--oxblood)' }}
      >
        {unified ? 'ローマは統一された' : survived ? '帝国は存続した' : '帝国は崩壊した'}
      </div>
      <div className="text-sm mt-1 text-center" style={{ color: 'var(--ink-soft)' }}>
        {unified ? `${score.finalYear}年に東西を再統一` : `${score.finalYear}年まで到達`}
      </div>
      <div className="roman-rule mt-3" />

      <dl className="roman-panel rounded-sm mt-6 px-3 py-2 space-y-2">
        <Row label="スコア" value={Math.round(score.score).toLocaleString()} strong />
        <Row label="難易度" value={DIFFICULTY_LABELS[score.difficulty]} />
        <Row label="世界線" value={SCENARIO_LABELS[state.scenario]} />
        {state.scenario === 'reunification' && (
          <>
            <Row
              label="東方属州"
              value={`${state.east.provinces.filter((p) => p.owner === 'west').length} / ${
                state.east.provinces.length
              } を保持`}
            />
            <Row
              label="ペルシア"
              value={
                state.persia.intervened
                  ? `介入（${state.persia.interventionYear}年）・戦力 ${Math.round(
                      state.persia.strength,
                    )}`
                  : '介入せず'
              }
            />
          </>
        )}
        <Row label="保持属州" value={`${score.provincesHeld}`} />
        <Row label="税基盤" value={score.taxBase.toFixed(0)} />
        <Row label="正統性" value={score.legitimacy.toFixed(0)} />
        <Row label="歴代皇帝" value={`${score.rulerCount}人`} />
        <Row label="継承危機" value={`${score.successionCrises}回`} />
        {score.abilitiesAdjusted && (
          <Row label="記録" value="調整済み（他のスコアと比較不可）" />
        )}
      </dl>

      <Chronicle state={state} />

      <button
        onClick={onRestart}
        className="roman-button mt-8 w-full rounded-sm py-3"
      >
        はじめから遊ぶ
      </button>
    </div>
  );
}

/**
 * 年代記。この帝国が何年保ち、誰が死に、何を売り渡したかを並べる。
 *
 * 点数はプレイの良し悪しを1つの数にまとめてしまうが、このゲームの
 * 目的は延命なので「どこまで保ったか」の経過のほうが結果に近い。
 * state から作るのでセーブを読み直しても同じものが出る
 */
function Chronicle({ state }: { state: GameState }) {
  const reigns = reignsOf(state);
  const events = state.firedEventIds
    .map((id) => findEvent(id))
    .filter((event): event is NonNullable<typeof event> => event !== undefined)
    .sort((a, b) => firstYearOf(a) - firstYearOf(b));
  const lost = (Object.keys(state.provinces) as ProvinceId[]).filter(
    (id) => state.provinces[id].control <= 0,
  );
  const settled = Object.values(state.factions).filter((f) => f.stance === 'settled');

  return (
    <section className="mt-8">
      <h2 className="roman-heading text-sm">年代記</h2>
      <div className="roman-rule mt-1" />

      <ol className="mt-2 space-y-1">
        {reigns.map((reign, index) => (
          <li key={index} className="flex gap-2 text-xs">
            <span className="tabular-nums shrink-0" style={{ color: 'var(--gold)' }}>
              {reign.from}–{reign.to}
            </span>
            <span style={{ color: 'var(--ink)' }}>
              {reign.name}
              <span style={{ color: 'var(--ink-soft)' }}>（{reign.note}）</span>
            </span>
          </li>
        ))}
      </ol>

      {events.length > 0 && (
        <ul className="mt-4 space-y-1">
          {events.map((event) => (
            <li key={event.id} className="text-xs" style={{ color: 'var(--oxblood)' }}>
              {event.title}
            </li>
          ))}
        </ul>
      )}

      {state.general.history.length > 0 && (
        <ol className="mt-4 space-y-1">
          {state.general.history.map((record, index) => (
            <li key={record.generalId} className="flex gap-2 text-xs">
              <span className="tabular-nums shrink-0" style={{ color: 'var(--gold)' }}>
                {record.fromYear}–{record.toYear}
              </span>
              <span style={{ color: 'var(--ink-soft)' }}>
                軍司令官 第{index + 1}代（軍事 {record.military}・
                {GENERAL_END_LABELS[record.end]}）
              </span>
            </li>
          ))}
        </ol>
      )}

      <dl className="mt-4 space-y-1 text-xs">
        <ChronicleRow
          label="失った属州"
          value={lost.length > 0 ? lost.map((id) => PROVINCE_LABELS[id]).join('、') : 'なし'}
        />
        <ChronicleRow
          label="定住を許した勢力"
          value={
            settled.length > 0
              ? settled
                  .map(
                    (f) =>
                      `${FACTION_LABELS[f.id]}${
                        f.location === 'exterior' ? '' : `（${PROVINCE_LABELS[f.location]}）`
                      }`,
                  )
                  .join('、')
              : 'なし'
          }
        />
      </dl>
    </section>
  );
}

function ChronicleRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0" style={{ color: 'var(--ink-soft)' }}>
        {label}
      </dt>
      <dd style={{ color: 'var(--ink)' }}>{value}</dd>
    </div>
  );
}

interface Reign {
  from: number;
  to: number;
  name: string;
  note: string;
}

/**
 * 歴代の在位期間。
 * history には没年しか無いので、前の代の没年を次の代の即位年とみなす
 */
function reignsOf(state: GameState): Reign[] {
  const reigns: Reign[] = [];
  let from = STARTING_YEAR;
  for (const record of state.dynasty.history) {
    reigns.push({
      from,
      to: record.year,
      name: record.name,
      note: `${record.cause === 'assassination' ? '暗殺' : '崩御'}・${
        SUCCESSION_LABELS[record.outcome]
      }`,
    });
    from = record.year;
  }
  reigns.push({
    from,
    to: state.year,
    name: state.dynasty.ruler.name,
    note: state.status === 'collapsed' ? '帝国の終わり' : '在位中',
  });
  return reigns;
}

/** 並べ替え用。年が決まっていないイベントは発火可能になる年で見る */
function firstYearOf(event: { condition: { year?: number; minYear?: number } }): number {
  return event.condition.year ?? event.condition.minYear ?? 0;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className="flex items-baseline justify-between pb-1.5"
      style={{ borderBottom: '1px solid rgba(168, 128, 31, 0.35)' }}
    >
      <dt className="text-sm" style={{ color: 'var(--ink-soft)' }}>
        {label}
      </dt>
      <dd
        className={`tabular-nums ${strong ? 'text-2xl font-bold' : 'text-sm'}`}
        style={{ color: strong ? 'var(--purple-deep)' : 'var(--ink)' }}
      >
        {value}
      </dd>
    </div>
  );
}
