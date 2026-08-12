import { useState } from 'react';

import { ABILITY_NEUTRAL, ADULT_AGE } from '../../core/constants';
import type { GameState, Ruler } from '../../core/types';
import { FACTION_LABELS, RULER_NAME_MAX_LENGTH } from '../catalogue';
import { ChiRho } from './UnitSprite';
import { DynastyTree } from './DynastyTree';
import { ConsortFigure, EmperorFigure, consortOriginLabel } from './Portrait';

export function RulerPanel({
  state,
  onRename,
}: {
  state: GameState;
  onRename: (name: string) => void;
}) {
  const { ruler, members, crisisYearsRemaining, history } = state.dynasty;
  const heirs = members.filter((m) => state.year - m.birthYear >= ADULT_AGE);
  const spouse = ruler.spouse;
  /** 王朝の名に触れると家系図が開く */
  const [treeOpen, setTreeOpen] = useState(false);

  return (
    <div className="roman-panel-dark relative overflow-hidden rounded-sm p-3">
      {/*
       * 帝室の徽章としてラバルムを地紋に敷く。
       * 軍旗と同じ図をここでも使うことで、皇帝と軍が同じ標識の下にある
       * ことが画面から読める。文字を邪魔しないよう薄く、右端から欠けさせる
       */}
      <svg
        viewBox="-16 -16 32 32"
        aria-hidden
        className="pointer-events-none absolute -right-12 top-1 h-40 w-40"
        style={{ opacity: 0.14, zIndex: 0 }}
      >
        <ChiRho color="var(--gold-bright)" strokeWidth={2.6} />
      </svg>

      <div className="relative space-y-2" style={{ zIndex: 1 }}>
        <div className="flex gap-3">
          <figure className="shrink-0 text-center">
            <EmperorFigure
              ruler={ruler}
              year={state.year}
              className="w-20 h-auto rounded-md ring-1 ring-amber-700/50"
            />
            <figcaption className="text-[10px] mt-0.5" style={{ color: 'var(--gold-bright)' }}>
              皇帝 {state.year - ruler.birthYear}歳
            </figcaption>
          </figure>

          {spouse && (
            <figure className="shrink-0 text-center">
              <ConsortFigure
                spouse={spouse}
                year={state.year}
                className="w-20 h-auto rounded-md ring-1 ring-amber-700/50"
              />
              <figcaption className="text-[10px] mt-0.5" style={{ color: 'var(--gold-bright)' }}>
                皇后
              </figcaption>
            </figure>
          )}

          <div className="min-w-0 flex-1">
            <RulerName ruler={ruler} onRename={onRename} />
            <button
              onClick={() => setTreeOpen(true)}
              className="text-xs text-left"
              style={{ color: 'var(--gold-bright)' }}
            >
              <span style={{ textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                {state.dynasty.name}朝
              </span>
              <span> / 在位 {state.year - ruler.accessionYear} 年 / {history.length + 1} 代目</span>
              <span className="ml-1 text-[10px]" style={{ color: 'var(--gold)' }}>
                家系図
              </span>
            </button>
            {spouse && (
              <p className="text-[11px] mt-1 truncate" style={{ color: '#e8b06a' }}>
                {consortOriginLabel(
                  spouse.origin,
                  spouse.origin.kind === 'barbarian' ? FACTION_LABELS[spouse.origin.factionId] : '',
                )}
                と婚姻
              </p>
            )}
            <p className="text-xs mt-1">
              後継者{' '}
              <span
                style={{
                  color: heirs.length > 0 ? 'var(--parchment)' : '#f0a0a8',
                }}
              >
                {heirs.length > 0 ? `${heirs.length}人` : 'なし'}
              </span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Ability label="軍事" value={ruler.abilities.military} hint="戦闘の防御" />
          <Ability label="統治" value={ruler.abilities.governance} hint="税収・正統性" />
          <Ability label="交渉" value={ruler.abilities.diplomacy} hint="貢納・成立率" />
        </div>

        <div
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
          style={{ color: 'var(--gold-bright)' }}
        >
          {heirs.length === 0 && <span style={{ color: '#f0a0a8' }}>継承危機の恐れ</span>}
          {ruler.mixedBlood && <span>混血の君主</span>}
          {ruler.claims.length > 0 && (
            <span>請求権: {ruler.claims.map((c) => FACTION_LABELS[c]).join('・')}</span>
          )}
          {crisisYearsRemaining > 0 && (
            <span style={{ color: '#f0a0a8' }}>継承危機の余波 残り{crisisYearsRemaining}年</span>
          )}
        </div>

        <GeneralRow state={state} />
      </div>

      {treeOpen && <DynastyTree state={state} onClose={() => setTreeOpen(false)} />}
    </div>
  );
}

/**
 * 皇帝の名。触ると書き換えられる。
 * 代替わりのたびに名を付け直せるよう、開始時だけでなく在位中も開く
 */
function RulerName({ ruler, onRename }: { ruler: Ruler; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(ruler.name);

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(ruler.name);
          setEditing(true);
        }}
        className="flex items-baseline gap-1.5 text-left"
      >
        <h2 className="roman-title text-base" style={{ color: 'var(--parchment)' }}>
          {ruler.name}
        </h2>
        <span className="text-[10px]" style={{ color: 'var(--gold)' }}>
          改名
        </span>
      </button>
    );
  }

  const commit = () => {
    onRename(draft);
    setEditing(false);
  };

  return (
    <input
      autoFocus
      type="text"
      value={draft}
      maxLength={RULER_NAME_MAX_LENGTH}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="w-full rounded-sm px-1.5 py-0.5 text-sm font-semibold"
      style={{
        border: '1px solid var(--gold-bright)',
        background: 'var(--purple-deep)',
        color: 'var(--parchment)',
      }}
    />
  );
}

/**
 * 軍司令官。皇帝と並べて出す。
 * この時代の実権は皇帝ではなくこの職にあったので、
 * 王朝の欄の中に置いて「宮廷の顔ぶれ」として見せる
 */
function GeneralRow({ state }: { state: GameState }) {
  const general = state.general.current;

  if (general === null) {
    return (
      <div
        className="rounded-sm px-2.5 py-1.5 text-xs"
        style={{
          border: '1px solid #a8434f',
          background: 'rgba(139, 35, 49, 0.28)',
        }}
      >
        <span className="font-semibold" style={{ color: '#f0a0a8' }}>
          軍司令官 空位
        </span>
        <span style={{ color: 'var(--gold-bright)' }}> — 指揮官のいない軍は戦いに弱い</span>
      </div>
    );
  }

  const gap = general.military - ABILITY_NEUTRAL;
  return (
    <div
      className="rounded-sm px-2.5 py-1.5 text-xs"
      style={{
        border: '1px solid var(--gold)',
        background: 'rgba(20, 8, 15, 0.45)',
      }}
    >
      <span className="font-semibold" style={{ color: 'var(--parchment)' }}>
        軍司令官 <span style={{ color: 'var(--gold-bright)' }}>軍事 {general.military}</span>
      </span>
      <span style={{ color: 'var(--gold-bright)' }}>
        {' '}
        — 在職 {state.year - general.appointedYear} 年 / 第{state.general.history.length + 1} 代
      </span>
      {gap > 0 && (
        <div className="mt-0.5" style={{ color: '#e8b06a' }}>
          戦勝の名声が皇帝に入りにくく、正統性が余分に減る
        </div>
      )}
    </div>
  );
}

function Ability({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-sm px-2 py-1.5" style={{ background: 'rgba(20, 8, 15, 0.45)' }}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs" style={{ color: 'var(--gold-bright)' }}>
          {label}
        </span>
        <span className="text-base font-bold tabular-nums" style={{ color: 'var(--parchment)' }}>
          {value}
        </span>
      </div>
      <div className="text-[10px] truncate" style={{ color: '#b08a5e' }}>
        {hint}
      </div>
    </div>
  );
}
