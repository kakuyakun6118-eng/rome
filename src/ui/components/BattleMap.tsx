import type { ReactElement } from 'react';

import { BATTLE_LANES, resolveTarget } from '../../core/battlefield';
import type { BattleOrders } from '../../core/battlefield';
import type {
  BattleArm,
  BattleLane,
  BattleLeader,
  BattleUnit,
  Battlefield,
  Terrain,
} from '../../core/types';
import {
  BATTLE_ARM_LABELS,
  BATTLE_LANE_LABELS,
  BATTLE_LEADER_LABELS,
  formatTroops,
} from '../catalogue';
import { useTerrainArt } from '../terrainArt';
import { ChiRho } from './UnitSprite';

/**
 * 戦場の地図。
 *
 * 関ヶ原の布陣図と同じ読み方をさせる。地形の上に両軍の隊を置き、
 * **隊は兵の列そのもの**として描く（兵科ごとに組み方が違う）。
 * 兵数の札を添え、命令は隊から伸びる矢で描く。
 *
 * 地形は画像を持たず、層を重ねた SVG で描く。遠くを霞ませ、
 * 光を左上から当てて起伏を出す（戦略地図の起伏と同じ作り）。
 *
 * **計算式はここに書かない。** 描くのは `Battlefield` が既に持っている値だけ
 */

const W = 320;
const H = 298;

/** 戦列の左端と幅。左翼・中央・右翼を等分に置く */
const LANE_X: Record<BattleLane, number> = { left: 8, center: 112, right: 216 };
const LANE_W = 96;

/** 隊ひとつぶんの高さ。兵の列と、その札 */
const SLOT_H = 32;
/** 兵の列の下に札を置く位置。列を増やしたぶん下げてある */
const ROW_H = 17;

/**
 * 陣の位置。敵は上端から下へ、我が軍は**下端から上へ**積む。
 *
 * どちらも上端から積んでいたときは、隊が1つずつしかない普通の布陣で
 * 画面の下3分の1が空いたままになった。下から積めば、空くのは
 * 両軍のあいだ＝戦場そのものになる
 */
const FOE_TOP = 12;
/** 我が軍の隊の下端。この下に戦列の名、さらに下に本陣を置く */
const OUR_BOTTOM = H - 64;
const MID_Y = 118;
/** 本陣の地面の高さ。戦列の名と重ならないよう十分に下へ取る */
const HQ_Y = H - 10;

function laneStrength(units: BattleUnit[]): number {
  return units.reduce((sum, u) => sum + u.strength, 0);
}

function laneCenter(lane: BattleLane): number {
  return LANE_X[lane] + LANE_W / 2;
}

// ── 地形 ──────────────────────────────────────────────

/**
 * 地形ごとの地の色。手前を濃く、奥を淡くして遠近を出す。
 * `far` が上（敵側）、`near` が下（こちら側）
 */
const GROUND: Record<Terrain, { far: string; near: string; shade: string }> = {
  plain: { far: '#cbc38c', near: '#b0a768', shade: '#9d9457' },
  hill: { far: '#c6b487', near: '#ab9868', shade: '#98865a' },
  forest: { far: '#93a084', near: '#7b8a68', shade: '#6c7b5b' },
  desert: { far: '#e3d3a2', near: '#d2bb80', shade: '#c1a970' },
  river: { far: '#c3c194', near: '#aaab73', shade: '#9a9c68' },
};

/** 起伏の陰影。乱流を法線に見立てて左上から光を当てる（戦略地図と同じ作り） */
function TerrainDefs({ terrain }: { terrain: Terrain }) {
  const g = GROUND[terrain];
  return (
    <defs>
      <linearGradient id="bf-ground" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={g.far} />
        <stop offset="48%" stopColor={g.near} />
        <stop offset="100%" stopColor={g.shade} />
      </linearGradient>
      {/* 遠くを霞ませる。上ほど白を薄く重ねて奥行きを出す */}
      {/* 画を敷いたときに札と兵を読ませるための陰。上下だけ落とす */}
      <linearGradient id="bf-vignette" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="rgba(20,14,6,0.42)" />
        <stop offset="26%" stopColor="rgba(20,14,6,0.04)" />
        <stop offset="72%" stopColor="rgba(20,14,6,0.06)" />
        <stop offset="100%" stopColor="rgba(20,14,6,0.44)" />
      </linearGradient>
      <linearGradient id="bf-haze" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="rgba(255,250,235,0.42)" />
        <stop offset="35%" stopColor="rgba(255,250,235,0.06)" />
        <stop offset="100%" stopColor="rgba(40,30,15,0.05)" />
      </linearGradient>
      {/*
        * 地のざらつき。周波数を上げすぎると漆喰の壁のような
        * 均一な粒になって地面に見えないので、粗い粒を薄く重ねるに留める
        */}
      <filter id="bf-relief" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.14" numOctaves={3} seed={9} result="n" />
        <feDiffuseLighting in="n" lightingColor="#fff6e4" surfaceScale={2.4} result="s">
          <feDistantLight azimuth={315} elevation={48} />
        </feDiffuseLighting>
        <feComposite in="s" in2="SourceAlpha" operator="in" />
      </filter>
      <marker id="bf-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#c9a227" />
      </marker>
      <marker id="bf-arrow-dim" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#6f6047" />
      </marker>
    </defs>
  );
}

/** 木立。幹と、光の当たる面・陰になる面の2枚で葉を描く */
function Tree({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g>
      <ellipse cx={x + s * 0.5} cy={y + s * 1.2} rx={s * 0.75} ry={s * 0.22} fill="rgba(30,40,25,0.28)" />
      <rect x={x - s * 0.08} y={y + s * 0.5} width={s * 0.16} height={s * 0.7} fill="#5a4527" />
      <path d={`M ${x} ${y + s * 0.7} l ${-s * 0.55} 0 l ${s * 0.55} ${-s * 1.5} z`} fill="#4f6340" />
      <path d={`M ${x} ${y + s * 0.7} l ${s * 0.55} 0 l ${-s * 0.55} ${-s * 1.5} z`} fill="#3c4d31" />
    </g>
  );
}

/**
 * 地形。遠景（敵側）・中景・手前（こちら側）の3層に分けて重ねる。
 * 隊が乗る帯は塞がないようにして、駒が地形に埋もれないようにする
 */
function TerrainScene({ terrain }: { terrain: Terrain }) {
  switch (terrain) {
    case 'hill':
      /*
       * 尾根を3列、奥から手前へ重ねる。1列ごとに
       * 「稜線の陽が当たる面」と「その下に落ちる陰」を対で描く。
       * 面を1枚だけ置いていたときは、色の違う帯が並ぶだけで
       * 起伏に見えなかった
       */
      return (
        <g>
          {[
            { y: MID_Y - 44, lit: '#d3c193', dark: '#8f7c4e', h: 34 },
            { y: MID_Y - 14, lit: '#c2ad7a', dark: '#7e6c42', h: 38 },
            { y: MID_Y + 20, lit: '#b09a58', dark: '#6d5c33', h: 50 },
          ].map((r, i) => {
            const crest =
              i === 0
                ? `M -6 ${r.y} q 46 -30 92 -6 q 40 20 74 -14 q 46 -32 96 -4 q 40 24 84 -12`
                : i === 1
                  ? `M -6 ${r.y} q 54 -34 106 -4 q 44 26 90 -18 q 48 -32 90 0 q 36 20 76 -10`
                  : `M -6 ${r.y} q 62 -38 122 0 q 50 30 98 -20 q 52 -34 122 6`;
            return (
              <g key={i}>
                <path d={`${crest} l 0 ${r.h} l -340 0 z`} fill={r.lit} />
                {/* 稜線のすぐ下の陰。ここが無いと丘が平らに見える */}
                <path d={`${crest} l 0 13 l -340 0 z`} fill={r.dark} opacity={0.72} />
                <path d={crest} fill="none" stroke="#6f5f39" strokeWidth={0.9} opacity={0.55} />
              </g>
            );
          })}
          {/* 露岩と灌木。稜線に沿って点在させ、規模の目安にする */}
          <g>
            {[
              [30, MID_Y - 14],
              [126, MID_Y - 26],
              [206, MID_Y + 4],
              [286, MID_Y - 8],
            ].map(([x, y], i) => (
              <g key={i}>
                <path d={`M ${x} ${y} l 4 -6 l 4 3 l 3 3 z`} fill="#6b5c37" />
                <ellipse cx={x + 12} cy={y + 1} rx={5} ry={2.2} fill="#6f7a45" opacity={0.7} />
              </g>
            ))}
          </g>
        </g>
      );

    case 'forest':
      /*
       * 奥は樹海。稜線を丸い房で刻んで梢の並びに見せる。
       * 直線の帯にしていたときは生垣の壁のように見えた
       */
      return (
        <g>
          {[
            { y: MID_Y - 40, fill: '#5b6c4f', r: 9, h: 26 },
            { y: MID_Y - 20, fill: '#4a5a41', r: 11, h: 26 },
          ].map((band, bi) => (
            <path
              key={bi}
              d={
                `M -8 ${band.y + band.r} ` +
                Array.from({ length: Math.ceil((W + 16) / (band.r * 1.5)) }, (_, i) => {
                  const x = -8 + i * band.r * 1.5;
                  const lift = (i % 3) * 2.5;
                  return `Q ${x + band.r * 0.75} ${band.y - band.r * 0.5 - lift} ${x + band.r * 1.5} ${band.y + band.r * 0.4}`;
                }).join(' ') +
                ` L ${W + 10} ${band.y + band.h} L -8 ${band.y + band.h} z`
              }
              fill={band.fill}
            />
          ))}
          {/* 手前の木立。中央は通り道として空け、隊が埋もれないようにする */}
          {[
            [6, 8],
            [26, 6.5],
            [52, 7.5],
            [88, 6],
            [232, 6],
            [268, 7.5],
            [296, 6.5],
            [314, 8],
          ].map(([x, sz], i) => (
            <Tree key={i} x={x} y={MID_Y + 2 + (i % 3) * 7} s={sz} />
          ))}
          {/* 下草 */}
          <g fill="#4f5f3c" opacity={0.5}>
            {[120, 160, 200, 60, 250].map((x, i) => (
              <ellipse key={i} cx={x} cy={MID_Y + 22 + (i % 2) * 8} rx={9} ry={3} />
            ))}
          </g>
        </g>
      );

    case 'desert':
      /* 砂丘。稜線に陽、風下側に陰。3列を重ねて遠近を出す */
      return (
        <g>
          {[
            { y: MID_Y - 44, fill: '#e0cd94', shade: '#c4aa6e', h: 30 },
            { y: MID_Y - 16, fill: '#d5bd7c', shade: '#b39a58', h: 34 },
            { y: MID_Y + 16, fill: '#c7ad6c', shade: '#a3894a', h: 46 },
          ].map((band, i) => {
            const crest =
              i % 2 === 0
                ? `M -6 ${band.y} q 58 -22 114 -2 q 52 18 104 -12 q 54 -20 134 6`
                : `M -6 ${band.y} q 50 -18 98 4 q 56 22 112 -14 q 50 -22 138 2`;
            return (
              <g key={i}>
                <path d={`${crest} l 0 ${band.h} l -340 0 z`} fill={band.fill} />
                <path d={crest} fill="none" stroke="#fbeec6" strokeWidth={1} opacity={0.8} />
                <path d={`${crest} l 0 10 l -340 0 z`} fill={band.shade} opacity={0.5} />
              </g>
            );
          })}
          {/* 岩と乾いた低木 */}
          <g opacity={0.7}>
            {[
              [40, MID_Y - 6],
              [180, MID_Y + 6],
              [280, MID_Y - 18],
            ].map(([x, y], i) => (
              <g key={i}>
                <path d={`M ${x} ${y} l 5 -5 l 5 5 z`} fill="#9c8248" />
                <path
                  d={`M ${x + 16} ${y} l 0 -5 M ${x + 13} ${y} l 3 -4 M ${x + 19} ${y} l -3 -4`}
                  stroke="#8b8352"
                  strokeWidth={0.8}
                />
              </g>
            ))}
          </g>
        </g>
      );

    case 'river':
      /* 川。岸・水面・浅瀬（渡河点）の順に重ねる */
      return (
        <g>
          <path
            d={`M -6 ${MID_Y - 26} q 62 14 116 2 q 58 -14 122 4 q 52 12 92 -6 l 0 52 q -40 18 -92 6 q -64 -18 -122 -4 q -54 12 -116 -2 z`}
            fill="#b9ae7c"
          />
          <path
            d={`M -6 ${MID_Y - 17} q 62 14 116 2 q 58 -14 122 4 q 52 12 92 -6 l 0 34 q -40 18 -92 6 q -64 -18 -122 -4 q -54 12 -116 -2 z`}
            fill="#4f7a95"
          />
          <path
            d={`M -6 ${MID_Y - 17} q 62 14 116 2 q 58 -14 122 4 q 52 12 92 -6 l 0 14 q -40 18 -92 6 q -64 -18 -122 -4 q -54 12 -116 -2 z`}
            fill="#7ba4bd"
            opacity={0.9}
          />
          <g fill="none" stroke="#d8e8f0" strokeWidth={0.7} opacity={0.55}>
            {[10, 92, 176, 254].map((x, i) => (
              <path key={i} d={`M ${x} ${MID_Y - 4 + (i % 2) * 8} q 24 5 48 -2`} />
            ))}
          </g>
          {/* 浅瀬。ここだけ底が見え、踏み越えられる */}
          <clipPath id="bf-water">
            <path
              d={`M -6 ${MID_Y - 17} q 62 14 116 2 q 58 -14 122 4 q 52 12 92 -6 l 0 34 q -40 18 -92 6 q -64 -18 -122 -4 q -54 12 -116 -2 z`}
            />
          </clipPath>
          <g clipPath="url(#bf-water)">
            <path
              d={`M ${laneCenter('center') - 26} ${MID_Y - 16} q 26 12 52 0 l 0 33 q -26 12 -52 0 z`}
              fill="#93b3c2"
            />
            <path
              d={`M ${laneCenter('center') - 26} ${MID_Y - 16} q 26 12 52 0 l 0 33 q -26 12 -52 0 z`}
              fill="none"
              stroke="#cfe2ea"
              strokeWidth={0.8}
              opacity={0.7}
            />
            <g stroke="#6f8e9c" strokeWidth={0.8} opacity={0.8}>
              {[0, 1, 2].map((i) => (
                <path
                  key={i}
                  d={`M ${laneCenter('center') - 22 + i * 15} ${MID_Y - 8} l 0 20`}
                />
              ))}
            </g>
            <text
              x={laneCenter('center')}
              y={MID_Y + 3}
              textAnchor="middle"
              fontSize={7}
              fill="#f2f6f7"
              style={{ letterSpacing: '0.1em', paintOrder: 'stroke' }}
              stroke="rgba(20,40,50,0.65)"
              strokeWidth={2}
            >
              浅瀬
            </text>
          </g>
        </g>
      );

    case 'plain':
      /* 麦の野。畝を奥ほど細かく刻んで遠近を出す */
      return (
        <g>
          {[
            { y: MID_Y - 46, step: 8, len: 4, color: '#c0b678', band: '#c6bd80' },
            { y: MID_Y - 20, step: 11, len: 6, color: '#aca354', band: '#b3aa64' },
            { y: MID_Y + 12, step: 15, len: 9, color: '#968c42', band: '#a19750' },
          ].map((band, bi) => (
            <g key={bi}>
              <rect x={-6} y={band.y} width={W + 12} height={34} fill={band.band} opacity={0.75} />
              <g stroke={band.color} strokeWidth={1.1} strokeLinecap="round" opacity={0.95}>
                {Array.from({ length: Math.ceil(W / band.step) + 1 }, (_, i) => {
                  const x = i * band.step + (bi % 2) * 4;
                  const y = band.y + 14;
                  return (
                    <path
                      key={i}
                      d={`M ${x} ${y + band.len} l ${-1.6} ${-band.len} M ${x + 2} ${y + band.len} l 0 ${-band.len - 1.5} M ${x + 4} ${y + band.len} l ${1.6} ${-band.len}`}
                    />
                  );
                })}
              </g>
            </g>
          ))}
          {/* 畦道と灌木。一様な野原に見せない */}
          <path
            d={`M -6 ${MID_Y + 4} q 80 -8 160 2 q 80 10 172 -4`}
            fill="none"
            stroke="#bdb281"
            strokeWidth={3}
            opacity={0.6}
          />
          <g fill="#6f7a45" opacity={0.6}>
            {[22, 132, 214, 296].map((x, i) => (
              <ellipse key={i} cx={x} cy={MID_Y - 6 + (i % 2) * 22} rx={8} ry={3.4} />
            ))}
          </g>
        </g>
      );
  }
}

/**
 * 手前の地。我が軍の足元にあたる帯。
 *
 * ここに何も置かないと、隊が一様に暗い板の上に立っているように見える。
 * 遠景と同じ素材を、粗く大きく散らして手前らしさを出す
 */
function NearGround({ terrain }: { terrain: Terrain }) {
  const y0 = MID_Y + 52;
  switch (terrain) {
    case 'forest':
      return (
        <g>
          {[
            [4, 9],
            [40, 7.5],
            [292, 8],
            [316, 9.5],
          ].map(([x, sz], i) => (
            <Tree key={i} x={x} y={y0 + (i % 2) * 12} s={sz} />
          ))}
          <g fill="#5e6d4a" opacity={0.45}>
            {[86, 150, 214, 262].map((x, i) => (
              <ellipse key={i} cx={x} cy={y0 + 30 + (i % 2) * 10} rx={14} ry={4} />
            ))}
          </g>
        </g>
      );
    case 'desert':
      return (
        <g>
          <path
            d={`M -6 ${y0} q 70 -14 140 4 q 66 16 200 -6 l 0 90 l -346 0 z`}
            fill="#cdb478"
            opacity={0.8}
          />
          <path
            d={`M -6 ${y0} q 70 -14 140 4 q 66 16 200 -6`}
            fill="none"
            stroke="#f6e8bf"
            strokeWidth={1}
            opacity={0.7}
          />
          <g opacity={0.55} stroke="#9d8449" strokeWidth={0.9}>
            {[24, 120, 236, 300].map((x, i) => (
              <path key={i} d={`M ${x} ${y0 + 26 + (i % 2) * 14} q 16 -5 32 0`} fill="none" />
            ))}
          </g>
        </g>
      );
    case 'hill':
      return (
        <g>
          <path
            d={`M -6 ${y0} q 84 -18 166 2 q 74 18 186 -8 l 0 90 l -352 0 z`}
            fill="#b5a06c"
          />
          <path
            d={`M -6 ${y0} q 84 -18 166 2 q 74 18 186 -8`}
            fill="none"
            stroke="#7d6c43"
            strokeWidth={1}
            opacity={0.6}
          />
          <g fill="#6f7a45" opacity={0.5}>
            {[16, 96, 208, 300].map((x, i) => (
              <ellipse key={i} cx={x} cy={y0 + 28 + (i % 2) * 12} rx={11} ry={4} />
            ))}
          </g>
        </g>
      );
    case 'river':
    case 'plain':
      return (
        <g>
          <g stroke="#9d9450" strokeWidth={1.3} strokeLinecap="round" opacity={0.7}>
            {Array.from({ length: 18 }, (_, i) => {
              const x = 6 + i * 18;
              const y = y0 + 14 + (i % 3) * 16;
              return (
                <path
                  key={i}
                  d={`M ${x} ${y + 10} l -2.5 -9 M ${x + 3} ${y + 10} l 0 -11 M ${x + 6} ${y + 10} l 2.5 -9`}
                />
              );
            })}
          </g>
          <g fill="#6f7a45" opacity={0.45}>
            {[40, 150, 268].map((x, i) => (
              <ellipse key={i} cx={x} cy={y0 + 46 + (i % 2) * 10} rx={13} ry={4.5} />
            ))}
          </g>
        </g>
      );
  }
}

// ── 兵の列 ────────────────────────────────────────────

/**
 * 隊を**兵の列**として描く。兵科ごとに組み方を変える。
 *
 * - 歩兵 — 楯を並べた密集陣。3列に組む
 * - 騎兵 — 間隔を空けた列。轡を並べて突撃に備える
 * - 弓兵 — さらに散らした2列の散兵線
 *
 * 兵の数そのものは描けない（数万人になる）ので、
 * **列の幅**で兵力を、粒の細かさで兵科を表す。
 *
 * **敵の兵は小さく描く。** 敵は図の上端＝遠く、我が軍は下端＝手前に立つ。
 * 地の画が透視で敷かれているのに兵だけ同じ大きさで並ぶと、遠くの敵が
 * 巨人に見えて奥行きが壊れる。列の幅は兵力の表示なので変えず、
 * **兵ひとりの大きさだけ**を縮める
 */
const FOE_FIGURE_SCALE = 0.78;

/** 陽は左上から。地の画の陰影と向きを揃える */
const SUN_DX = 1.15;
const SUN_DY = 0.5;

function Formation({
  unit,
  cx,
  y,
  width,
  foe,
  faded,
}: {
  unit: BattleUnit;
  cx: number;
  y: number;
  width: number;
  foe: boolean;
  faded?: boolean;
}) {
  const body = foe ? '#7c2029' : '#2c4454';
  const dark = foe ? '#571219' : '#182c38';
  const trim = foe ? '#e0a0a4' : '#d8ab3c';
  const left = cx - width / 2;
  const s = foe ? FOE_FIGURE_SCALE : 1;

  const pieces: ReactElement[] = [];

  /** 兵ひとりを置く。中身は原点まわりに描き、ここで位置と大きさを決める */
  const man = (key: string, x: number, yy: number, shadowR: number, art: ReactElement) => (
    <g key={key} transform={`translate(${x} ${yy}) scale(${s})`}>
      {/* 足元の影。陽の向きに合わせて右下へ落とす */}
      <ellipse
        cx={SUN_DX * shadowR}
        cy={SUN_DY * shadowR}
        rx={shadowR * 1.15}
        ry={shadowR * 0.42}
        fill="rgba(30,20,8,0.30)"
      />
      {art}
    </g>
  );

  if (unit.arm === 'infantry') {
    /*
     * 重装歩兵。楯を並べた密集陣を3列に組み、後列を半歩ずらす。
     * 兜と槍の穂先まで描いて、遠目にも槍衾と分かるようにする
     */
    const step = 3.7 * s;
    const n = Math.max(4, Math.floor(width / step));
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < n; i++) {
        const x = left + i * step + (row % 2) * (step / 2) + 0.6;
        const yy = y + row * 3.4 * s;
        pieces.push(
          man(
            `i${row}-${i}`,
            x,
            yy,
            2.1,
            <>
              {/* 槍。穂先を斜めに立てる */}
              <path d="M 2.6 3 l -0.4 -5" stroke={dark} strokeWidth={0.45} />
              <path d="M 2.2 -2 l 0.4 -1 l 0.4 1 z" fill={trim} />
              {/* 兜 */}
              <path d="M 0.4 0 q 0.75 -1.3 1.5 0" fill={dark} />
              {/* 楯（スクトゥム）。縦長の長方形に真ん中の飾り */}
              <rect x={0} y={0} width={2.4} height={4.2} rx={0.6} fill={body} stroke={dark} strokeWidth={0.25} />
              {/* 楯の左端に陽が当たる */}
              <path d="M 0.35 0.5 l 0 3.2" stroke="rgba(255,244,214,0.34)" strokeWidth={0.42} />
              <path d="M 1.2 0.9 l 0 2.4" stroke={trim} strokeWidth={0.4} />
            </>,
          ),
        );
      }
    }
  } else if (unit.arm === 'cavalry') {
    /*
     * 騎兵。馬を横向きに描く。胴・首・頭・四肢と尾まで取り、
     * 鞍上に槍を構えた騎手を乗せる
     */
    const step = 7.6 * s;
    const n = Math.max(3, Math.floor(width / step));
    for (let i = 0; i < n; i++) {
      const x = left + i * step + 1;
      // 後列を半歩ずらして、馬体が重なっても数が読めるようにする
      const yy = y + (i % 2) * 2.6 * s;
      pieces.push(
        man(
          `c${i}`,
          x,
          yy,
          3.4,
          <>
            {/* 馬の胴 */}
            <path d="M 0.4 6 q 0.4 -1.9 2.6 -1.9 q 2.2 0 2.8 1.7 l 0 1.1 q -2.6 0.8 -5.4 0 z" fill={body} />
            {/* 背に陽が乗る */}
            <path d="M 1.1 4.5 q 1.9 -0.9 4.3 0.1" fill="none" stroke="rgba(255,244,214,0.3)" strokeWidth={0.42} />
            {/* 首と頭 */}
            <path d="M 5.6 5.7 l 1.6 -2 l 1.1 0.4 l -0.9 1.1 l -1.1 1.2 z" fill={body} />
            {/* 四肢 */}
            <g stroke={dark} strokeWidth={0.55} strokeLinecap="round">
              <path d="M 1.3 7 l -0.3 2 M 2.7 7 l 0.2 2" />
              <path d="M 4.6 7 l -0.2 2 M 5.6 6.9 l 0.4 2.1" />
            </g>
            {/* 尾 */}
            <path d="M 0.4 5.5 q -1.2 0.6 -1.3 2.2" fill="none" stroke={dark} strokeWidth={0.55} />
            {/* 騎手。胴と頭、構えた槍 */}
            <path d="M 2.7 4.8 l 0 -1.9" stroke={body} strokeWidth={1.2} strokeLinecap="round" />
            <circle cx={2.7} cy={2.2} r={0.85} fill={dark} />
            <path d="M 1.4 1.4 l 4.6 2.6" stroke={trim} strokeWidth={0.5} />
          </>,
        ),
      );
    }
  } else {
    /*
     * 弓兵。散らした散兵線。弓をはっきり C 字に描き、
     * 弦と矢を添えて「射る姿」に見せる
     */
    const step = 6.2 * s;
    const n = Math.max(3, Math.floor(width / step));
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < n; i++) {
        const x = left + i * step + (row % 2) * (step / 2) + 0.8;
        const yy = y + row * 4.6 * s + 1;
        pieces.push(
          man(
            `a${row}-${i}`,
            x,
            yy,
            2.0,
            <>
              {/* 弓と弦 */}
              <path d="M 3.4 -0.4 q 2 2.3 0 4.6" fill="none" stroke={trim} strokeWidth={0.6} />
              <path d="M 3.4 -0.4 l 0 4.6" stroke={trim} strokeWidth={0.3} />
              {/* 矢 */}
              <path d="M 1.9 1.9 l 2.8 0" stroke={dark} strokeWidth={0.38} />
              {/* 射手。頭・胴・踏み出した脚 */}
              <circle cx={1.5} cy={0} r={0.9} fill={dark} />
              <path d="M 1.5 0.9 l 0 2.3" stroke={body} strokeWidth={1.25} strokeLinecap="round" />
              <path d="M 1.5 3.2 l -0.9 1.5 M 1.5 3.2 l 1.1 1.4" stroke={dark} strokeWidth={0.5} />
            </>,
          ),
        );
      }
    }
  }

  return (
    <g opacity={faded ? 0.5 : 1}>
      {/*
       * 隊が踏み荒らした地面。兵ひとりずつの影だけだと、
       * 密集陣が地面の上に貼り付いた紙のように見える
       */}
      <ellipse
        cx={cx + 1.5}
        cy={y + 11}
        rx={width / 2 + 3}
        ry={4.2}
        fill="rgba(120,98,62,0.22)"
      />
      <ellipse cx={cx} cy={y + 12} rx={width / 2} ry={2.2} fill="rgba(35,25,10,0.24)" />
      {pieces}
    </g>
  );
}

/** 兵数の札。兵科と兵数、下に士気の帯 */
function TroopTag({
  unit,
  cx,
  y,
  foe,
  faded,
}: {
  unit: BattleUnit;
  cx: number;
  y: number;
  foe: boolean;
  faded?: boolean;
}) {
  const label = `${BATTLE_ARM_LABELS[unit.arm]} ${formatTroops(unit.strength)}`;
  const w = Math.min(LANE_W - 2, label.length * 5.4 + 8);
  const morale = Math.max(0, Math.min(100, unit.morale));
  return (
    <g opacity={faded ? 0.55 : 1}>
      <rect
        x={cx - w / 2}
        y={y}
        width={w}
        height={11}
        rx={1.5}
        fill={foe ? 'rgba(122,26,36,0.92)' : 'rgba(30,48,60,0.92)'}
        stroke={foe ? '#5e141d' : '#12222c'}
        strokeWidth={0.6}
      />
      <text x={cx} y={y + 7.8} textAnchor="middle" fontSize={7.2} fill="#f4ead2">
        {label}
      </text>
      <rect x={cx - w / 2} y={y + 11} width={w} height={1.6} fill="rgba(0,0,0,0.3)" />
      <rect
        x={cx - w / 2}
        y={y + 11}
        width={(w * morale) / 100}
        height={1.6}
        fill={foe ? '#d98b93' : '#d8ab3c'}
      />
    </g>
  );
}

/**
 * 本陣。指揮官が控える位置に**ラバルム**（キリストのモノグラム ☧）を立てる。
 *
 * コンスタンティヌス以降のローマ軍の標識で、この時代の軍旗は鷲章ではなくこれ。
 * 地図・軍団の竿頭・君主の欄と同じ図を使い回す
 */
function Headquarters({ leader }: { leader: BattleLeader }) {
  // 竿・天幕・銘を横一列に並べる。縦に積むと戦列の名に重なった
  const pole = W / 2 - 34;
  return (
    <g>
      {/* 天幕。竿だけだと地面に刺さった棒に見える */}
      {[-24, -12].map((dx, i) => (
        <path
          key={i}
          d={`M ${pole + dx - 7} ${HQ_Y} l 7 -${9 + i * 2} l 7 ${9 + i * 2} z`}
          fill="rgba(58,38,20,0.9)"
          stroke="#c9a227"
          strokeWidth={0.5}
        />
      ))}
      {/* 竿 */}
      <path d={`M ${pole} ${HQ_Y} l 0 -22`} stroke="#c9a227" strokeWidth={1.4} />
      {/* 竿頭のラバルム。この時代の軍の標識は鷲章ではなくこれ */}
      <g transform={`translate(${pole}, ${HQ_Y - 27}) scale(0.36)`}>
        <ChiRho color="#f6d68a" strokeWidth={5.5} />
      </g>
      {/* 布。帝室紫に金の縁 */}
      <path
        d={`M ${pole + 0.7} ${HQ_Y - 20} l 12 1.6 l 0 8.4 l -12 -1.6 z`}
        fill="#5b2141"
        stroke="#c9a227"
        strokeWidth={0.6}
      />
      <text
        x={pole + 18}
        y={HQ_Y - 4}
        fontSize={8}
        fill="#f4ead2"
        style={{ letterSpacing: '0.1em', paintOrder: 'stroke' }}
        stroke="rgba(20,14,4,0.72)"
        strokeWidth={2.4}
      >
        本陣
      </text>
      <text
        x={pole + 44}
        y={HQ_Y - 4}
        fontSize={7.5}
        fill="#e2d2b4"
        style={{ paintOrder: 'stroke' }}
        stroke="rgba(20,14,4,0.72)"
        strokeWidth={2.4}
      >
        {BATTLE_LEADER_LABELS[leader]}
      </text>
    </g>
  );
}

// ── 命令の矢 ──────────────────────────────────────────

function OrderArrow({
  lane,
  order,
  target,
  /** その戦列の隊の上端。矢はここから伸びる */
  fromY,
  /** 突く相手の戦列の隊の下端。矢はここで止まる */
  toY,
}: {
  lane: BattleLane;
  order: BattleOrders[BattleLane];
  target: BattleLane;
  fromY: number;
  toY: number;
}) {
  const from = laneCenter(lane);
  const stroke = order === 'withdraw' ? '#6f6047' : '#c9a227';

  if (order === 'withdraw') {
    return (
      <g stroke={stroke} strokeWidth={2.2} fill="none" markerEnd="url(#bf-arrow-dim)">
        <path d={`M ${from} ${OUR_BOTTOM - 4} l 0 14`} />
      </g>
    );
  }
  if (order === 'advance' && target === lane) {
    return (
      <g stroke={stroke} strokeWidth={2.2} fill="none" markerEnd="url(#bf-arrow)">
        <path d={`M ${from} ${fromY} L ${from} ${toY}`} />
      </g>
    );
  }

  /*
   * 隣の戦列へ回り込む矢。迂回のときと、前進した先が空いていて
   * 厚い戦列へ向き直したときの両方で描く。破線は迂回のときだけにして、
   * 「側面を突きにいく」のと「正面が空いたので隣へ流れる」のを見分けられるようにする
   */
  const to = laneCenter(target);
  return (
    <g stroke={stroke} strokeWidth={2.2} fill="none" markerEnd="url(#bf-arrow)">
      <path
        d={`M ${from} ${fromY} C ${from} ${MID_Y + 6}, ${to} ${MID_Y - 6}, ${to} ${toY}`}
        strokeDasharray={order === 'flank' ? '5 3' : undefined}
      />
    </g>
  );
}

// ── 地図本体 ──────────────────────────────────────────

export function BattleMap({
  field,
  /** 布陣の途中。まだ戦列に置かれていない兵科がある */
  pending,
  orders,
  selectedLane,
  onSelectLane,
}: {
  field: Battlefield;
  pending?: {
    placed: Partial<Record<BattleArm, BattleLane>>;
    strengthOf: (arm: BattleArm) => number;
  };
  orders?: BattleOrders;
  selectedLane?: BattleLane | null;
  onSelectLane?: (lane: BattleLane) => void;
}) {
  // 両軍で共通の目盛り。揃えないと列の幅で厚みを比べられない
  const maxStrength = Math.max(
    field.ourStartStrength * 0.6,
    ...BATTLE_LANES.map((l) => laneStrength(field.theirs.lanes[l])),
    1,
  );
  const widthOf = (strength: number) =>
    Math.max(20, Math.min(LANE_W - 6, (strength / maxStrength) * (LANE_W - 6)));

  /** 我が軍の隊。布陣中は置いた兵科だけを仮に描く */
  const ourUnits = (lane: BattleLane): BattleUnit[] => {
    if (pending === undefined) return field.ours.lanes[lane];
    return (Object.keys(pending.placed) as BattleArm[])
      .filter((arm) => pending.placed[arm] === lane)
      .map((arm) => ({ arm, strength: pending.strengthOf(arm), morale: 100 }));
  };

  const art = useTerrainArt(field.terrain);
  const emptyLabel = field.round > 1 ? '崩れた' : 'なし';

  /** その戦列の我が軍の隊の上端。矢はここから伸びる */
  const ourTop = (lane: BattleLane) =>
    OUR_BOTTOM - Math.max(1, ourUnits(lane).length) * SLOT_H;
  /** その戦列の敵の隊の下端。矢はここで止まる */
  const foeBottom = (lane: BattleLane) =>
    FOE_TOP + Math.max(1, field.theirs.lanes[lane].length) * SLOT_H - 6;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-sm"
      style={{ touchAction: 'manipulation', display: 'block' }}
      role="img"
      aria-label="戦場の布陣図"
    >
      <TerrainDefs terrain={field.terrain} />

      {/*
       * 地。画が登録されていればそれを敷き、無ければ線と面で描く。
       * 画は地形だけを写したもので、兵は描き込まない（兵は状態から描く）
       */}
      {art === null ? (
        <>
          <rect x={0} y={0} width={W} height={H} fill="url(#bf-ground)" />
          <rect x={0} y={0} width={W} height={H} filter="url(#bf-relief)" opacity={0.13} />
          <TerrainScene terrain={field.terrain} />
          <NearGround terrain={field.terrain} />
          <rect x={0} y={0} width={W} height={H} fill="url(#bf-haze)" />
        </>
      ) : (
        <>
          <image
            href={art}
            x={0}
            y={0}
            width={W}
            height={H}
            preserveAspectRatio="xMidYMid slice"
          />
          {/*
           * 上下だけ落とす。写実的な地に札や兵をそのまま置くと
           * 明るい草地や砂の上で読めなくなる
           */}
          <rect x={0} y={0} width={W} height={H} fill="url(#bf-vignette)" />
        </>
      )}

      {/* 敵軍。上端から下へ積む */}
      {BATTLE_LANES.map((lane) => {
        const units = field.theirs.lanes[lane];
        return (
          <g key={`foe-${lane}`}>
            {units.length === 0 && (
              <text
                x={laneCenter(lane)}
                y={FOE_TOP + 22}
                textAnchor="middle"
                fontSize={8}
                fill="#f0c3c7"
                style={{ paintOrder: 'stroke' }}
                stroke="rgba(20,14,4,0.6)"
                strokeWidth={2.2}
              >
                {emptyLabel}
              </text>
            )}
            {units.map((u, i) => (
              <g key={i}>
                <TroopTag unit={u} cx={laneCenter(lane)} y={FOE_TOP + i * SLOT_H} foe />
                <Formation
                  unit={u}
                  cx={laneCenter(lane)}
                  y={FOE_TOP + i * SLOT_H + ROW_H + 2}
                  width={widthOf(u.strength)}
                  foe
                />
              </g>
            ))}
          </g>
        );
      })}

      {/* 命令の矢。布陣中は描かない */}
      {orders !== undefined &&
        field.phase === 'engaged' &&
        BATTLE_LANES.filter((lane) => laneStrength(field.ours.lanes[lane]) > 0).map((lane) => {
          /*
           * 向かう先は core の規則をそのまま引く。ここで引き写すと、
           * 正面が空いた戦列が隣へ回り込む規則を描き落とす
           */
          const target = resolveTarget(lane, orders[lane], field.theirs) ?? lane;
          return (
            <OrderArrow
              key={`arrow-${lane}`}
              lane={lane}
              order={orders[lane]}
              target={target}
              fromY={ourTop(lane) - 4}
              toY={foeBottom(target) + 5}
            />
          );
        })}

      {/* 我が軍。下端から上へ積む。触れて布陣・命令の対象にする */}
      {BATTLE_LANES.map((lane) => {
        const units = ourUnits(lane);
        const selected = selectedLane === lane;
        return (
          <g
            key={`our-${lane}`}
            onClick={() => onSelectLane?.(lane)}
            style={{ cursor: onSelectLane ? 'pointer' : undefined }}
          >
            {/* 触れる範囲。選ばれているときだけ枠を見せる */}
            {/* 隊にぴったり被せる。開けた地面まで伸ばすと箱が浮いて見える */}
            <rect
              x={LANE_X[lane]}
              y={ourTop(lane) - 8}
              width={LANE_W}
              height={OUR_BOTTOM - ourTop(lane) + 12}
              rx={2}
              fill={selected ? 'rgba(201,162,39,0.20)' : 'transparent'}
              stroke={selected ? '#c9a227' : 'transparent'}
              strokeWidth={1.6}
            />
            {units.length === 0 && (
              <text
                x={laneCenter(lane)}
                y={OUR_BOTTOM - 12}
                textAnchor="middle"
                fontSize={8}
                fill="#dfeaf1"
                style={{ paintOrder: 'stroke' }}
                stroke="rgba(20,14,4,0.6)"
                strokeWidth={2.2}
              >
                {pending ? 'ここへ置く' : emptyLabel}
              </text>
            )}
            {units.map((u, i) => {
              const y = OUR_BOTTOM - (units.length - i) * SLOT_H;
              return (
                <g key={i}>
                  <Formation
                    unit={u}
                    cx={laneCenter(lane)}
                    y={y}
                    width={widthOf(u.strength)}
                    foe={false}
                    faded={pending !== undefined}
                  />
                  <TroopTag
                    unit={u}
                    cx={laneCenter(lane)}
                    y={y + ROW_H}
                    foe={false}
                    faded={pending !== undefined}
                  />
                </g>
              );
            })}
            <text
              x={laneCenter(lane)}
              y={OUR_BOTTOM + 12}
              textAnchor="middle"
              fontSize={8.5}
              fill="#f4ead2"
              style={{ letterSpacing: '0.12em', paintOrder: 'stroke' }}
              stroke="rgba(20,14,4,0.65)"
              strokeWidth={2.2}
            >
              {BATTLE_LANE_LABELS[lane]}
            </text>
          </g>
        );
      })}

      {/* 本陣。ラバルムを立てた指揮官の位置 */}
      <Headquarters leader={field.leader} />
    </svg>
  );
}
