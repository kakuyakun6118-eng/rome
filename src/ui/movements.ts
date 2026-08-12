import type {
  BarbarianFactionId,
  BarbarianStance,
  GameState,
  PlayerAction,
  ProvinceId,
} from '../core/types';
import { FACTION_LABELS } from './catalogue';
import { PROVINCE_LABEL_POINTS, projectLonLat } from './mapPaths';

/**
 * 地図上の進軍演出のための座標計算。
 * ゲームには個々の部隊の位置が無いため、前ターンと今ターンの
 * 差分から「どこからどこへ動いたか」を復元して描く。
 * これは表示のための解釈であって、状態そのものではない
 */

export type Point = [number, number];

/*
 * 手で置く地点は経緯度で持ち、地図と同じ投影を通す。
 * 座標を直に書くと、地図の表示範囲を変えたときに
 * すべてずれてしまうため
 */

/**
 * 属州の代表点。名前・支配度・軍の駒をすべてここに揃える。
 *
 * 自動生成した重心で収まりが悪いものだけ手で置き直す。
 * アフリカはアルジェリア内陸に寄るので沿岸へ、地中海北岸は
 * 属州が密集して名前が重なるので散らす
 */
export const PROVINCE_POINTS: Record<ProvinceId, Point> = {
  ...PROVINCE_LABEL_POINTS,
  Africa: projectLonLat(8.89, 35.2),
  Italia: projectLonLat(12.2, 41.4),
  Illyricum: projectLonLat(20.8, 43.9),
  Noricum: projectLonLat(18.6, 47.6),
};

/**
 * 帝国境外にいる勢力の待機位置。史実の進入方向に合わせて置く。
 *
 * 駒には勢力名を添えるので、名前どうしが重ならない間隔を空けてある。
 * ライン川の向こうに5勢力が並ぶため、緯度もずらして段違いにする
 */
const EXTERIOR_POINTS: Record<BarbarianFactionId, Point> = {
  // 郷里を持つ勢力。境外にいる年は面で描くので、この点は進軍の起点にだけ使う
  Saxons: projectLonLat(9.5, 56.2),
  Franks: projectLonLat(9.0, 51.5),
  Suebi: projectLonLat(15.4, 50.0),
  Burgundians: projectLonLat(19.6, 52.6),
  Gepids: projectLonLat(25.0, 46.5),
  Scoti: projectLonLat(-8.0, 53.2),
  /*
   * 郷里を持たない勢力。ここが駒の立ち位置になる。
   * 395年前後の所在に合わせて置く。
   *
   * ゴート族はドナウ下流から黒海北岸に居り、東ゴート（グロイトゥンギ）は
   * ドニエストル〜ドン川のあいだでフンに服属していた。フン本体は
   * さらに東のポントス・カスピ海草原、アランは北カフカスにいる。
   * 以前は東ゴートを 40.5°E に置いていたが、それはドン川より東の
   * 内陸で、フンの本拠と重なるうえ史実の所在より東に寄りすぎていた
   */
  Visigoths: projectLonLat(27.5, 45.4),
  Vandals: projectLonLat(21.5, 48.4),
  Heruli: projectLonLat(31.5, 47.0),
  Ostrogoths: projectLonLat(34.5, 48.8),
  Huns: projectLonLat(43.0, 48.2),
  Alans: projectLonLat(44.0, 44.2),
  // アグリ・デクマテス。ライン上流の対岸
  Alemanni: projectLonLat(8.6, 47.6),
  /*
   * マウレタニア。アトラス山脈の内陸で、属州の海岸帯の南西に当たる。
   * 以前は 2°E の砂漠に置いていたが、それはヌミディアの南で
   * マウリの地ではない。ローマの支配が届かなかった山地に置く
   */
  Mauri: projectLonLat(-5.0, 31.8),
};

/** 野戦軍が出撃する拠点 */
const CAPITAL: Point = PROVINCE_POINTS.Italia;

function pointOf(faction: BarbarianFactionId, location: ProvinceId | 'exterior'): Point {
  return location === 'exterior' ? EXTERIOR_POINTS[faction] : PROVINCE_POINTS[location];
}

/**
 * 皇帝が自ら軍を率いるとみなす「軍事」能力の下限。
 * これは表示のための解釈であってゲームルールではないため
 * core/constants.ts ではなくここに置く。
 * 軍才ある皇帝は戦場に立ち、凡庸な皇帝は宮廷に留まる、という
 * 史実の対比を既存の能力値だけで表す
 */
const IMPERIAL_CAMPAIGN_MIN_MILITARY = 7;

export interface MapMarch {
  id: string;
  kind: 'legion' | 'barbarian';
  from: Point;
  to: Point;
  label: string;
  /** 軍旗に出す兵力。規模を目で見えるようにする */
  strength: number;
  /** 皇帝の親征。金色のローマ旗を掲げる */
  imperial: boolean;
}

export interface MapBattle {
  id: string;
  at: Point;
  label: string;
}

export interface TurnMotion {
  marches: MapMarch[];
  battles: MapBattle[];
}

export const NO_MOTION: TurnMotion = { marches: [], battles: [] };

/** 地図に常時出す蛮族の駒 */
export interface FactionMarker {
  id: BarbarianFactionId;
  at: Point;
  strength: number;
  stance: BarbarianStance;
  label: string;
}

/** 同じ属州に複数の勢力がいるとき、名前ごと重ならない間隔で横へ散らす */
const MARKER_SPREAD = 52;
/** 属州の名前と重ならないよう、駒は代表点より上に置く */
const MARKER_RISE = 26;

/**
 * 各勢力が今いる場所を駒として返す。
 *
 * ゲームには「蛮族の領域」という状態が無く、勢力は属州か境外の
 * どちらかに“いる”だけなので、面ではなく駒で表す。
 * 同じ属州に複数いる場合は横に並べて全部見えるようにする
 */
export function deriveFactionMarkers(state: GameState): FactionMarker[] {
  const ids = Object.keys(state.factions) as BarbarianFactionId[];

  // 境外は勢力ごとに待機位置が違うので束ねない
  const groups = new Map<string, BarbarianFactionId[]>();
  for (const id of ids) {
    const location = state.factions[id].location;
    const key = location === 'exterior' ? `exterior:${id}` : location;
    const group = groups.get(key);
    if (group) group.push(id);
    else groups.set(key, [id]);
  }

  const markers: FactionMarker[] = [];
  for (const group of groups.values()) {
    group.forEach((id, index) => {
      const faction = state.factions[id];
      const [x, y] = pointOf(id, faction.location);
      // 中央を軸に左右へ振り分ける
      const shift = (index - (group.length - 1) / 2) * MARKER_SPREAD;
      markers.push({
        id,
        at: [x + shift, y - MARKER_RISE],
        strength: faction.strength,
        stance: faction.stance,
        label: FACTION_LABELS[id],
      });
    });
  }
  return markers;
}

/** 定住された属州。税基盤が恒久的に削られた土地を地図に示す */
export function settledProvinces(state: GameState): Set<ProvinceId> {
  const settled = new Set<ProvinceId>();
  for (const faction of Object.values(state.factions)) {
    if (faction.stance === 'settled' && faction.location !== 'exterior') {
      settled.add(faction.location);
    }
  }
  return settled;
}

/**
 * 1ターン分の進軍と戦闘を差分から復元する。
 * key に turn を含めるのは、同じ経路でも年が変われば
 * アニメーションをやり直させるため
 */
export function deriveTurnMotion(
  before: GameState,
  after: GameState,
  actions: readonly PlayerAction[],
): TurnMotion {
  const turn = after.turn;
  const marches: MapMarch[] = [];
  const battles: MapBattle[] = [];

  // 野戦軍の派遣。首都から派遣先へ進む
  const imperial =
    after.dynasty.ruler.abilities.military >= IMPERIAL_CAMPAIGN_MIN_MILITARY;
  for (const action of actions) {
    if (action.type !== 'military_deploy') continue;
    marches.push({
      id: `legion-${turn}-${action.provinceId}`,
      kind: 'legion',
      from: CAPITAL,
      to: PROVINCE_POINTS[action.provinceId],
      label: imperial ? '皇帝親征' : '野戦軍',
      strength: after.fieldArmy,
      imperial,
    });
  }

  for (const id of Object.keys(after.factions) as BarbarianFactionId[]) {
    const was = before.factions[id];
    const now = after.factions[id];

    // 蛮族の移動
    if (was.location !== now.location) {
      marches.push({
        id: `barb-${turn}-${id}`,
        kind: 'barbarian',
        from: pointOf(id, was.location),
        to: pointOf(id, now.location),
        label: FACTION_LABELS[id],
        strength: now.strength,
        imperial: false,
      });
    }

    /*
     * 戦闘。敵対勢力が属州にいて、その属州の支配度が下がった年を
     * 戦闘があった年とみなす。増税による一律の低下を拾わないよう
     * 敵の駐留を条件に入れている
     */
    if (now.stance !== 'hostile' || now.location === 'exterior') continue;
    const province = now.location;
    if (after.provinces[province].control < before.provinces[province].control) {
      battles.push({
        id: `battle-${turn}-${province}`,
        at: PROVINCE_POINTS[province],
        label: province,
      });
    }
  }

  // 同じ属州で複数勢力が戦っても印はひとつでよい
  const seen = new Set<string>();
  return {
    marches,
    battles: battles.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true))),
  };
}
