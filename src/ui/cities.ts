import citiesData from '../data/cities.json';
import type { EastProvinceId, ProvinceId } from '../core/types';
import { projectLonLat } from './mapPaths';
import type { Point } from './movements';

/**
 * 首都と主要都市。
 *
 * **表示のためだけの情報で、どの計算式にも影響しない。**
 * 都市そのものを状態に持たせると `GameState` に新しい資源が増えるので、
 * 人物名（leaders.json）と同じく静的なデータとして持ち、
 * 触れたときにその土地の今の状態（属州の支配度と守備隊、
 * ペルシアなら戦力）を添えて出す。
 *
 * 位置は経緯度で持ち、地図と同じ投影を通す。座標を直に書くと
 * 表示範囲を変えたときにすべてずれる
 */
export interface City {
  id: string;
  name: string;
  lon: number;
  lat: number;
  owner: 'west' | 'east' | 'persia';
  /** 属する属州。ペルシアの都市は属州を持たないので null */
  province: ProvinceId | EastProvinceId | null;
  role: string;
  /** 都市の規模と重み（1〜10）。この値以上なら地図に名前を出す */
  rank: number;
  /** 札の逃がし先。属州名や隣の都市とぶつかる都市だけ持つ */
  labelDx?: number;
  labelDy?: number;
}

/** 地図に名前まで出す規模。これ未満は点だけ描き、触れたときに名を出す */
export const CITY_LABEL_MIN_RANK = 9;

export const CITIES: City[] = (citiesData.cities as City[]).map((city) => ({ ...city }));

const BY_ID = new Map(CITIES.map((city) => [city.id, city]));

export function cityById(id: string): City | undefined {
  return BY_ID.get(id);
}

export function cityPoint(city: City): Point {
  return projectLonLat(city.lon, city.lat);
}

/** 都市の格。rank をそのまま出しても意味が伝わらないので言葉にする */
export function cityRankLabel(rank: number): string {
  if (rank >= 10) return '都（首都）';
  if (rank >= 8) return '大都市';
  if (rank >= 6) return '主要都市';
  return '地方の府';
}
