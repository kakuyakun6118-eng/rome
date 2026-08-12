import { useState } from 'react';

import { MAX_ACTIONS_PER_TURN, MOBILIZE_MAX_PROVINCES } from '../../core/constants';
import type {
  BarbarianFactionId,
  BattleLeader,
  EastProvinceId,
  GameState,
  PlayerAction,
  ProvinceId,
} from '../../core/types';
import {
  ACTION_TEMPLATES,
  BATTLE_LEADER_LABELS,
  battleFoeKey,
  battleFoeLabel,
  battleFoes,
  EAST_OWNER_LABELS,
  EAST_PROVINCE_LABELS,
  FACTION_LABELS,
  MARRIAGE_EAST_REQUIREMENT,
  MARRIAGE_ROMAN_REQUIREMENT,
  PROVINCE_LABELS,
  type ActionTemplate,
  type MarriageKind,
} from '../catalogue';
import { availableBattleLeaders, mobilizableProvinces } from '../../core/battle';
import { romanHouses } from '../../core/diplomacy';
import { invadableEastProvinces } from '../../core/east';
import { consumesActionSlot } from '../../core/tick';
import { actionKey } from '../useGame';

interface Props {
  state: GameState;
  selected: PlayerAction[];
  onToggle: (action: PlayerAction, key: string) => void;
}

const CATEGORIES = ['交渉', '雇用', '軍事', '内政', '東帝国'];

export function ActionPanel({ state, selected, onToggle }: Props) {
  const [openCategory, setOpenCategory] = useState<string>('軍事');
  // 要求への応答は枠を消費しないので、枠の残りには数えない
  const full = selected.filter(consumesActionSlot).length >= MAX_ACTIONS_PER_TURN;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            onClick={() => setOpenCategory(category)}
            className={
              openCategory === category
                ? 'roman-button px-3 py-1.5 rounded-full text-xs transition'
                : 'roman-panel px-3 py-1.5 rounded-full text-xs font-medium transition'
            }
          >
            {category}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {ACTION_TEMPLATES.filter(
          (t) =>
            t.category === openCategory &&
            // シナリオ指定のある行動は、そのシナリオでだけ出す
            (t.scenario === undefined || t.scenario === state.scenario),
        ).map((template) => (
          <ActionCard
            key={template.id}
            template={template}
            state={state}
            selected={selected}
            full={full}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

function ActionCard({
  template,
  state,
  selected,
  full,
  onToggle,
}: {
  template: ActionTemplate;
  state: GameState;
  selected: PlayerAction[];
  full: boolean;
  onToggle: (action: PlayerAction, key: string) => void;
}) {
  const provinceIds = Object.keys(state.provinces) as ProvinceId[];
  const allFactionIds = Object.keys(state.factions) as BarbarianFactionId[];
  /*
   * 郷里への遠征は、まだ取っていない土地だけが相手になる。
   * 相手の選び方が「勢力を選ぶ」点では他の交渉と同じなので、
   * factionFilter と同じ仕組みで候補を絞る
   */
  const baseIds =
    template.target === 'homeland'
      ? allFactionIds.filter((id) => {
          const homeland = state.homelands[id];
          // 郷里を持たない勢力は攻め込む先が無い
          if (homeland === undefined || homeland.owner === 'west') return false;
          // 給金を払っている相手の郷里は攻められない
          return state.factions[id].stance !== 'foederati';
        })
      : allFactionIds;
  const factionIds = template.factionFilter
    ? baseIds.filter((id) => template.factionFilter!(state, id))
    : baseIds;

  const [province, setProvince] = useState<ProvinceId>('Italia');
  const [eastProvince, setEastProvince] = useState<EastProvinceId>('Thracia');
  /*
   * 攻め込める東方属州は状況で変わる（講和するとペルシアが握る州だけになる）。
   * 選択中の州が候補から外れたら先頭に読み替え、無効な相手を掴んだまま
   * 枠を捨てることがないようにする
   */
  const invadable = invadableEastProvinces(state);
  const eastTarget = invadable.some((p) => p.id === eastProvince)
    ? eastProvince
    : invadable[0]?.id;
  const [faction, setFaction] = useState<BarbarianFactionId>('Visigoths');
  /** 婚姻の相手。既定はローマ貴族の家門（最も通りやすい縁組） */
  const [marriage, setMarriage] = useState<MarriageKind>('roman');
  const [house, setHouse] = useState<string>(romanHouses()[0].id);
  const [foeKey, setFoeKey] = useState<string>('');
  const [leader, setLeader] = useState<BattleLeader>('general');
  const [usurperId, setUsurperId] = useState<string>('');
  /** 会戦に動員する属州。守備隊の半分を戦場へ連れ出す */
  const [mobilize, setMobilize] = useState<ProvinceId[]>([]);

  // 会戦の相手と率いる者。どちらも状況で候補が変わるので先頭に読み替える
  const foes = battleFoes(state);
  const foe = foes.find((f) => battleFoeKey(f) === foeKey) ?? foes[0];
  const leaders = availableBattleLeaders(state);
  const battleLeader = leaders.includes(leader) ? leader : leaders[0];
  const usurper =
    state.usurpers.find((u) => u.id === usurperId) ?? state.usurpers[0];

  /*
   * 選択中の相手が候補から外れることがある（要求に答えた直後など）。
   * その場合は先頭の候補に読み替え、無効な相手を掴んだままにしない
   */
  const target = factionIds.includes(faction) ? faction : factionIds[0];

  const blocked = template.blockedReason(state);
  const action = template.build({
    province,
    faction: target,
    marriage: template.target === 'marriage' ? marriage : undefined,
    house,
    eastProvince: eastTarget,
    foe,
    leader: battleLeader,
    mobilize,
    usurperId: usurper?.id,
  });
  const key = action ? actionKey(action) : template.id;
  const isSelected = selected.some((a) => actionKey(a) === key);
  // 枠を消費しない行動は、枠が埋まっていても選べる
  const usesSlot = action === null || consumesActionSlot(action);
  const disabled = blocked !== null || action === null || (full && usesSlot && !isSelected);

  return (
    <div
      className="roman-panel rounded-sm p-3"
      style={
        isSelected
          ? { borderColor: 'var(--gold-bright)', boxShadow: '0 0 0 2px rgba(216, 171, 60, 0.45)' }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="roman-heading text-sm">
            {template.label}
            {template.cost !== null && (
              <span className="ml-2 text-xs font-normal" style={{ color: 'var(--gold)' }}>
                {template.cost} ソリドゥス
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ink-soft)' }}>
            {template.detail}
          </p>
        </div>
        <button
          onClick={() => action && onToggle(action, key)}
          disabled={disabled}
          className={
            disabled && !isSelected
              ? 'shrink-0 px-3 py-1.5 rounded-sm text-xs font-semibold'
              : 'roman-button shrink-0 px-3 py-1.5 rounded-sm text-xs transition'
          }
          style={
            disabled && !isSelected
              ? { background: 'var(--parchment-dim)', color: '#9a8a6e' }
              : undefined
          }
        >
          {isSelected ? '取消' : '選択'}
        </button>
      </div>

      {blocked && (
        <p className="text-xs mt-2" style={{ color: 'var(--oxblood)' }}>
          {blocked}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-2">
        {(template.target === 'province' || template.target === 'faction-province') && (
          <Select value={province} onChange={(v) => setProvince(v as ProvinceId)}>
            {provinceIds.map((id) => (
              <option key={id} value={id}>
                {PROVINCE_LABELS[id]}（支配 {Math.round(state.provinces[id].control)}）
              </option>
            ))}
          </Select>
        )}

        {template.target === 'east-province' && (
          <Select value={eastTarget ?? ''} onChange={(v) => setEastProvince(v as EastProvinceId)}>
            {invadable.map((p) => (
              <option key={p.id} value={p.id}>
                {EAST_PROVINCE_LABELS[p.id]}（{EAST_OWNER_LABELS[p.owner]}・支配{' '}
                {Math.round(p.control)}）
              </option>
            ))}
          </Select>
        )}

        {template.target === 'marriage' && (
          <>
            <Select value={marriage} onChange={(v) => setMarriage(v as MarriageKind)}>
              <option value="roman">
                ローマ貴族の娘（元老院支持 {MARRIAGE_ROMAN_REQUIREMENT} 以上）
              </option>
              <option value="barbarian">蛮族の族長家</option>
              <option value="east">
                東ローマ帝室（関係 {MARRIAGE_EAST_REQUIREMENT} 以上・成立しにくい）
              </option>
            </Select>
            {marriage === 'roman' && (
              <Select value={house} onChange={setHouse}>
                {romanHouses().map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}家
                  </option>
                ))}
              </Select>
            )}
          </>
        )}

        {template.target === 'battle' && foes.length > 0 && leaders.length > 0 && (
          <>
            <Select value={foe ? battleFoeKey(foe) : ''} onChange={setFoeKey}>
              {foes.map((f) => (
                <option key={battleFoeKey(f)} value={battleFoeKey(f)}>
                  {battleFoeLabel(f)}
                </option>
              ))}
            </Select>
            <Select value={battleLeader ?? ''} onChange={(v) => setLeader(v as BattleLeader)}>
              {leaders.map((l) => (
                <option key={l} value={l}>
                  {BATTLE_LEADER_LABELS[l]}
                </option>
              ))}
            </Select>
            {/* 属州からの動員。連れ出した守備隊はその属州から減る */}
            <div className="mt-1">
              <div className="text-[11px] mb-1" style={{ color: 'var(--ink-soft)' }}>
                属州から動員（{mobilize.length} / {MOBILIZE_MAX_PROVINCES}）—
                守備隊の半分を戦場へ連れ出す。その属州の守りは薄くなる
              </div>
              <div className="flex flex-wrap gap-1">
                {mobilizableProvinces(state).map((id) => {
                  const on = mobilize.includes(id);
                  return (
                    <button
                      key={id}
                      onClick={() =>
                        setMobilize((current) =>
                          current.includes(id)
                            ? current.filter((p) => p !== id)
                            : current.length >= MOBILIZE_MAX_PROVINCES
                              ? current
                              : [...current, id],
                        )
                      }
                      className="roman-panel rounded-sm px-2 py-1 text-[11px]"
                      style={
                        on
                          ? { borderColor: 'var(--gold)', color: 'var(--purple)', fontWeight: 600 }
                          : { color: 'var(--ink-soft)' }
                      }
                    >
                      {PROVINCE_LABELS[id]} {Math.round(state.provinces[id].garrison)}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {template.target === 'usurper' && state.usurpers.length > 0 && (
          <Select value={usurper?.id ?? ''} onChange={setUsurperId}>
            {state.usurpers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}（{u.emperorName}・兵 {Math.round(u.strength)}）
              </option>
            ))}
          </Select>
        )}

        {template.target === 'homeland' && (
          <Select value={target ?? ''} onChange={(v) => setFaction(v as BarbarianFactionId)}>
            {factionIds.map((id) => {
              const homeland = state.homelands[id];
              if (homeland === undefined) return null;
              return (
                <option key={id} value={id}>
                  {homeland.name}（{FACTION_LABELS[id]}・支配 {Math.round(homeland.control)}・兵{' '}
                  {Math.round(homeland.garrison)}）
                </option>
              );
            })}
          </Select>
        )}

        {(template.target === 'faction' ||
          template.target === 'faction-province' ||
          (template.target === 'marriage' && marriage === 'barbarian')) && (
          <Select value={target ?? ''} onChange={(v) => setFaction(v as BarbarianFactionId)}>
            {factionIds.map((id) => (
              <option key={id} value={id}>
                {FACTION_LABELS[id]}（
                {state.factions[id].stance === 'foederati'
                  ? '同盟'
                  : state.factions[id].stance === 'settled'
                    ? '定住'
                    : '敵対'}
                ・戦力 {Math.round(state.factions[id].strength)}）
              </option>
            ))}
          </Select>
        )}
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="roman-tablet flex-1 min-w-0 text-xs rounded-sm px-2 py-1.5"
    >
      {children}
    </select>
  );
}
