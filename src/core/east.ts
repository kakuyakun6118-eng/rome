/**
 * 東ローマ帝国とサーサーン朝ペルシア。
 *
 * 史実シナリオ(`historical`)では東は属州も軍も持たず、
 * 従来どおり `eastRelations` という数値としてだけ働く。
 * この系統が動くのは統一シナリオ(`reunification`)だけで、
 * 史実側の調整済みバランスには一切影響させない。
 */

import leadersData from '../data/leaders.json';
import {
  ABILITY_NEUTRAL,
  COMBAT_RANDOMNESS,
  CONTROL_RECOVERY_PER_TURN,
  DEFENSE_MULTIPLIER,
  EAST_ARMY_GROWTH_RATE,
  EAST_ARMY_MAX,
  EAST_ARMY_REBUILD,
  EAST_ARMY_LOSS_FACTOR,
  EAST_CONQUEST_CONTROL,
  EAST_COMMANDER_TEMPO_PER_POINT,
  EAST_COUNTERATTACK_PROBABILITY,
  JUSTINIAN_RECONQUEST_YEAR,
  EAST_DECLARE_WAR_LEGITIMACY_LOSS,
  EAST_DECLARE_WAR_SENATE_LOSS,
  EAST_DEFENSE_ARMY_SHARE,
  EAST_IMPROVE_COST,
  EAST_IMPROVE_RELATIONS_GAIN,
  EAST_INVADE_ARMY_SHARE,
  EAST_INVADE_ATTRITION_RATE,
  EAST_INVADE_CONTROL_DAMAGE,
  EAST_PEACE_MIN_WAR_YEARS,
  EAST_PEACE_RELATIONS,
  EAST_WAR_LEGITIMACY_DRAIN,
  FOREIGN_COMMANDER_PER_POINT,
  MAX_CONTROL,
  MAX_EAST_RELATIONS,
  MAX_LEGITIMACY,
  MAX_PERSIA_RELATIONS,
  MAX_SENATE_SUPPORT,
  MIN_CONTROL,
  MIN_EAST_RELATIONS,
  MIN_LEGITIMACY,
  MIN_PERSIA_RELATIONS,
  MIN_SENATE_SUPPORT,
  PERSIA_ATTACK_CONTROL_DAMAGE,
  PERSIA_IMPROVE_AT_WAR_PENALTY,
  PERSIA_IMPROVE_COST,
  PERSIA_IMPROVE_RELATIONS_GAIN,
  PERSIA_RELATIONS_ATTACK_FLOOR,
  PERSIA_RELATIONS_INTERVENTION_FLOOR,
  PERSIA_ATTACK_PROBABILITY,
  PERSIA_ATTACK_SHARE,
  PERSIA_DEFENSE_SHARE,
  PERSIA_GROWTH_RATE,
  PERSIA_MAX_STRENGTH,
  PERSIA_HOLD_CONTROL,
  PERSIA_INTERVENTION_PROBABILITY,
  PERSIA_LOSS_FACTOR,
  PERSIA_MIN_WAR_YEARS,
  PERSIA_SEIZE_CONTROL_THRESHOLD,
  PERSIA_SEIZE_STRENGTH_GAIN,
  SUCCESSION_UNREST_PERSIA_MULTIPLIER,
  WEST_ARMY_LOSS_FACTOR,
  PERSIA_HOME_DEFENSE_SHARE,
  PERSIA_INVADE_ARMY_SHARE,
  PERSIA_INVADE_ATTRITION_RATE,
  PERSIA_INVADE_STRENGTH_LOSS,
  PERSIA_SUBDUED_LEGITIMACY_GAIN,
  PERSIA_SUBDUED_THRESHOLD,
} from './constants';
import { diplomacyModifier, militaryModifier } from './dynasty';
import { isSuccessionUnrest } from './partition';
import { generalDefenseModifier } from './general';
import { resolveCombat } from './military';
import type { EastProvince, EastProvinceId, ForeignCommander, GameState } from './types';
import { clamp } from './util';

function randomizedPower(base: number, rng: () => number): number {
  return base * (1 + (rng() * 2 - 1) * COMBAT_RANDOMNESS);
}

/**
 * 東ローマとペルシアの軍司令官。
 *
 * 西に軍司令官がいて戦闘解決に効くのに、相手側は皇帝ひとりで
 * 戦っていた。どちらも実際に軍を率いたのは将であって帝ではないので、
 * 西と同じ形で置く。**新しい資源ではない。** 西の将軍と同じく、
 * 既存の戦闘解決の戦力に掛かる補正としてのみ作用させる。
 *
 * 名簿は実在の人物を在職年で引く。プレイヤーが任免できる相手ではないので
 * 乱数で生まれる西の将軍とは違い、年から決まる
 */
interface CommanderReign {
  from: number;
  name: string;
  military: number;
}

const COMMANDERS = leadersData as unknown as {
  eastCommanders: CommanderReign[];
  persiaCommanders: CommanderReign[];
};

function commanderAt(roster: CommanderReign[], year: number): ForeignCommander {
  for (let i = roster.length - 1; i >= 0; i--) {
    if (year >= roster[i].from) return { name: roster[i].name, military: roster[i].military };
  }
  return { name: roster[0].name, military: roster[0].military };
}

export function eastCommanderAt(year: number): ForeignCommander {
  return commanderAt(COMMANDERS.eastCommanders, year);
}

export function persiaCommanderAt(year: number): ForeignCommander {
  return commanderAt(COMMANDERS.persiaCommanders, year);
}

/** 司令官の力量が戦力に掛ける補正。西の generalDefenseModifier と同じ考え方 */
export function foreignCommanderModifier(commander: ForeignCommander): number {
  return 1 + (commander.military - ABILITY_NEUTRAL) * FOREIGN_COMMANDER_PER_POINT;
}

/** 統一シナリオかどうか。史実シナリオではこの系統を丸ごと素通りさせる */
export function isReunification(state: GameState): boolean {
  return state.scenario === 'reunification';
}

/**
 * 東への修好。使者と贈り物で関係を戻す。
 * 交渉能力が高い君主ほど同じ金額で多く戻せる
 */
export function improveEastRelations(state: GameState): GameState {
  if (state.treasury < EAST_IMPROVE_COST) return state;
  // 交戦中に贈り物は通らない
  if (state.east.stance === 'war') return state;
  return {
    ...state,
    treasury: state.treasury - EAST_IMPROVE_COST,
    eastRelations: clamp(
      state.eastRelations + EAST_IMPROVE_RELATIONS_GAIN * diplomacyModifier(state),
      MIN_EAST_RELATIONS,
      MAX_EAST_RELATIONS,
    ),
  };
}

/**
 * サーサーン朝への修好。
 *
 * 史実の西ローマとペルシアにはほとんど直接の往来が無かったが、
 * このゲームのペルシアは統一の最後の関門なので、
 * 使者を送って介入を遅らせる手を持たせる。
 *
 * **新しい資源にはしない。** 上がった関係は既存の2つの確率
 * （介入の開始・毎年の攻勢）を下げる補正としてのみ働き、
 * どちらもゼロにはできない（PERSIA_RELATIONS_*_FLOOR）。
 * 金でラスボスを消せてしまっては主題が壊れる
 */
export function improvePersiaRelations(state: GameState): GameState {
  if (!isReunification(state)) return state;
  if (state.treasury < PERSIA_IMPROVE_COST) return state;
  if (state.persia.relations >= MAX_PERSIA_RELATIONS) return state;

  // 剣を抜いた相手に贈り物はあまり通らない
  const efficiency = state.persia.intervened ? PERSIA_IMPROVE_AT_WAR_PENALTY : 1;
  return {
    ...state,
    treasury: state.treasury - PERSIA_IMPROVE_COST,
    persia: {
      ...state.persia,
      relations: clamp(
        state.persia.relations +
          PERSIA_IMPROVE_RELATIONS_GAIN * diplomacyModifier(state) * efficiency,
        MIN_PERSIA_RELATIONS,
        MAX_PERSIA_RELATIONS,
      ),
    },
  };
}

/**
 * 関係が確率に掛ける係数。関係0で1.0、満点で floor まで下がる。
 * 補正の形は君主能力や官職と同じで、既存の式に掛かるだけ
 */
function persiaRelationsFactor(state: GameState, floor: number): number {
  const ratio = state.persia.relations / MAX_PERSIA_RELATIONS;
  return 1 - (1 - floor) * ratio;
}

/** 東ローマに宣戦する。ローマ人同士の戦なので正統性と元老院支持を先払いする */
export function declareWarOnEast(state: GameState, year: number): GameState {
  if (!isReunification(state)) return state;
  if (state.east.stance === 'war') return state;
  return {
    ...state,
    eastRelations: MIN_EAST_RELATIONS,
    legitimacy: clamp(
      state.legitimacy - EAST_DECLARE_WAR_LEGITIMACY_LOSS,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    senateSupport: clamp(
      state.senateSupport - EAST_DECLARE_WAR_SENATE_LOSS,
      MIN_SENATE_SUPPORT,
      MAX_SENATE_SUPPORT,
    ),
    east: { ...state.east, stance: 'war', warStartYear: year },
    turnEvents: [...state.turnEvents, 'east_war_declared'],
  };
}

/** 講和。奪った属州は保持したまま戦端だけ閉じる */
export function makePeaceWithEast(state: GameState): GameState {
  const { east } = state;
  if (east.stance !== 'war' || east.warStartYear === null) return state;
  if (state.year - east.warStartYear < EAST_PEACE_MIN_WAR_YEARS) return state;
  return {
    ...state,
    eastRelations: EAST_PEACE_RELATIONS,
    east: { ...east, stance: 'peace', warStartYear: null },
    turnEvents: [...state.turnEvents, 'east_peace'],
  };
}

/**
 * その東方属州に攻め込めるか。
 *
 * 東ローマの属州を攻めるには宣戦していることが要る。
 * **ペルシアが握っている属州は講和後でも攻められる。**
 * 交戦中であることを一律の条件にしていたときは、ペルシアが1州でも
 * 持っている状態で講和すると取り返す手段が消え、統一が永久に
 * 成立しなくなっていた（ペルシアの側は介入済みなら講和に関わらず
 * 攻勢を続けるので、一方的に殴られ続ける形になる）。
 * 「講和してもペルシアは引かない」という行動の説明とも食い違っていた
 */
export function canInvadeEastProvince(state: GameState, province: EastProvince): boolean {
  if (province.owner === 'west') return false;
  if (province.owner === 'persia') return true;
  return state.east.stance === 'war';
}

/** 攻め込める東方属州。UI の候補もこれで絞る */
export function invadableEastProvinces(state: GameState): EastProvince[] {
  return state.east.provinces.filter((p) => canInvadeEastProvince(state, p));
}

/**
 * 東方属州への侵攻。
 * 西の野戦軍を遠征に振り向け、支配度を削り、0まで落とすと自分のものになる
 */
export function invadeEastProvince(
  state: GameState,
  provinceId: EastProvinceId,
  rng: () => number,
): GameState {
  const { east } = state;
  const index = east.provinces.findIndex((p) => p.id === provinceId);
  if (index < 0) return state;
  const target = east.provinces[index];
  if (!canInvadeEastProvince(state, target)) return state;

  const attacker = randomizedPower(
    state.fieldArmy * EAST_INVADE_ARMY_SHARE * militaryModifier(state),
    rng,
  );
  // 守る側が誰かで防御戦力が変わる。ペルシアが握っている属州は固い
  const defenseBase =
    target.owner === 'persia'
      ? target.garrison + state.persia.strength * PERSIA_DEFENSE_SHARE
      : target.garrison + east.army * EAST_DEFENSE_ARMY_SHARE;
  // 守る側の司令官の力量。ペルシアが握る属州はその王の将が守る
  const defenderCommander =
    target.owner === 'persia' ? state.persia.commander : east.commander;
  const defender = randomizedPower(
    defenseBase * DEFENSE_MULTIPLIER * foreignCommanderModifier(defenderCommander),
    rng,
  );

  const { attackerWins, margin } = resolveCombat(attacker, defender);
  const provinces = [...east.provinces];
  const turnEvents = [...state.turnEvents];
  let fieldArmy = state.fieldArmy * (1 - EAST_INVADE_ATTRITION_RATE);
  let eastArmy = east.army;
  let persiaStrength = state.persia.strength;
  let seized = state.persia.seizedProvinces;

  if (attackerWins) {
    const control = clamp(
      target.control - EAST_INVADE_CONTROL_DAMAGE,
      MIN_CONTROL,
      MAX_CONTROL,
    );
    if (target.owner === 'persia') {
      persiaStrength = Math.max(0, persiaStrength - margin * PERSIA_LOSS_FACTOR);
    } else {
      eastArmy = Math.max(0, eastArmy - margin * EAST_ARMY_LOSS_FACTOR);
    }

    if (control <= MIN_CONTROL) {
      // 征服。奪ったばかりの土地なので支配度は低いところから始まる
      provinces[index] = {
        ...target,
        owner: 'west',
        control: EAST_CONQUEST_CONTROL,
        garrison: 0,
      };
      seized = seized.filter((id) => id !== target.id);
      turnEvents.push('east_province_taken');
    } else {
      provinces[index] = {
        ...target,
        control,
        garrison: Math.max(0, target.garrison - margin * EAST_ARMY_LOSS_FACTOR),
      };
    }
  } else {
    fieldArmy = Math.max(0, fieldArmy - margin * WEST_ARMY_LOSS_FACTOR);
  }

  return {
    ...state,
    fieldArmy,
    east: { ...east, army: eastArmy, provinces },
    persia: { ...state.persia, strength: persiaStrength, seizedProvinces: seized },
    turnEvents,
  };
}

/**
 * 東ローマの手番。交戦中なら攻め返してくる。
 * 西が奪った東方属州を取り返しに来る
 */
/**
 * ユスティニアヌス1世の西方回復（renovatio imperii）。
 *
 * 527年、東方属州を西に握られていれば、**講和していようと従属して
 * いようと東は戦端を開く。** ベリサリウスとナルセスを西へ送り込んだ
 * 史実そのままの筋で、統一シナリオの山場になる。
 *
 * これが無いと、統一したあと講和してしまえば東は二度と動かず、
 * 6世紀が何も起きない89年になっていた
 */
function justinianReconquest(state: GameState): GameState {
  // その年に一度だけ。tick() が年を進めるので二重には起きない
  if (state.year !== JUSTINIAN_RECONQUEST_YEAR) return state;
  if (state.east.stance === 'war') return state;
  if (!state.east.provinces.some((p) => p.owner === 'west')) return state;

  return {
    ...state,
    east: {
      ...state.east,
      stance: 'war',
      warStartYear: state.year,
      // 従属していた東方帝は宗主権を振り払ってこれに加わる
      vassalRuler: null,
    },
    turnEvents: [...state.turnEvents, 'justinian_reconquest', 'east_war_declared'],
  };
}

function eastCounterattack(state: GameState, rng: () => number): GameState {
  const { east } = state;
  if (east.stance !== 'war') return state;
  /*
   * 攻め返す頻度は司令官の力量で変わる。
   * 有能な将は一撃が重いだけでなく、休まず戦役を起こす
   */
  const tempo =
    1 + (east.commander.military - ABILITY_NEUTRAL) * EAST_COMMANDER_TEMPO_PER_POINT;
  if (rng() >= EAST_COUNTERATTACK_PROBABILITY * tempo) return state;

  // 取り返す相手は、西が握っている東方属州のうち最も支配度が低いもの
  const targets = east.provinces
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.owner === 'west')
    .sort((a, b) => a.p.control - b.p.control);
  if (targets.length === 0) return state;

  const { p: target, i: index } = targets[0];
  const attacker = randomizedPower(
    east.army * EAST_DEFENSE_ARMY_SHARE * foreignCommanderModifier(east.commander),
    rng,
  );
  const defender = randomizedPower(
    (target.garrison + state.fieldArmy * EAST_INVADE_ARMY_SHARE) *
      DEFENSE_MULTIPLIER *
      militaryModifier(state) *
      generalDefenseModifier(state),
    rng,
  );
  const { attackerWins, margin } = resolveCombat(attacker, defender);

  const provinces = [...east.provinces];
  const turnEvents = [...state.turnEvents];
  if (attackerWins) {
    const control = clamp(
      target.control - EAST_INVADE_CONTROL_DAMAGE,
      MIN_CONTROL,
      MAX_CONTROL,
    );
    if (control <= MIN_CONTROL) {
      provinces[index] = { ...target, owner: 'east', control: EAST_CONQUEST_CONTROL };
      turnEvents.push('east_province_lost');
    } else {
      provinces[index] = { ...target, control };
    }
    return {
      ...state,
      fieldArmy: Math.max(0, state.fieldArmy - margin * WEST_ARMY_LOSS_FACTOR),
      east: { ...east, provinces },
      turnEvents,
    };
  }

  return {
    ...state,
    east: { ...east, army: Math.max(0, east.army - margin * EAST_ARMY_LOSS_FACTOR) },
  };
}

/**
 * ペルシアの手番。
 *
 * ローマ同士が交戦している年に介入を始める。いったん動き出すと
 * 講和しても引かない。東方属州を次々に奪い、奪うたびに強くなる。
 * 統一の最後の関門になる
 */
function persianTurn(state: GameState, rng: () => number): GameState {
  const { persia, east } = state;

  if (!persia.intervened) {
    // ローマ同士が潰し合っている隙にだけ動き出す
    if (east.stance !== 'war' || east.warStartYear === null) return state;
    // 緒戦のうちは静観する。内戦が長引いたのを見てから動く
    if (state.year - east.warStartYear < PERSIA_MIN_WAR_YEARS) return state;
    // 修好が続いていれば、動き出す年が遅くなる
    if (
      rng() >=
      PERSIA_INTERVENTION_PROBABILITY *
        persiaRelationsFactor(state, PERSIA_RELATIONS_INTERVENTION_FLOOR)
    ) {
      return state;
    }

    /*
     * 介入は宣言だけで終わらせず、その年のうちに橋頭堡を確保させる。
     *
     * 確率的に削るだけにしていたときは、西が東を平らげるほうが速く、
     * 統一した58局のうちペルシアと属州を争ったのは2局しかなかった。
     * それではラスボスではなく、間に合えば無視できる背景になる。
     * 介入した時点で必ず1州を握らせ、統一するなら必ず
     * ペルシアを打ち破らなければならない形にする
     */
    const beachhead = east.provinces
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.owner !== 'persia')
      .sort((a, b) => a.p.control - b.p.control)[0];
    if (beachhead === undefined) {
      return {
        ...state,
        persia: { ...persia, intervened: true, interventionYear: state.year },
        turnEvents: [...state.turnEvents, 'persia_intervened'],
      };
    }
    const provinces = [...east.provinces];
    provinces[beachhead.i] = {
      ...beachhead.p,
      owner: 'persia',
      control: PERSIA_HOLD_CONTROL,
    };
    return {
      ...state,
      east: { ...east, provinces },
      persia: {
        ...persia,
        intervened: true,
        interventionYear: state.year,
        strength: persia.strength + PERSIA_SEIZE_STRENGTH_GAIN,
        seizedProvinces: [...persia.seizedProvinces, beachhead.p.id],
      },
      turnEvents: [...state.turnEvents, 'persia_intervened'],
    };
  }

  // 東の軍と同じく天井を置く。171ターンでは掛け算だけだと膨らみ続ける
  const grown = Math.min(PERSIA_MAX_STRENGTH, persia.strength * (1 + PERSIA_GROWTH_RATE));
  if (
    rng() >=
    PERSIA_ATTACK_PROBABILITY *
      persiaRelationsFactor(state, PERSIA_RELATIONS_ATTACK_FLOOR) *
      // 代替わりの隙はペルシアも突いてくる
      (isSuccessionUnrest(state) ? SUCCESSION_UNREST_PERSIA_MULTIPLIER : 1)
  ) {
    return { ...state, persia: { ...persia, strength: grown } };
  }

  // 狙うのはペルシアの持ち物でない東方属州のうち、最も支配度が低いもの
  const targets = east.provinces
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.owner !== 'persia')
    .sort((a, b) => a.p.control - b.p.control);
  if (targets.length === 0) return { ...state, persia: { ...persia, strength: grown } };

  const { p: target, i: index } = targets[0];
  const attacker = randomizedPower(
    grown * PERSIA_ATTACK_SHARE * foreignCommanderModifier(persia.commander),
    rng,
  );
  // 西が持っている属州は西の野戦軍が、東の属州は東の軍が守る
  const defenseBase =
    target.owner === 'west'
      ? target.garrison + state.fieldArmy * EAST_INVADE_ARMY_SHARE
      : target.garrison + east.army * EAST_DEFENSE_ARMY_SHARE;
  const defenderModifier =
    target.owner === 'west'
      ? militaryModifier(state) * generalDefenseModifier(state)
      : foreignCommanderModifier(east.commander);
  const defender = randomizedPower(defenseBase * DEFENSE_MULTIPLIER * defenderModifier, rng);

  const { attackerWins, margin } = resolveCombat(attacker, defender);
  if (!attackerWins) {
    return {
      ...state,
      persia: { ...persia, strength: Math.max(0, grown - margin * PERSIA_LOSS_FACTOR) },
    };
  }

  const provinces = [...east.provinces];
  const turnEvents = [...state.turnEvents];
  let fieldArmy = state.fieldArmy;
  let eastArmy = east.army;
  let seized = persia.seizedProvinces;
  let strength = grown;

  const control = clamp(
    target.control - PERSIA_ATTACK_CONTROL_DAMAGE,
    MIN_CONTROL,
    MAX_CONTROL,
  );
  if (target.owner === 'west') {
    fieldArmy = Math.max(0, fieldArmy - margin * WEST_ARMY_LOSS_FACTOR);
  } else {
    eastArmy = Math.max(0, eastArmy - margin * EAST_ARMY_LOSS_FACTOR);
  }

  if (control <= PERSIA_SEIZE_CONTROL_THRESHOLD) {
    provinces[index] = { ...target, owner: 'persia', control: PERSIA_HOLD_CONTROL };
    seized = seized.includes(target.id) ? seized : [...seized, target.id];
    strength += PERSIA_SEIZE_STRENGTH_GAIN;
    turnEvents.push('persia_offensive');
  } else {
    provinces[index] = { ...target, control };
  }

  return {
    ...state,
    fieldArmy,
    east: { ...east, army: eastArmy, provinces },
    persia: { ...persia, strength, seizedProvinces: seized },
    turnEvents,
  };
}

/**
 * サーサーン朝の本土へ遠征できるか。
 *
 * **ローマを統一したあとにだけ選べる。** 東を平らげてはじめて、
 * 帝国は東の国境の向こうへ手を伸ばせる。動き出していないペルシアを
 * こちらから叩くことはしない（介入していないうちは戦端が無い）
 */
export function canInvadePersia(state: GameState): boolean {
  if (!isReunification(state)) return false;
  if (!state.persia.intervened) return false;
  if (state.persia.strength <= 0) return false;
  return isUnified(state);
}

/**
 * サーサーン朝の本土への遠征。
 *
 * 都クテシフォンはこの地図では属州ではないので落とせない。
 * 代わりに本土を突いてその戦力そのものを削る形にしてある。
 * 削り切ればペルシアは介入を取り下げ、東方戦線が閉じる
 */
export function invadePersia(state: GameState, rng: () => number): GameState {
  if (!canInvadePersia(state)) return state;
  const { persia } = state;

  const attacker = randomizedPower(
    state.fieldArmy * PERSIA_INVADE_ARMY_SHARE * militaryModifier(state) *
      generalDefenseModifier(state),
    rng,
  );
  // 本土なので王の軍が出張ってくる。属州を攻めるよりはるかに重い
  const defender = randomizedPower(
    persia.strength * PERSIA_HOME_DEFENSE_SHARE * DEFENSE_MULTIPLIER *
      foreignCommanderModifier(persia.commander),
    rng,
  );

  const { attackerWins, margin } = resolveCombat(attacker, defender);
  const fieldArmy = state.fieldArmy * (1 - PERSIA_INVADE_ATTRITION_RATE);
  const turnEvents = [...state.turnEvents];

  if (!attackerWins) {
    return {
      ...state,
      fieldArmy: Math.max(0, fieldArmy - margin * WEST_ARMY_LOSS_FACTOR),
      turnEvents,
    };
  }

  const strength = Math.max(0, persia.strength * (1 - PERSIA_INVADE_STRENGTH_LOSS));
  turnEvents.push('persia_invaded');

  // 削り切ればペルシアは介入を取り下げる。東方戦線はここで閉じる
  if (strength < PERSIA_SUBDUED_THRESHOLD) {
    turnEvents.push('persia_subdued');
    return {
      ...state,
      fieldArmy,
      legitimacy: clamp(
        state.legitimacy + PERSIA_SUBDUED_LEGITIMACY_GAIN,
        MIN_LEGITIMACY,
        MAX_LEGITIMACY,
      ),
      persia: { ...persia, strength: 0, intervened: false },
      turnEvents,
    };
  }

  return { ...state, fieldArmy, persia: { ...persia, strength }, turnEvents };
}

/**
 * 東方戦線の1年ぶんの処理。コアループから呼ぶ。
 * 統一シナリオでなければ何もしない
 */
export function updateEasternFront(state: GameState, rng: () => number): GameState {
  if (!isReunification(state)) return state;

  /*
   * 司令官の交代。名簿を年で引くだけなので `tick()` の純粋性を壊さない。
   * 戦闘の前に済ませ、その年の戦いは新任の将が指揮する形にする
   */
  let next: GameState = {
    ...state,
    east: { ...state.east, commander: eastCommanderAt(state.year) },
    persia: { ...state.persia, commander: persiaCommanderAt(state.year) },
  };

  // 同胞と戦い続ける年は正統性が余分に減る
  if (next.east.stance === 'war') {
    next = {
      ...next,
      legitimacy: clamp(
        next.legitimacy - EAST_WAR_LEGITIMACY_DRAIN,
        MIN_LEGITIMACY,
        MAX_LEGITIMACY,
      ),
    };
  }

  // 527年、ユスティニアヌスが西方の回復を掲げて動く
  next = justinianReconquest(next);
  next = eastCounterattack(next, rng);
  next = persianTurn(next, rng);

  /*
   * 東方属州の支配度の回復。
   *
   * 西の属州は updateControl が面倒を見るが、east.provinces は
   * そこを通らない。入れ忘れていたときは、征服した属州が
   * EAST_CONQUEST_CONTROL のまま永久に回復せず、
   * ペルシアに削られて必ず奪われていた。
   *
   * 回復するのは西が押さえた属州だけにする。西の属州で
   * 「敵がいる属州は回復しない」のと同じ理屈で、攻められている
   * 東方属州が毎年立ち直ると攻略がまったく進まなくなる
   */
  const provinces = next.east.provinces.map((p) =>
    p.owner === 'west' && p.control < MAX_CONTROL
      ? { ...p, control: clamp(p.control + CONTROL_RECOVERY_PER_TURN, MIN_CONTROL, MAX_CONTROL) }
      : p,
  );

  /*
   * 東の軍は毎年少しずつ立て直す。
   *
   * 掛け算だけだと一度壊滅させた東は二度と戻れず、6世紀の巻き返しが
   * 起きない。逆に上限が無いと171ターンで28倍まで膨らむ。
   * 天井へ向かって伸び、削り切っても最低量は戻る形にする
   */
  return {
    ...next,
    east: {
      ...next.east,
      army: Math.min(
        EAST_ARMY_MAX,
        next.east.army * (1 + EAST_ARMY_GROWTH_RATE) + EAST_ARMY_REBUILD,
      ),
      provinces,
    },
  };
}

/** 西が持っている東方属州。収入計算に加える */
export function westHeldEastProvinces(state: GameState): EastProvince[] {
  return state.east.provinces.filter((p) => p.owner === 'west');
}

/**
 * 統一が成立しているか。
 * 東方属州をすべて西のものにし、ペルシアの手に渡ったものが無いこと
 */
export function isUnified(state: GameState): boolean {
  if (!isReunification(state)) return false;
  return state.east.provinces.every((p) => p.owner === 'west');
}
