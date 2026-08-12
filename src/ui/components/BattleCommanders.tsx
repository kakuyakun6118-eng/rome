import { chiefMilitary } from '../../core/homelands';
import type { BattleFoe, Battlefield, GameState } from '../../core/types';
import { FACTION_LABELS } from '../catalogue';
import {
  chiefAgeBand,
  eastEmperorAge,
  eastEmperorName,
  factionLeaderName,
  factionPortraitFile,
  factionPortraitOrigin,
  generalAgeBand,
  generalName,
  hasDistinctPortraits,
  persianKingAge,
  persianKingName,
} from '../leaders';
import { EmperorFigure, LeaderFigure } from './Portrait';
import type { PortraitAge, PortraitOrigin, PortraitRole } from '../portraitAssets';

/**
 * 対陣 — 両軍を率いる者の顔。
 *
 * 蛮族の族長の顔をホーム画面に常時並べるのはやめ、**実際に刃を交える
 * この画面**に出す。誰と戦っているのかが顔で分かることが、地図の色と
 * 民を結び付ける役目をそのまま引き継ぐ。
 *
 * 軍事能力は `giveBattle()` と戦場の両方に効く既存の値をそのまま出す。
 * ここで計算はしない
 */
export function BattleCommanders({ state, field }: { state: GameState; field: Battlefield }) {
  const foe = describeFoe(state, field.foe);
  const ours = describeOurs(state, field);

  return (
    <section className="roman-panel rounded-sm px-2 py-2">
      <div className="flex items-stretch gap-2">
        <Side {...ours} align="left" />
        <div
          className="flex flex-col items-center justify-center px-1 shrink-0"
          style={{ color: 'var(--oxblood)' }}
        >
          <span className="roman-title text-sm">対</span>
        </div>
        <Side {...foe} align="right" hostile />
      </div>
    </section>
  );
}

interface SideView {
  title: string;
  name: string;
  military: number | null;
  note: string;
  portrait: {
    role: PortraitRole;
    origin: PortraitOrigin;
    age: PortraitAge;
    seedId: string;
    file?: string | null;
  } | null;
  /** 皇帝が親征する場合だけは君主の肖像をそのまま使う */
  ruler?: boolean;
}

function Side({
  title,
  name,
  military,
  note,
  portrait,
  ruler,
  align,
  hostile,
  state,
  year,
}: SideView & {
  align: 'left' | 'right';
  hostile?: boolean;
  state?: GameState;
  year?: number;
}) {
  const border = hostile ? 'var(--oxblood)' : 'var(--gold)';
  return (
    <figure
      className={`flex-1 min-w-0 flex gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}
    >
      <div
        className="shrink-0 w-14 rounded-sm overflow-hidden"
        style={{ border: `1px solid ${border}` }}
      >
        {ruler && state !== undefined && year !== undefined ? (
          <EmperorFigure ruler={state.dynasty.ruler} year={year} className="w-full h-auto block" />
        ) : portrait !== null ? (
          <LeaderFigure
            role={portrait.role}
            origin={portrait.origin}
            age={portrait.age}
            seedId={portrait.seedId}
            file={portrait.file}
            alt={`${title}の肖像`}
            className="w-full h-auto block"
          />
        ) : null}
      </div>
      <figcaption className="min-w-0 flex-1">
        <div className="text-[10px] leading-tight truncate" style={{ color: 'var(--ink-soft)' }}>
          {title}
        </div>
        <div
          className="text-xs leading-tight truncate font-semibold"
          style={{ color: hostile ? 'var(--oxblood)' : 'var(--purple-deep)' }}
          title={name}
        >
          {name || '—'}
        </div>
        {military !== null && (
          <div className="text-[11px] leading-tight tabular-nums" style={{ color: 'var(--ink)' }}>
            軍事 {military}
          </div>
        )}
        <div className="text-[10px] leading-tight truncate" style={{ color: 'var(--ink-soft)' }}>
          {note}
        </div>
      </figcaption>
    </figure>
  );
}

/** 敵側を率いる者。族長・東ローマ皇帝・ペルシア王のいずれか */
function describeFoe(state: GameState, foe: BattleFoe): SideView {
  if (foe.kind === 'barbarian') {
    const faction = state.factions[foe.factionId];
    const age = chiefAgeBand(faction.strength);
    return {
      title: `${FACTION_LABELS[foe.factionId]}の族長`,
      name: factionLeaderName(foe.factionId, state.year),
      military: chiefMilitary(foe.factionId, state.year),
      note: `戦力 ${Math.round(faction.strength)}`,
      portrait: {
        role: 'chief',
        origin: factionPortraitOrigin(foe.factionId),
        age,
        seedId: `${foe.factionId}:${factionLeaderName(foe.factionId, state.year)}`,
        // 専用の絵柄を持つ勢力は hash で引く。他は勢力ごとに顔を固定する
        file: hasDistinctPortraits(foe.factionId)
          ? null
          : factionPortraitFile(foe.factionId, age),
      },
    };
  }

  if (foe.kind === 'east') {
    return {
      title: '東ローマの司令官',
      name: state.east.commander.name || eastEmperorName(state.year),
      military: state.east.commander.military,
      note: `野戦軍 ${Math.round(state.east.army)}`,
      portrait: {
        role: 'eastemperor',
        origin: 'east',
        age: eastEmperorAge(state.year),
        seedId: `east${eastEmperorName(state.year)}`,
      },
    };
  }

  return {
    title: 'ペルシアの司令官',
    name: state.persia.commander.name || persianKingName(state.year),
    military: state.persia.commander.military,
    note: `戦力 ${Math.round(state.persia.strength)}`,
    portrait: {
      role: 'shah',
      origin: 'persia',
      age: persianKingAge(state.year),
      seedId: `persia${persianKingName(state.year)}`,
    },
  };
}

/** ローマ軍を率いる者。皇帝の親征か、軍司令官か */
function describeOurs(state: GameState, field: Battlefield): SideView & { state: GameState; year: number } {
  const base = { state, year: state.year };
  if (field.leader === 'ruler') {
    const ruler = state.dynasty.ruler;
    return {
      ...base,
      title: '皇帝の親征',
      name: ruler.name,
      military: ruler.abilities.military,
      note: '大敗すれば捕虜になる',
      portrait: null,
      ruler: true,
    };
  }

  const general = state.general.current;
  return {
    ...base,
    title: '軍司令官',
    name: general === null ? '空位' : generalName(general.id),
    military: general?.military ?? null,
    note: general === null ? '率いる者がいない' : '捕縛の危険はない',
    portrait:
      general === null
        ? null
        : {
            role: 'general',
            origin: 'roman',
            age: generalAgeBand(state.year - general.appointedYear, general.military),
            seedId: general.id,
          },
  };
}
