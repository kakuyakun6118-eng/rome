import type {
  BarbarianDemand,
  BarbarianFactionId,
  GameState,
  Lineage,
  MarriageOrigin,
  PendingMarriage,
  ProvinceId,
  Spouse,
} from './types';
import {
  DEMAND_GOLD_DISPERSAL_RATE,
  DEMAND_GOLD_PER_STRENGTH,
  DEMAND_LAND_CONTROL_THRESHOLD,
  DEMAND_PROBABILITY,
  DEMAND_TITLE_WAGE_DISCOUNT,
  DEMAND_TITLE_LEGITIMACY_LOSS,
  DEMAND_TITLE_SENATE_LOSS,
  DEMAND_TITLE_SHARE,
  DIFFICULTY_SETTINGS,
  EAST_AID_ARMY_GAIN,
  EAST_AID_MIN_RELATIONS,
  EAST_AID_RELATIONS_LOSS,
  EAST_AID_TREASURY_GAIN,
  EAST_TITLE_COST,
  EAST_TITLE_LEGITIMACY_GAIN,
  EAST_TITLE_RELATIONS_LOSS,
  FOEDERATI_DEMAND_ESCALATION,
  FOEDERATI_DEMAND_PER_STRENGTH,
  FOEDERATI_HIRE_COST,
  FOEDERATI_HIRE_LEGITIMACY_LOSS,
  FOEDERATI_LOYALTY_DECAY_UNPAID,
  FOEDERATI_LOYALTY_RECOVERY,
  FOEDERATI_TAX_BASE_DRAIN,
  LEGITIMACY_LOSS_PER_SETTLEMENT,
  MARRIAGE_BARBARIAN_LOYALTY_GAIN,
  MARRIAGE_BARBARIAN_SENATE_LOSS,
  MARRIAGE_BARBARIAN_SUCCESS_BASE,
  MARRIAGE_COST,
  MARRIAGE_EAST_LEGITIMACY_GAIN,
  MARRIAGE_EAST_MIN_RELATIONS,
  MARRIAGE_EAST_RELATIONS_GAIN,
  MARRIAGE_EAST_SUCCESS_BASE,
  MARRIAGE_HEIR_BORN_EAST_RELATIONS_GAIN,
  MARRIAGE_HEIR_BORN_LOYALTY_GAIN,
  MARRIAGE_HEIR_BORN_SENATE_GAIN,
  MARRIAGE_LEGITIMACY_LOSS,
  MARRIAGE_ROMAN_LEGITIMACY_GAIN,
  MARRIAGE_ROMAN_MIN_SENATE_SUPPORT,
  MARRIAGE_ROMAN_SENATE_GAIN,
  MARRIAGE_ROMAN_SUCCESS_BASE,
  MARRIAGE_ROMAN_TAX_BASE_LOSS,
  MAX_EAST_RELATIONS,
  MAX_FOEDERATI_LOYALTY,
  MAX_LEGITIMACY,
  MAX_SENATE_SUPPORT,
  MAX_TAX_BASE,
  MIN_EAST_RELATIONS,
  MIN_FOEDERATI_LOYALTY,
  MIN_LEGITIMACY,
  MIN_SENATE_SUPPORT,
  MIN_TAX_BASE,
  SETTLE_TAX_BASE_LOSS,
  TRIBUTE_LOYALTY_GAIN,
} from './constants';
import housesData from '../data/houses.json';
import { diplomacyModifier } from './dynasty';
import { clamp } from './util';

/** 元老院貴族の家門。状態を持たない静的なデータ。コードに直接書かない */
const HOUSES = (housesData as { houses: RomanHouse[] }).houses;

export interface RomanHouse {
  id: string;
  name: string;
}

/** 家門の呼び名。表示側はこれを引く（ui にデータの読み方を書かせない） */
export function romanHouseName(houseId: string): string {
  return HOUSES.find((house) => house.id === houseId)?.name ?? houseId;
}

/** 縁組を申し込める家門の一覧。相手を選ばせるために表示側も引く */
export function romanHouses(): RomanHouse[] {
  return HOUSES;
}

/** 契約時の給金。強力な勢力ほど高い */
export function foederatiDemandFor(strength: number): number {
  return strength * FOEDERATI_DEMAND_PER_STRENGTH;
}

/**
 * 敵対勢力が突きつける要求を更新する。
 *
 * 属州に入り込んだ勢力は、その年に金・土地・称号のいずれかを要求する。
 * 要求は蛮族AIの行動として起こるので、プレイヤーが答えられるのは翌年。
 * 答えずに放置している間、その勢力は戦闘で強くなる（barbarians.ts）
 */
export function updateBarbarianDemands(state: GameState, rng: () => number): GameState {
  const factions = { ...state.factions };
  let changed = false;

  for (const factionId of Object.keys(factions) as BarbarianFactionId[]) {
    const faction = factions[factionId];
    if (faction.stance !== 'hostile' || faction.location === 'exterior') continue;

    // 答えを待っている要求はそのまま残す。代償は戦闘の重さで受ける
    if (faction.demand !== null) continue;

    if (rng() >= DEMAND_PROBABILITY) continue;
    factions[factionId] = { ...faction, demand: demandFor(state, faction.location, faction.strength, rng) };
    changed = true;
  }

  return changed ? { ...state, factions } : state;
}

/**
 * 要求の中身を決める。
 * 支配の緩んだ属州にいるならその土地そのものを、
 * そうでなければ金か称号を求める
 */
function demandFor(
  state: GameState,
  location: ProvinceId,
  strength: number,
  rng: () => number,
): BarbarianDemand {
  if (state.provinces[location].control < DEMAND_LAND_CONTROL_THRESHOLD) {
    return { type: 'land', amount: 0, targetProvince: location };
  }
  if (rng() < DEMAND_TITLE_SHARE) {
    return { type: 'title', amount: 0 };
  }
  return { type: 'gold', amount: strength * DEMAND_GOLD_PER_STRENGTH };
}

/**
 * 突きつけられた要求を飲む。
 *
 * 金は国庫、土地は税基盤、称号は正統性と元老院の支持で払う。
 * どれを差し出すかがこの行動の中身なので、要求の種類ごとに
 * 減る資源を変えている
 */
export function acceptDemand(state: GameState, factionId: BarbarianFactionId): GameState {
  const faction = state.factions[factionId];
  const demand = faction.demand;
  if (demand === null || faction.stance !== 'hostile') return state;

  if (demand.type === 'land') {
    if (demand.targetProvince === undefined) return state;
    return settleFaction(state, factionId, demand.targetProvince);
  }

  if (demand.type === 'title') {
    /*
     * 官位を与えて味方に付ける。金も土地も減らないが、
     * 蛮族を帝国の職に就けたことで元老院と正統性を失い、
     * 以後は給金を払い続ける相手になる。
     * 求められたのは地位なので、給金そのものは雇うより安い
     */
    return {
      ...state,
      senateSupport: clamp(
        state.senateSupport - DEMAND_TITLE_SENATE_LOSS,
        MIN_SENATE_SUPPORT,
        MAX_SENATE_SUPPORT,
      ),
      legitimacy: clamp(
        state.legitimacy - DEMAND_TITLE_LEGITIMACY_LOSS,
        MIN_LEGITIMACY,
        MAX_LEGITIMACY,
      ),
      factions: {
        ...state.factions,
        [factionId]: {
          ...faction,
          stance: 'foederati',
          demand: {
            type: 'gold',
            amount: foederatiDemandFor(faction.strength) * DEMAND_TITLE_WAGE_DISCOUNT,
          },
        },
      },
    };
  }

  /*
   * 金。貢納（その年の侵攻を止めるだけ）と違い、
   * 要求どおりの額を払えば相手は属州から引き揚げる。
   * 額は相手の戦力に比例するので、大勢力ほど高く付く
   */
  if (state.treasury < demand.amount) return state;
  return {
    ...state,
    treasury: state.treasury - demand.amount,
    factions: {
      ...state.factions,
      [factionId]: {
        ...faction,
        location: 'exterior',
        strength: faction.strength * (1 - DEMAND_GOLD_DISPERSAL_RATE),
        demand: null,
      },
    },
  };
}

/** 貢納で和平を買う。その勢力はこのターン攻撃してこない */
export function payTribute(
  state: GameState,
  factionId: BarbarianFactionId,
  amount: number,
): GameState {
  if (state.treasury < amount) return state;
  const faction = state.factions[factionId];
  if (faction.stance === 'settled') return state;
  return {
    ...state,
    treasury: state.treasury - amount,
    foederatiLoyalty:
      faction.stance === 'foederati'
        ? clamp(
            state.foederatiLoyalty + TRIBUTE_LOYALTY_GAIN,
            MIN_FOEDERATI_LOYALTY,
            MAX_FOEDERATI_LOYALTY,
          )
        : state.foederatiLoyalty,
  };
}

/**
 * 土地を与えて定住させる。戦線はただちに消えるが、
 * その属州の税収と帝国全体の税基盤を恒久的に失う
 */
export function settleFaction(
  state: GameState,
  factionId: BarbarianFactionId,
  provinceId: ProvinceId,
): GameState {
  const faction = state.factions[factionId];
  if (faction.stance === 'settled') return state;
  const province = state.provinces[provinceId];
  return {
    ...state,
    provinces: { ...state.provinces, [provinceId]: { ...province, baseTax: 0 } },
    factions: {
      ...state.factions,
      [factionId]: { ...faction, stance: 'settled', location: provinceId, demand: null },
    },
    taxBase: clamp(state.taxBase - SETTLE_TAX_BASE_LOSS, MIN_TAX_BASE, MAX_TAX_BASE),
    legitimacy: clamp(
      state.legitimacy - LEGITIMACY_LOSS_PER_SETTLEMENT,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
  };
}

/**
 * 婚姻同盟。抽象的な効果ではなく、君主と相手家門の人物同士の婚姻として扱う。
 * 成立すると君主に配偶者がつき、以降生まれる子は混血の後継者になる。
 * 即時効果と、子が生まれてから発生する効果を分けている
 */
export function arrangeMarriage(
  state: GameState,
  target: MarriageOrigin,
  rng: () => number,
): GameState {
  if (state.treasury < MARRIAGE_COST) return state;
  // 君主が既婚なら重婚はしない
  if (state.dynasty.ruler.spouse !== null) return state;

  if (target.kind === 'east') {
    return marryEast(state, rng);
  }
  if (target.kind === 'roman') {
    return marryRoman(state, target.houseId, rng);
  }
  return marryBarbarian(state, target.factionId, rng);
}

/** 交渉能力は成功率を補正する */
function negotiationSucceeds(state: GameState, base: number, rng: () => number): boolean {
  return rng() < base * diplomacyModifier(state);
}

function spouseFor(state: GameState, origin: MarriageOrigin, rng: () => number): Spouse {
  return {
    id: `s${state.year}_${Math.floor(rng() * 100000)}`,
    origin,
    marriedYear: state.year,
  };
}

/**
 * 蛮族の族長家との婚姻。
 * 相手の stance と忠誠は改善するが、蛮族を帝室に入れることを
 * 元老院は嫌う
 */
function marryBarbarian(
  state: GameState,
  factionId: BarbarianFactionId,
  rng: () => number,
): GameState {
  const faction = state.factions[factionId];
  if (faction.stance === 'settled') return state;

  const paid = { ...state, treasury: state.treasury - MARRIAGE_COST };
  if (!negotiationSucceeds(paid, MARRIAGE_BARBARIAN_SUCCESS_BASE, rng)) {
    // 不成立でも交渉の費用は戻らない
    return paid;
  }

  const origin: MarriageOrigin = { kind: 'barbarian', factionId };
  return {
    ...paid,
    factions: {
      ...paid.factions,
      [factionId]: {
        ...faction,
        stance: 'foederati',
        demand: { type: 'gold', amount: foederatiDemandFor(faction.strength) },
      },
    },
    foederatiLoyalty: clamp(
      paid.foederatiLoyalty + MARRIAGE_BARBARIAN_LOYALTY_GAIN,
      MIN_FOEDERATI_LOYALTY,
      MAX_FOEDERATI_LOYALTY,
    ),
    senateSupport: clamp(
      paid.senateSupport - MARRIAGE_BARBARIAN_SENATE_LOSS,
      MIN_SENATE_SUPPORT,
      MAX_SENATE_SUPPORT,
    ),
    legitimacy: clamp(
      paid.legitimacy - MARRIAGE_LEGITIMACY_LOSS,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    dynasty: {
      ...paid.dynasty,
      ruler: { ...paid.dynasty.ruler, spouse: spouseFor(paid, origin, rng) },
      pendingMarriages: [
        ...paid.dynasty.pendingMarriages,
        { origin, marriedYear: paid.year },
      ],
    },
  };
}

/**
 * 東ローマ帝室との婚姻。
 * 正統性と関係が上がるが、帝室との縁組なので成立は難しい
 */
function marryEast(state: GameState, rng: () => number): GameState {
  if (state.eastRelations < MARRIAGE_EAST_MIN_RELATIONS) return state;

  const paid = { ...state, treasury: state.treasury - MARRIAGE_COST };
  if (!negotiationSucceeds(paid, MARRIAGE_EAST_SUCCESS_BASE, rng)) {
    return paid;
  }

  const origin: MarriageOrigin = { kind: 'east' };
  return {
    ...paid,
    eastRelations: clamp(
      paid.eastRelations + MARRIAGE_EAST_RELATIONS_GAIN,
      MIN_EAST_RELATIONS,
      MAX_EAST_RELATIONS,
    ),
    legitimacy: clamp(
      paid.legitimacy + MARRIAGE_EAST_LEGITIMACY_GAIN,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    dynasty: {
      ...paid.dynasty,
      ruler: { ...paid.dynasty.ruler, spouse: spouseFor(paid, origin, rng) },
      pendingMarriages: [
        ...paid.dynasty.pendingMarriages,
        { origin, marriedYear: paid.year },
      ],
    },
  };
}

/**
 * ローマの元老院貴族の家門との婚姻。
 *
 * 蛮族との縁組が元老院を怒らせ、東ローマとの縁組が難物であるのに対し、
 * こちらは最も通りやすく、元老院支持への効きも最大になる。
 *
 * **代わりに差し出すのは税基盤。** 大貴族の家に娘を出させるということは、
 * その家が持つ広大な所領の免税特権を追認するということで、
 * 元老院への譲歩と同じものを倍の量だけ恒久的に失う。
 *
 * この縁組だけは**子が混血にならない**。生まれた後継者は純粋なローマ人で、
 * 即位しても MIXED_BLOOD_LEGITIMACY_PENALTY を負わない。
 * 三者の婚姻を「支持・関係・血統」の三択にするのがこの差
 */
function marryRoman(state: GameState, houseId: string, rng: () => number): GameState {
  // 帝室を後ろ盾と見なさなくなった元老院は娘を出さない
  if (state.senateSupport < MARRIAGE_ROMAN_MIN_SENATE_SUPPORT) return state;

  const paid = { ...state, treasury: state.treasury - MARRIAGE_COST };
  if (!negotiationSucceeds(paid, MARRIAGE_ROMAN_SUCCESS_BASE, rng)) {
    return paid;
  }

  const origin: MarriageOrigin = { kind: 'roman', houseId };
  return {
    ...paid,
    senateSupport: clamp(
      paid.senateSupport + MARRIAGE_ROMAN_SENATE_GAIN,
      MIN_SENATE_SUPPORT,
      MAX_SENATE_SUPPORT,
    ),
    legitimacy: clamp(
      paid.legitimacy + MARRIAGE_ROMAN_LEGITIMACY_GAIN,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    // 持参財産に伴う免税特権の追認。恒久的に失われる
    taxBase: clamp(paid.taxBase - MARRIAGE_ROMAN_TAX_BASE_LOSS, MIN_TAX_BASE, MAX_TAX_BASE),
    dynasty: {
      ...paid.dynasty,
      ruler: { ...paid.dynasty.ruler, spouse: spouseFor(paid, origin, rng) },
      pendingMarriages: [
        ...paid.dynasty.pendingMarriages,
        { origin, marriedYear: paid.year },
      ],
    },
  };
}

/**
 * 子が生まれてから発生する婚姻の効果を清算する。
 * 婚姻は結んだ時点では約束にすぎず、血の繋がりができて初めて
 * 相手にとって守る価値のある同盟になる
 */
/**
 * その婚姻の子が生まれたか。
 *
 * 蛮族・東ローマとの縁組は子が混血になるので血統で引ける。
 * ローマ貴族との縁組は子も純粋なローマ人で、婚姻前から居る子と
 * 血統では区別が付かないため、婚姻の年より後に生まれたかで見る
 */
function heirBorn(
  state: GameState,
  pending: PendingMarriage,
  bornOrigins: Set<Lineage>,
): boolean {
  if (pending.origin.kind === 'roman') {
    return state.dynasty.members.some(
      (member) => member.lineage === 'roman' && member.birthYear > pending.marriedYear,
    );
  }
  return bornOrigins.has(
    pending.origin.kind === 'east' ? 'east' : pending.origin.factionId,
  );
}

export function settlePendingMarriages(state: GameState): GameState {
  const { pendingMarriages } = state.dynasty;
  if (pendingMarriages.length === 0) return state;
  // 混血の子が生まれているかを請求権と血統で判定する
  const bornOrigins = new Set(
    state.dynasty.members
      .filter((member) => member.mixedBlood)
      .map((member) => member.lineage),
  );

  const remaining = pendingMarriages.filter((pending) => !heirBorn(state, pending, bornOrigins));
  if (remaining.length === pendingMarriages.length) return state;

  const realised = pendingMarriages.filter((pending) => !remaining.includes(pending));
  let loyaltyGain = 0;
  let eastGain = 0;
  let senateGain = 0;
  for (const pending of realised) {
    if (pending.origin.kind === 'east') eastGain += MARRIAGE_HEIR_BORN_EAST_RELATIONS_GAIN;
    else if (pending.origin.kind === 'roman') senateGain += MARRIAGE_HEIR_BORN_SENATE_GAIN;
    else loyaltyGain += MARRIAGE_HEIR_BORN_LOYALTY_GAIN;
  }

  return {
    ...state,
    foederatiLoyalty: clamp(
      state.foederatiLoyalty + loyaltyGain,
      MIN_FOEDERATI_LOYALTY,
      MAX_FOEDERATI_LOYALTY,
    ),
    eastRelations: clamp(
      state.eastRelations + eastGain,
      MIN_EAST_RELATIONS,
      MAX_EAST_RELATIONS,
    ),
    senateSupport: clamp(
      state.senateSupport + senateGain,
      MIN_SENATE_SUPPORT,
      MAX_SENATE_SUPPORT,
    ),
    dynasty: { ...state.dynasty, pendingMarriages: remaining },
  };
}

/**
 * フォエデラティ契約。目先の戦線を安く埋められるが、
 * 毎ターンの給金が発生し、途切れれば寝返る
 */
export function hireFoederati(state: GameState, factionId: BarbarianFactionId): GameState {
  if (state.treasury < FOEDERATI_HIRE_COST) return state;
  const faction = state.factions[factionId];
  if (faction.stance !== 'hostile') return state;
  return {
    ...state,
    treasury: state.treasury - FOEDERATI_HIRE_COST,
    factions: {
      ...state.factions,
      [factionId]: {
        ...faction,
        stance: 'foederati',
        demand: { type: 'gold', amount: foederatiDemandFor(faction.strength) },
      },
    },
    legitimacy: clamp(
      state.legitimacy - FOEDERATI_HIRE_LEGITIMACY_LOSS,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
  };
}

/** 東帝国への援軍要請。関係を消費して金と兵を得る */
export function requestEastAid(state: GameState): GameState {
  if (state.eastRelations < EAST_AID_MIN_RELATIONS) return state;
  return {
    ...state,
    treasury: state.treasury + EAST_AID_TREASURY_GAIN,
    fieldArmy: state.fieldArmy + EAST_AID_ARMY_GAIN,
    eastRelations: clamp(
      state.eastRelations - EAST_AID_RELATIONS_LOSS,
      MIN_EAST_RELATIONS,
      MAX_EAST_RELATIONS,
    ),
  };
}

/** 東帝国から帝位の承認を取り付ける */
export function confirmTitle(state: GameState): GameState {
  if (state.treasury < EAST_TITLE_COST) return state;
  return {
    ...state,
    treasury: state.treasury - EAST_TITLE_COST,
    legitimacy: clamp(
      state.legitimacy + EAST_TITLE_LEGITIMACY_GAIN,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    eastRelations: clamp(
      state.eastRelations - EAST_TITLE_RELATIONS_LOSS,
      MIN_EAST_RELATIONS,
      MAX_EAST_RELATIONS,
    ),
  };
}

/**
 * 給金の支払い実績に忠誠を連動させる。
 * 支出を賄えなかったターン（国庫が負）は未払いとみなす
 */
export function updateFoederatiLoyalty(state: GameState): GameState {
  const hasFoederati = Object.values(state.factions).some(
    (faction) => faction.stance === 'foederati',
  );
  if (!hasFoederati) return state;

  const delta =
    state.treasury < 0 ? -FOEDERATI_LOYALTY_DECAY_UNPAID : FOEDERATI_LOYALTY_RECOVERY;
  return {
    ...state,
    foederatiLoyalty: clamp(
      state.foederatiLoyalty + delta,
      MIN_FOEDERATI_LOYALTY,
      MAX_FOEDERATI_LOYALTY,
    ),
  };
}

/**
 * フォエデラティに依存し続けることの長期的な代償。
 * 給金の要求は年々膨らみ、駐屯地の税基盤は恒久的に失われていく
 */
export function updateFoederatiObligations(state: GameState): GameState {
  const factionIds = (Object.keys(state.factions) as BarbarianFactionId[]).filter(
    (id) => state.factions[id].stance === 'foederati',
  );
  if (factionIds.length === 0) return state;

  const factions = { ...state.factions };
  for (const id of factionIds) {
    const faction = factions[id];
    if (!faction.demand) continue;
    factions[id] = {
      ...faction,
      demand: {
        ...faction.demand,
        amount:
          faction.demand.amount *
          (1 +
            FOEDERATI_DEMAND_ESCALATION *
              DIFFICULTY_SETTINGS[state.difficulty].foederatiEscalationMultiplier),
      },
    };
  }

  return {
    ...state,
    factions,
    taxBase: clamp(
      state.taxBase - FOEDERATI_TAX_BASE_DRAIN * factionIds.length,
      MIN_TAX_BASE,
      MAX_TAX_BASE,
    ),
  };
}
