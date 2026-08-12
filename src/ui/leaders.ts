import leadersData from '../data/leaders.json';
import type { BarbarianFactionId } from '../core/types';

/**
 * 人物名の割り当て。**表示のためだけの情報で、どの計算式にも影響しない。**
 *
 * 東ローマ皇帝とサーサーン朝の王は実在の人物を実際の在位年で引く。
 * 蛮族の族長も史料に残る名を年代順に並べてある。
 * 年から引くだけなので `GameState` に持たせる必要がなく、
 * セーブ形式も変わらない。
 *
 * 軍司令官だけは乱数で生まれるので年では引けない。
 * `id` から決定的に名簿を引き、同じ将軍が常に同じ名になるようにする
 * （肖像画の割り当てと同じ考え方）
 */

interface Reign {
  from: number;
  /** この年の**手前**まで。次代の from と重ねて書く */
  to: number;
  name: string;
  /**
   * その時期の見た目。実際の即位年齢と在位の長さに合わせる。
   * 在位が長く見た目が変わる者は、同じ名前のまま区間を分けてある
   * （テオドシウス2世は7歳で即位し49歳で没するので若年→壮年）
   */
  age?: 'child' | 'youth' | 'adult' | 'elder';
}

const DATA = leadersData as {
  east: Reign[];
  persia: Reign[];
  factions: Record<BarbarianFactionId, Reign[]>;
  generalNames: string[];
  /** データで名が決まっている将軍。開始時のスティリコなど */
  knownGenerals: Record<string, string>;
  /**
   * 勢力ごとに固定する族長の顔。年代の帯ごとに1枚。
   * フン族とマウリは専用の出自（origin: 'hun' / 'mauri'）から引くのでここには入れない。
   * 幼年（child）は持たない。族長が幼年になることは無いため
   */
  factionPortraits: Partial<
    Record<BarbarianFactionId, Partial<Record<'child' | 'youth' | 'adult' | 'elder', string>>>
  >;
};

function reignAt(reigns: Reign[], year: number): Reign | undefined {
  // 後ろから探す。区間が重なっていても最後に始まった者が現職になる
  for (let i = reigns.length - 1; i >= 0; i--) {
    if (year >= reigns[i].from) return reigns[i];
  }
  return reigns[0];
}

function nameAt(reigns: Reign[], year: number): string {
  return reignAt(reigns, year)?.name ?? '';
}

function ageAt(reigns: Reign[], year: number): 'child' | 'youth' | 'adult' | 'elder' {
  return reignAt(reigns, year)?.age ?? 'adult';
}

/** 東ローマ皇帝。395年アルカディウスから476年ゼノンまで */
export function eastEmperorName(year: number): string {
  return nameAt(DATA.east, year);
}

/** サーサーン朝の王 */
export function persianKingName(year: number): string {
  return nameAt(DATA.persia, year);
}

/** 肖像に使う年代。即位年齢と在位の長さから決めてある */
export function eastEmperorAge(year: number): 'child' | 'youth' | 'adult' | 'elder' {
  return ageAt(DATA.east, year);
}

export function persianKingAge(year: number): 'child' | 'youth' | 'adult' | 'elder' {
  return ageAt(DATA.persia, year);
}

/** 蛮族の族長 */
export function factionLeaderName(id: BarbarianFactionId, year: number): string {
  const reigns = DATA.factions[id];
  return reigns ? nameAt(reigns, year) : '';
}

/**
 * ゲルマン諸族とは風貌が異なる勢力の出自。
 * これらは勢力ごとに顔を固定せず、専用の絵柄から族長名の hash で引く
 */
const DISTINCT_ORIGINS: Partial<Record<BarbarianFactionId, 'hun' | 'mauri'>> = {
  Huns: 'hun',
  Mauri: 'mauri',
};

/** 族長の肖像に使う出自。フンとマウリだけは蛮族一般と分ける */
export function factionPortraitOrigin(id: BarbarianFactionId): 'barbarian' | 'hun' | 'mauri' {
  return DISTINCT_ORIGINS[id] ?? 'barbarian';
}

/** 専用の絵柄を持つ勢力は hash で引くので、固定の顔は使わない */
export function hasDistinctPortraits(id: BarbarianFactionId): boolean {
  return DISTINCT_ORIGINS[id] !== undefined;
}

/**
 * 強大な勢力ほど老練な族長に見せる。族長は年齢を持たないので戦力で代える。
 *
 * 帯の境目は勢力の戦力の分布に合わせる。14勢力に割り直したとき
 * 30/60 のままでは9勢力が若年の帯に落ち、若年の絵が2枚しかないため
 * 同じ顔ばかりが並んだ
 */
export function chiefAgeBand(strength: number): 'youth' | 'adult' | 'elder' {
  if (strength < 14) return 'youth';
  return strength >= 45 ? 'elder' : 'adult';
}

/**
 * 将軍の肖像に使う年代。将軍は年齢を持たないので、在職年数と軍事能力で代える。
 *
 * 長く在職した将軍は老将になる。それ以外は能力で分け、
 * 練達しているほど老いた顔にする。3つの帯すべてを使うための割り当てで、
 * 在職年数だけで決めていたときは若年の絵が一度も出なかった
 */
export function generalAgeBand(years: number, military: number): 'youth' | 'adult' | 'elder' {
  if (years >= 16) return 'elder';
  if (military <= 5) return 'youth';
  return military <= 7 ? 'adult' : 'elder';
}

/**
 * 勢力ごとに固定した族長の顔。
 *
 * hash 任せにすると、同じ年代の帯に入った勢力どうしで顔が重なるうえ、
 * 族長が代替わりするたびに顔が入れ替わって勢力の見分けが付かなくなる。
 * データで固定して「西ゴートといえばこの顔」を保つ
 */
export function factionPortraitFile(
  id: BarbarianFactionId,
  age: 'child' | 'youth' | 'adult' | 'elder',
): string | null {
  return DATA.factionPortraits[id]?.[age] ?? null;
}

/** 文字列から決定的に整数を作る。肖像画の割り当てと同じ手 */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 軍司令官の名。id から引くので同じ将軍は常に同じ名になる。
 * 開始時の将軍のようにデータで名が決まっているものはそれを優先する
 */
export function generalName(generalId: string): string {
  const known = DATA.knownGenerals[generalId];
  if (known !== undefined) return known;
  const pool = DATA.generalNames;
  return pool[hashString(generalId) % pool.length];
}
