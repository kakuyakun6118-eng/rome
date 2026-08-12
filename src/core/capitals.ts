/**
 * 首都と主要属州の占領。
 *
 * 都市（data/cities.json）は状態を持たない静的なデータだが、
 * 「どの属州に都があるか」だけはこの系統が使う。
 * ローマ＝イタリア、コンスタンティノポリス＝トラキアというように、
 * 都を含む属州を **首都属州**、それに次ぐ大都市を含む属州を
 * **主要属州** として引く。
 *
 * 新しい資源は増やさない。作用先は既存の3つに限る。
 *
 * | 起きたこと | 作用する既存の仕組み |
 * |---|---|
 * | 自国の首都属州が敵手に落ちる | 属州の動揺（総督の皇帝僭称の確率） |
 * | 自国の主要属州を失う | 正統性と元老院支持 |
 * | 東ローマの首都属州を奪う | 東の野戦軍と残る属州の支配度 |
 * | ペルシアから主要属州を取り返す | ペルシアの戦力 |
 */

import citiesData from '../data/cities.json';
import {
  CAPITAL_FALLEN_CONTROL_THRESHOLD,
  CAPITAL_FALLEN_UPHEAVAL_YEARS,
  EAST_CAPITAL_LOST_ARMY_LOSS,
  EAST_CAPITAL_LOST_CONTROL_LOSS,
  MAJOR_PROVINCE_LOST_LEGITIMACY,
  MAJOR_PROVINCE_LOST_SENATE,
  MAX_CONTROL,
  MAX_LEGITIMACY,
  MAX_SENATE_SUPPORT,
  MIN_CONTROL,
  MIN_LEGITIMACY,
  MIN_SENATE_SUPPORT,
  PERSIA_MAJOR_PROVINCE_LOST_STRENGTH,
} from './constants';
import type { EastProvinceId, GameState, ProvinceId } from './types';
import { clamp } from './util';
import { isUsurperHeld } from './battle';

interface CityRow {
  owner: 'west' | 'east' | 'persia';
  province: string | null;
  rank: number;
}

const CITIES = (citiesData as { cities: CityRow[] }).cities;

/** 都（rank 10）を含む属州。西はイタリア、東はトラキア */
function capitalProvinceFor(owner: 'west' | 'east'): string | null {
  return CITIES.find((c) => c.owner === owner && c.rank >= 10)?.province ?? null;
}

/** 大都市（rank 9 以上）を含む属州。都もここに含まれる */
function majorProvincesFor(owner: 'west' | 'east'): string[] {
  return CITIES.filter((c) => c.owner === owner && c.rank >= 9 && c.province !== null).map(
    (c) => c.province as string,
  );
}

export const WEST_CAPITAL_PROVINCE = capitalProvinceFor('west') as ProvinceId | null;
export const EAST_CAPITAL_PROVINCE = capitalProvinceFor('east') as EastProvinceId | null;
export const WEST_MAJOR_PROVINCES = majorProvincesFor('west') as ProvinceId[];
export const EAST_MAJOR_PROVINCES = majorProvincesFor('east') as EastProvinceId[];

/**
 * 自国の都が敵手にあるか。
 *
 * 僭称帝国に握られているか、支配度が閾値を下回っている状態を
 * 「都を押さえられている」とみなす。イタリアの支配度が 0 になると
 * その時点で崩壊なので、0 になる前の段階を拾う必要がある
 */
export function isCapitalUnderEnemyControl(state: GameState): boolean {
  if (WEST_CAPITAL_PROVINCE === null) return false;
  if (isUsurperHeld(state, WEST_CAPITAL_PROVINCE)) return true;
  return state.provinces[WEST_CAPITAL_PROVINCE].control < CAPITAL_FALLEN_CONTROL_THRESHOLD;
}

/**
 * 都を押さえられているあいだ、属州は動揺し続ける。
 *
 * 会戦の大敗と同じ `upheavalYearsRemaining` に載せるので、
 * 総督の皇帝僭称の確率がそのまま跳ね上がる。
 * 「都が敵の手にある皇帝に、属州が従う理由はない」という形
 */
export function applyCapitalPressure(state: GameState): GameState {
  if (!isCapitalUnderEnemyControl(state)) return state;
  return {
    ...state,
    upheavalYearsRemaining: Math.max(
      state.upheavalYearsRemaining,
      CAPITAL_FALLEN_UPHEAVAL_YEARS,
    ),
  };
}

/**
 * 主要属州を失ったときの追加の代償。
 *
 * 属州の喪失そのものは `LEGITIMACY_LOSS_PER_PROVINCE_LOST` で
 * 一律に効いているが、カルタゴやローマを抱える属州はそれだけでは足りない。
 * 大都市を含む属州の喪失にだけ、正統性と元老院支持の上乗せを掛ける
 */
export function applyMajorProvinceLoss(before: GameState, after: GameState): GameState {
  let lost = 0;
  for (const id of WEST_MAJOR_PROVINCES) {
    const was = before.provinces[id];
    const now = after.provinces[id];
    if (was === undefined || now === undefined) continue;
    if (was.control > MIN_CONTROL && now.control <= MIN_CONTROL) lost++;
  }
  if (lost === 0) return after;

  return {
    ...after,
    legitimacy: clamp(
      after.legitimacy - MAJOR_PROVINCE_LOST_LEGITIMACY * lost,
      MIN_LEGITIMACY,
      MAX_LEGITIMACY,
    ),
    senateSupport: clamp(
      after.senateSupport - MAJOR_PROVINCE_LOST_SENATE * lost,
      MIN_SENATE_SUPPORT,
      MAX_SENATE_SUPPORT,
    ),
  };
}

/**
 * 東ローマの都を奪ったときの効き。
 *
 * コンスタンティノポリスを失った東は指揮系統ごと折れる。
 * 野戦軍が大きく減り、残る属州の支配度も落ちるので、
 * そこから先の征服がはっきり楽になる。
 * 「首都を落とせば戦争は決まる」という形を数値にしたもの
 */
export function applyEastCapitalFall(before: GameState, after: GameState): GameState {
  if (EAST_CAPITAL_PROVINCE === null) return after;
  const was = before.east.provinces.find((p) => p.id === EAST_CAPITAL_PROVINCE);
  const now = after.east.provinces.find((p) => p.id === EAST_CAPITAL_PROVINCE);
  if (was === undefined || now === undefined) return after;
  // 東が持っていた都を西が奪った年だけ効く
  if (was.owner !== 'east' || now.owner !== 'west') return after;

  return {
    ...after,
    east: {
      ...after.east,
      army: after.east.army * (1 - EAST_CAPITAL_LOST_ARMY_LOSS),
      provinces: after.east.provinces.map((p) =>
        p.owner === 'east'
          ? {
              ...p,
              control: clamp(
                p.control - EAST_CAPITAL_LOST_CONTROL_LOSS,
                MIN_CONTROL,
                MAX_CONTROL,
              ),
            }
          : p,
      ),
    },
  };
}

/**
 * ペルシアから主要属州を取り返したときの効き。
 *
 * サーサーン朝の都（クテシフォン）はこの地図では属州ではないので
 * 落とせない。代わりに、ペルシアが押さえた大都市を取り返すと
 * その戦力を削る形にする。アンティオキアやアレクサンドリアは
 * 東方戦線を支える拠点なので、失えば軍を養えなくなる
 */
export function applyPersiaMajorLoss(before: GameState, after: GameState): GameState {
  let retaken = 0;
  for (const id of EAST_MAJOR_PROVINCES) {
    const was = before.east.provinces.find((p) => p.id === id);
    const now = after.east.provinces.find((p) => p.id === id);
    if (was === undefined || now === undefined) continue;
    if (was.owner === 'persia' && now.owner !== 'persia') retaken++;
  }
  if (retaken === 0) return after;

  return {
    ...after,
    persia: {
      ...after.persia,
      strength:
        after.persia.strength * (1 - PERSIA_MAJOR_PROVINCE_LOST_STRENGTH) ** retaken,
    },
  };
}
