/*
 * Natural Earth (world-atlas) の国境データから、属州ごとの SVG パスを
 * 生成して src/ui/mapPaths.ts に書き出す。
 *
 * 実行時には地図ライブラリを一切使わない。ここで静的な path 文字列に
 * 変換してしまい、UI はそれを <path d=...> に流し込むだけにする。
 *   npx tsx scripts/generate-map.ts
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
// 属州は輪郭がそのまま見えるので 50m、帝国外の背景陸地は 110m で足りる
const topo = require('world-atlas/countries-50m.json');
const topoCoarse = require('world-atlas/countries-110m.json');

/**
 * 地形（山脈・砂漠・河川）は Natural Earth の公開データから取る。
 * 手描きの近似ではなく実地形なので、アルプスやピレネーが実際の位置に出る。
 * 再生成にはネットワークが要る（生成物は mapPaths.ts に固定される）
 */
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
async function fetchGeo(name: string): Promise<any> {
  const res = await fetch(`${NE}/${name}.geojson`);
  if (!res.ok) throw new Error(`${name} の取得に失敗: ${res.status}`);
  return res.json();
}

/**
 * 表示範囲（経度・緯度）。
 *
 * 東は 58°E まで取る。52°E で切っていたときはサーサーン朝が
 * メソポタミアの帯としてしか映らず、ラスボスに見えなかった。
 * イラン高原とイスタフル（ペルセポリス近郊 52.9°E）までを収める。
 *
 * 経度の幅を広げたぶん WIDTH も比例して広げてある。760 のままだと
 * 地形だけが viewBox の中で縮み、文字の大きさは変わらないので、
 * 属州名と都市名が重なって読めなくなる。
 * 南は 24°N まで取り、エジプトをナイル上流（シエネ 24.1°N）まで収める
 */
const LON_MIN = -11, LON_MAX = 58, LAT_MIN = 24, LAT_MAX = 59;
const WIDTH = 832;

/** 属州に対応する現代の国。ローマ期の領域の近似として使う */
const PROVINCE_COUNTRIES: Record<string, string[]> = {
  Britannia: ['United Kingdom'],
  Gallia: ['France', 'Belgium', 'Netherlands', 'Luxembourg', 'Switzerland'],
  Hispania: ['Spain', 'Portugal'],
  Italia: ['Italy', 'San Marino'],
  Illyricum: ['Croatia', 'Bosnia and Herz.', 'Serbia', 'Montenegro', 'Albania', 'Slovenia', 'Kosovo', 'Macedonia'],
  Noricum: ['Austria', 'Hungary', 'Slovakia'],
  Africa: ['Tunisia', 'Algeria', 'Libya', 'Morocco'],
};

/*
 * 東ローマ帝国の領域。プレイヤーの属州ではないので支配度を持たず、
 * 「西の外側にもうひとつのローマがある」ことを示すためだけに描く。
 *
 * バルカン半島は 395年の分割では東（ダキア・マケドニア管区）だが、
 * このゲームは西の属州 Illyricum にまとめているので、ここには含めない。
 * 地図の色分けと属州データが食い違わないことを優先する
 */
const EAST_ROMAN_COUNTRIES = [
  'Greece', 'Bulgaria', 'Turkey', 'Cyprus', 'N. Cyprus',
  'Egypt', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Jordan',
];

/*
 * 東方属州。統一シナリオで西が奪えるので、東ローマ全体を一色で塗らず
 * 属州ごとに分けて持ち主を出せるようにする。
 * 上の EAST_ROMAN_COUNTRIES と同じ国を4つに割ったもの
 */
const EAST_PROVINCE_COUNTRIES: Record<string, string[]> = {
  Thracia: ['Greece', 'Bulgaria'],
  Asiana: ['Turkey', 'Cyprus', 'N. Cyprus'],
  Oriens: ['Syria', 'Lebanon', 'Israel', 'Palestine', 'Jordan'],
  Aegyptus: ['Egypt'],
};

/** ラベルを置く国。表示範囲に確実に入るものを選ぶ */
const EAST_PROVINCE_LABEL_COUNTRY: Record<string, string> = {
  Thracia: 'Bulgaria',
  Asiana: 'Turkey',
  Oriens: 'Syria',
  Aegyptus: 'Egypt',
};

/*
 * 蛮族の郷里。帝国の外に定住地が特定できる勢力だけが持つ。
 *
 * 395年前後の所在を現代の国で近似している。国境線は分割できないので
 * 1勢力に1つ以上の国を割り当て、領域が重ならないようにした。
 *
 * フン・アラン・西ゴート・ヴァンダル・東ゴート・ヘルールはこの時代
 * ずっと動き続けており、定住地を持たないので面では描かない。
 * アラマンニの地（アグリ・デクマテス）は国境線そのものと重なっていて、
 * 国単位ではフランクのゲルマニアと分けられないため同じく面を持たない
 */
const HOMELAND_COUNTRIES: Record<string, string[]> = {
  // 下ライン。フランク諸部族
  Franks: ['Germany'],
  // ユトランドと北海沿岸
  Saxons: ['Denmark', 'Sweden'],
  // ボヘミア。マルコマンニ・クアディなどスエビ系
  Suebi: ['Czechia'],
  // ヴィスワ川。ブルグントの伝承上の出自
  Burgundians: ['Poland'],
  // ダキア。フン崩壊後にこの地を握るゲピード
  Gepids: ['Romania', 'Moldova'],
  // ヒベルニア。ブリタンニアを襲うスコティ（アイルランド）
  Scoti: ['Ireland'],
};

const HOMELAND_LABEL_COUNTRY: Record<string, string> = {
  Franks: 'Germany',
  Saxons: 'Denmark',
  Suebi: 'Czechia',
  Burgundians: 'Poland',
  Gepids: 'Romania',
  Scoti: 'Ireland',
};

/*
 * サーサーン朝ペルシア。西ローマの敵ではないが、東ローマが
 * 援軍を出せるかどうかを左右する存在なので地図に置く。
 * ゲームの状態は持たず、地図上の背景としてのみ描く。
 *
 * カフカス（ジョージア）は 4世紀末には東西の緩衝地帯で
 * 帰属が揺れるため、どちらにも入れず帝国外のままにする
 */
const PERSIA_COUNTRIES = [
  'Iran', 'Iraq', 'Armenia', 'Azerbaijan', 'Kuwait', 'Turkmenistan', 'Afghanistan',
];

// メルカトル図法。経度・緯度ともラジアンで扱う
const rad = (deg: number) => (deg * Math.PI) / 180;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));
const scale = WIDTH / (rad(LON_MAX) - rad(LON_MIN));
const yTop = mercY(LAT_MAX);
const HEIGHT = Math.round((yTop - mercY(LAT_MIN)) * scale);
const project = ([lon, lat]: number[]): [number, number] => [
  (rad(lon) - rad(LON_MIN)) * scale,
  (yTop - mercY(lat)) * scale,
];

/** 表示範囲にかかるリングだけ残す。フランス海外県などを落とすため */
function ringInView(ring: number[][]): boolean {
  return ring.some(([lon, lat]) =>
    lon >= LON_MIN - 3 && lon <= LON_MAX + 3 && lat >= LAT_MIN - 3 && lat <= LAT_MAX + 3);
}

/**
 * 投影後の座標で、この距離より近い連続点は間引く（px）。
 * 属州の輪郭は画面上でそのまま見えるので細かく、
 * 背景の陸地や支流は粗くと、用途ごとに切り替える
 */
let MIN_POINT_DISTANCE = 1.1;
/** 投影後の外接矩形がこれより小さいリングは捨てる（px） */
let MIN_RING_SIZE = 3;

function ringToPath(ring: number[][]): string | null {
  const projected = ring.map(project);

  const xs = projected.map((p) => p[0]);
  const ys = projected.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  // 表示しても点にしかならない小島は落とす
  if (w < MIN_RING_SIZE && h < MIN_RING_SIZE) return null;

  const kept: [number, number][] = [projected[0]];
  for (const point of projected.slice(1, -1)) {
    const last = kept[kept.length - 1];
    const dx = point[0] - last[0];
    const dy = point[1] - last[1];
    if (dx * dx + dy * dy >= MIN_POINT_DISTANCE * MIN_POINT_DISTANCE) kept.push(point);
  }
  if (kept.length < 3) return null;

  const pts = kept.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`);
  return `M${pts.join('L')}Z`;
}

/** 線分（河川）用。閉じずに描く */
function lineToPath(coords: number[][]): string | null {
  const projected = coords.map(project);
  const kept: [number, number][] = [projected[0]];
  for (const point of projected.slice(1)) {
    const last = kept[kept.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= MIN_POINT_DISTANCE) kept.push(point);
  }
  if (kept.length < 2) return null;
  return `M${kept.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}`;
}

function linesToPath(geom: any): string {
  const lines: number[][][] = geom.type === 'LineString' ? [geom.coordinates] : geom.coordinates;
  const parts: string[] = [];
  for (const line of lines) {
    if (!ringInView(line)) continue;
    const d = lineToPath(line);
    if (d) parts.push(d);
  }
  return parts.join('');
}

function geometryToPath(geom: any): string {
  const polys: number[][][][] = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  const parts: string[] = [];
  for (const poly of polys) {
    for (const ring of poly) {
      if (ring.length < 4 || !ringInView(ring)) continue;
      const d = ringToPath(ring);
      if (d) parts.push(d);
    }
  }
  return parts.join('');
}

/** 面積が最大のリングの重心。ラベルの置き場所に使う */
function labelPoint(geom: any): [number, number] {
  const polys: number[][][][] = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  let best: number[][] | null = null, bestArea = -1;
  for (const poly of polys) {
    const ring = poly[0];
    if (!ring || !ringInView(ring)) continue;
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    area = Math.abs(area / 2);
    if (area > bestArea) { bestArea = area; best = ring; }
  }
  if (!best) return [0, 0];
  const pts = best.map(project);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [Number(cx.toFixed(1)), Number(cy.toFixed(1))];
}

const fc: any = feature(topo, topo.objects.countries);
const byName = new Map<string, any>();
for (const f of fc.features) byName.set(f.properties.name, f);

const owned = new Set<string>();
const provincePaths: Record<string, string> = {};
const provinceLabels: Record<string, [number, number]> = {};

for (const [province, countries] of Object.entries(PROVINCE_COUNTRIES)) {
  const parts: string[] = [];
  let labelGeom: any = null, labelArea = -1;
  for (const name of countries) {
    const f = byName.get(name);
    if (!f) { console.warn(`  見つからない国: ${name}`); continue; }
    owned.add(name);
    const d = geometryToPath(f.geometry);
    if (d) parts.push(d);
    const approx = JSON.stringify(f.geometry).length;
    if (approx > labelArea) { labelArea = approx; labelGeom = f.geometry; }
  }
  provincePaths[province] = parts.join('');
  provinceLabels[province] = labelPoint(labelGeom);
}

/**
 * 属州ではない勢力の領域。属州と同じ解像度で描く。
 * labelCountry はラベルを置く国。表示範囲に確実に入るものを選ぶ
 */
function pickCountries(names: string[], labelCountry: string) {
  const parts: string[] = [];
  let labelGeom: any = null;
  for (const name of names) {
    const f = byName.get(name);
    if (!f) { console.warn(`  見つからない国: ${name}`); continue; }
    owned.add(name);
    const d = geometryToPath(f.geometry);
    if (d) parts.push(d);
    if (name === labelCountry) labelGeom = f.geometry;
  }
  return { path: parts.join(''), label: labelGeom ? labelPoint(labelGeom) : [0, 0] };
}

const east = pickCountries(EAST_ROMAN_COUNTRIES, 'Greece');

// 東方属州と蛮族の本拠地。pickCountries は owned に積むので東の後に呼ぶ
const eastProvincePaths: Record<string, string> = {};
const eastProvinceLabels: Record<string, [number, number]> = {};
for (const [id, countries] of Object.entries(EAST_PROVINCE_COUNTRIES)) {
  const r = pickCountries(countries, EAST_PROVINCE_LABEL_COUNTRY[id]);
  eastProvincePaths[id] = r.path;
  eastProvinceLabels[id] = r.label as [number, number];
}

const homelandPaths: Record<string, string> = {};
const homelandLabels: Record<string, [number, number]> = {};
for (const [id, countries] of Object.entries(HOMELAND_COUNTRIES)) {
  const r = pickCountries(countries, HOMELAND_LABEL_COUNTRY[id]);
  homelandPaths[id] = r.path;
  homelandLabels[id] = r.label as [number, number];
}
// ペルシアのラベルはメソポタミア（クテシフォンのある地）に置く
const persia = pickCountries(PERSIA_COUNTRIES, 'Iraq');

// 属州に属さない陸地（背景として暗く描く）。粗い解像度で十分
MIN_POINT_DISTANCE = 3;
const fcCoarse: any = feature(topoCoarse, topoCoarse.objects.countries);
const contextParts: string[] = [];
for (const f of fcCoarse.features) {
  if (owned.has(f.properties.name)) continue;
  const d = geometryToPath(f.geometry);
  if (d) contextParts.push(d);
}

// ── 地形（山脈・高原・平原・砂漠・湖・河川） ──────────────
/*
 * 地形は 1:10m を使う。1:50m だと表示範囲内の山脈が15件しか無く、
 * マッシフ・サントラルやジュラ、リーフ山地といった中規模の山地が
 * すべて抜け落ちて「アルプスとピレネーだけの地図」になるため。
 * 1:10m にすると35件になる。頂点は投影後に間引くので描画負荷は
 * 元データの解像度ではなく下の MIN_POINT_DISTANCE で決まる
 */
MIN_POINT_DISTANCE = 1.3;
const regions = await fetchGeo('ne_10m_geography_regions_polys');
const lakes = await fetchGeo('ne_50m_lakes');
const rivers = await fetchGeo('ne_10m_rivers_lake_centerlines');

const pickRegions = (classes: string[]): string => {
  const parts: string[] = [];
  for (const f of regions.features) {
    if (!classes.includes(f.properties.featurecla ?? f.properties.FEATURECLA)) continue;
    const d = geometryToPath(f.geometry);
    if (d) parts.push(d);
  }
  return parts.join('');
};

const mountainPath = pickRegions(['Range/mtn']);

/*
 * 山脈以外の面は輪郭をそのまま見せず色の帯として敷くだけなので、
 * 粗く間引いてよい。表示範囲を東へ広げたぶんの頂点を取り戻す
 */
MIN_POINT_DISTANCE = 1.8;
const desertPath = pickRegions(['Desert']);
const plateauPath = pickRegions(['Plateau']);
const plainPath = pickRegions(['Plain', 'Basin', 'Lowland', 'Valley']);

// 湖。小さいものが多いので最小サイズを緩める
MIN_POINT_DISTANCE = 1.2;
MIN_RING_SIZE = 1.5;
const lakeParts: string[] = [];
for (const f of lakes.features) {
  const d = geometryToPath(f.geometry);
  if (d) lakeParts.push(d);
}
const lakePath = lakeParts.join('');

/*
 * 河川は主流と支流に分ける。太さと不透明度を変えて描くと
 * 水系の広がりが出る。scalerank が小さいほど大きな川
 */
const MAJOR_RIVER_MAX_RANK = 5;
const majorParts: string[] = [];
const minorParts: string[] = [];
for (const f of rivers.features) {
  const rank = f.properties.scalerank ?? f.properties.SCALERANK ?? 9;
  const major = rank <= MAJOR_RIVER_MAX_RANK;
  // 支流は本数が多いので粗く間引く
  MIN_POINT_DISTANCE = major ? 1.3 : 3;
  const d = linesToPath(f.geometry);
  if (!d) continue;
  (major ? majorParts : minorParts).push(d);
}
const riverPath = majorParts.join('');
const minorRiverPath = minorParts.join('');

const kb = (s: string) => (s.length / 1024).toFixed(0) + 'KB';
console.log(
  `山脈 ${kb(mountainPath)} / 高原 ${kb(plateauPath)} / 平原 ${kb(plainPath)} / ` +
    `砂漠 ${kb(desertPath)} / 湖 ${kb(lakePath)} / 河川 ${kb(riverPath)}+${kb(minorRiverPath)}`,
);

const out = `// 自動生成。手で編集しない。
// 生成元: Natural Earth 1:50m (npm world-atlas) / scripts/generate-map.ts
// 実行時に地図ライブラリは使わず、この静的なパス文字列だけを描画する。
// 属州の領域はローマ期の近似として現代の国境を組み合わせている。
import type { ProvinceId } from '../core/types';

export const MAP_VIEWBOX = '0 0 ${WIDTH} ${HEIGHT}';

/** 属州に属さない陸地。背景として描く */
export const CONTEXT_LAND_PATH = ${JSON.stringify(contextParts.join(''))};

/** 東ローマ帝国の領域。プレイヤーの属州ではないので支配度を持たない */
export const EAST_ROMAN_PATH = ${JSON.stringify(east.path)};

/** 東ローマのラベルを置く座標（ギリシャの重心） */
export const EAST_ROMAN_LABEL_POINT: [number, number] = ${JSON.stringify(east.label)};

/** サーサーン朝ペルシアの領域。地図上の背景で、ゲームの状態は持たない */
export const PERSIA_PATH = ${JSON.stringify(persia.path)};

/** ペルシアのラベルを置く座標（メソポタミアの重心） */
export const PERSIA_LABEL_POINT: [number, number] = ${JSON.stringify(persia.label)};

/**
 * 経緯度をこの地図の座標へ写す。属州の輪郭と同じ投影を使うので、
 * 表示範囲を変えてもここを通した座標はずれない。
 * 手で置いた地点（蛮族の待機位置など）は必ずこれを通すこと
 */
const LON_MIN_RAD = ${(rad(LON_MIN)).toFixed(10)};
const MERC_Y_TOP = ${yTop.toFixed(10)};
const MAP_SCALE = ${scale.toFixed(6)};

export function projectLonLat(lon: number, lat: number): [number, number] {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const mercator = (deg: number) => Math.log(Math.tan(Math.PI / 4 + toRad(deg) / 2));
  return [(toRad(lon) - LON_MIN_RAD) * MAP_SCALE, (MERC_Y_TOP - mercator(lat)) * MAP_SCALE];
}

/** 山脈。起伏の陰影を付ける下地に使う（Natural Earth Range/mtn） */
export const MOUNTAIN_PATH = ${JSON.stringify(mountainPath)};

/** 高原。山地と平地の中間の色味にする（Natural Earth Plateau） */
export const PLATEAU_PATH = ${JSON.stringify(plateauPath)};

/** 平原・盆地・低地。緑を強めて肥沃に見せる */
export const PLAIN_PATH = ${JSON.stringify(plainPath)};

/** 砂漠。地形の色味を変える（Natural Earth Desert） */
export const DESERT_PATH = ${JSON.stringify(desertPath)};

/** 湖（Natural Earth 1:50m lakes） */
export const LAKE_PATH = ${JSON.stringify(lakePath)};

/** 主要な河川（scalerank ${MAJOR_RIVER_MAX_RANK} 以下） */
export const RIVER_PATH = ${JSON.stringify(riverPath)};

/** 支流。細く薄く描いて水系の広がりを出す */
export const MINOR_RIVER_PATH = ${JSON.stringify(minorRiverPath)};

/** 東方属州の領域。持ち主（東ローマ／西ローマ／ペルシア）で塗り分ける */
export const EAST_PROVINCE_PATHS: Record<string, string> = ${JSON.stringify(eastProvincePaths, null, 2)};

export const EAST_PROVINCE_LABEL_POINTS: Record<string, [number, number]> = ${JSON.stringify(eastProvinceLabels, null, 2)};

/** 蛮族の本拠地。征服すると西ローマの領域になる */
export const HOMELAND_PATHS: Record<string, string> = ${JSON.stringify(homelandPaths, null, 2)};

export const HOMELAND_LABEL_POINTS: Record<string, [number, number]> = ${JSON.stringify(homelandLabels, null, 2)};

export const PROVINCE_PATHS: Record<ProvinceId, string> = ${JSON.stringify(provincePaths, null, 2)} as Record<ProvinceId, string>;

/** ラベルを置く座標 */
export const PROVINCE_LABEL_POINTS: Record<ProvinceId, [number, number]> = ${JSON.stringify(provinceLabels, null, 2)} as Record<ProvinceId, [number, number]>;
`;
writeFileSync('src/ui/mapPaths.ts', out);
console.log(`viewBox 0 0 ${WIDTH} ${HEIGHT}`);
console.log(`出力サイズ: ${(out.length / 1024).toFixed(0)} KB`);
