import type { GameState, ProvinceId } from './types';
import { isUsurperHeld } from './battle';
import {
  CONSCRIPT_ARMY_GAIN,
  CONSCRIPT_COST,
  MAX_CONTROL,
  MIN_CONTROL,
  PROVINCE_RECRUIT_CONTROL_LOSS,
  PROVINCE_RECRUIT_COST,
  PROVINCE_RECRUIT_GARRISON_SHARE,
  PROVINCE_RECRUIT_PER_BASE_TAX,
  CONSCRIPT_SENATE_LOSS,
  DEFEND_COST,
  DEFEND_GARRISON_GAIN,
  DEPLOY_ATTRITION_RATE,
  DESERTION_RATE,
  GENERAL_USURP_EXTRA_ARMY_LOSS,
  MAX_LEGITIMACY,
  MAX_SENATE_SUPPORT,
  MIN_LEGITIMACY,
  MIN_SENATE_SUPPORT,
  REORGANIZE_COST,
  REORGANIZE_GARRISON_DRAW_RATE,
  REORGANIZE_TRANSFER_EFFICIENCY,
  SUCCESSION_CRISIS_USURPER_BONUS,
  USURPER_ARMY_LOSS_RATE,
  USURPER_LEGITIMACY_LOSS,
  USURPER_LEGITIMACY_THRESHOLD,
  USURPER_PROBABILITY,
  USURPER_PROBABILITY_CAP,
} from './constants';
import { generalUsurperBonus, vacateSeat } from './general';
import { clamp } from './util';

/** 国庫が負なら野戦軍の一部が脱走する */
export function applyDesertion(state: GameState): GameState {
  if (state.treasury >= 0) return state;
  return {
    ...state,
    fieldArmy: state.fieldArmy * (1 - DESERTION_RATE),
    turnEvents: [...state.turnEvents, 'desertion'],
  };
}

export interface CombatResult {
  attackerWins: boolean;
  /** 勝敗の差の絶対値。損耗量の算出に使う */
  margin: number;
}

export function resolveCombat(attackerPower: number, defenderPower: number): CombatResult {
  const margin = attackerPower - defenderPower;
  return { attackerWins: margin > 0, margin: Math.abs(margin) };
}

/** 徴募: 金を払って野戦軍を増やす。徴募の負担は元老院の支持を削る */
export function conscript(state: GameState): GameState {
  if (state.treasury < CONSCRIPT_COST) return state;
  return {
    ...state,
    treasury: state.treasury - CONSCRIPT_COST,
    fieldArmy: state.fieldArmy + CONSCRIPT_ARMY_GAIN,
    senateSupport: clamp(
      state.senateSupport - CONSCRIPT_SENATE_LOSS,
      MIN_SENATE_SUPPORT,
      MAX_SENATE_SUPPORT,
    ),
  };
}

/**
 * その属州で兵を募る。
 *
 * 中央の徴募が「金で兵を買う」のに対して、こちらは**土地から兵を出す**。
 * 穫れ高はその属州の税収基礎と支配度に比例するので、豊かな属州を
 * 保っているほど効く。安いが、若者を連れていかれた土地は荒れる
 */
export function recruitInProvince(state: GameState, provinceId: ProvinceId): GameState {
  if (state.treasury < PROVINCE_RECRUIT_COST) return state;
  const province = state.provinces[provinceId];
  if (province === undefined || province.control <= MIN_CONTROL) return state;
  // 僭称帝国が握る属州からは募れない
  if (isUsurperHeld(state, provinceId)) return state;

  const levy =
    province.baseTax * (province.control / MAX_CONTROL) * PROVINCE_RECRUIT_PER_BASE_TAX;
  return {
    ...state,
    treasury: state.treasury - PROVINCE_RECRUIT_COST,
    fieldArmy: state.fieldArmy + levy * (1 - PROVINCE_RECRUIT_GARRISON_SHARE),
    provinces: {
      ...state.provinces,
      [provinceId]: {
        ...province,
        // 募った兵の一部はその場に残って守りにつく
        garrison: province.garrison + levy * PROVINCE_RECRUIT_GARRISON_SHARE,
        control: clamp(
          province.control - PROVINCE_RECRUIT_CONTROL_LOSS,
          MIN_CONTROL,
          MAX_CONTROL,
        ),
      },
    },
  };
}

/**
 * 軍の再編。兵を生み出さず、属州の守備隊から野戦軍へ移す再配分。
 * 機動戦力は厚くなるが属州の守りは薄くなるという取引であり、
 * 守備隊が尽きれば得られる兵も尽きる
 */
export function reorganizeArmy(state: GameState): GameState {
  if (state.treasury < REORGANIZE_COST) return state;

  const provinces = { ...state.provinces };
  let drawn = 0;
  for (const id of Object.keys(provinces) as ProvinceId[]) {
    const province = provinces[id];
    const taken = province.garrison * REORGANIZE_GARRISON_DRAW_RATE;
    if (taken <= 0) continue;
    drawn += taken;
    provinces[id] = { ...province, garrison: province.garrison - taken };
  }

  // 引き抜ける守備隊がなければ再編は成立せず、費用も発生しない
  if (drawn <= 0) return state;

  return {
    ...state,
    treasury: state.treasury - REORGANIZE_COST,
    fieldArmy: state.fieldArmy + drawn * REORGANIZE_TRANSFER_EFFICIENCY,
    provinces,
  };
}

/** 属州防衛: 金を払って守備隊を増強する */
export function reinforceGarrison(state: GameState, provinceId: ProvinceId): GameState {
  if (state.treasury < DEFEND_COST) return state;
  const province = state.provinces[provinceId];
  return {
    ...state,
    treasury: state.treasury - DEFEND_COST,
    provinces: {
      ...state.provinces,
      [provinceId]: { ...province, garrison: province.garrison + DEFEND_GARRISON_GAIN },
    },
  };
}

/** 野戦軍の派遣: 移動と行軍で軍が損耗する。防衛への寄与は戦闘解決時に加算される */
export function applyDeployAttrition(state: GameState): GameState {
  return { ...state, fieldArmy: state.fieldArmy * (1 - DEPLOY_ATTRITION_RATE) };
}

/**
 * コアループ ステップ7: 正統性判定。
 * 正統性が閾値を下回ると簒奪者が現れ、野戦軍と正統性を失う。
 * 継承危機の直後は簒奪者が現れやすい
 */
export function checkUsurper(state: GameState, rng: () => number): GameState {
  const inCrisis = state.dynasty.crisisYearsRemaining > 0;
  if (state.legitimacy >= USURPER_LEGITIMACY_THRESHOLD && !inCrisis) return state;

  // 継承危機と低正統性が重なっても発散しないよう上限を設ける
  const probability = Math.min(
    USURPER_PROBABILITY +
      (inCrisis ? SUCCESSION_CRISIS_USURPER_BONUS : 0) +
      generalUsurperBonus(state),
    USURPER_PROBABILITY_CAP,
  );
  if (rng() >= probability) return state;

  /*
   * 軍を握っているのは将軍なので、在職していれば簒奪者は将軍本人とみなす。
   * 無名の反乱よりこの時代の実態に近く、失う軍も大きい。
   * 蜂起した将軍はその職を離れるため、後任を立て直すことになる
   */
  const general = state.general.current;
  if (general !== null) {
    const vacated = vacateSeat(state, 'usurped');
    return {
      ...vacated,
      fieldArmy:
        vacated.fieldArmy * (1 - USURPER_ARMY_LOSS_RATE - GENERAL_USURP_EXTRA_ARMY_LOSS),
      legitimacy: clamp(
        vacated.legitimacy - USURPER_LEGITIMACY_LOSS,
        MIN_LEGITIMACY,
        MAX_LEGITIMACY,
      ),
      turnEvents: [...vacated.turnEvents, 'general_usurped'],
    };
  }

  return {
    ...state,
    fieldArmy: state.fieldArmy * (1 - USURPER_ARMY_LOSS_RATE),
    legitimacy: clamp(
      state.legitimacy - USURPER_LEGITIMACY_LOSS,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    turnEvents: [...state.turnEvents, 'usurper_attempt'],
  };
}
