import type { GameState } from '../../core/types';
import {
  eastEmperorAge,
  eastEmperorName,
  generalAgeBand,
  generalName,
  persianKingAge,
  persianKingName,
} from '../leaders';
import { LeaderFigure } from './Portrait';

/**
 * 宮廷と隣の帝国の顔ぶれ — 軍司令官・東ローマ皇帝・ペルシア王。
 *
 * 名前は表示のためだけの情報で、どの計算式にも影響しない。
 * 東ローマ皇帝とサーサーン朝の王は実在の人物を実際の在位年で出す
 * （395年アルカディウス／バハラーム4世から、476年ゼノン／ペーローズ1世まで）。
 *
 * **蛮族の族長はここには並べない。** 14勢力ぶんの顔が常時ホーム画面を
 * 占めても、その年に関わりのない民のほうが多い。族長の顔は
 * 地図に触れたとき（PowerCard）と、実際に刃を交える会戦の画面で出す
 */
export function CourtFigures({ state }: { state: GameState }) {
  const general = state.general.current;
  const showEast = state.scenario === 'reunification';

  return (
    <section className="roman-panel rounded-sm p-3">
      <h2 className="roman-heading text-sm">宮廷と隣の帝国</h2>
      <div className="roman-rule mt-1" />

      <div className="mt-2 grid grid-cols-3 gap-2">
        {general !== null && (
          <Figure
            role="general"
            origin="roman"
            age={generalAgeBand(state.year - general.appointedYear, general.military)}
            seedId={general.id}
            title="軍司令官"
            name={generalName(general.id)}
            note={`軍事 ${general.military}`}
          />
        )}

{/*
          東ローマ皇帝は史実シナリオでも出す。属州や軍は持たないが、
          援軍要請や帝位の承認の相手として存在しているため。
          ペルシアは統一シナリオでしか登場しないのでそちらだけに出す
        */}
        <Figure
          role="eastemperor"
          origin="east"
          age={eastEmperorAge(state.year)}
          seedId={`east${eastEmperorName(state.year)}`}
          title="東ローマ皇帝"
          name={eastEmperorName(state.year)}
          note={
            state.east.stance === 'war' ? '交戦中' : `関係 ${Math.round(state.eastRelations)}`
          }
          hostile={state.east.stance === 'war'}
        />

        {showEast && (
          <Figure
            role="shah"
            origin="persia"
            age={persianKingAge(state.year)}
            seedId={`persia${persianKingName(state.year)}`}
            title="ペルシア王"
            name={persianKingName(state.year)}
            note={state.persia.intervened ? `戦力 ${Math.round(state.persia.strength)}` : '静観'}
            hostile={state.persia.intervened}
          />
        )}

      </div>
    </section>
  );
}


function Figure({
  role,
  origin,
  age,
  seedId,
  title,
  name,
  note,
  hostile,
  faded,
  file,
}: {
  role: 'general' | 'chief' | 'eastemperor' | 'shah';
  origin: 'roman' | 'barbarian' | 'east' | 'persia' | 'hun' | 'mauri';
  age: 'child' | 'youth' | 'adult' | 'elder';
  seedId: string;
  title: string;
  name: string;
  note: string;
  hostile?: boolean;
  faded?: boolean;
  file?: string | null;
}) {
  return (
    <figure
      className="rounded-sm overflow-hidden"
      style={{
        border: `1px solid ${hostile ? 'var(--oxblood)' : 'var(--bronze)'}`,
        background: 'var(--parchment)',
        opacity: faded ? 0.55 : 1,
      }}
    >
      <LeaderFigure
        role={role}
        origin={origin}
        age={age}
        seedId={seedId}
        file={file}
        alt={`${title}の肖像`}
        className="w-full h-auto block"
      />
      <figcaption className="px-1.5 py-1">
        <div className="text-[10px] leading-tight truncate" style={{ color: 'var(--ink-soft)' }}>
          {title}
        </div>
        <div
          className="text-[11px] leading-tight truncate"
          style={{ color: 'var(--purple-deep)' }}
          title={name}
        >
          {name}
        </div>
        <div className="text-[10px] leading-tight truncate" style={{ color: 'var(--ink-soft)' }}>
          {note}
        </div>
      </figcaption>
    </figure>
  );
}
