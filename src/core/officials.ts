/**
 * 官職 — プラエトリア長官と属州総督、そしてその反乱。
 *
 * どちらも**新しい資源ではない**。君主能力・軍司令官と同じく、
 * 既存の計算式に対する補正としてのみ作用する。
 *
 * 史実の補足として、近衛隊は312年にコンスタンティヌスが解散させており、
 * 395〜476年のプラエトリア長官は軍の指揮官ではない。税務・軍糧・
 * 属州行政を統べる文官の筆頭で、軍を率いるのはマギステル・ミリトゥムの
 * ほうである。役割が重ならないよう、長官は税収と元老院支持にだけ効かせる。
 *
 * 反乱は正統性に関わらず毎年判定する。順調な帝国でも属州は離れうる、
 * という緊張を残すため。正統性の低さは確率を押し上げる要因として効く。
 * 西ローマの崩壊が中央からではなく属州の僭称帝から始まったこと
 * （ガリアのコンスタンティヌス3世、ブリタンニアの相次ぐ僭称）を、
 * 既存の legitimacy を機能させる形で表す。
 */

import officialsData from '../data/officials.json';
import {
  ABILITY_NEUTRAL,
  ADULT_AGE,
  BROTHER_REVOLT_ARMY_LOSS_RATE,
  BROTHER_REVOLT_BASE_PROBABILITY,
  BROTHER_REVOLT_LEGITIMACY_LOSS,
  BROTHER_REVOLT_LEGITIMACY_PRESSURE_FROM,
  BROTHER_REVOLT_LOW_LEGITIMACY_BONUS,
  BROTHER_REVOLT_PER_ADULT,
  BROTHER_REVOLT_PROBABILITY_CAP,
  GOVERNOR_APPOINT_COST,
  GOVERNOR_CONTROL_RECOVERY_PER_POINT,
  GOVERNOR_DEFENSE_PER_POINT,
  GOVERNOR_MAX_TERM,
  GOVERNOR_MIN_TERM,
  GOVERNOR_REVOLT_AMBITION_PER_POINT,
  GOVERNOR_REVOLT_BASE_PROBABILITY,
  GOVERNOR_REVOLT_CONTROL_LOSS,
  GOVERNOR_REVOLT_GARRISON_LOSS_RATE,
  GOVERNOR_REVOLT_LEGITIMACY_LOSS,
  GOVERNOR_REVOLT_LEGITIMACY_PRESSURE_FROM,
  GOVERNOR_REVOLT_LOW_CONTROL_BONUS,
  GOVERNOR_REVOLT_LOW_LEGITIMACY_BONUS,
  GOVERNOR_REVOLT_LOW_CONTROL_THRESHOLD,
  GOVERNOR_REVOLT_PROBABILITY_CAP,
  UPHEAVAL_REVOLT_BONUS,
  GOVERNOR_VACANT_DEFENSE_PENALTY,
  MAX_CONTROL,
  MAX_LEGITIMACY,
  MIN_CONTROL,
  MIN_LEGITIMACY,
  OFFICIAL_ABILITY_ROLL_MAX,
  OFFICIAL_ABILITY_ROLL_MIN,
  OFFICIAL_AMBITION_ROLL_MAX,
  OFFICIAL_AMBITION_ROLL_MIN,
  OFFICIAL_CANDIDATE_COUNT,
  PREFECT_APPOINT_COST,
  PREFECT_DISMISS_LEGITIMACY_GAIN,
  PREFECT_INCOME_PER_POINT,
  PREFECT_MAX_TERM,
  PREFECT_MIN_TERM,
  PREFECT_SENATE_DECAY_PER_POINT,
  PREFECT_VACANT_INCOME_PENALTY,
} from './constants';
import type {
  GameState,
  Governor,
  GovernorSeat,
  Official,
  OfficialEnd,
  PrefectSeat,
  GovernedId,
  ProvinceId,
} from './types';
import { proclaimUsurperEmpire } from './battle';
import regionsData from '../data/regions.json';
import { clamp } from './util';

const REGION_NAMES = (regionsData as { regions: Record<string, string> }).regions;

/** 僭称帝国の名に使う地域名。データから引く。コードに直接書かない */
function regionName(id: ProvinceId): string {
  return REGION_NAMES[id] ?? id;
}

const NAME_POOL: string[] = officialsData.namePool;

function rollInRange(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** 名はデータから引く。コードに直接書かない */
function drawName(rng: () => number): string {
  return NAME_POOL[Math.floor(rng() * NAME_POOL.length)];
}

function rollOfficial(
  year: number,
  rng: () => number,
  minTerm: number,
  maxTerm: number,
  prefix: string,
): Official {
  return {
    id: `${prefix}${year}_${Math.floor(rng() * 1_000_000)}`,
    name: drawName(rng),
    ability: rollInRange(rng, OFFICIAL_ABILITY_ROLL_MIN, OFFICIAL_ABILITY_ROLL_MAX),
    ambition: rollInRange(rng, OFFICIAL_AMBITION_ROLL_MIN, OFFICIAL_AMBITION_ROLL_MAX),
    appointedYear: year,
    retiresYear: year + rollInRange(rng, minTerm, maxTerm),
  };
}

// ── 空位のあいだ並ぶ候補 ──────────────────────────────

/**
 * 候補を作る。空位になった年に一度だけ引く。
 * 毎年引き直すと「良い候補が出るまで待つ」だけの作業になるため
 */
function rollPrefectCandidates(year: number, rng: () => number): Official[] {
  return Array.from({ length: OFFICIAL_CANDIDATE_COUNT }, () =>
    rollOfficial(year, rng, PREFECT_MIN_TERM, PREFECT_MAX_TERM, 'p'),
  );
}

function rollGovernorCandidates(
  provinceId: GovernedId,
  year: number,
  rng: () => number,
): Governor[] {
  return Array.from({ length: OFFICIAL_CANDIDATE_COUNT }, () => ({
    ...rollOfficial(year, rng, GOVERNOR_MIN_TERM, GOVERNOR_MAX_TERM, 'v'),
    provinceId,
  }));
}

// ── 補正（既存の計算式に対してのみ作用する） ──────────

/**
 * 長官が税収にかける補正。
 * 空位なら罰、有能なら上乗せ。軍事には一切効かない
 */
export function prefectIncomeModifier(state: GameState): number {
  const prefect = state.prefect.current;
  if (prefect === null) return 1 - PREFECT_VACANT_INCOME_PENALTY;
  return 1 + (prefect.ability - ABILITY_NEUTRAL) * PREFECT_INCOME_PER_POINT;
}

/** 長官が元老院支持の自然減にかける軽減。空位なら軽減なし */
export function prefectSenateDecayRelief(state: GameState): number {
  const prefect = state.prefect.current;
  if (prefect === null) return 0;
  return Math.max(0, (prefect.ability - ABILITY_NEUTRAL) * PREFECT_SENATE_DECAY_PER_POINT);
}

/** 総督がその属州の守備隊の戦闘力にかける補正 */
export function governorDefenseModifier(state: GameState, provinceId: GovernedId): number {
  const governor = state.governors[provinceId]?.current ?? null;
  if (governor === null) return 1 - GOVERNOR_VACANT_DEFENSE_PENALTY;
  return 1 + (governor.ability - ABILITY_NEUTRAL) * GOVERNOR_DEFENSE_PER_POINT;
}

/** 総督がその属州の支配度の自然回復にかける補正 */
export function governorControlRecoveryModifier(
  state: GameState,
  provinceId: GovernedId,
): number {
  const governor = state.governors[provinceId]?.current ?? null;
  if (governor === null) return 1;
  return Math.max(
    0,
    1 + (governor.ability - ABILITY_NEUTRAL) * GOVERNOR_CONTROL_RECOVERY_PER_POINT,
  );
}

// ── 任命と解任 ────────────────────────────────────────

export function appointPrefect(state: GameState, officialId: string): GameState {
  if (state.prefect.current !== null) return state;
  if (state.treasury < PREFECT_APPOINT_COST) return state;
  const chosen = state.prefect.candidates.find((c) => c.id === officialId);
  if (chosen === undefined) return state;
  return {
    ...state,
    treasury: state.treasury - PREFECT_APPOINT_COST,
    prefect: {
      ...state.prefect,
      current: { ...chosen, appointedYear: state.year },
      candidates: [],
    },
  };
}

/** 長官は軍を持たないので、解任しても兵は離れない */
export function dismissPrefect(state: GameState): GameState {
  const prefect = state.prefect.current;
  if (prefect === null) return state;
  return {
    ...vacatePrefect(state, 'dismissed'),
    legitimacy: clamp(
      state.legitimacy + PREFECT_DISMISS_LEGITIMACY_GAIN,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
  };
}

function vacatePrefect(state: GameState, end: OfficialEnd): GameState {
  const prefect = state.prefect.current;
  if (prefect === null) return state;
  return {
    ...state,
    prefect: {
      current: null,
      candidates: [],
      history: [
        ...state.prefect.history,
        {
          officialId: prefect.id,
          name: prefect.name,
          fromYear: prefect.appointedYear,
          toYear: state.year,
          ability: prefect.ability,
          end,
        },
      ],
    },
  };
}

export function appointGovernor(
  state: GameState,
  provinceId: GovernedId,
  officialId: string,
): GameState {
  const seat = state.governors[provinceId];
  if (seat === undefined || seat.current !== null) return state;
  if (state.treasury < GOVERNOR_APPOINT_COST) return state;
  const chosen = seat.candidates.find((c) => c.id === officialId);
  if (chosen === undefined) return state;
  return {
    ...state,
    treasury: state.treasury - GOVERNOR_APPOINT_COST,
    governors: {
      ...state.governors,
      [provinceId]: { current: { ...chosen, appointedYear: state.year }, candidates: [] },
    },
  };
}

export function dismissGovernor(state: GameState, provinceId: GovernedId): GameState {
  const seat = state.governors[provinceId];
  if (seat === undefined || seat.current === null) return state;
  return {
    ...state,
    governors: { ...state.governors, [provinceId]: { current: null, candidates: [] } },
  };
}

// ── 毎年の更新 ────────────────────────────────────────

/**
 * 任期の満了と候補の補充。
 * 退任しても後任は自動では決まらない。空位を埋めるかがプレイヤーの判断になる
 */
export function updateOfficials(state: GameState, rng: () => number): GameState {
  let next = state;

  // 長官
  const prefect = next.prefect.current;
  if (prefect !== null && next.year >= prefect.retiresYear) {
    next = vacatePrefect(next, 'retired');
    next = { ...next, turnEvents: [...next.turnEvents, 'prefect_retired'] };
  }
  if (next.prefect.current === null && next.prefect.candidates.length === 0) {
    next = {
      ...next,
      prefect: { ...next.prefect, candidates: rollPrefectCandidates(next.year, rng) },
    };
  }

  // 総督
  const governors = { ...next.governors };
  let retired = false;
  for (const id of Object.keys(governors) as GovernedId[]) {
    const governor = governors[id]?.current ?? null;
    if (governor !== null && next.year >= governor.retiresYear) {
      governors[id] = { current: null, candidates: [] };
      retired = true;
    }
  }
  for (const id of Object.keys(governors) as GovernedId[]) {
    const seat = governors[id];
    if (seat !== undefined && seat.current === null && seat.candidates.length === 0) {
      governors[id] = { current: null, candidates: rollGovernorCandidates(id, next.year, rng) };
    }
  }
  next = { ...next, governors };
  if (retired) next = { ...next, turnEvents: [...next.turnEvents, 'governor_retired'] };

  return next;
}

// ── 反乱 ──────────────────────────────────────────────

/**
 * 属州総督の反乱と、皇帝の兄弟（傍系の一族）の挙兵。
 *
 * どちらも毎年判定する。基礎確率は低く抑えたうえで、
 * 野心・属州の荒れ具合・正統性の低さが確率を押し上げる
 */
export function checkRevolts(state: GameState, rng: () => number): GameState {
  let next = checkGovernorRevolt(state, rng);
  next = checkBrotherRevolt(next, rng);
  return next;
}

/**
 * 正統性の低さによる押し上げ係数。
 * `from` を上回っていれば 0、0まで落ちれば 1 になる
 */
function legitimacyPressure(legitimacy: number, from: number): number {
  return clamp((from - legitimacy) / from, 0, 1);
}

/**
 * 属州の動揺による押し上げ。
 * 会戦の大敗や君主の捕縛の直後だけ立ち、桁違いに大きい
 */
function upheavalBonus(state: GameState): number {
  return state.upheavalYearsRemaining > 0 ? UPHEAVAL_REVOLT_BONUS : 0;
}

/**
 * 僭称帝を名乗る野心の下限。
 * 動揺していても、野心の薄い総督は独立まではしない
 */
const USURPER_MIN_AMBITION = 7;

function checkGovernorRevolt(state: GameState, rng: () => number): GameState {
  /*
   * 正統性に関わらず毎年判定する。順調な帝国でも属州は離れうる、
   * という緊張を残すため。正統性は確率を押し上げる要因として効く
   */
  const pressure = legitimacyPressure(
    state.legitimacy,
    GOVERNOR_REVOLT_LEGITIMACY_PRESSURE_FROM,
  );

  /*
   * 反乱の判定は**属州だけ**を見る。郷里にも総督は置けるが、
   * 境外の辺境の司令が属州ごと帝国から抜けて帝位を僭称する形は
   * 史実にも合わないので、そこは判定に入れない
   */
  for (const id of Object.keys(state.provinces) as ProvinceId[]) {
    const governor = state.governors[id]?.current ?? null;
    if (governor === null) continue;
    const province = state.provinces[id];
    if (province.control <= MIN_CONTROL) continue;

    const probability = Math.min(
      GOVERNOR_REVOLT_BASE_PROBABILITY +
        Math.max(0, governor.ambition - ABILITY_NEUTRAL) * GOVERNOR_REVOLT_AMBITION_PER_POINT +
        pressure * GOVERNOR_REVOLT_LOW_LEGITIMACY_BONUS +
        (province.control < GOVERNOR_REVOLT_LOW_CONTROL_THRESHOLD
          ? GOVERNOR_REVOLT_LOW_CONTROL_BONUS
          : 0) +
        upheavalBonus(state),
      GOVERNOR_REVOLT_PROBABILITY_CAP,
  UPHEAVAL_REVOLT_BONUS,
    );
    if (rng() >= probability) continue;

    /*
     * 敗報で属州が動揺しているあいだ、野心の高い総督は
     * 単に離反するのではなくローマ皇帝を僭称して属州ごと帝国から抜ける。
     * 史実のエデッサの戦いのあとのガリア帝国と同じ形
     */
    if (state.upheavalYearsRemaining > 0 && governor.ambition >= USURPER_MIN_AMBITION) {
      return proclaimUsurperEmpire(state, id, regionName(id), governor.name);
    }

    /*
     * 反乱した総督はその属州の守備隊を連れて独立する。
     * 属州そのものは残るが支配度が大きく削られ、守りが薄くなる。
     * 蛮族に狙われている属州で起きると、そのまま失陥につながる
     */
    return {
      ...state,
      provinces: {
        ...state.provinces,
        [id]: {
          ...province,
          control: clamp(
            province.control - GOVERNOR_REVOLT_CONTROL_LOSS,
            MIN_CONTROL,
            MAX_CONTROL,
          ),
          garrison: province.garrison * (1 - GOVERNOR_REVOLT_GARRISON_LOSS_RATE),
        },
      },
      governors: {
        ...state.governors,
        [id]: { current: null, candidates: [] },
      },
      legitimacy: clamp(
        state.legitimacy - GOVERNOR_REVOLT_LEGITIMACY_LOSS,
        MIN_LEGITIMACY,
        MAX_LEGITIMACY,
      ),
      turnEvents: [...state.turnEvents, 'governor_revolt'],
    };
  }

  return state;
}

function checkBrotherRevolt(state: GameState, rng: () => number): GameState {
  const adults = state.dynasty.members.filter(
    (member) => state.year - member.birthYear >= ADULT_AGE,
  );
  if (adults.length === 0) return state;

  // 総督と同じく毎年判定し、正統性の低さは確率を押し上げるだけにする
  const pressure = legitimacyPressure(
    state.legitimacy,
    BROTHER_REVOLT_LEGITIMACY_PRESSURE_FROM,
  );
  const probability = Math.min(
    BROTHER_REVOLT_BASE_PROBABILITY +
      adults.length * BROTHER_REVOLT_PER_ADULT +
      pressure * BROTHER_REVOLT_LOW_LEGITIMACY_BONUS,
    BROTHER_REVOLT_PROBABILITY_CAP,
  );
  if (rng() >= probability) return state;

  /*
   * 挙兵した一族は軍の一部を連れて出る。
   * 後継者がいることは継承危機を防ぐ利点だが、同時に帝位を狙う者を
   * 抱えることでもある、という取引をここで成立させる。
   * 挙兵した本人は継承候補から外れる
   */
  const rebel = adults[Math.floor(rng() * adults.length)];
  return {
    ...state,
    fieldArmy: state.fieldArmy * (1 - BROTHER_REVOLT_ARMY_LOSS_RATE),
    legitimacy: clamp(
      state.legitimacy - BROTHER_REVOLT_LEGITIMACY_LOSS,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    dynasty: {
      ...state.dynasty,
      members: state.dynasty.members.filter((member) => member.id !== rebel.id),
    },
    turnEvents: [...state.turnEvents, 'brother_revolt'],
  };
}

/**
 * 開始時の官職。
 *
 * 空位から始めない。この時代の帝国に長官も総督もいなかったことは
 * ないので、空位は退任や反乱の**結果**として起きるものとして扱う。
 * 空位を既定にすると、既存の調整済みバランスに恒久的な減収と
 * 守備の罰が掛かりっぱなしになる（計測では生存率が
 * 中級47%→28%まで落ちた）。
 *
 * 顔ぶれは data/officials.json から読む。コードに直接書かない
 */
export function createInitialPrefect(): PrefectSeat {
  return { current: { ...(officialsData.prefect as Official) }, candidates: [], history: [] };
}

export function createInitialGovernors(
  provinceIds: ProvinceId[],
): Partial<Record<GovernedId, GovernorSeat>> {
  const initial = officialsData.governors as Governor[];
  return Object.fromEntries(
    provinceIds.map((id) => {
      const found = initial.find((g) => g.provinceId === id);
      return [id, { current: found ? { ...found } : null, candidates: [] } as GovernorSeat];
    }),
  ) as Partial<Record<GovernedId, GovernorSeat>>;
}
