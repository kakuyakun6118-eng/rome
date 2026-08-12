import { useState } from 'react';

import { MAX_ACTIONS_PER_TURN } from '../core/constants';
import { consumesActionSlot } from '../core/tick';
import type { GameState, ProvinceId } from '../core/types';
import { ActionPanel } from './components/ActionPanel';
import { BattleScreen } from './components/BattleScreen';
import {
  MapLegend,
  ProvinceMap,
  occupierNames,
  type InspectTarget,
} from './components/ProvinceMap';
import { PowerCard } from './components/PowerCard';
import { CourtFigures } from './components/CourtFigures';
import { CourtPanel } from './components/CourtPanel';
import { EastPanel } from './components/EastPanel';
import { RulerPanel } from './components/RulerPanel';
import { ResultScreen, TitleScreen } from './components/Screens';
import { StatusBar } from './components/StatusBar';
import { DEMAND_DETAILS, DEMAND_LABELS, FACTION_LABELS, PROVINCE_LABELS } from './catalogue';
import { useMusic } from './music';
import { useGame } from './useGame';

/**
 * 突きつけられている要求。行動枠を消費せずに答えられるので、
 * 行動の一覧とは別に、見落とさない場所へ出す
 */
function DemandPanel({ state }: { state: GameState }) {
  const demands = Object.values(state.factions).filter(
    (faction) => faction.stance === 'hostile' && faction.demand !== null,
  );
  if (demands.length === 0) return null;

  return (
    <section
      className="roman-panel rounded-sm px-3 py-2"
      style={{ borderColor: 'var(--oxblood)', backgroundColor: 'rgba(139, 35, 49, 0.09)' }}
    >
      <h2 className="roman-heading text-sm" style={{ color: 'var(--oxblood)' }}>
        突きつけられている要求
      </h2>
      <ul className="mt-1.5 space-y-1.5">
        {demands.map((faction) => {
          const demand = faction.demand;
          if (demand === null) return null;
          return (
            <li key={faction.id} className="text-xs">
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                {FACTION_LABELS[faction.id]}
              </span>
              <span style={{ color: 'var(--ink-soft)' }}>
                {faction.location !== 'exterior' && `（${PROVINCE_LABELS[faction.location]}）`} —{' '}
              </span>
              <span className="font-semibold" style={{ color: 'var(--purple)' }}>
                {DEMAND_LABELS[demand.type]}
                {demand.type === 'gold' && ` ${Math.round(demand.amount)}`}
                {demand.type === 'land' &&
                  demand.targetProvince &&
                  ` （${PROVINCE_LABELS[demand.targetProvince]}）`}
              </span>
              <div style={{ color: 'var(--ink-soft)' }}>{DEMAND_DETAILS[demand.type]}</div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--oxblood)' }}>
        答えるまで、その勢力は戦いを有利に進め、土地に住み着きやすくなる。
        「交渉 → 要求を飲む」で応じる（行動枠は消費しない）
      </p>
    </section>
  );
}

/**
 * 戦線 — いま敵が踏み込んでいる属州。
 *
 * 地図を1州ずつ触らないと「どこが攻められているか」が分からなかった。
 * 地図の下に並べて、色と名前を一目で結び付ける
 */
function FrontsPanel({ state }: { state: GameState }) {
  const usurped = new Set(state.usurpers.flatMap((u) => u.provinces));
  const fronts = (Object.keys(state.provinces) as ProvinceId[])
    .map((id) => ({
      id,
      province: state.provinces[id],
      foes: Object.values(state.factions).filter(
        (f) => f.location === id && f.stance !== 'foederati',
      ),
      usurped: usurped.has(id),
    }))
    .filter((row) => row.foes.length > 0 || row.usurped);

  if (fronts.length === 0) {
    return (
      <section className="roman-panel rounded-sm px-3 py-2">
        <h2 className="roman-heading text-sm">戦線</h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
          いま帝国領に踏み込んでいる敵はいない
        </p>
      </section>
    );
  }

  return (
    <section
      className="roman-panel rounded-sm px-3 py-2"
      style={{ borderColor: 'var(--oxblood)' }}
    >
      <h2 className="roman-heading text-sm" style={{ color: 'var(--oxblood)' }}>
        戦線 {fronts.length} 州
      </h2>
      <ul className="mt-1 space-y-1">
        {fronts.map((row) => (
          <li key={row.id} className="text-xs flex items-baseline gap-1.5">
            <span className="font-semibold shrink-0" style={{ color: 'var(--ink)' }}>
              {PROVINCE_LABELS[row.id]}
            </span>
            <span className="tabular-nums shrink-0" style={{ color: 'var(--ink-soft)' }}>
              支配 {Math.round(row.province.control)} / 守備{' '}
              {Math.round(row.province.garrison)}
            </span>
            <span className="truncate" style={{ color: 'var(--oxblood)' }}>
              {row.usurped && '僭称帝国 '}
              {row.foes
                .map(
                  (f) =>
                    `${FACTION_LABELS[f.id]}${f.stance === 'settled' ? '（定住）' : ''} ${Math.round(f.strength)}`,
                )
                .join('、')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 画面の区切り。
 *
 * 以前は地図・王朝・宮廷・東方・要求・行動・記録を1本の縦列に並べていて、
 * 携帯では6画面ぶんの巻物になっていた。**同時に見たいものだけを1画面に
 * まとめる**ほうが読める。状況表示と「次の年へ」はどの区でも動かさない
 */
type Tab = 'map' | 'court' | 'act' | 'log';

const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: '地図' },
  { id: 'court', label: '宮廷' },
  { id: 'act', label: '行動' },
  { id: 'log', label: '記録' },
];

function TabBar({
  current,
  onSelect,
  badges,
}: {
  current: Tab;
  onSelect: (tab: Tab) => void;
  /** 見落とすと困るものの数。0 なら出さない */
  badges: Partial<Record<Tab, number>>;
}) {
  return (
    <nav className="roman-tablet" style={{ borderWidth: '0 0 1px 0' }}>
      <div className="max-w-lg mx-auto grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.id === current;
          const badge = badges[tab.id] ?? 0;
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className="relative py-2 text-xs"
              style={{
                color: active ? 'var(--purple-deep)' : 'var(--ink-soft)',
                fontWeight: active ? 700 : 400,
                letterSpacing: '0.1em',
                borderBottom: `2px solid ${active ? 'var(--purple)' : 'transparent'}`,
              }}
            >
              {tab.label}
              {badge > 0 && (
                <span
                  className="ml-1 inline-block rounded-full px-1 text-[10px] align-top"
                  style={{ background: 'var(--oxblood)', color: 'var(--parchment)' }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** 同じ相手をもう一度触れたら閉じる。属州の選択と同じ操作感にする */
function sameTarget(a: InspectTarget | null, b: InspectTarget): boolean {
  if (a === null) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'faction' && b.kind === 'faction') return a.id === b.id;
  if (a.kind === 'city' && b.kind === 'city') return a.id === b.id;
  return a.kind !== 'faction' && a.kind !== 'city';
}

export function App() {
  const {
    state,
    previous,
    selected,
    log,
    score,
    loadError,
    motion,
    start,
    toggleAction,
    rename,
    endTurn,
    deploy,
    fight,
    finishBattle,
    quit,
    save,
    load,
  } = useGame();
  const [tab, setTab] = useState<Tab>('map');
  const [focused, setFocused] = useState<ProvinceId | null>(null);
  // 地図で触れた他国。属州の選択とは別に持つ
  const [inspected, setInspected] = useState<InspectTarget | null>(null);
  const music = useMusic();

  if (state === null) {
    return (
      <TitleScreen
        onStart={(difficulty, rulerName, scenario) => {
          // 難易度を選ぶ操作をきっかけに鳴らす。操作なしでは再生できない
          music.startIfAllowed();
          start(difficulty, rulerName, scenario);
        }}
        onLoad={load}
        loadError={loadError}
      />
    );
  }
  if (state.status !== 'ongoing' && score !== null) {
    return <ResultScreen score={score} state={state} onRestart={quit} />;
  }
  // 会戦のあいだは戦闘専用の画面に切り替える。その年はまだ進んでいない
  if (state.battlefield !== null) {
    return (
      <BattleScreen
        state={state}
        field={state.battlefield}
        onDeploy={deploy}
        onFight={fight}
        onFinish={finishBattle}
      />
    );
  }

  const occupiers = focused ? occupierNames(state, focused) : [];
  const demandCount = Object.values(state.factions).filter(
    (faction) => faction.stance === 'hostile' && faction.demand !== null,
  ).length;
  const usedSlots = selected.filter(consumesActionSlot).length;

  return (
    <div className="min-h-dvh pb-28">
      {/* 状況表示と区切りは一体で貼り付ける。別々に sticky にすると重なる */}
      <div className="sticky top-0 z-20">
        <StatusBar state={state} previous={previous} music={music} />
        <TabBar current={tab} onSelect={setTab} badges={{ act: demandCount }} />
      </div>

      <main className="max-w-lg mx-auto px-3 py-3 space-y-3">
        <section hidden={tab !== 'map'}>
          <ProvinceMap
            state={state}
            motion={motion}
            selectedProvince={focused}
            onSelect={(id) => {
              setInspected(null);
              setFocused((current) => (current === id ? null : id));
            }}
            onInspect={(target) => {
              setFocused(null);
              setInspected((current) => (sameTarget(current, target) ? null : target));
            }}
          />
          <MapLegend />
          {inspected && (
            <PowerCard state={state} target={inspected} onClose={() => setInspected(null)} />
          )}
          {focused && (
            <div className="roman-panel mt-2 rounded-sm px-3 py-2 text-xs">
              <span className="roman-heading">{PROVINCE_LABELS[focused]}</span>
              <span style={{ color: 'var(--ink-soft)' }}>
                {' '}— 支配 {Math.round(state.provinces[focused].control)} / 税収基礎{' '}
                {Math.round(state.provinces[focused].baseTax)} / 守備{' '}
                {Math.round(state.provinces[focused].garrison)}
              </span>
              {occupiers.length > 0 && (
                <div className="mt-1" style={{ color: 'var(--ink-soft)' }}>
                  駐留: {occupiers.join('、')}
                </div>
              )}
            </div>
          )}
          <div className="mt-2">
            <FrontsPanel state={state} />
          </div>
        </section>

        {tab === 'court' && (
          <>
            <RulerPanel state={state} onRename={rename} />
            <CourtFigures state={state} />
            <CourtPanel state={state} selected={selected} onToggle={toggleAction} />
            <EastPanel state={state} />
          </>
        )}

        {tab === 'act' && (
          <>
            {/* 要求は行動枠を消費せずに答えられる。行動の一覧より先に出す */}
            <DemandPanel state={state} />
            <section>
              <h2 className="roman-heading text-sm mb-2">
                この年の行動
                <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>
                  {usedSlots} / {MAX_ACTIONS_PER_TURN}
                </span>
              </h2>
              <ActionPanel state={state} selected={selected} onToggle={toggleAction} />
            </section>
          </>
        )}

        {tab === 'log' && (
          <>
            <section>
              <h2 className="roman-heading text-sm mb-2">記録</h2>
              {log.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                  まだ何も起きていない
                </p>
              ) : (
                <ul className="space-y-1">
                  {log.map((entry, i) => (
                    <li
                      key={i}
                      className="text-xs pl-2"
                      style={{ color: 'var(--ink-soft)', borderLeft: '2px solid var(--gold)' }}
                    >
                      {entry}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex gap-2">
              <button
                onClick={save}
                className="roman-panel flex-1 rounded-sm py-2 text-xs font-medium"
              >
                この時点を保存
              </button>
              <button
                onClick={quit}
                className="roman-panel flex-1 rounded-sm py-2 text-xs font-medium"
                style={{ color: 'var(--ink-soft)' }}
              >
                中断してタイトルへ
              </button>
            </section>
          </>
        )}
      </main>

      <div className="roman-tablet fixed bottom-0 inset-x-0 z-20 pb-[env(safe-area-inset-bottom)]">
        <div className="roman-meander" />
        <div className="max-w-lg mx-auto px-3 py-2.5">
          {/*
            選んだ行動を年送りの手前に出す。区を分けたことで
            「地図を見ている間に何を選んだか忘れる」ことがなくなる
          */}
          <div
            className="flex items-center justify-between text-[11px] mb-1.5"
            style={{ color: 'var(--ink-soft)' }}
          >
            <span>
              行動 {usedSlots} / {MAX_ACTIONS_PER_TURN}
              {selected.length > usedSlots && `（＋枠外 ${selected.length - usedSlots}）`}
            </span>
            {demandCount > 0 && tab !== 'act' && (
              <button onClick={() => setTab('act')} style={{ color: 'var(--oxblood)' }}>
                未応答の要求 {demandCount} 件 →
              </button>
            )}
          </div>
          <button
            onClick={endTurn}
            className="roman-button w-full rounded-sm py-3.5 transition"
          >
            次の年へ（{state.year + 1}年）
          </button>
        </div>
      </div>
    </div>
  );
}
