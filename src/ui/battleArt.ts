import manifest from './battleArt.json';
import { WEST_CAPITAL_PROVINCE, EAST_CAPITAL_PROVINCE } from '../core/capitals';
import type { Battlefield, Terrain } from '../core/types';

/**
 * 会戦のイメージ画。
 *
 * 肖像（portraitAssets.ts）と同じ考え方で、戦場の属性（地形・相手・
 * 都かどうか）で分類した有限枚数を持ち、**その会戦から決定的に1枚を選ぶ。**
 * 同じ戦場なら激突を重ねても絵は変わらず、セーブして読み直しても変わらない。
 *
 * 画像が1枚も無い場合や読み込みに失敗した場合は、
 * 帯そのものを出さずに戦場の地図だけを見せる
 */

interface BattleArtEntry {
  file: string;
  title: string;
  terrain: string[];
  foe: string[];
  /** 都での戦い。地形より優先して選ばれる */
  capital?: boolean;
}

const MANIFEST = manifest as {
  version: number;
  basePath: string;
  entries: BattleArtEntry[];
};

/** 肖像と同じ FNV-1a + 撹拌。似た文字列で選択が偏らないようにする */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  return hash >>> 0;
}

/**
 * manifest の basePath は先頭が "/" の絶対パス。
 * サブパスで公開したときに 404 にならないよう BASE_URL を前に付ける
 */
function artUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${MANIFEST.basePath.replace(/^\//, '')}${file}`;
}

/** その戦場が都で行われているか。都なら攻城戦の絵になる */
function isCapitalBattle(placeId: string): boolean {
  return placeId === WEST_CAPITAL_PROVINCE || placeId === EAST_CAPITAL_PROVINCE;
}

export interface BattleArt {
  url: string;
  title: string;
}

/**
 * その会戦に添える絵を1枚選ぶ。
 *
 * 都での戦いは攻城戦の絵、それ以外は「相手 かつ 地形」で選ぶ。
 * 一致するものが無ければ相手だけ、それも無ければ地形だけ、と条件を緩める
 */
export function battleArtFor(field: Battlefield): BattleArt | null {
  const { entries } = MANIFEST;
  if (entries.length === 0) return null;

  const terrain: Terrain = field.terrain;
  const foe = field.foe.kind;

  const open = entries.filter((e) => e.capital !== true);

  /*
   * 条件を緩める順は「相手と地形」→「地形」→「相手」。
   * 地形を相手より先に残すのは、この大きさの帯では**画の見た目を
   * 決めるのが地形のほう**だからで、砂漠の会戦にガリアの平原の画が
   * 出るほうが、そこに写る兵の民が違うことより目につく
   */
  const narrowed = [
    open.filter((e) => e.foe.includes(foe) && e.terrain.includes(terrain)),
    open.filter((e) => e.terrain.includes(terrain)),
    open.filter((e) => e.foe.includes(foe)),
  ].find((list) => list.length > 0);

  const candidates = isCapitalBattle(field.placeId)
    ? entries.filter((e) => e.capital === true)
    : (narrowed ?? []);

  const pool = candidates.length > 0 ? candidates : entries;
  // 同じ戦場なら激突を重ねても同じ絵になるよう、変わらない値だけを種にする
  const picked = pool[hashString(`${field.placeId}:${foe}:${terrain}`) % pool.length];
  return { url: artUrl(picked.file), title: picked.title };
}
