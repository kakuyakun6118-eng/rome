/**
 * 東西の分割相続と、代替わりの動揺。
 *
 * 西が東ローマを平らげれば、その皇帝はローマ全土の帝になる。
 * だがその死に際して**成人した後継者が複数いれば帝国は割れる。**
 * 395年のテオドシウス1世の死がまさにそれで、このゲームの開始点そのもの。
 * 一度統一しても同じことが起きる、という円環をここで閉じる。
 *
 * 後継者が1人なら全土をそのまま引き継ぐ。
 *
 * **プレイヤーは常に西を操作する。** 分割で生まれた東は独立国ではなく、
 * 西の宗主権のもとにある**従属国**（西ローマの東方帝）。
 * 兵権も貢納も西に属する。ただし野心の高い東帝は宗主権を振り払う。
 *
 * 分けるのは近い属州（トラキア・アシア）を西に残し、遠い東方
 * （オリエンス・エジプト）を東方帝に委ねる形。
 * 土地の数では差を付けず、軍と宗主権で「西ローマ優位」を作る。
 */

import {
  ABILITY_NEUTRAL,
  EAST_PARTITION_ARMY_SHARE,
  EAST_PARTITION_CONTROL,
  PARTITION_LEGITIMACY_LOSS,
  MAX_LEGITIMACY,
  MIN_LEGITIMACY,
  SUCCESSION_UNREST_ADVANCE_MULTIPLIER,
  SUCCESSION_UNREST_YEARS,
  VASSAL_AMBITION_MAX,
  VASSAL_AMBITION_MIN,
  VASSAL_ARMY_SHARE,
  VASSAL_INDEPENDENCE_BASE,
  VASSAL_INDEPENDENCE_LEGITIMACY_FROM,
  VASSAL_INDEPENDENCE_LEGITIMACY_LOSS,
  VASSAL_INDEPENDENCE_LOW_LEGITIMACY_BONUS,
  VASSAL_INDEPENDENCE_PER_AMBITION,
  VASSAL_TRIBUTE_SHARE,
} from './constants';
import type { EastProvinceId, GameState } from './types';
import { clamp } from './util';

/**
 * 分割で新しい東帝国に渡る属州。
 *
 * 西に近い順に残すので、遠い2州が東になる。
 * 「西ローマ優位」を土地ではなく**軍**で作るため、
 * 州の数そのものは半々にしてある
 */
const PARTITIONED_TO_EAST: EastProvinceId[] = ['Oriens', 'Aegyptus'];

/** 成人した継承候補の数。分割が起きるかはこれで決まる */
function adultHeirCount(state: GameState, adultAge: number): number {
  return state.dynasty.members.filter(
    (m) => m.legitimate && state.year - m.birthYear >= adultAge,
  ).length;
}

/**
 * 代替わりの直後か。
 *
 * 新しい状態を持たせず、君主の即位年から導く。
 * `tick()` の純粋性を壊さずに「代替わりの動揺」を表せる
 */
export function isSuccessionUnrest(state: GameState): boolean {
  return state.year - state.dynasty.ruler.accessionYear < SUCCESSION_UNREST_YEARS;
}

/**
 * 代替わりの年に蛮族の侵入が激しくなる係数。
 * 既存の `ADVANCE_PROBABILITY` に掛かるだけで、新しい仕組みではない
 */
export function successionAdvanceMultiplier(state: GameState): number {
  return isSuccessionUnrest(state) ? SUCCESSION_UNREST_ADVANCE_MULTIPLIER : 1;
}

/**
 * 継承にともなう帝国の分割。
 *
 * `succeed()` の直後に呼ぶ。西が東方属州を持っていて、かつ成人した
 * 後継者が複数いるときだけ割れる。1人なら全土をそのまま引き継ぐ
 */
export function partitionOnSuccession(
  state: GameState,
  adultAge: number,
  rng: () => number,
): GameState {
  // 西が東方属州を握っていなければ分けるものがない
  const westHeld = state.east.provinces.filter((p) => p.owner === 'west');
  if (westHeld.length === 0) return state;
  // 後継者がひとりなら全土を引き継ぐ
  if (adultHeirCount(state, adultAge) < 1) return state;

  const toEast = westHeld.filter((p) => PARTITIONED_TO_EAST.includes(p.id));
  if (toEast.length === 0) return state;

  // 東方帝になるのは、継承から漏れた最年長の嫡子
  const heirName =
    state.dynasty.members
      .filter((m) => m.legitimate && state.year - m.birthYear >= adultAge)
      .sort((a, b) => a.birthYear - b.birthYear)[0]?.name ?? '東方帝';

  return {
    ...state,
    east: {
      ...state.east,
      // 独立国ではなく従属国。兵権も貢納も西にある
      stance: 'vassal',
      warStartYear: null,
      vassalRuler: {
        name: heirName,
        ambition: rollVassalAmbition(rng),
      },
      /*
       * 分け与えられた側なので、兄の帝国より弱いところから始まる。
       * これが「西ローマ優位」の中身で、土地の数では差を付けていない
       */
      army: Math.max(state.east.army, 1) * EAST_PARTITION_ARMY_SHARE,
      provinces: state.east.provinces.map((p) =>
        toEast.some((t) => t.id === p.id)
          ? { ...p, owner: 'east' as const, control: EAST_PARTITION_CONTROL }
          : p,
      ),
    },
    // 帝国が割れたことは正統性に響く。全土の帝ではなくなる
    legitimacy: clamp(
      state.legitimacy - PARTITION_LEGITIMACY_LOSS,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    turnEvents: [...state.turnEvents, 'empire_partitioned', 'east_vassalized'],
  };
}

/**
 * 東帝の野心。独立の確率にのみ効き、他には一切効かない。
 * 官職の野心と同じ考え方
 */
function rollVassalAmbition(rng: () => number): number {
  return (
    VASSAL_AMBITION_MIN +
    Math.floor(rng() * (VASSAL_AMBITION_MAX - VASSAL_AMBITION_MIN + 1))
  );
}

/**
 * 従属国が宗主権を振り払う判定。毎年行う。
 *
 * 野心の高い東帝ほど独立を図り、西の正統性が低いほど通りやすい。
 * 独立されると兵権も貢納も失い、東は再び別の帝国に戻る
 */
export function checkVassalIndependence(state: GameState, rng: () => number): GameState {
  const { east } = state;
  if (east.stance !== 'vassal' || east.vassalRuler === null) return state;

  const pressure = clamp(
    (VASSAL_INDEPENDENCE_LEGITIMACY_FROM - state.legitimacy) /
      VASSAL_INDEPENDENCE_LEGITIMACY_FROM,
    0,
    1,
  );
  const probability =
    VASSAL_INDEPENDENCE_BASE +
    Math.max(0, east.vassalRuler.ambition - ABILITY_NEUTRAL) *
      VASSAL_INDEPENDENCE_PER_AMBITION +
    pressure * VASSAL_INDEPENDENCE_LOW_LEGITIMACY_BONUS;
  if (rng() >= probability) return state;

  return {
    ...state,
    east: { ...east, stance: 'peace', vassalRuler: null },
    legitimacy: clamp(
      state.legitimacy - VASSAL_INDEPENDENCE_LEGITIMACY_LOSS,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    turnEvents: [...state.turnEvents, 'east_independence'],
  };
}

/** 従属国から西へ入る貢納。既存の収入計算に足すだけ */
export function vassalTribute(state: GameState): number {
  if (state.east.stance !== 'vassal') return 0;
  return state.east.provinces
    .filter((p) => p.owner === 'east')
    .reduce((sum, p) => sum + (p.control / 100) * p.baseTax, 0) * VASSAL_TRIBUTE_SHARE;
}

/**
 * 従属国の軍のうち、西の属州防衛に使える戦力。これが「兵権」。
 * 既存の防衛戦力に足すだけで、新しい資源にはしない
 */
export function vassalDefenseSupport(state: GameState): number {
  if (state.east.stance !== 'vassal') return 0;
  return state.east.army * VASSAL_ARMY_SHARE;
}
