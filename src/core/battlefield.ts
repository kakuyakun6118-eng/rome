/**
 * 戦場 — 会戦の戦列マップ。
 *
 * `battle.ts` の会戦が「野戦軍どうしが一度ぶつかって決着する」処理なのに対し、
 * ここは**その一戦のなかを何度かの激突に分けて描く**層。
 * 左翼・中央・右翼の3つの戦列に歩兵・騎兵・弓を配り、
 * 激突ごとに前進・迂回・退却を選ぶ。
 *
 * **戦術は戦略の結果を置き換えない。** ここで積んだ優劣は
 * `battlefieldTactics()` が返す1つの倍率になり、既存の `giveBattle()` の
 * 攻撃側戦力に掛かるだけで終わる。中庸に戦えば 1.0 になるので、
 * 調整済みの釣り合いは動かない。ヘッドレス実行が戦場を開かずに
 * `giveBattle()` を直に呼び続けられるのもこのため。
 *
 * 指揮官の能力は**士気の粘りにだけ**効かせる。攻撃力の補正は既に
 * `giveBattle()` に入っているので、戦場でも掛けると二重取りになる。
 */

import terrainData from '../data/terrain.json';
import {
  BATTLE_COMPOSITION_ARCHERS,
  BATTLE_COMPOSITION_CAVALRY,
  BATTLE_COMPOSITION_INFANTRY,
  BATTLE_DAMAGE_RATE,
  BATTLE_FOE_BARBARIAN_ARCHERS,
  BATTLE_FOE_BARBARIAN_CAVALRY,
  BATTLE_FOE_BARBARIAN_INFANTRY,
  BATTLE_FOE_EAST_ARCHERS,
  BATTLE_FOE_EAST_CAVALRY,
  BATTLE_FOE_EAST_INFANTRY,
  BATTLE_FOE_PERSIA_ARCHERS,
  BATTLE_FOE_PERSIA_CAVALRY,
  BATTLE_FOE_PERSIA_INFANTRY,
  BATTLE_LEADER_MANEUVER_SCALE,
  BATTLE_LEADER_MORALE_SCALE,
  BATTLE_MATCHUP_ADVANTAGE,
  BATTLE_MATCHUP_DISADVANTAGE,
  BATTLE_MAX_ROUNDS,
  BATTLE_MORALE_DRAIN_PER_ROUND,
  BATTLE_MORALE_LOSS_PER_LOSS_RATIO,
  BATTLE_MORALE_RECOVERY_WITHDRAW,
  ABILITY_NEUTRAL,
  BATTLE_ORDER_ATTACK_ADVANCE,
  BATTLE_ORDER_ATTACK_FLANK,
  BATTLE_ORDER_ATTACK_WITHDRAW,
  BATTLE_ORDER_DEFENSE_ADVANCE,
  BATTLE_ORDER_DEFENSE_FLANK,
  BATTLE_ORDER_DEFENSE_WITHDRAW,
  BATTLE_RIVER_ADVANCE_PENALTY,
  BATTLE_START_MORALE,
  MEN_PER_STRENGTH,
  BATTLE_TACTICS_MAX,
  BATTLE_TACTICS_MIN,
  BATTLE_TACTICS_SPREAD,
  BATTLE_TERRAIN_MODIFIERS,
  DIFFICULTY_SETTINGS,
  PITCHED_ARMY_SHARE,
} from './constants';
import { mobilizedStrength } from './battle';
import { chiefPowerModifier } from './homelands';
import { foreignCommanderModifier } from './east';
import type {
  BattleArm,
  BattleFoe,
  BattleLane,
  BattleLeader,
  BattleOrder,
  BattleRoundLog,
  BattleSide,
  BattleUnit,
  Battlefield,
  GameState,
  ProvinceId,
  Terrain,
} from './types';
import { clamp } from './util';

export const BATTLE_LANES: BattleLane[] = ['left', 'center', 'right'];
export const BATTLE_ARMS: BattleArm[] = ['infantry', 'cavalry', 'archers'];

/** 布陣。兵科ごとに、どの戦列へ置くかを決める */
export type BattleDeployment = Record<BattleArm, BattleLane>;
/** 命令。戦列ごとに1つ */
export type BattleOrders = Record<BattleLane, BattleOrder>;

const TERRAIN_BY_PLACE = terrainData as Record<string, Terrain>;

// ── 戦場を開く ────────────────────────────────────────

/** 会戦の場になる土地。蛮族なら踏み込まれた属州、東・ペルシアなら係争地 */
function battlePlace(state: GameState, foe: BattleFoe): string {
  switch (foe.kind) {
    case 'barbarian':
      return state.factions[foe.factionId].location;
    case 'east': {
      // 東と争っている属州。無ければ東の都のあるトラキア
      const contested = state.east.provinces.find((p) => p.owner === 'east');
      return contested?.id ?? 'Thracia';
    }
    case 'persia': {
      const held = state.east.provinces.find((p) => p.owner === 'persia');
      return held?.id ?? 'Oriens';
    }
  }
}

function terrainOf(placeId: string): Terrain {
  return TERRAIN_BY_PLACE[placeId] ?? 'plain';
}

/** 相手の戦力。`battle.ts` の `foePower` と同じ見立てを使う */
function foeStrength(state: GameState, foe: BattleFoe): number {
  switch (foe.kind) {
    case 'barbarian':
      return (
        state.factions[foe.factionId].strength *
        DIFFICULTY_SETTINGS[state.difficulty].barbarianPowerMultiplier *
        chiefPowerModifier(state, foe.factionId)
      );
    case 'east':
      return state.east.army * foreignCommanderModifier(state.east.commander);
    case 'persia':
      return state.persia.strength * foreignCommanderModifier(state.persia.commander);
  }
}

/** 相手の兵科の内訳。民ごとに戦い方が違う */
function foeComposition(foe: BattleFoe): Record<BattleArm, number> {
  switch (foe.kind) {
    case 'barbarian':
      return {
        infantry: BATTLE_FOE_BARBARIAN_INFANTRY,
        cavalry: BATTLE_FOE_BARBARIAN_CAVALRY,
        archers: BATTLE_FOE_BARBARIAN_ARCHERS,
      };
    case 'east':
      return {
        infantry: BATTLE_FOE_EAST_INFANTRY,
        cavalry: BATTLE_FOE_EAST_CAVALRY,
        archers: BATTLE_FOE_EAST_ARCHERS,
      };
    case 'persia':
      return {
        infantry: BATTLE_FOE_PERSIA_INFANTRY,
        cavalry: BATTLE_FOE_PERSIA_CAVALRY,
        archers: BATTLE_FOE_PERSIA_ARCHERS,
      };
  }
}

function emptySide(): BattleSide {
  return { lanes: { left: [], center: [], right: [] } };
}

function unit(arm: BattleArm, strength: number): BattleUnit {
  return { arm, strength, morale: BATTLE_START_MORALE };
}

/**
 * 相手の布陣。乱数で決めるので、こちらの布陣が毎回同じ最適解にはならない。
 * 敵の戦列は最初から見えている（斥候の働き）ので、見てから布陣を決められる
 */
function deployFoe(
  strength: number,
  composition: Record<BattleArm, number>,
  rng: () => number,
): BattleSide {
  const side = emptySide();
  for (const arm of BATTLE_ARMS) {
    const lane = BATTLE_LANES[Math.floor(rng() * BATTLE_LANES.length)];
    side.lanes[lane].push(unit(arm, strength * composition[arm]));
  }
  return side;
}

/**
 * 戦場を開く。この時点ではまだ布陣していない（`phase` は `deploy`）。
 * 投じる兵力は会戦と同じく野戦軍の `PITCHED_ARMY_SHARE`
 */
export function openBattlefield(
  state: GameState,
  foe: BattleFoe,
  leader: BattleLeader,
  rng: () => number,
  /** 会戦に動員する属州。連れ出した守備隊も戦場に並ぶ */
  mobilize: ProvinceId[] = [],
): Battlefield {
  // 動員した守備隊も戦場に立つので、布陣する兵にそのまま足す
  const ourStrength = state.fieldArmy * PITCHED_ARMY_SHARE + mobilizedStrength(state, mobilize);
  const theirStrength = foeStrength(state, foe);
  const placeId = battlePlace(state, foe);

  const field: Battlefield = {
    foe,
    leader,
    terrain: terrainOf(placeId),
    placeId,
    round: 1,
    phase: 'deploy',
    ours: emptySide(),
    theirs: deployFoe(theirStrength, foeComposition(foe), rng),
    ourStartStrength: ourStrength,
    theirStartStrength: theirStrength,
    resilience: moraleResilience(state, leader),
    maneuver: maneuverSkill(state, leader),
    // 先に 1 を入れて型を満たし、この直後に試算した値で置き換える
    baselineExchange: 1,
    log: [],
    pendingActions: [],
  };

  /*
   * 基準になる交換比を、いま引いた乱数で一度だけ試算する。
   *
   * **試算は「中庸の将が中庸に指した場合」で取る。** その指揮官自身で
   * 基準を作っていたときは、名将ほど基準の交換比も良くなるので差が
   * 打ち消し合い、軍事1の将のほうが倍率が高く出た（迂回で 1.065 対 1.041）。
   * 基準を将から切り離すことで、**指揮官の技量そのものが倍率に乗る**
   */
  const neutralLeader: Battlefield = { ...field, resilience: 1, maneuver: 1 };
  return {
    ...field,
    baselineExchange: exchangeRatio(autoResolveBattlefield(neutralLeader, rng)),
  };
}

/** 失った兵 ÷ 討ち取った兵。小さいほど良い交換 */
function exchangeRatio(field: Battlefield): number {
  const ourLoss = Math.max(0, field.ourStartStrength - sideStrength(field.ours));
  const theirLoss = Math.max(0, field.theirStartStrength - sideStrength(field.theirs));
  if (ourLoss <= 0 && theirLoss <= 0) return 1;
  return ourLoss / Math.max(1, theirLoss);
}

/**
 * 戦力を兵員数に直す。表示のためだけで、どの計算式にも戻さない
 */
export function troopsOf(strength: number): number {
  return strength * MEN_PER_STRENGTH;
}

/** 野戦軍の兵科の内訳 */
const OUR_COMPOSITION: Record<BattleArm, number> = {
  infantry: BATTLE_COMPOSITION_INFANTRY,
  cavalry: BATTLE_COMPOSITION_CAVALRY,
  archers: BATTLE_COMPOSITION_ARCHERS,
};

/**
 * その兵科に割り当たる兵力。
 * 布陣する前に駒の大きさを描くために UI から引く（計算式を ui/ に置かないため）
 */
export function armStrength(field: Battlefield, arm: BattleArm): number {
  return field.ourStartStrength * OUR_COMPOSITION[arm];
}

/** 布陣を決めて戦端を開く */
export function deployBattlefield(
  field: Battlefield,
  deployment: BattleDeployment,
): Battlefield {
  if (field.phase !== 'deploy') return field;

  const ours = emptySide();
  for (const arm of BATTLE_ARMS) {
    ours.lanes[deployment[arm]].push(unit(arm, armStrength(field, arm)));
  }

  return { ...field, ours, phase: 'engaged' };
}

/** 中庸の布陣。ヘッドレス実行と、布陣せずに送られた場合の既定 */
export const NEUTRAL_DEPLOYMENT: BattleDeployment = {
  infantry: 'center',
  cavalry: 'right',
  archers: 'left',
};

/** 中庸の命令。全戦列が正面からぶつかる */
export const NEUTRAL_ORDERS: BattleOrders = {
  left: 'advance',
  center: 'advance',
  right: 'advance',
};

// ── 激突の解決 ────────────────────────────────────────

/** 兵科の相性。騎兵 > 弓 > 歩兵 > 騎兵 */
function matchup(attacker: BattleArm, defender: BattleArm): number {
  if (attacker === 'cavalry' && defender === 'archers') return BATTLE_MATCHUP_ADVANTAGE;
  if (attacker === 'archers' && defender === 'infantry') return BATTLE_MATCHUP_ADVANTAGE;
  if (attacker === 'infantry' && defender === 'cavalry') return BATTLE_MATCHUP_ADVANTAGE;
  if (attacker === 'archers' && defender === 'cavalry') return BATTLE_MATCHUP_DISADVANTAGE;
  if (attacker === 'infantry' && defender === 'archers') return BATTLE_MATCHUP_DISADVANTAGE;
  if (attacker === 'cavalry' && defender === 'infantry') return BATTLE_MATCHUP_DISADVANTAGE;
  return 1;
}

/**
 * 命令ごとの攻撃補正。
 *
 * **前進には指揮官の巧拙を掛けない。** 前進は正面からぶつかるだけで
 * 手順が要らず、そこへ掛けると `giveBattle()` の指揮官補正と二重取りになる。
 * 掛かるのは迂回（側面へ回り込む）と退却（整然と下がる）という、
 * 段取りの要る動きの**上振れ分**だけ
 */
function orderAttack(order: BattleOrder, maneuver: number): number {
  if (order === 'advance') return BATTLE_ORDER_ATTACK_ADVANCE;
  if (order === 'flank') {
    return 1 + (BATTLE_ORDER_ATTACK_FLANK - 1) * maneuver;
  }
  return BATTLE_ORDER_ATTACK_WITHDRAW;
}

function orderDefense(order: BattleOrder, terrain: Terrain, maneuver: number): number {
  let base: number;
  if (order === 'advance') {
    base = BATTLE_ORDER_DEFENSE_ADVANCE;
  } else if (order === 'flank') {
    // 有能な将ほど正面を空ける隙が小さい
    base = 1 + (BATTLE_ORDER_DEFENSE_FLANK - 1) / maneuver;
  } else {
    // 有能な将ほど下がりながらの損害が小さい
    base = 1 - (1 - BATTLE_ORDER_DEFENSE_WITHDRAW) * maneuver;
  }
  // 渡河点では前へ出た戦列が余計に削られる
  if (terrain === 'river' && order === 'advance') return base * BATTLE_RIVER_ADVANCE_PENALTY;
  return base;
}

function laneStrength(units: BattleUnit[]): number {
  return units.reduce((sum, u) => sum + u.strength, 0);
}

function occupied(side: BattleSide, lane: BattleLane): boolean {
  return laneStrength(side.lanes[lane]) > 0;
}

/** 敵がまだ立っている戦列のうち、最も厚いもの */
function strongestLane(side: BattleSide): BattleLane | null {
  const standing = BATTLE_LANES.filter((lane) => occupied(side, lane));
  if (standing.length === 0) return null;
  return standing.reduce((best, lane) =>
    laneStrength(side.lanes[lane]) > laneStrength(side.lanes[best]) ? lane : best,
  );
}

/**
 * その戦列が突く相手の戦列。命令と、敵がどこに立っているかで決まる。
 *
 * **正面が空いた戦列は隣へ回り込む。** 空いた戦列がそのまま
 * 何もしないままだったときは、互いの正面が食い違うと
 * どちらも1兵も削れないまま5戦が過ぎる膠着が起きた
 */
export function resolveTarget(
  lane: BattleLane,
  order: BattleOrder,
  enemy: BattleSide,
): BattleLane | null {
  if (order === 'withdraw') return null;

  if (order === 'flank') {
    // 翼は中央へ、中央の予備は手薄なほうの翼へ回り込む
    if (lane !== 'center') {
      if (occupied(enemy, 'center')) return 'center';
      const other: BattleLane = lane === 'left' ? 'right' : 'left';
      return occupied(enemy, other) ? other : strongestLane(enemy);
    }
    const wings = (['left', 'right'] as BattleLane[]).filter((l) => occupied(enemy, l));
    if (wings.length === 0) return strongestLane(enemy);
    return wings.reduce((weak, l) =>
      laneStrength(enemy.lanes[l]) < laneStrength(enemy.lanes[weak]) ? l : weak,
    );
  }

  // 前進は正面。正面に誰もいなければ、前へ出たまま厚い戦列へ向かう
  return occupied(enemy, lane) ? lane : strongestLane(enemy);
}

/** その戦列が与える攻撃力。相手の兵科の内訳で相性が決まる */
function attackPower(
  attackers: BattleUnit[],
  defenders: BattleUnit[],
  order: BattleOrder,
  terrain: Terrain,
  maneuver: number,
): number {
  const defenderTotal = laneStrength(defenders);
  return attackers.reduce((sum, u) => {
    // 相性は相手の戦列に並ぶ兵科の構成比で平均する
    const match =
      defenderTotal <= 0
        ? 1
        : defenders.reduce(
            (m, d) => m + matchup(u.arm, d.arm) * (d.strength / defenderTotal),
            0,
          );
    return (
      sum +
      u.strength * match * BATTLE_TERRAIN_MODIFIERS[terrain][u.arm] * orderAttack(order, maneuver)
    );
  }, 0);
}

/** 会戦を率いる者の軍事能力 */
function leaderAbility(state: GameState, leader: BattleLeader): number {
  return leader === 'ruler'
    ? state.dynasty.ruler.abilities.military
    : (state.general.current?.military ?? ABILITY_NEUTRAL);
}

/** 指揮官の能力から来る士気の粘り。有能なほど崩れにくい */
function moraleResilience(state: GameState, leader: BattleLeader): number {
  return 1 + (leaderAbility(state, leader) - ABILITY_NEUTRAL) * BATTLE_LEADER_MORALE_SCALE;
}

/** 指揮官の能力から来る機動の巧拙。有能なほど迂回と退却が決まる */
function maneuverSkill(state: GameState, leader: BattleLeader): number {
  return Math.max(
    0.2,
    1 + (leaderAbility(state, leader) - ABILITY_NEUTRAL) * BATTLE_LEADER_MANEUVER_SCALE,
  );
}

/** 損害を戦列の各隊へ兵力に比例して割り振り、士気を削る */
function applyLoss(
  units: BattleUnit[],
  loss: number,
  order: BattleOrder,
  resilience: number,
): { units: BattleUnit[]; broke: boolean } {
  const total = laneStrength(units);
  if (total <= 0) return { units: [], broke: false };

  const lossRatio = Math.min(1, loss / total);
  let broke = false;
  const next: BattleUnit[] = [];
  for (const u of units) {
    const strength = Math.max(0, u.strength - loss * (u.strength / total));
    let morale =
      u.morale -
      (lossRatio * BATTLE_MORALE_LOSS_PER_LOSS_RATIO + BATTLE_MORALE_DRAIN_PER_ROUND) /
        resilience;
    if (order === 'withdraw') morale += BATTLE_MORALE_RECOVERY_WITHDRAW;
    morale = clamp(morale, 0, BATTLE_START_MORALE);

    // 士気の尽きた隊、兵の尽きた隊は戦場から消える
    if (morale <= 0 || strength <= 0) {
      broke = true;
      continue;
    }
    next.push({ ...u, strength, morale });
  }
  return { units: next, broke };
}

/** 相手の命令。手薄な戦列は下がり、優勢な戦列は前へ出る */
function foeOrders(field: Battlefield, rng: () => number): BattleOrders {
  const orders = {} as BattleOrders;
  for (const lane of BATTLE_LANES) {
    const mine = laneStrength(field.theirs.lanes[lane]);
    const facing = laneStrength(field.ours.lanes[lane]);
    if (mine <= 0) {
      orders[lane] = 'withdraw';
    } else if (facing <= 0) {
      // 正面に誰もいなければ回り込む
      orders[lane] = 'flank';
    } else if (mine < facing * 0.6) {
      orders[lane] = 'withdraw';
    } else if (mine > facing * 1.4 && rng() < 0.5) {
      orders[lane] = 'flank';
    } else {
      orders[lane] = 'advance';
    }
  }
  return orders;
}

function sideStrength(side: BattleSide): number {
  return BATTLE_LANES.reduce((sum, lane) => sum + laneStrength(side.lanes[lane]), 0);
}

/**
 * 一度の激突を解決する。
 *
 * 損害はどちらも激突前の兵力から計算し、同時に適用する。
 * 先に片方を削ってから返り討ちを計算すると、手番の順序が
 * そのまま有利不利になってしまうため
 */
export function battleRound(
  field: Battlefield,
  orders: BattleOrders,
  rng: () => number,
): Battlefield {
  if (field.phase !== 'engaged') return field;

  const theirOrders = foeOrders(field, rng);
  const resilience = field.resilience;
  // 相手の指揮官の巧拙はこの模型では持たないので中庸に据える
  const foeManeuver = 1;

  // 各戦列が誰を突くかを先に決める
  const ourTargets = {} as Record<BattleLane, BattleLane | null>;
  const theirTargets = {} as Record<BattleLane, BattleLane | null>;
  for (const lane of BATTLE_LANES) {
    ourTargets[lane] = resolveTarget(lane, orders[lane], field.theirs);
    theirTargets[lane] = resolveTarget(lane, theirOrders[lane], field.ours);
  }

  // 損害を集計する。適用は最後にまとめて行う
  const damageToThem = { left: 0, center: 0, right: 0 } as Record<BattleLane, number>;
  const damageToUs = { left: 0, center: 0, right: 0 } as Record<BattleLane, number>;
  for (const lane of BATTLE_LANES) {
    const target = ourTargets[lane];
    if (target !== null) {
      damageToThem[target] +=
        attackPower(
          field.ours.lanes[lane],
          field.theirs.lanes[target],
          orders[lane],
          field.terrain,
          field.maneuver,
        ) *
        BATTLE_DAMAGE_RATE *
        orderDefense(theirOrders[target], field.terrain, foeManeuver);
    }

    const theirTarget = theirTargets[lane];
    if (theirTarget !== null) {
      damageToUs[theirTarget] +=
        attackPower(
          field.theirs.lanes[lane],
          field.ours.lanes[theirTarget],
          theirOrders[lane],
          field.terrain,
          foeManeuver,
        ) *
        BATTLE_DAMAGE_RATE *
        orderDefense(orders[theirTarget], field.terrain, field.maneuver);
    }
  }

  const ours = emptySide();
  const theirs = emptySide();
  const log: BattleRoundLog[] = [];
  for (const lane of BATTLE_LANES) {
    const before = laneStrength(field.ours.lanes[lane]);
    const theirBefore = laneStrength(field.theirs.lanes[lane]);
    const ourResult = applyLoss(field.ours.lanes[lane], damageToUs[lane], orders[lane], resilience);
    const theirResult = applyLoss(
      field.theirs.lanes[lane],
      damageToThem[lane],
      theirOrders[lane],
      1,
    );
    ours.lanes[lane] = ourResult.units;
    theirs.lanes[lane] = theirResult.units;

    log.push({
      round: field.round,
      lane,
      ourOrder: orders[lane],
      theirOrder: theirOrders[lane],
      ourTarget: ourTargets[lane] ?? lane,
      ourLoss: before - laneStrength(ourResult.units),
      theirLoss: theirBefore - laneStrength(theirResult.units),
      ourBroke: ourResult.broke,
      theirBroke: theirResult.broke,
    });
  }

  const next: Battlefield = {
    ...field,
    round: field.round + 1,
    ours,
    theirs,
    log: [...field.log, ...log],
  };

  const over =
    sideStrength(ours) <= 0 || sideStrength(theirs) <= 0 || next.round > BATTLE_MAX_ROUNDS;
  return over ? { ...next, phase: 'done' } : next;
}

// ── 戦術の結果を1つの倍率にする ───────────────────────

/**
 * 戦場で積んだ優劣を、会戦の攻撃側戦力に掛かる倍率に落とす。
 *
 * 互いに同じだけ削り合えば 1.0。相手を多く削って自分が残っていれば上、
 * 逆なら下。**上下の幅は狭く取ってある**（0.7〜1.45）。
 * 戦術で戦略をひっくり返せるようにすると、
 * 「兵力を養えないから負ける」という主題が消えるため
 */
export function battlefieldTactics(field: Battlefield): number {
  /*
   * 測るのは「どれだけ残ったか」ではなく、**中庸の将が中庸に指したときと
   * 比べてどれだけ良い交換ができたか**。指し手の巧拙と指揮官の技量の
   * 両方がここに乗る。
   *
   * 残存率の差で測っていたときは、兵力で劣る側が必ず下限に張り付いた。
   * 少ないほうが多く削られるのは当たり前で、それは `giveBattle()` が
   * 既に戦力差として見ている。戦場でも同じものを測ると数の差を
   * 二重に罰することになり、劣勢の側は会戦を挑む意味を失う
   */
  const baseline = field.baselineExchange;
  const actual = exchangeRatio(field);
  const edge = (baseline - actual) / Math.max(1e-6, baseline + actual);

  return clamp(1 + edge * BATTLE_TACTICS_SPREAD, BATTLE_TACTICS_MIN, BATTLE_TACTICS_MAX);
}

/**
 * 布陣も命令も与えられないまま送られた戦場を、中庸の指し手で決着させる。
 *
 * ヘッドレス実行と、戦闘画面を経ずにターンが送られた場合の受け皿。
 * 中庸に指すので倍率はおおむね 1.0 に落ち着き、既存の釣り合いを動かさない
 */
export function autoResolveBattlefield(field: Battlefield, rng: () => number): Battlefield {
  let current = field.phase === 'deploy' ? deployBattlefield(field, NEUTRAL_DEPLOYMENT) : field;
  while (current.phase === 'engaged') {
    current = battleRound(current, NEUTRAL_ORDERS, rng);
  }
  return current;
}
