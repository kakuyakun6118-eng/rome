import { useId, useState } from 'react';

import type { DynastyMember, MarriageOrigin, Ruler, Spouse } from '../../core/types';
import { romanHouseName } from '../../core/diplomacy';
import {
  ageBandOf,
  consortAgeBandOf,
  consortOriginOf,
  emperorOriginOf,
  portraitUrl,
  selectPortrait,
  type PortraitAge,
  type PortraitOrigin,
  type PortraitRole,
} from '../portraitAssets';

/**
 * 君主と皇后の肖像。画像素材を持たず、SVG を組み立てて描く。
 * 見た目は id から決定的に決まるので、同じ人物なら常に同じ顔になり、
 * 代替わりすれば顔が変わる。
 * 意匠は後期ローマ／ビザンティンの帝室肖像に寄せ、
 * 帝室紫・金の刺繍・宝石・真珠・大理石の壁龕で構成する
 */

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** id から決まる擬似乱数。描画のためだけに使う */
function picker(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const pick = <T,>(rng: () => number, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)];

const SKIN = ['#f0c9a4', '#e3b088', '#cf9364', '#b87a4e'] as const;
const HAIR = ['#2a1c12', '#3f2a17', '#5b3d20', '#7d5a2c'] as const;
const GEMS = ['#c026d3', '#dc2626', '#0ea5e9', '#16a34a'] as const;
const GREY = '#d8d2c6';

interface Look {
  skin: string;
  hair: string;
  gem: string;
  aged: boolean;
  beard: boolean;
  curly: boolean;
  browTilt: number;
}

/** 髭を蓄えはじめる年齢 */
const BEARD_MIN_AGE = 20;

function lookOf(id: string, age: number, allowBeard: boolean): Look {
  const rng = picker(hashString(id));
  const aged = age >= 50;
  return {
    skin: pick(rng, SKIN),
    hair: aged ? GREY : pick(rng, HAIR),
    gem: pick(rng, GEMS),
    aged,
    beard: allowBeard && age >= BEARD_MIN_AGE && rng() < 0.6,
    curly: rng() < 0.6,
    browTilt: rng() < 0.5 ? -1 : 1,
  };
}

/** 金・紫・大理石・肌の陰影。id が衝突しないよう uid を付ける */
function Defs({ uid, look, robe }: { uid: string; look: Look; robe: [string, string] }) {
  return (
    <defs>
      <linearGradient id={`gold-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fde68a" />
        <stop offset="45%" stopColor="#eab308" />
        <stop offset="100%" stopColor="#a16207" />
      </linearGradient>
      <linearGradient id={`robe-${uid}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={robe[0]} />
        <stop offset="100%" stopColor={robe[1]} />
      </linearGradient>
      <linearGradient id={`marble-${uid}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#5b4a52" />
        <stop offset="55%" stopColor="#3a2f38" />
        <stop offset="100%" stopColor="#221b23" />
      </linearGradient>
      {/*
        肌。黒を混ぜると顔が濁るので、外側も肌色のまま止めて
        陰影は別に薄い影を重ねて付ける
      */}
      <radialGradient id={`skin-${uid}`} cx="0.4" cy="0.32" r="0.85">
        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.3} />
        <stop offset="60%" stopColor={look.skin} />
        <stop offset="100%" stopColor={look.skin} />
      </radialGradient>
      {/* 金糸の刺繍 */}
      <pattern
        id={`emb-${uid}`}
        width={9}
        height={11}
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(8)"
      >
        <path d="M4.5,1.5 Q7,5 4.5,8.5 Q2,5 4.5,1.5 Z" fill="#f0c357" opacity={0.55} />
        <circle cx={4.5} cy={9.8} r={0.7} fill="#fde68a" opacity={0.45} />
      </pattern>
    </defs>
  );
}

/** 大理石の壁龕と玉座。人物の背景 */
function Niche({ uid }: { uid: string }) {
  return (
    <g>
      <path
        d="M2,128 L2,52 A48,46 0 0 1 98,52 L98,128 Z"
        fill={`url(#marble-${uid})`}
        stroke={`url(#gold-${uid})`}
        strokeWidth={2.2}
      />
      {/* 左右の柱 */}
      <g fill="#6b5a63" opacity={0.55}>
        <rect x={3} y={54} width={9} height={74} />
        <rect x={88} y={54} width={9} height={74} />
      </g>
      <g fill="#8d7a84" opacity={0.4}>
        <rect x={5} y={54} width={2.5} height={74} />
        <rect x={90} y={54} width={2.5} height={74} />
      </g>
      {/* 玉座の背もたれ */}
      <path d="M18,128 L18,60 A32,30 0 0 1 82,60 L82,128 Z" fill="#4a1d2e" opacity={0.85} />
      <path
        d="M18,128 L18,60 A32,30 0 0 1 82,60 L82,128"
        fill="none"
        stroke={`url(#gold-${uid})`}
        strokeWidth={1.6}
        opacity={0.9}
      />
    </g>
  );
}

/** 顔。冠や髪は呼び出し側が重ねる */
function Face({ uid, look }: { uid: string; look: Look }) {
  return (
    <g>
      {/* 首 */}
      <path d="M41,64 L59,64 L59,86 L41,86 Z" fill={look.skin} />
      <path d="M41,74 Q50,83 59,74 L59,86 L41,86 Z" fill="#00000022" />
      {/* 顔 */}
      <ellipse cx={50} cy={48} rx={20} ry={24.5} fill={`url(#skin-${uid})`} />
      {/* 右側の頬に落ちる影 */}
      <path d="M62,32 A20,24.5 0 0 1 62,64 A24,24 0 0 0 62,32 Z" fill="#00000014" />
      {/* 耳 */}
      <ellipse cx={29.5} cy={50} rx={4} ry={6} fill={look.skin} />
      <ellipse cx={70.5} cy={50} rx={4} ry={6} fill={look.skin} />
      {/* 眉 */}
      <path
        d={`M38,${41 + look.browTilt} Q43,37.5 47.5,${41 - look.browTilt}`}
        stroke={look.hair}
        strokeWidth={2.1}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M52.5,${41 - look.browTilt} Q57,37.5 62,${41 + look.browTilt}`}
        stroke={look.hair}
        strokeWidth={2.1}
        fill="none"
        strokeLinecap="round"
      />
      {/* 目 */}
      <ellipse cx={42.5} cy={47} rx={3.8} ry={2.5} fill="#fdfdfd" />
      <ellipse cx={57.5} cy={47} rx={3.8} ry={2.5} fill="#fdfdfd" />
      <circle cx={42.8} cy={47} r={1.8} fill="#3b2a1a" />
      <circle cx={57.8} cy={47} r={1.8} fill="#3b2a1a" />
      <circle cx={43.4} cy={46.3} r={0.6} fill="#ffffff" />
      <circle cx={58.4} cy={46.3} r={0.6} fill="#ffffff" />
      {/* 鼻 */}
      <path
        d="M50,47 L47.5,56 Q50,57.4 52.5,56"
        stroke="#00000038"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
      />
      {/* 口 */}
      <path d="M45.5,62 Q50,65 54.5,62" stroke="#9c4f45" strokeWidth={2} fill="none" strokeLinecap="round" />
      {look.aged && (
        <g stroke="#00000030" strokeWidth={1.1} fill="none" strokeLinecap="round">
          <path d="M34,54 Q36,57 34,60" />
          <path d="M66,54 Q64,57 66,60" />
        </g>
      )}
    </g>
  );
}

/** 帝室紫のローブ。金の縁取りと刺繍を重ねる */
function Robe({ uid, collar }: { uid: string; collar: React.ReactNode }) {
  const body = 'M8,128 Q14,94 36,84 L64,84 Q86,94 92,128 Z';
  return (
    <g>
      <path d={body} fill={`url(#robe-${uid})`} />
      <path d={body} fill={`url(#emb-${uid})`} />
      {/* 前身頃の帯 */}
      <path d="M42,84 L42,128 L58,128 L58,84 Z" fill="#00000033" />
      <path
        d="M42,84 L42,128 M58,84 L58,128"
        stroke={`url(#gold-${uid})`}
        strokeWidth={2.4}
      />
      {/* 肩の縁取り */}
      <path
        d="M36,84 Q50,96 64,84"
        fill="none"
        stroke={`url(#gold-${uid})`}
        strokeWidth={3}
      />
      {collar}
    </g>
  );
}

/** 皇帝。宝石をちりばめた黄金の月桂冠と帝室紫のトガ */
export function EmperorPortrait({
  ruler,
  year,
  className,
}: {
  /** 君主に限らない。家系図では継承候補も同じ絵で描く */
  ruler: DynastyMember;
  year: number;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const look = lookOf(ruler.id, year - ruler.birthYear, true);

  return (
    <svg viewBox="0 0 100 130" className={className} role="img" aria-label="皇帝の肖像">
      <Defs uid={uid} look={look} robe={['#6d28d9', '#4c1d95']} />
      <Niche uid={uid} />

      <Robe
        uid={uid}
        collar={
          <g>
            {/* 肩留めの黄金のフィブラ */}
            <circle cx={34} cy={90} r={4.6} fill={`url(#gold-${uid})`} stroke="#78350f" strokeWidth={0.8} />
            <circle cx={34} cy={90} r={1.9} fill={look.gem} />
          </g>
        }
      />

      {/* 髪 */}
      <path d="M27,46 Q29,20 50,20 Q71,20 73,46 Q69,34 50,32 Q31,34 27,46 Z" fill={look.hair} />
      {look.curly && (
        <g fill={look.hair}>
          {[32, 39, 46, 54, 61, 68].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 === 0 ? 26 : 24} r={5} />
          ))}
        </g>
      )}

      <Face uid={uid} look={look} />

      {look.beard && (
        <g fill={look.hair}>
          <path d="M32,52 Q33,74 50,76 Q67,74 68,52 Q63,65 50,66 Q37,65 32,52 Z" />
          <path d="M44,62 Q50,60 56,62 Q50,64 44,62 Z" fill="#00000022" />
        </g>
      )}

      {/* 宝石の月桂冠 */}
      <path d="M27,40 Q50,25 73,40" fill="none" stroke={`url(#gold-${uid})`} strokeWidth={4.4} />
      <g fill="#fde047">
        {[
          [30, 41],
          [36, 35.5],
          [43, 31.5],
          [57, 31.5],
          [64, 35.5],
          [70, 41],
        ].map(([x, y]) => (
          <ellipse
            key={x}
            cx={x}
            cy={y}
            rx={4}
            ry={2.1}
            transform={`rotate(${x < 50 ? -42 : 42} ${x} ${y})`}
          />
        ))}
      </g>
      <g>
        <circle cx={50} cy={28} r={4} fill={`url(#gold-${uid})`} stroke="#78350f" strokeWidth={0.8} />
        <circle cx={50} cy={28} r={2.1} fill={look.gem} />
        <circle cx={38} cy={33} r={1.6} fill={look.gem} />
        <circle cx={62} cy={33} r={1.6} fill={look.gem} />
      </g>
    </svg>
  );
}

/**
 * 皇后。出自によって装いが変わる。
 * 東ローマ帝室なら真珠を垂らした宝冠、蛮族の族長家なら編み込みと金環
 */
export function ConsortPortrait({
  spouse,
  className,
}: {
  spouse: Spouse;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const look = lookOf(spouse.id, 28, false);
  const east = spouse.origin.kind === 'east';

  return (
    <svg viewBox="0 0 100 130" className={className} role="img" aria-label="皇后の肖像">
      <Defs
        uid={uid}
        look={look}
        robe={east ? ['#7e22ce', '#4338ca'] : ['#9a3412', '#7c2d12']}
      />
      <Niche uid={uid} />

      <Robe
        uid={uid}
        collar={
          east ? (
            // 真珠の連なる首飾り
            <g>
              {[92, 98, 104].map((y, i) => (
                <path
                  key={y}
                  d={`M${36 + i * 1.5},86 Q50,${y} ${64 - i * 1.5},86`}
                  fill="none"
                  stroke="#f8fafc"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeDasharray="0.2 3.4"
                />
              ))}
              <circle cx={50} cy={104} r={3.4} fill={`url(#gold-${uid})`} stroke="#78350f" strokeWidth={0.7} />
              <circle cx={50} cy={104} r={1.7} fill={look.gem} />
            </g>
          ) : (
            // 金の襟飾りと肩留め
            <g>
              <path d="M38,88 Q50,98 62,88" fill="none" stroke={`url(#gold-${uid})`} strokeWidth={2.6} />
              <circle cx={33} cy={92} r={4.4} fill={`url(#gold-${uid})`} stroke="#78350f" strokeWidth={0.8} />
              <circle cx={33} cy={92} r={1.8} fill={look.gem} />
            </g>
          )
        }
      />

      {/* 後ろ髪。顔の外側だけに広げ、顎の下は塗らない */}
      <ellipse cx={50} cy={48} rx={26} ry={29} fill={look.hair} />
      <path d="M24,52 Q20,80 27,96 L37,96 Q31,76 31,54 Z" fill={look.hair} />
      <path d="M76,52 Q80,80 73,96 L63,96 Q69,76 69,54 Z" fill={look.hair} />

      <Face uid={uid} look={look} />

      {/* 結い上げた髪 */}
      <path d="M27,48 Q28,19 50,19 Q72,19 73,48 Q68,31 50,29 Q32,31 27,48 Z" fill={look.hair} />

      {east ? (
        <>
          <ellipse cx={50} cy={18} rx={14} ry={8.5} fill={look.hair} />
          {/* 宝石の宝冠 */}
          <path d="M27,36 Q50,22 73,36" fill="none" stroke={`url(#gold-${uid})`} strokeWidth={4.6} />
          <g>
            <circle cx={50} cy={24} r={3.4} fill={`url(#gold-${uid})`} />
            <circle cx={50} cy={24} r={1.8} fill={look.gem} />
            <circle cx={40} cy={28} r={1.5} fill={look.gem} />
            <circle cx={60} cy={28} r={1.5} fill={look.gem} />
          </g>
          <g fill="#f8fafc" stroke="#cbd5e1" strokeWidth={0.5}>
            {[31, 37, 44, 56, 63, 69].map((x, i) => (
              <circle key={x} cx={x} cy={33 - Math.abs(2.5 - i) * 0.9} r={2.2} />
            ))}
          </g>
          {/* 垂れ飾り（ペンディリア） */}
          <g fill="#f8fafc" stroke="#cbd5e1" strokeWidth={0.4}>
            {[0, 1, 2, 3].map((i) => (
              <circle key={`l${i}`} cx={26.5} cy={42 + i * 6} r={2.1} />
            ))}
            {[0, 1, 2, 3].map((i) => (
              <circle key={`r${i}`} cx={73.5} cy={42 + i * 6} r={2.1} />
            ))}
          </g>
        </>
      ) : (
        <>
          {/* 編み込み */}
          <g fill={look.hair} stroke="#00000033" strokeWidth={0.8}>
            {[0, 1, 2, 3].map((i) => (
              <ellipse key={`l${i}`} cx={24} cy={56 + i * 9} rx={5.2} ry={5.6} />
            ))}
            {[0, 1, 2, 3].map((i) => (
              <ellipse key={`r${i}`} cx={76} cy={56 + i * 9} rx={5.2} ry={5.6} />
            ))}
          </g>
          {/* 金環と額飾り */}
          <path d="M28,35 Q50,25 72,35" fill="none" stroke={`url(#gold-${uid})`} strokeWidth={4} />
          <circle cx={50} cy={27.5} r={3} fill={`url(#gold-${uid})`} />
          <circle cx={50} cy={27.5} r={1.5} fill={look.gem} />
        </>
      )}
    </svg>
  );
}

/**
 * 表示用の肖像。事前生成した画像があればそれを、
 * 無ければ（読み込みに失敗した場合も）SVG の肖像を描く
 */
export function EmperorFigure({
  ruler,
  year,
  className,
}: {
  ruler: DynastyMember;
  year: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = selectPortrait(
    'emperor',
    emperorOriginOf(ruler),
    ageBandOf(year - ruler.birthYear),
    ruler.id,
  );

  if (url !== null && !failed) {
    return (
      <img
        src={url}
        className={className}
        alt="皇帝の肖像"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  return <EmperorPortrait ruler={ruler} year={year} className={className} />;
}

export function ConsortFigure({
  spouse,
  year,
  className,
}: {
  spouse: Spouse;
  year: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = selectPortrait(
    'consort',
    consortOriginOf(spouse),
    consortAgeBandOf(spouse, year),
    spouse.id,
  );

  if (url !== null && !failed) {
    return (
      <img
        src={url}
        className={className}
        alt="皇后の肖像"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  return <ConsortPortrait spouse={spouse} className={className} />;
}

/** 婚姻相手の呼び名。家門の名は core から引く */
export function consortOriginLabel(origin: MarriageOrigin, factionLabel: string): string {
  if (origin.kind === 'east') return '東ローマ帝室';
  if (origin.kind === 'roman') return `${romanHouseName(origin.houseId)}家`;
  return `${factionLabel}の族長家`;
}

/**
 * 軍司令官・蛮族の族長・東ローマ皇帝・ペルシア王の肖像。
 *
 * 君主や皇后と違い、これらは SVG の代替図を持たない。
 * 画像が無ければ何も描かず、呼び出し側が枠だけを出す
 */
export function LeaderFigure({
  role,
  origin,
  age,
  seedId,
  alt,
  className,
  file,
}: {
  role: PortraitRole;
  origin: PortraitOrigin;
  age: PortraitAge;
  seedId: string;
  alt: string;
  className?: string;
  /** 指定するとこのファイルを使う。勢力ごとに顔を固定するため */
  file?: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const url = file ? portraitUrl(file) : selectPortrait(role, origin, age, seedId);
  if (url === null || failed) return null;
  return (
    <img
      src={url}
      className={className}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
