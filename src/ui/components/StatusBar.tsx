import {
  MAX_EAST_RELATIONS,
  MAX_FOEDERATI_LOYALTY,
  MAX_LEGITIMACY,
  MAX_SENATE_SUPPORT,
  MAX_TAX_BASE,
  endingYearOf,
} from '../../core/constants';
import type { GameState } from '../../core/types';
import { DIFFICULTY_LABELS } from '../catalogue';
import type { Music } from '../music';

interface Stat {
  label: string;
  value: number;
  /** 目盛りの満量。国庫と野戦軍には上限が無いので null */
  full: number | null;
  warn: number;
  danger: number;
  /** 表示する桁 */
  digits: number;
}

/** 危険域は赤、警戒域は錆色、平時は墨色 */
function tone(value: number, warn: number, danger: number): string {
  if (value <= danger) return 'var(--oxblood)';
  if (value <= warn) return '#9a6b12';
  return 'var(--ink)';
}

/**
 * 状況表示。
 *
 * 数字だけでは「40 が高いのか低いのか」が読めないので、**目盛り**と
 * **前年からの増減**を添える。7パラメータそのものは増やしていない
 */
export function StatusBar({
  state,
  previous,
  music,
}: {
  state: GameState;
  /** 1年前の状態。増減を出すためだけに使う。初年や読み込み直後は null */
  previous: GameState | null;
  music: Music;
}) {
  const stats: Stat[] = [
    { label: '国庫', value: state.treasury, full: null, warn: 200, danger: 0, digits: 0 },
    { label: '税基盤', value: state.taxBase, full: MAX_TAX_BASE, warn: 40, danger: 20, digits: 0 },
    { label: '野戦軍', value: state.fieldArmy, full: null, warn: 30, danger: 10, digits: 0 },
    {
      label: '正統性',
      value: state.legitimacy,
      full: MAX_LEGITIMACY,
      warn: 35,
      danger: 20,
      digits: 0,
    },
    {
      label: '元老院',
      value: state.senateSupport,
      full: MAX_SENATE_SUPPORT,
      warn: 30,
      danger: 15,
      digits: 0,
    },
    {
      label: '東帝国',
      value: state.eastRelations,
      full: MAX_EAST_RELATIONS,
      warn: 30,
      danger: 15,
      digits: 0,
    },
    {
      label: '傭兵忠誠',
      value: state.foederatiLoyalty,
      full: MAX_FOEDERATI_LOYALTY,
      warn: 35,
      danger: 20,
      digits: 0,
    },
  ];

  const before: number[] | null =
    previous === null
      ? null
      : [
          previous.treasury,
          previous.taxBase,
          previous.fieldArmy,
          previous.legitimacy,
          previous.senateSupport,
          previous.eastRelations,
          previous.foederatiLoyalty,
        ];

  return (
    <div className="roman-tablet">
      <div className="flex items-baseline justify-between px-3 pt-2">
        <div className="roman-title text-lg">
          {state.year}
          <span className="text-xs font-normal ml-1" style={{ color: 'var(--ink-soft)' }}>
            年 / {endingYearOf(state.scenario)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-soft)' }}>
          <span>
            {DIFFICULTY_LABELS[state.difficulty]}
            {state.dynasty.abilitiesAdjusted && ' ・調整済み'}
          </span>
          <button
            onClick={music.toggle}
            aria-label={music.playing ? '音楽を止める' : '音楽を鳴らす'}
            className="px-1.5 py-0.5 rounded-sm"
            style={{ border: '1px solid var(--gold)', color: 'var(--ink-soft)' }}
          >
            {music.playing ? '♪' : '♪ 切'}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-x-2 gap-y-1 px-3 py-1.5">
        {stats.map((s, i) => (
          <Gauge key={s.label} stat={s} before={before === null ? null : before[i]} />
        ))}
      </div>
      <div className="roman-meander" />
    </div>
  );
}

/** 1つの数値。名前・値・前年からの増減・目盛り */
function Gauge({ stat, before }: { stat: Stat; before: number | null }) {
  const color = tone(stat.value, stat.warn, stat.danger);
  const delta = before === null ? null : Math.round(stat.value - before);
  const ratio = stat.full === null ? null : Math.max(0, Math.min(1, stat.value / stat.full));

  return (
    <div className="min-w-0">
      <div
        className="text-[10px] leading-tight truncate tracking-wider"
        style={{ color: 'var(--ink-soft)' }}
      >
        {stat.label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-semibold tabular-nums" style={{ color }}>
          {stat.value.toLocaleString(undefined, {
            maximumFractionDigits: stat.digits,
            minimumFractionDigits: stat.digits,
          })}
        </span>
        {delta !== null && delta !== 0 && (
          <span
            className="text-[10px] tabular-nums leading-none"
            style={{ color: delta > 0 ? '#2f6b34' : 'var(--oxblood)' }}
          >
            {delta > 0 ? '▲' : '▼'}
            {Math.abs(delta)}
          </span>
        )}
      </div>
      {/*
        目盛り。上限のある5つだけに引く。国庫と野戦軍は満量が無く、
        適量も状況で変わるので、色と増減だけで見せる。
        溝だけ出すと「常に空の器」に見えるので、無い側は場所だけ空ける
      */}
      <div
        className="h-[3px] rounded-full mt-0.5"
        style={{ background: ratio === null ? 'transparent' : 'rgba(90, 70, 40, 0.22)' }}
      >
        {ratio !== null && (
          <div
            className="h-full rounded-full"
            style={{ width: `${ratio * 100}%`, background: color }}
          />
        )}
      </div>
    </div>
  );
}
