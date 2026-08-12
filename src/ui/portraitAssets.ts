import type { DynastyMember, Spouse } from '../core/types';
import manifest from './portraits.json';

/**
 * 事前生成した肖像画像の割り当て。
 *
 * 君主は毎回ランダムに生まれるので「1人1枚」は用意できない。
 * 代わりに属性（役割・出自・年代）で分類した有限枚数を持ち、
 * 人物の id から決定的に1枚を選ぶ。
 * こうすると同じ皇帝は常に同じ肖像になり、セーブして読み直しても変わらない。
 *
 * 画像が1枚も無い場合や読み込みに失敗した場合は
 * components/Portrait.tsx の SVG 肖像にそのまま落ちる
 */

export type PortraitRole =
  | 'emperor'
  | 'consort'
  /** 軍司令官（マギステル・ミリトゥム） */
  | 'general'
  /** 蛮族の族長 */
  | 'chief'
  /** 東ローマ皇帝 */
  | 'eastemperor'
  /** サーサーン朝の王 */
  | 'shah';
export type PortraitOrigin =
  | 'roman'
  | 'east'
  | 'barbarian'
  | 'persia'
  /**
   * フン族。中央アジアの遊牧民で、ゲルマン諸族とは風貌が異なるため
   * 蛮族一般とは別の出自として持つ
   */
  | 'hun'
  /**
   * マウリ（ムーア人）。北アフリカのベルベル系で、
   * こちらもゲルマン諸族とは風貌が異なるため別の出自として持つ
   */
  | 'mauri';
/**
 * 年代。幼年（child）はこの時代の帝室に実際に多い。
 * ホノリウスは395年に11歳、テオドシウス2世は408年に7歳で即位している
 */
export type PortraitAge = 'child' | 'youth' | 'adult' | 'elder';

export interface PortraitEntry {
  /** basePath からの相対ファイル名 */
  file: string;
  role: PortraitRole;
  origin: PortraitOrigin;
  age: PortraitAge;
}

export interface PortraitManifest {
  version: number;
  /** 画像を配信する基点。public/ 以下を指す */
  basePath: string;
  entries: PortraitEntry[];
}

const MANIFEST = manifest as PortraitManifest;

/** 髭が生え、老いと見なす年齢の境目。SVG 肖像と揃えている */
const CHILD_MAX_AGE = 13;
const YOUTH_MAX_AGE = 19;
const ELDER_MIN_AGE = 50;

export function ageBandOf(age: number): PortraitAge {
  if (age <= CHILD_MAX_AGE) return 'child';
  if (age <= YOUTH_MAX_AGE) return 'youth';
  if (age < ELDER_MIN_AGE) return 'adult';
  return 'elder';
}

/** 君主の出自。混血や簒奪者も血統から判定する */
export function emperorOriginOf(ruler: DynastyMember): PortraitOrigin {
  if (ruler.lineage === 'roman') return 'roman';
  if (ruler.lineage === 'east') return 'east';
  return 'barbarian';
}

export function consortOriginOf(spouse: Spouse): PortraitOrigin {
  if (spouse.origin.kind === 'barbarian') return 'barbarian';
  /*
   * ローマ貴族の娘は 'roman' の絵を引くが、consort/roman を1枚も
   * 登録していないときは東ローマ帝室の絵に落とす。selectPortrait の
   * 既定の緩和は出自を捨てて年代で拾うので、放っておくと蛮族の族長家の
   * 絵が出る。同じローマ世界の貴婦人である東方の絵のほうが近い
   */
  if (spouse.origin.kind === 'roman') {
    return MANIFEST.entries.some((e) => e.role === 'consort' && e.origin === 'roman')
      ? 'roman'
      : 'east';
  }
  return 'east';
}

/**
 * 皇后の年齢は state に持っていないので、婚姻時にこの年齢だったとみなして
 * 婚姻からの経過年数で老いていく。治世が長引けば皇后も年を取る
 */
const CONSORT_AGE_AT_MARRIAGE = 20;

export function consortAgeBandOf(spouse: Spouse, year: number): PortraitAge {
  return ageBandOf(CONSORT_AGE_AT_MARRIAGE + (year - spouse.marriedYear));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  /*
   * 撹拌して下位ビットを散らす。FNV だけだと似た文字列の hash が
   * 近い値になり、候補数で割った余りが偏る。実際、勢力 id と族長名から
   * 引いた8勢力の族長が5種類の絵に固まっていた
   */
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  return hash >>> 0;
}

/**
 * manifest の basePath は先頭が "/" の絶対パス。
 * そのまま使うとサブパスで公開したときに配信元の根を指して 404 になるので、
 * Vite の BASE_URL を前に付けて公開先に追随させる
 */
export function portraitUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${MANIFEST.basePath.replace(/^\//, '')}${file}`;
}

/**
 * 属性に合う肖像を1枚選ぶ。
 * 完全一致が無ければ年代を、それも無ければ出自を順に緩める。
 * 少数の画像から始めて後から足していけるようにするため
 */
export function selectPortrait(
  role: PortraitRole,
  origin: PortraitOrigin,
  age: PortraitAge,
  seedId: string,
): string | null {
  const byRole = MANIFEST.entries.filter((entry) => entry.role === role);
  if (byRole.length === 0) return null;

  const candidates =
    byRole.filter((e) => e.origin === origin && e.age === age).length > 0
      ? byRole.filter((e) => e.origin === origin && e.age === age)
      : byRole.filter((e) => e.origin === origin).length > 0
        ? byRole.filter((e) => e.origin === origin)
        : byRole.filter((e) => e.age === age).length > 0
          ? byRole.filter((e) => e.age === age)
          : byRole;

  return portraitUrl(candidates[hashString(seedId) % candidates.length].file);
}
