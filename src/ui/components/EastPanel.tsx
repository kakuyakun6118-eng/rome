import type { GameState } from '../../core/types';
import { EAST_OWNER_LABELS, EAST_PROVINCE_LABELS } from '../catalogue';

/**
 * 東方戦線。統一シナリオでのみ出す。
 *
 * 東方属州は西の属州とは別の入れ物に入っていて地図の塗り分けにも
 * 出ないので、誰がどこを握っているかをここで一覧にする
 */
export function EastPanel({ state }: { state: GameState }) {
  if (state.scenario !== 'reunification') return null;

  const { east, persia } = state;
  const held = east.provinces.filter((p) => p.owner === 'west').length;
  const atWar = east.stance === 'war';

  return (
    <section className="roman-panel rounded-sm p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="roman-heading text-sm">東方戦線</h2>
        <span className="text-xs tabular-nums" style={{ color: 'var(--gold)' }}>
          {held} / {east.provinces.length} 州
        </span>
      </div>
      <div className="roman-rule mt-1" />

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span style={{ color: atWar ? 'var(--oxblood)' : 'var(--ink-soft)' }}>
          東ローマ: {atWar ? `交戦中（${east.warStartYear}年〜）` : '和平'}
          <span style={{ color: 'var(--ink-soft)' }}> ・軍 {Math.round(east.army)}</span>
        </span>
        <span style={{ color: persia.intervened ? 'var(--oxblood)' : 'var(--ink-soft)' }}>
          ペルシア:{' '}
          {persia.intervened
            ? `介入（${persia.interventionYear}年〜）・戦力 ${Math.round(persia.strength)}`
            : '静観'}
        </span>
      </div>

      <ul className="mt-2 space-y-1">
        {east.provinces.map((province) => (
          <li key={province.id} className="flex items-baseline justify-between gap-2 text-xs">
            <span style={{ color: 'var(--ink)' }}>{EAST_PROVINCE_LABELS[province.id]}</span>
            <span className="tabular-nums" style={{ color: ownerColor(province.owner) }}>
              {EAST_OWNER_LABELS[province.owner]}・支配 {Math.round(province.control)}
            </span>
          </li>
        ))}
      </ul>

      {!persia.intervened && atWar && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
          ローマ同士の内戦が長引けば、ペルシアが背後から動く
        </p>
      )}
    </section>
  );
}

function ownerColor(owner: 'east' | 'west' | 'persia'): string {
  if (owner === 'west') return 'var(--purple-deep)';
  if (owner === 'persia') return 'var(--oxblood)';
  return 'var(--ink-soft)';
}
