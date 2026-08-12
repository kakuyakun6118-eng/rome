/**
 * 会戦と僭称帝国。
 *
 * 属州の攻防（barbarians.ts）が「territory を削り合う」処理なのに対し、
 * 会戦は野戦軍どうしが正面からぶつかる一度きりの決戦を表す。
 *
 * **率いる者が要る。** 皇帝自身か軍司令官がいなければ挑めない。
 * 大敗すれば属州が動揺し、野心の高い総督がローマ皇帝を僭称して離れる。
 * 史実のエデッサの戦い（260年、ウァレリアヌス捕縛）のあとに現れた
 * ガリア帝国やパルミラの型を、この時代に置いたもの。
 */

import {
  COMBAT_RANDOMNESS,
  DIFFICULTY_SETTINGS,
  MAX_CONTROL,
  MAX_LEGITIMACY,
  MIN_CONTROL,
  MIN_LEGITIMACY,
  MOBILIZE_EFFICIENCY,
  MOBILIZE_GARRISON_SHARE,
  MOBILIZE_MAX_PROVINCES,
  PITCHED_ARMY_SHARE,
  PITCHED_CAPTURE_LEGITIMACY,
  PITCHED_CAPTURE_PROBABILITY,
  PITCHED_DEFEAT_LEGITIMACY,
  PITCHED_LOSER_DAMAGE,
  PITCHED_ROUT_LEGITIMACY,
  PITCHED_ROUT_MARGIN_RATIO,
  PITCHED_RULER_MIN_MILITARY,
  PITCHED_VICTORY_LEGITIMACY,
  PITCHED_WINNER_DAMAGE,
  SUPPRESS_ARMY_SHARE,
  SUPPRESS_ATTRITION_RATE,
  SUPPRESS_LEGITIMACY_GAIN,
  SUPPRESS_RECOVERED_CONTROL,
  UPHEAVAL_YEARS_ON_CAPTURE,
  UPHEAVAL_YEARS_ON_ROUT,
  USURPER_EMPIRE_LEGITIMACY_LOSS,
  USURPER_GARRISON_SHARE,
  USURPER_GROWTH_RATE,
  USURPER_STRENGTH_PER_BASE_TAX,
} from './constants';
import { militaryModifier } from './dynasty';
import { generalDefenseModifier } from './general';
import { chiefPowerModifier } from './homelands';
import { foreignCommanderModifier } from './east';
import { resolveCombat } from './military';
import type {
  BattleFoe,
  BattleLeader,
  BattleOutcome,
  GameState,
  ProvinceId,
  Usurper,
} from './types';
import { clamp } from './util';

function randomizedPower(base: number, rng: () => number): number {
  return base * (1 + (rng() * 2 - 1) * COMBAT_RANDOMNESS);
}

/**
 * 会戦を率いられる者。
 *
 * 皇帝は軍事能力が足りていれば自ら戦場に立てる。
 * そうでなければ軍司令官に任せるしかなく、どちらも欠けていれば挑めない。
 * 「軍を率いるのは皇帝ではなくマギステル・ミリトゥムだった」という
 * この時代の形を、そのまま会戦の条件にしている
 */
export function availableBattleLeaders(state: GameState): BattleLeader[] {
  const leaders: BattleLeader[] = [];
  if (state.dynasty.ruler.abilities.military >= PITCHED_RULER_MIN_MILITARY) {
    leaders.push('ruler');
  }
  if (state.general.current !== null) leaders.push('general');
  return leaders;
}

/** その相手と会戦を挑めるか。相手が戦場に出ていなければ挑めない */
export function canGiveBattle(state: GameState, foe: BattleFoe): boolean {
  if (availableBattleLeaders(state).length === 0) return false;
  switch (foe.kind) {
    case 'barbarian': {
      const faction = state.factions[foe.factionId];
      // 帝国領に踏み込んでいる敵対勢力だけが会戦の相手になる
      return faction.stance === 'hostile' && faction.location !== 'exterior';
    }
    case 'east':
      return state.east.stance === 'war' && state.east.army > 0;
    case 'persia':
      return state.persia.intervened && state.persia.strength > 0;
  }
}

/** 会戦に出てくる相手の戦力と、率いる者の補正 */
function foePower(state: GameState, foe: BattleFoe): number {
  switch (foe.kind) {
    case 'barbarian': {
      const faction = state.factions[foe.factionId];
      return (
        faction.strength *
        DIFFICULTY_SETTINGS[state.difficulty].barbarianPowerMultiplier *
        chiefPowerModifier(state, foe.factionId)
      );
    }
    case 'east':
      return state.east.army * foreignCommanderModifier(state.east.commander);
    case 'persia':
      return state.persia.strength * foreignCommanderModifier(state.persia.commander);
  }
}

/**
 * 率いる者による攻撃側の補正。
 *
 * 皇帝が自ら率いれば軍事能力がそのまま乗るが、負けたときに
 * 捕虜になる危険を負う。将軍に任せれば安全だが手柄も将軍のものになる
 */
function leaderModifier(state: GameState, leader: BattleLeader): number {
  return leader === 'ruler' ? militaryModifier(state) : generalDefenseModifier(state);
}

/**
 * 会戦に動員できる属州。
 *
 * 守備隊が薄い属州、僭称帝国が握る属州からは連れ出せない
 */
export function mobilizableProvinces(state: GameState): ProvinceId[] {
  const held = usurperHeldProvinces(state);
  return (Object.keys(state.provinces) as ProvinceId[]).filter(
    (id) => !held.has(id) && state.provinces[id].garrison > 0,
  );
}

/**
 * 動員した属州が会戦に足す戦力。
 *
 * 守備隊の半分を連れ出し、行軍のぶん目減りする。
 * `openBattlefield` と `giveBattle` の両方がこの同じ値を使う
 */
export function mobilizedStrength(state: GameState, provinces: ProvinceId[]): number {
  return uniqueMobilized(state, provinces).reduce(
    (sum, id) =>
      sum + state.provinces[id].garrison * MOBILIZE_GARRISON_SHARE * MOBILIZE_EFFICIENCY,
    0,
  );
}

/** 動員する属州。重複と動員できない属州を落とし、上限で切る */
function uniqueMobilized(state: GameState, provinces: ProvinceId[]): ProvinceId[] {
  const allowed = new Set(mobilizableProvinces(state));
  return [...new Set(provinces)]
    .filter((id) => allowed.has(id))
    .slice(0, MOBILIZE_MAX_PROVINCES);
}

/** 連れ出した守備隊をその属州から差し引く */
function payMobilization(state: GameState, provinces: ProvinceId[]): GameState {
  const chosen = uniqueMobilized(state, provinces);
  if (chosen.length === 0) return state;
  const next = { ...state.provinces };
  for (const id of chosen) {
    next[id] = { ...next[id], garrison: next[id].garrison * (1 - MOBILIZE_GARRISON_SHARE) };
  }
  return { ...state, provinces: next };
}

export interface BattleResult {
  state: GameState;
  outcome: BattleOutcome;
}

/**
 * 会戦の解決。
 *
 * 勝敗は既存の `resolveCombat` で決め、margin の大きさで
 * 「敗北」と「大敗」を分ける。大敗すると属州が動揺し、
 * 皇帝が自ら率いていた場合は捕虜になることがある。
 *
 * `tactics` は戦場（`battlefield.ts`）で積んだ優劣の倍率。
 * 戦闘画面を経ない場合は 1.0 で、そのとき挙動は従来と1つも変わらない
 */
export function giveBattle(
  state: GameState,
  foe: BattleFoe,
  leader: BattleLeader,
  rng: () => number,
  tactics = 1,
  mobilize: ProvinceId[] = [],
): BattleResult {
  if (!canGiveBattle(state, foe)) return { state, outcome: 'defeat' };
  if (!availableBattleLeaders(state).includes(leader)) return { state, outcome: 'defeat' };

  /*
   * 動員した属州の守備隊も戦場に立つ。連れ出したぶんは
   * その属州から差し引かれるので、勝っても土地は薄くなる
   */
  const levy = mobilizedStrength(state, mobilize);
  const marched = payMobilization(state, mobilize);

  const ourBase =
    (marched.fieldArmy * PITCHED_ARMY_SHARE + levy) *
    leaderModifier(marched, leader) *
    tactics;
  const theirBase = foePower(marched, foe);
  const ours = randomizedPower(ourBase, rng);
  const theirs = randomizedPower(theirBase, rng);
  const { attackerWins, margin } = resolveCombat(ours, theirs);

  if (attackerWins) {
    return { state: applyVictory(marched, foe, margin), outcome: 'victory' };
  }

  // 大敗の判定。こちらの投じた兵に対して差が大きいほど壊走に近い
  const routed = margin / Math.max(1, ourBase) >= PITCHED_ROUT_MARGIN_RATIO;
  return applyDefeat(marched, margin, leader, routed, rng);
}

function applyVictory(state: GameState, foe: BattleFoe, margin: number): GameState {
  const damage = margin * PITCHED_WINNER_DAMAGE;
  const turnEvents = [...state.turnEvents, 'pitched_victory' as const];
  const legitimacy = clamp(
    state.legitimacy + PITCHED_VICTORY_LEGITIMACY,
    MIN_LEGITIMACY,
    MAX_LEGITIMACY,
  );

  switch (foe.kind) {
    case 'barbarian': {
      const faction = state.factions[foe.factionId];
      return {
        ...state,
        legitimacy,
        factions: {
          ...state.factions,
          [foe.factionId]: {
            ...faction,
            strength: Math.max(0, faction.strength - damage),
            // 野戦で敗れた軍勢は境外へ退く
            location: 'exterior',
          },
        },
        turnEvents,
      };
    }
    case 'east':
      return {
        ...state,
        legitimacy,
        east: { ...state.east, army: Math.max(0, state.east.army - damage) },
        turnEvents,
      };
    case 'persia':
      return {
        ...state,
        legitimacy,
        persia: {
          ...state.persia,
          strength: Math.max(0, state.persia.strength - damage),
        },
        turnEvents,
      };
  }
}

function applyDefeat(
  state: GameState,
  margin: number,
  leader: BattleLeader,
  routed: boolean,
  rng: () => number,
): BattleResult {
  const fieldArmy = Math.max(0, state.fieldArmy - margin * PITCHED_LOSER_DAMAGE);
  const captured =
    routed && leader === 'ruler' && rng() < PITCHED_CAPTURE_PROBABILITY;

  let legitimacyLoss = PITCHED_DEFEAT_LEGITIMACY;
  if (routed) legitimacyLoss += PITCHED_ROUT_LEGITIMACY;
  if (captured) legitimacyLoss += PITCHED_CAPTURE_LEGITIMACY;

  const outcome: BattleOutcome = captured ? 'captured' : routed ? 'rout' : 'defeat';
  const turnEvents = [...state.turnEvents];
  if (captured) turnEvents.push('ruler_captured');
  else if (routed) turnEvents.push('pitched_rout');
  else turnEvents.push('pitched_defeat');

  /*
   * 動揺。敗報が届いた属州で総督の反乱判定が跳ね上がる。
   * 捕縛のほうが長く尾を引く
   */
  const upheaval = captured
    ? UPHEAVAL_YEARS_ON_CAPTURE
    : routed
      ? UPHEAVAL_YEARS_ON_ROUT
      : 0;

  return {
    state: {
      ...state,
      fieldArmy,
      legitimacy: clamp(state.legitimacy - legitimacyLoss, MIN_LEGITIMACY, MAX_LEGITIMACY),
      upheavalYearsRemaining: Math.max(state.upheavalYearsRemaining, upheaval),
      turnEvents,
    },
    outcome,
  };
}

/** 動揺は年ごとに冷めていく */
export function updateUpheaval(state: GameState): GameState {
  if (state.upheavalYearsRemaining <= 0) return state;
  return { ...state, upheavalYearsRemaining: state.upheavalYearsRemaining - 1 };
}

// ── 僭称帝国 ──────────────────────────────────────────

/** 僭称帝国が握っている属州。収入にも保持属州数にも数えない */
export function usurperHeldProvinces(state: GameState): Set<ProvinceId> {
  const held = new Set<ProvinceId>();
  for (const usurper of state.usurpers) {
    for (const id of usurper.provinces) held.add(id);
  }
  return held;
}

export function isUsurperHeld(state: GameState, id: ProvinceId): boolean {
  return state.usurpers.some((u) => u.provinces.includes(id));
}

/**
 * 総督が皇帝を僭称して属州ごと離れる。
 *
 * `checkRevolts` の総督反乱と違い、属州そのものが帝国から抜ける。
 * 名は「地域名＋帝国」にする（ガリア帝国、ブリタンニア帝国…）
 */
export function proclaimUsurperEmpire(
  state: GameState,
  provinceId: ProvinceId,
  regionName: string,
  emperorName: string,
): GameState {
  if (isUsurperHeld(state, provinceId)) return state;
  const province = state.provinces[provinceId];

  const usurper: Usurper = {
    id: `usurper-${provinceId}-${state.year}`,
    name: `${regionName}帝国`,
    emperorName,
    provinces: [provinceId],
    strength:
      province.garrison * USURPER_GARRISON_SHARE +
      province.baseTax * USURPER_STRENGTH_PER_BASE_TAX,
    foundedYear: state.year,
  };

  return {
    ...state,
    provinces: {
      ...state.provinces,
      // 守備隊は僭称帝に付いていく
      [provinceId]: { ...province, garrison: province.garrison * (1 - USURPER_GARRISON_SHARE) },
    },
    // 総督の席は空く。僭称帝は総督ではなく皇帝を名乗っている
    governors: { ...state.governors, [provinceId]: { current: null, candidates: [] } },
    usurpers: [...state.usurpers, usurper],
    legitimacy: clamp(
      state.legitimacy - USURPER_EMPIRE_LEGITIMACY_LOSS,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    turnEvents: [...state.turnEvents, 'usurper_empire'],
  };
}

/** 僭称帝国は年ごとに兵を蓄える */
export function updateUsurpers(state: GameState): GameState {
  if (state.usurpers.length === 0) return state;
  return {
    ...state,
    usurpers: state.usurpers.map((u) => ({
      ...u,
      strength: u.strength * (1 + USURPER_GROWTH_RATE),
    })),
  };
}

/**
 * 僭称帝国の討伐。
 *
 * 蛮族の郷里への遠征と同じく野戦軍を投じるが、相手はローマ人なので
 * 勝っても正統性はよく戻る（皇帝がひとりに戻ったという宣言になる）
 */
export function suppressUsurper(
  state: GameState,
  usurperId: string,
  rng: () => number,
): GameState {
  const usurper = state.usurpers.find((u) => u.id === usurperId);
  if (usurper === undefined) return state;

  const ours = randomizedPower(
    state.fieldArmy * SUPPRESS_ARMY_SHARE * militaryModifier(state) * generalDefenseModifier(state),
    rng,
  );
  const theirs = randomizedPower(usurper.strength, rng);
  const { attackerWins, margin } = resolveCombat(ours, theirs);
  const fieldArmy = state.fieldArmy * (1 - SUPPRESS_ATTRITION_RATE);

  if (!attackerWins) {
    return {
      ...state,
      fieldArmy: Math.max(0, fieldArmy - margin * PITCHED_LOSER_DAMAGE),
      usurpers: state.usurpers.map((u) =>
        u.id === usurperId ? { ...u, strength: Math.max(0, u.strength - margin * 0.2) } : u,
      ),
      turnEvents: [...state.turnEvents, 'usurper_battle_lost'],
    };
  }

  const survivors = Math.max(0, usurper.strength - margin * PITCHED_WINNER_DAMAGE);
  if (survivors > 0) {
    // 一度で潰れるとは限らない。削り切るまで属州は戻らない
    return {
      ...state,
      fieldArmy,
      usurpers: state.usurpers.map((u) =>
        u.id === usurperId ? { ...u, strength: survivors } : u,
      ),
      turnEvents: [...state.turnEvents, 'usurper_battle_won'],
    };
  }

  // 討伐が成った。属州は荒れたまま帝国へ戻る
  const provinces = { ...state.provinces };
  for (const id of usurper.provinces) {
    provinces[id] = {
      ...provinces[id],
      control: clamp(SUPPRESS_RECOVERED_CONTROL, MIN_CONTROL, MAX_CONTROL),
    };
  }
  return {
    ...state,
    fieldArmy,
    provinces,
    usurpers: state.usurpers.filter((u) => u.id !== usurperId),
    legitimacy: clamp(
      state.legitimacy + SUPPRESS_LEGITIMACY_GAIN,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    turnEvents: [...state.turnEvents, 'usurper_suppressed'],
  };
}
