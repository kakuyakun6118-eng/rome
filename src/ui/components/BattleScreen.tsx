import { useMemo, useState } from 'react';

import { BATTLE_ARMS, BATTLE_LANES, armStrength, battlefieldTactics } from '../../core/battlefield';
import type { BattleDeployment, BattleOrders } from '../../core/battlefield';
import { BATTLE_MAX_ROUNDS } from '../../core/constants';
import type { BattleArm, BattleLane, BattleOrder, Battlefield, GameState } from '../../core/types';
import { battleArtFor } from '../battleArt';
import {
  BATTLE_ARM_LABELS,
  BATTLE_ARM_MARKS,
  BATTLE_LANE_LABELS,
  BATTLE_LEADER_LABELS,
  BATTLE_ORDER_DETAILS,
  BATTLE_ORDER_LABELS,
  EAST_PROVINCE_LABELS,
  PROVINCE_LABELS,
  TERRAIN_DETAILS,
  TERRAIN_LABELS,
  battleFoeLabel,
  formatTroops,
} from '../catalogue';
import { BattleCommanders } from './BattleCommanders';
import { BattleMap } from './BattleMap';

/** 戦場になった土地の名。属州・東方属州・境外のいずれか */
function placeLabel(placeId: string): string {
  if (placeId === 'exterior') return '境外';
  if (placeId in PROVINCE_LABELS) return PROVINCE_LABELS[placeId as keyof typeof PROVINCE_LABELS];
  if (placeId in EAST_PROVINCE_LABELS) {
    return EAST_PROVINCE_LABELS[placeId as keyof typeof EAST_PROVINCE_LABELS];
  }
  return placeId;
}

const ORDERS: BattleOrder[] = ['advance', 'flank', 'withdraw'];

/**
 * 戦闘画面。
 *
 * 戦場を地図にして、両軍の隊を駒で置く（関ヶ原の布陣図の読み方）。
 * 布陣は「控えの駒を選び、戦列に触れて置く」、命令は「戦列に触れて選ぶ」。
 *
 * **計算式はここに書かない。** 布陣も解決も core/battlefield.ts に投げる
 */
export function BattleScreen({
  state,
  field,
  onDeploy,
  onFight,
  onFinish,
}: {
  state: GameState;
  field: Battlefield;
  onDeploy: (deployment: BattleDeployment) => void;
  onFight: (orders: BattleOrders) => void;
  onFinish: () => void;
}) {
  /** 置いた兵科と、その戦列。全部置くまで戦端は開けない */
  const [placed, setPlaced] = useState<Partial<Record<BattleArm, BattleLane>>>({});
  /** 次に置く兵科。控えの駒を触れて選ぶ */
  const [holding, setHolding] = useState<BattleArm | null>('infantry');
  const [orders, setOrders] = useState<BattleOrders>({
    left: 'advance',
    center: 'advance',
    right: 'advance',
  });
  const [selectedLane, setSelectedLane] = useState<BattleLane | null>(null);

  const art = useMemo(() => battleArtFor(field), [field]);
  const lastRound = field.log.filter((entry) => entry.round === field.round - 1);
  const reserve = BATTLE_ARMS.filter((arm) => placed[arm] === undefined);
  const ready = reserve.length === 0;

  /** 戦列に触れたときの動き。布陣中は駒を置き、交戦中は命令の対象を選ぶ */
  const onSelectLane = (lane: BattleLane) => {
    if (field.phase === 'deploy') {
      if (holding === null) return;
      const next = { ...placed, [holding]: lane };
      setPlaced(next);
      // 続けて置けるよう、まだ置いていない兵科へ自動で持ち替える
      setHolding(BATTLE_ARMS.find((arm) => next[arm] === undefined) ?? null);
      return;
    }
    if (field.phase === 'engaged') setSelectedLane((current) => (current === lane ? null : lane));
  };

  return (
    <div className="min-h-dvh pb-28">
      <header className="roman-tablet sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-3 py-2">
          <h1 className="roman-heading text-sm">
            会戦 — {battleFoeLabel(field.foe)}
            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>
              {placeLabel(field.placeId)} / {TERRAIN_LABELS[field.terrain]}
            </span>
          </h1>
          <p className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
            {BATTLE_LEADER_LABELS[field.leader]} — {TERRAIN_DETAILS[field.terrain]}
          </p>
        </div>
        <div className="roman-meander" />
      </header>

      <main className="max-w-lg mx-auto px-3 py-3 space-y-3">
        {/* 対陣。両軍を率いる者の顔をここで出す */}
        <BattleCommanders state={state} field={field} />

        {/* 会戦のイメージ画。無ければ帯ごと出さない */}
        {art !== null && (
          <figure
            className="roman-panel rounded-sm overflow-hidden"
            style={{ borderColor: 'var(--gold)' }}
          >
            <img
              src={art.url}
              alt={art.title}
              className="w-full block"
              style={{ aspectRatio: '341 / 133', objectFit: 'cover' }}
              onError={(e) => {
                (e.currentTarget.closest('figure') as HTMLElement).style.display = 'none';
              }}
            />
            <figcaption
              className="px-2 py-1 text-[10px]"
              style={{ color: 'var(--ink-soft)', backgroundColor: 'rgba(0,0,0,0.05)' }}
            >
              {art.title}
            </figcaption>
          </figure>
        )}

        {/* 布陣図 */}
        <section className="roman-panel rounded-sm p-2">
          <BattleMap
            field={field}
            pending={
              field.phase === 'deploy'
                ? { placed, strengthOf: (arm) => armStrength(field, arm) }
                : undefined
            }
            orders={orders}
            selectedLane={selectedLane}
            onSelectLane={field.phase === 'done' ? undefined : onSelectLane}
          />
          <div className="mt-1 text-[10px] flex justify-between" style={{ color: 'var(--ink-soft)' }}>
            <span className="flex items-center gap-1">
              <i className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: '#2c4454' }} />
              ローマ軍
              <i className="inline-block w-2 h-2 rounded-sm ml-1" style={{ backgroundColor: '#7c2029' }} />
              敵軍
              <span className="ml-1">／列の幅＝兵力</span>
            </span>
            <span>
              ローマ軍{' '}
              {formatTroops(
                field.phase === 'deploy'
                  ? field.ourStartStrength
                  : BATTLE_LANES.reduce(
                      (s, l) => s + field.ours.lanes[l].reduce((a, u) => a + u.strength, 0),
                      0,
                    ),
              )}{' '}
              / 敵{' '}
              {formatTroops(
                BATTLE_LANES.reduce(
                  (s, l) => s + field.theirs.lanes[l].reduce((a, u) => a + u.strength, 0),
                  0,
                ),
              )}
            </span>
          </div>
        </section>

        {field.phase === 'deploy' && (
          <section className="roman-panel rounded-sm px-3 py-2">
            <h2 className="roman-heading text-sm">布陣</h2>
            <p className="text-[11px] mb-2" style={{ color: 'var(--ink-soft)' }}>
              控えの駒を選び、図の戦列に触れて置く。相性は 騎兵 → 弓兵 → 歩兵 → 騎兵 の順に強い
            </p>

            <div className="flex gap-1.5 flex-wrap">
              {BATTLE_ARMS.map((arm) => {
                const lane = placed[arm];
                const isHeld = holding === arm;
                return (
                  <button
                    key={arm}
                    onClick={() => (lane === undefined ? setHolding(arm) : unplace(arm))}
                    className="roman-panel rounded-sm px-2 py-1.5 text-[11px] text-left"
                    style={
                      isHeld
                        ? { borderColor: 'var(--gold-bright)', boxShadow: '0 0 0 2px rgba(216,171,60,0.45)' }
                        : lane !== undefined
                          ? { color: 'var(--ink-soft)', opacity: 0.75 }
                          : undefined
                    }
                  >
                    <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
                      {BATTLE_ARM_MARKS[arm]} {BATTLE_ARM_LABELS[arm]}
                    </span>
                    <span className="ml-1" style={{ color: 'var(--ink-soft)' }}>
                      {formatTroops(armStrength(field, arm))}
                    </span>
                    <div style={{ color: lane ? 'var(--purple)' : 'var(--gold)' }}>
                      {lane ? `${BATTLE_LANE_LABELS[lane]}（触れて戻す）` : '控え'}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {field.phase === 'engaged' && (
          <section className="roman-panel rounded-sm px-3 py-2">
            <h2 className="roman-heading text-sm">
              第{field.round}戦の命令
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ink-soft)' }}>
                全{BATTLE_MAX_ROUNDS}戦
              </span>
            </h2>
            <p className="text-[11px] mb-2" style={{ color: 'var(--ink-soft)' }}>
              図の戦列に触れて選ぶ。矢がその戦列の向かう先を示す
            </p>
            {(selectedLane === null ? BATTLE_LANES : [selectedLane]).map((lane) => (
              <div key={lane} className="mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs w-12 shrink-0" style={{ color: 'var(--ink)' }}>
                    {BATTLE_LANE_LABELS[lane]}
                  </span>
                  <div className="flex gap-1 flex-1">
                    {ORDERS.map((order) => (
                      <button
                        key={order}
                        onClick={() => setOrders((o) => ({ ...o, [lane]: order }))}
                        className="roman-panel flex-1 rounded-sm py-1.5 text-[11px]"
                        style={
                          orders[lane] === order
                            ? { borderColor: 'var(--gold)', color: 'var(--purple)', fontWeight: 600 }
                            : { color: 'var(--ink-soft)' }
                        }
                      >
                        {BATTLE_ORDER_LABELS[order]}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] pl-[3.25rem]" style={{ color: 'var(--ink-soft)' }}>
                  {BATTLE_ORDER_DETAILS[orders[lane]]}
                </p>
              </div>
            ))}
          </section>
        )}

        {/* 直前の激突の顛末 */}
        {lastRound.length > 0 && (
          <section className="roman-panel rounded-sm px-3 py-2">
            <h2 className="roman-heading text-xs">第{field.round - 1}戦</h2>
            <ul className="mt-1 space-y-0.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
              {lastRound.map((entry, i) => (
                <li key={i}>
                  {BATTLE_LANE_LABELS[entry.lane]} — {BATTLE_ORDER_LABELS[entry.ourOrder]}
                  {entry.ourTarget !== entry.lane &&
                    `（${BATTLE_LANE_LABELS[entry.ourTarget]}へ回り込む）`}
                  ／ 味方 −{formatTroops(entry.ourLoss)}、敵 −{formatTroops(entry.theirLoss)}
                  {entry.ourBroke && (
                    <span style={{ color: 'var(--oxblood)' }}> 味方の隊が崩れた</span>
                  )}
                  {entry.theirBroke && <span style={{ color: 'var(--gold)' }}> 敵の隊が崩れた</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {field.phase === 'done' && (
          <section className="roman-panel rounded-sm px-3 py-2">
            <h2 className="roman-heading text-sm">戦場の趨勢</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-soft)' }}>
              戦列での優劣は、この会戦のローマ軍の戦力に{' '}
              <span style={{ color: 'var(--purple)', fontWeight: 600 }}>
                ×{battlefieldTactics(field).toFixed(2)}
              </span>{' '}
              として掛かる。勝敗はこのあと決まる
            </p>
          </section>
        )}
      </main>

      <div className="roman-tablet fixed bottom-0 inset-x-0 z-20 pb-[env(safe-area-inset-bottom)]">
        <div className="roman-meander" />
        <div className="max-w-lg mx-auto px-3 py-3">
          {field.phase === 'deploy' && (
            <button
              onClick={() => ready && onDeploy(placed as BattleDeployment)}
              disabled={!ready}
              className={ready ? 'roman-button w-full rounded-sm py-3.5 transition' : 'w-full rounded-sm py-3.5'}
              style={ready ? undefined : { background: 'var(--parchment-dim)', color: '#9a8a6e' }}
            >
              {ready
                ? '布陣を定めて戦端を開く'
                : `残り ${reserve.map((a) => BATTLE_ARM_LABELS[a]).join('・')} を置く`}
            </button>
          )}
          {field.phase === 'engaged' && (
            <button
              onClick={() => {
                setSelectedLane(null);
                onFight(orders);
              }}
              className="roman-button w-full rounded-sm py-3.5 transition"
            >
              第{field.round}戦を交える
            </button>
          )}
          {field.phase === 'done' && (
            <button onClick={onFinish} className="roman-button w-full rounded-sm py-3.5 transition">
              戦いを終える
            </button>
          )}
        </div>
      </div>
    </div>
  );

  /** 置いた駒を控えに戻す */
  function unplace(arm: BattleArm) {
    setPlaced((current) => {
      const next = { ...current };
      delete next[arm];
      return next;
    });
    setHolding(arm);
  }
}
