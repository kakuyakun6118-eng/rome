import { ABILITY_NEUTRAL, GOVERNOR_APPOINT_COST, PREFECT_APPOINT_COST } from '../../core/constants';
import type {
  BarbarianFactionId,
  GameState,
  GovernedId,
  Official,
  PlayerAction,
  ProvinceId,
} from '../../core/types';
import { FACTION_LABELS, PROVINCE_LABELS } from '../catalogue';

/**
 * 宮廷の顔ぶれ — プラエトリア長官と属州総督。
 *
 * 任命は行動枠を消費しないので、行動カードの一覧ではなくここに置く。
 * 「今年の2手」とは別の判断であることを画面の位置でも示す。
 *
 * 長官は軍の指揮官ではなく、税務と属州行政の長。
 * 軍を率いるのは君主の欄にある軍司令官のほう
 */
export function CourtPanel({
  state,
  selected,
  onToggle,
}: {
  state: GameState;
  selected: PlayerAction[];
  onToggle: (action: PlayerAction, key: string) => void;
}) {
  /*
   * 席のある土地。属州は常にあり、征服した郷里は併合した年に席ができる。
   * 郷里は属州のあとに並べて、境外の土地であることが読めるようにする
   */
  const seatIds = Object.keys(state.governors) as GovernedId[];
  const provinceIds = seatIds.filter((id): id is ProvinceId => id in state.provinces);
  const homelandIds = seatIds.filter((id) => !(id in state.provinces)) as BarbarianFactionId[];

  return (
    <section className="roman-panel rounded-sm p-3">
      <h2 className="roman-heading text-sm">宮廷と属州</h2>
      <div className="roman-rule mt-1" />
      <p className="mt-1 text-[11px]" style={{ color: 'var(--ink-soft)' }}>
        任命は行動枠を消費しない。空位のままだと減収と守りの薄さが続く
      </p>

      <Seat
        title="プラエトリア長官"
        note="税収と元老院の支持に効く。軍は指揮しない"
        official={state.prefect.current}
        candidates={state.prefect.candidates}
        cost={PREFECT_APPOINT_COST}
        treasury={state.treasury}
        year={state.year}
        selected={selected}
        onToggle={onToggle}
        buildAppoint={(officialId) => ({ type: 'appoint_prefect', officialId })}
      />

      <div className="mt-3 space-y-2">
        {provinceIds.map((id) => (
          <Seat
            key={id}
            title={`${PROVINCE_LABELS[id]} 総督`}
            note="その属州の守りと立て直しに効く"
            official={state.governors[id]?.current ?? null}
            candidates={state.governors[id]?.candidates ?? []}
            cost={GOVERNOR_APPOINT_COST}
            treasury={state.treasury}
            year={state.year}
            selected={selected}
            onToggle={onToggle}
            buildAppoint={(officialId) => ({ type: 'appoint_governor', provinceId: id, officialId })}
            compact
          />
        ))}
        {/* 征服した郷里。境外の土地なので属州のあとに並べる */}
        {homelandIds.map((id) => (
          <Seat
            key={id}
            title={`${state.homelands[id]?.name ?? FACTION_LABELS[id]} 総督`}
            note={`${FACTION_LABELS[id]}の旧領。守りと立て直しに効く`}
            official={state.governors[id]?.current ?? null}
            candidates={state.governors[id]?.candidates ?? []}
            cost={GOVERNOR_APPOINT_COST}
            treasury={state.treasury}
            year={state.year}
            selected={selected}
            onToggle={onToggle}
            buildAppoint={(officialId) => ({ type: 'appoint_governor', provinceId: id, officialId })}
            compact
          />
        ))}
      </div>
    </section>
  );
}

function Seat({
  title,
  note,
  official,
  candidates,
  cost,
  treasury,
  year,
  selected,
  onToggle,
  buildAppoint,
  compact,
}: {
  title: string;
  note: string;
  official: Official | null;
  candidates: Official[];
  cost: number;
  treasury: number;
  year: number;
  selected: PlayerAction[];
  onToggle: (action: PlayerAction, key: string) => void;
  buildAppoint: (officialId: string) => PlayerAction;
  compact?: boolean;
}) {
  if (official !== null) {
    return (
      <div className={compact ? 'text-xs' : 'mt-2 text-xs'}>
        {/*
          名前は長さがまちまちなので、はみ出す分は省略して1行に収める。
          折り返させると「マッリウス・テ / オドルス」のように
          途中で切れて読みにくい。全体は title 属性で読める
        */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate" style={{ color: 'var(--ink)' }} title={official.name}>
            <span className="roman-heading text-xs">{title}</span>{' '}
            <span style={{ color: 'var(--purple-deep)' }}>{official.name}</span>
          </span>
          <span className="tabular-nums shrink-0" style={{ color: 'var(--ink-soft)' }}>
            能力{official.ability}・野心{official.ambition}・{year - official.appointedYear}年
          </span>
        </div>
        {!compact && (
          <div className="text-[11px]" style={{ color: 'var(--ink-soft)' }}>
            {note}
          </div>
        )}
        {official.ambition > ABILITY_NEUTRAL && (
          <div className="text-[11px]" style={{ color: 'var(--oxblood)' }}>
            野心が強い。帝位が揺らげば離反しかねない
          </div>
        )}
      </div>
    );
  }

  const affordable = treasury >= cost;
  return (
    <div
      className={compact ? 'rounded-sm px-2 py-1.5' : 'mt-2 rounded-sm px-2 py-1.5'}
      style={{ border: '1px solid var(--oxblood)', background: 'rgba(139, 35, 49, 0.08)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="roman-heading text-xs">{title}</span>
        <span className="text-[11px]" style={{ color: 'var(--oxblood)' }}>
          空位 — {cost} ソリドゥス
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {candidates.map((candidate) => {
          const action = buildAppoint(candidate.id);
          const key = `${action.type}:${candidate.id}`;
          const isSelected = selected.some(
            (a) => a.type === action.type && 'officialId' in a && a.officialId === candidate.id,
          );
          return (
            <button
              key={candidate.id}
              disabled={!affordable && !isSelected}
              onClick={() => onToggle(action, key)}
              className="rounded-sm px-2 py-1 text-[11px]"
              style={
                isSelected
                  ? {
                      border: '1px solid var(--gold-bright)',
                      background: 'var(--purple-deep)',
                      color: 'var(--parchment)',
                    }
                  : {
                      border: '1px solid var(--bronze)',
                      background: affordable ? 'var(--parchment)' : 'var(--parchment-dim)',
                      color: affordable ? 'var(--ink)' : '#9a8a6e',
                    }
              }
            >
              {candidate.name}
              <span style={{ opacity: 0.8 }}>
                {' '}
                能力{candidate.ability}・野心{candidate.ambition}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
