import { ADULT_AGE } from '../../core/constants';
import type { DeathRecord, DynastyMember, GameState } from '../../core/types';
import { FACTION_LABELS } from '../catalogue';
import { ConsortFigure, EmperorFigure, consortOriginLabel } from './Portrait';

/**
 * 家系図。王朝の名に触れると開く。
 *
 * **血統が断裂すると王朝そのものが替わる**ので、歴代は一本の列ではなく
 * 王朝ごとの束になる。没した皇帝の記録に残した `dynastyName` で束ね、
 * 古い順に並べる。
 *
 * 表示だけの画面で、ここに計算式は書かない
 */
export function DynastyTree({ state, onClose }: { state: GameState; onClose: () => void }) {
  const { dynasty } = state;
  const houses = groupByDynasty(dynasty.history, dynasty.name, dynasty.foundedYear);

  return (
    <div
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(20, 8, 15, 0.62)' }}
      onClick={onClose}
    >
      <div
        className="roman-panel w-full max-w-lg rounded-sm max-h-[86dvh] overflow-y-auto"
        style={{ borderColor: 'var(--gold-bright)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="roman-tablet sticky top-0 z-10 flex items-baseline justify-between px-3 py-2"
          style={{ borderWidth: '0 0 1px 0' }}
        >
          <h2 className="roman-title text-base">
            {dynasty.name}朝
            <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--ink-soft)' }}>
              {dynasty.foundedYear}年 興る ／ 第{dynasty.history.length + 1}代
            </span>
          </h2>
          <button
            onClick={onClose}
            className="px-2 py-0.5 rounded-sm text-xs"
            style={{ border: '1px solid var(--bronze)', color: 'var(--ink-soft)' }}
          >
            閉じる
          </button>
        </header>

        <div className="px-3 py-3 space-y-3">
          <CurrentGeneration state={state} />

          {/* 歴代。王朝ごとに束ねて古い順に並べる */}
          {houses.length > 0 && (
            <section>
              <h3 className="roman-heading text-xs">歴代</h3>
              <div className="roman-rule mt-1 mb-2" />
              <ol className="space-y-2">
                {houses.map((house) => (
                  <li key={`${house.name}:${house.from}`}>
                    <div
                      className="text-[11px] font-semibold"
                      style={{ color: 'var(--purple)' }}
                    >
                      {house.name}朝
                      <span className="ml-1 font-normal" style={{ color: 'var(--ink-soft)' }}>
                        {house.current
                          ? `${house.from ?? '?'}年〜`
                          : `${house.from === null ? '' : `${house.from}〜`}${house.to}年`}
                      </span>
                    </div>
                    <ul
                      className="mt-0.5 space-y-0.5 pl-2"
                      style={{ borderLeft: '2px solid var(--gold)' }}
                    >
                      {house.rulers.map((record) => (
                        <li key={record.rulerId} className="text-[11px]">
                          <span style={{ color: 'var(--ink)' }}>{record.name}</span>
                          <span style={{ color: 'var(--ink-soft)' }}>
                            {' '}— {record.year}年{' '}
                            {record.cause === 'assassination' ? '暗殺' : '崩御'}
                          </span>
                          {record.outcome === 'crisis' && (
                            <span style={{ color: 'var(--oxblood)' }}> ／ 一族が尽き血統は絶えた</span>
                          )}
                          {record.outcome === 'sibling' && (
                            <span style={{ color: 'var(--ink-soft)' }}> ／ 子がなく傍系が継いだ</span>
                          )}
                        </li>
                      ))}
                      {house.current && (
                        <li className="text-[11px]" style={{ color: 'var(--gold)' }}>
                          {dynasty.ruler.name} — 在位中
                        </li>
                      )}
                    </ul>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/** 今の代 — 皇帝と皇后、そしてその子 */
function CurrentGeneration({ state }: { state: GameState }) {
  const { ruler, members } = state.dynasty;
  const spouse = ruler.spouse;
  /** 皇帝の子と、それ以外の一族（傍系）を分ける */
  const children = members.filter((m) => ruler.childIds.includes(m.id));
  const kin = members.filter((m) => !ruler.childIds.includes(m.id));

  return (
    <section>
      <h3 className="roman-heading text-xs">今の代</h3>
      <div className="roman-rule mt-1 mb-2" />

      <div className="flex items-start gap-2">
        <Person member={ruler} year={state.year} caption="皇帝" highlight />
        {spouse && (
          <figure className="shrink-0 text-center w-16">
            <ConsortFigure
              spouse={spouse}
              year={state.year}
              className="w-16 h-auto rounded-sm"
              // 皇后の枠は皇帝と揃える
            />
            <figcaption className="text-[10px] leading-tight mt-0.5">
              <div style={{ color: 'var(--purple)' }}>皇后</div>
              <div className="truncate" style={{ color: 'var(--ink-soft)' }}>
                {consortOriginLabel(
                  spouse.origin,
                  spouse.origin.kind === 'barbarian'
                    ? FACTION_LABELS[spouse.origin.factionId]
                    : '',
                )}
              </div>
            </figcaption>
          </figure>
        )}
      </div>

      {/* 子。継承の線はここから伸びる */}
      <div className="mt-2 pl-2" style={{ borderLeft: '2px solid var(--gold)' }}>
        <div className="text-[11px] mb-1" style={{ color: 'var(--ink-soft)' }}>
          子 {children.length}人
          {children.length === 0 && ' — 成人した嫡子がいないまま没すれば血統は絶える'}
        </div>
        {children.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {children.map((child) => (
              <Person key={child.id} member={child} year={state.year} caption="" />
            ))}
          </div>
        )}
      </div>

      {kin.length > 0 && (
        <div className="mt-2 pl-2" style={{ borderLeft: '2px dashed var(--bronze)' }}>
          <div className="text-[11px] mb-1" style={{ color: 'var(--ink-soft)' }}>
            傍系 {kin.length}人 — 帝位を狙って挙兵することがある
          </div>
          <div className="flex flex-wrap gap-2">
            {kin.map((member) => (
              <Person key={member.id} member={member} year={state.year} caption="" />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** 一族の1人。肖像と、年齢・能力・血統の札 */
function Person({
  member,
  year,
  caption,
  highlight,
}: {
  member: DynastyMember;
  year: number;
  caption: string;
  highlight?: boolean;
}) {
  const age = year - member.birthYear;
  const adult = age >= ADULT_AGE;
  const { military, governance, diplomacy } = member.abilities;

  return (
    <figure
      className="shrink-0 text-center w-16 rounded-sm overflow-hidden"
      style={highlight ? { boxShadow: '0 0 0 2px var(--gold-bright)' } : undefined}
    >
      <EmperorFigure ruler={member} year={year} className="w-16 h-auto block" />
      <figcaption className="text-[10px] leading-tight mt-0.5">
        {caption && <div style={{ color: 'var(--purple)' }}>{caption}</div>}
        <div className="truncate" style={{ color: 'var(--ink)' }} title={member.name}>
          {member.name}
        </div>
        <div style={{ color: adult ? 'var(--ink-soft)' : 'var(--oxblood)' }}>
          {age}歳{adult ? '' : '・未成年'}
        </div>
        <div className="tabular-nums" style={{ color: 'var(--ink-soft)' }}>
          {military}/{governance}/{diplomacy}
        </div>
        {member.mixedBlood && (
          <div style={{ color: 'var(--purple)' }}>
            混血
            {member.claims.length > 0 && `・請求権`}
          </div>
        )}
      </figcaption>
    </figure>
  );
}

interface House {
  name: string;
  /** 興った年。最初の王朝だけは辿れないので null になる */
  from: number | null;
  to: number;
  rulers: DeathRecord[];
  /** 今の王朝か。在位中の皇帝をこの束の末尾に添える */
  current: boolean;
}

/**
 * 没した皇帝の記録を王朝ごとに束ねる。
 *
 * 記録には没時の王朝名が入っているので、名が変わったところが
 * 王朝の切れ目になる。前の王朝が絶えた年が次の王朝の興った年で、
 * 在位中の王朝だけは `dynasty.foundedYear` から直に引く。
 *
 * **最初の王朝の興った年は辿れない。** `foundedYear` は代替わりで
 * 上書きされるので、一度でも断裂した局では開始時の値が残らない。
 * 推測で年を書かず、末年だけを出す
 */
function groupByDynasty(
  history: DeathRecord[],
  currentName: string,
  currentFoundedYear: number,
): House[] {
  const houses: House[] = [];
  for (const record of history) {
    const last = houses[houses.length - 1];
    if (last !== undefined && last.name === record.dynastyName) {
      last.rulers.push(record);
      last.to = record.year;
      continue;
    }
    houses.push({
      name: record.dynastyName,
      from: last?.to ?? null,
      to: record.year,
      rulers: [record],
      current: false,
    });
  }

  const last = houses[houses.length - 1];
  if (last !== undefined && last.name === currentName) {
    last.current = true;
    last.from = currentFoundedYear;
    return houses;
  }
  houses.push({
    name: currentName,
    from: currentFoundedYear,
    to: currentFoundedYear,
    rulers: [],
    current: true,
  });
  return houses;
}
