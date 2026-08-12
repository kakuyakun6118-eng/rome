/**
 * 蛮族の本拠地と、その征服。
 *
 * 帝国の外に定住地が特定できる勢力だけが郷里を持ち、攻め取れば属州になる。
 * 7パラメータには増やさず、`GameState` の別サブ構造として置く。
 *
 * フンやアランのように移動を続けた勢力は郷里を持たない。攻め込む先が
 * 無いので、その戦力そのものを戦場で叩くしかない。
 *
 * **征服は属州の防衛より重い。** 狙われた勢力だけでなく、
 * 他の敵対勢力も加勢する（COALITION_DEFENSE_SHARE）。
 * 帝国の外へ出ることは、蛮族を連合させることでもある、という形にする。
 */

import homelandsData from '../data/homelands.json';
import leadersData from '../data/leaders.json';
import {
  ABILITY_NEUTRAL,
  CHIEF_MILITARY_PER_POINT,
  COALITION_DEFENSE_SHARE,
  COALITION_RALLY_PER_HOMELAND,
  COMBAT_RANDOMNESS,
  CONQUEST_ARMY_SHARE,
  CONQUEST_ATTRITION_RATE,
  CONQUEST_CONTROL_DAMAGE,
  CONQUEST_INITIAL_CONTROL,
  CONQUEST_LEGITIMACY_GAIN,
  DEFENSE_MULTIPLIER,
  HOMELAND_CONTROL_RECOVERY,
  HOMELAND_DEFENSE_STRENGTH_SHARE,
  HOMELAND_LOST_STRENGTH_PENALTY,
  HOMELAND_RECLAIM_CONTROL_DAMAGE,
  HOMELAND_RECLAIM_PROBABILITY,
  MAX_CONTROL,
  MAX_LEGITIMACY,
  MIN_CONTROL,
  MIN_LEGITIMACY,
  WEST_ARMY_LOSS_FACTOR,
} from './constants';
import { militaryModifier } from './dynasty';
import { generalDefenseModifier } from './general';
import { governorControlRecoveryModifier, governorDefenseModifier } from './officials';
import { resolveCombat } from './military';
import type { BarbarianFactionId, GameState, Homeland } from './types';
import { clamp } from './util';

interface LeaderReign {
  from: number;
  name: string;
  military?: number;
}

const LEADERS = leadersData as unknown as {
  factions: Record<BarbarianFactionId, LeaderReign[]>;
};

function randomizedPower(base: number, rng: () => number): number {
  return base * (1 + (rng() * 2 - 1) * COMBAT_RANDOMNESS);
}

/** 初期状態。データから読む。コードに直接書かない */
export function createInitialHomelands(): Partial<Record<BarbarianFactionId, Homeland>> {
  const list = homelandsData.homelands as Homeland[];
  return Object.fromEntries(list.map((h) => [h.factionId, { ...h }])) as Partial<
    Record<BarbarianFactionId, Homeland>
  >;
}

/**
 * その年の族長の軍事能力。史実の事績に即した値をデータから引く。
 * 見つからなければ中庸（ABILITY_NEUTRAL）を返す
 */
export function chiefMilitary(factionId: BarbarianFactionId, year: number): number {
  const reigns = LEADERS.factions[factionId];
  if (!reigns) return ABILITY_NEUTRAL;
  for (let i = reigns.length - 1; i >= 0; i--) {
    if (year >= reigns[i].from) return reigns[i].military ?? ABILITY_NEUTRAL;
  }
  return reigns[0]?.military ?? ABILITY_NEUTRAL;
}

/**
 * 族長の力量が攻撃側戦力に掛ける補正。
 * アッティラやガイセリックの下では同じ兵力でも攻撃が重くなる
 */
export function chiefPowerModifier(state: GameState, factionId: BarbarianFactionId): number {
  const military = chiefMilitary(factionId, state.year);
  return 1 + (military - ABILITY_NEUTRAL) * CHIEF_MILITARY_PER_POINT;
}

/** 西が併合した本拠地。収入と保持領域に数える */
export function westHeldHomelands(state: GameState): Homeland[] {
  return homelandList(state).filter((h) => h.owner === 'west');
}

/** 郷里を持つ勢力の一覧。持たない勢力は飛ばす */
export function homelandList(state: GameState): Homeland[] {
  return Object.values(state.homelands).filter((h): h is Homeland => h !== undefined);
}

/**
 * 本拠地への遠征。
 *
 * 守備側は「その土地の守備隊 ＋ その勢力の戦力の半分 ＋ 他の敵対勢力の加勢」。
 * 加勢があるぶん、同じ兵力でも属州を守るより攻めるほうがはるかに重い
 */
export function conquerHomeland(
  state: GameState,
  factionId: BarbarianFactionId,
  rng: () => number,
): GameState {
  const homeland = state.homelands[factionId];
  if (homeland === undefined || homeland.owner === 'west') return state;

  const faction = state.factions[factionId];
  /*
   * 契約中のフォエデラティの郷里は攻められない。
   * 給金を払っている相手の土地を同じ年に攻めるのは筋が通らないし、
   * これを許すと蛮族をひととおり味方に付けてから境外を平らげる
   * 抜け道になる（初級で8勢力すべての郷里を取る局が出た）
   */
  if (faction.stance === 'foederati') return state;
  // 連合。狙った相手以外の敵対勢力が加勢する
  const coalition = Object.values(state.factions)
    .filter((f) => f.id !== factionId && f.stance === 'hostile')
    .reduce((sum, f) => sum + f.strength, 0);
  /*
   * すでに奪った郷里の数だけ連合が固くなる。
   * 遠征を重ねるほど次が重くなり、境外を平らげることができなくなる
   */
  const rally =
    COALITION_DEFENSE_SHARE *
    (1 + COALITION_RALLY_PER_HOMELAND * westHeldHomelands(state).length);

  const attacker = randomizedPower(
    state.fieldArmy * CONQUEST_ARMY_SHARE * militaryModifier(state) * generalDefenseModifier(state),
    rng,
  );
  const defender = randomizedPower(
    (homeland.garrison +
      faction.strength * HOMELAND_DEFENSE_STRENGTH_SHARE +
      coalition * rally) *
      DEFENSE_MULTIPLIER *
      chiefPowerModifier(state, factionId),
    rng,
  );

  const { attackerWins, margin } = resolveCombat(attacker, defender);
  let fieldArmy = state.fieldArmy * (1 - CONQUEST_ATTRITION_RATE);
  const turnEvents = [...state.turnEvents];
  let legitimacy = state.legitimacy;
  const homelands = { ...state.homelands };
  let governors = state.governors;
  const factions = { ...state.factions };

  if (!attackerWins) {
    return {
      ...state,
      fieldArmy: Math.max(0, fieldArmy - margin * WEST_ARMY_LOSS_FACTOR),
      turnEvents,
    };
  }

  const control = clamp(homeland.control - CONQUEST_CONTROL_DAMAGE, MIN_CONTROL, MAX_CONTROL);
  if (control <= MIN_CONTROL) {
    homelands[factionId] = { ...homeland, owner: 'west', control: CONQUEST_INITIAL_CONTROL };
    // 併合した土地には総督を置ける。席は征服したこの年にできる
    governors = { ...governors, [factionId]: { current: null, candidates: [] } };
    // 郷里を失った勢力は人が集まらなくなる
    factions[factionId] = {
      ...faction,
      strength: faction.strength * HOMELAND_LOST_STRENGTH_PENALTY,
    };
    legitimacy = clamp(legitimacy + CONQUEST_LEGITIMACY_GAIN, MIN_LEGITIMACY, MAX_LEGITIMACY);
    turnEvents.push('homeland_conquered');
  } else {
    homelands[factionId] = {
      ...homeland,
      control,
      garrison: Math.max(0, homeland.garrison - margin * 0.3),
    };
  }

  return { ...state, fieldArmy, homelands, factions, governors, legitimacy, turnEvents };
}

/**
 * 本拠地の毎年の更新。
 * 併合した土地は少しずつ落ち着き、元の主は取り返しに来る
 */
export function updateHomelands(state: GameState, rng: () => number): GameState {
  const homelands = { ...state.homelands };
  const turnEvents = [...state.turnEvents];
  let governors = state.governors;
  let changed = false;

  for (const id of Object.keys(homelands) as BarbarianFactionId[]) {
    const homeland = homelands[id];
    if (homeland === undefined || homeland.owner !== 'west') continue;

    const faction = state.factions[id];
    // 勢力が健在なかぎり郷里を諦めない
    if (faction.stance !== 'settled' && faction.strength > 0) {
      /*
       * 総督を置いた土地は取り返されにくい。属州で守備隊の戦闘力に
       * 効くのと同じ補正を、こちらでは奪還の確率に効かせる
       * （郷里の奪還は戦闘解決を経ない一発の判定なので、
       *   戦闘力を掛ける先が無い）
       */
      if (rng() < HOMELAND_RECLAIM_PROBABILITY / governorDefenseModifier(state, id)) {
        const control = clamp(
          homeland.control - HOMELAND_RECLAIM_CONTROL_DAMAGE,
          MIN_CONTROL,
          MAX_CONTROL,
        );
        if (control <= MIN_CONTROL) {
          homelands[id] = { ...homeland, owner: 'barbarian', control: CONQUEST_INITIAL_CONTROL };
          // 取り返された土地の総督の席は消える
          governors = { ...governors };
          delete governors[id];
          turnEvents.push('homeland_lost');
        } else {
          homelands[id] = { ...homeland, control };
        }
        changed = true;
        continue;
      }
    }

    if (homeland.control < MAX_CONTROL) {
      homelands[id] = {
        ...homeland,
        // 支配度の自然回復も、属州と同じく総督の能力で変わる
        control: clamp(
          homeland.control +
            HOMELAND_CONTROL_RECOVERY * governorControlRecoveryModifier(state, id),
          MIN_CONTROL,
          MAX_CONTROL,
        ),
      };
      changed = true;
    }
  }

  if (!changed && turnEvents.length === state.turnEvents.length) return state;
  return { ...state, homelands, governors, turnEvents };
}
