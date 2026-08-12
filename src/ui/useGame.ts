import { useCallback, useMemo, useState } from 'react';

import dynastyData from '../data/dynasty.json';
import eastData from '../data/east.json';
import persiaData from '../data/persia.json';
import generalData from '../data/general.json';
import factionsData from '../data/factions.json';
import provincesData from '../data/provinces.json';
import { MAX_ACTIONS_PER_TURN } from '../core/constants';
import { renameRuler } from '../core/dynasty';
import { createInitialState } from '../core/economy';
import { findEvent } from '../core/events';
import { deserialize, serialize, suggestFileName } from '../core/save';
import {
  advanceBattle,
  beginTurn,
  concludeBattle,
  consumesActionSlot,
  deployBattle,
  evaluateScore,
} from '../core/tick';
import type { BattleDeployment, BattleOrders } from '../core/battlefield';
import type {
  BarbarianFaction,
  Difficulty,
  Dynasty,
  EastEmpire,
  GameState,
  GeneralSeat,
  Persia,
  PlayerAction,
  PlayerActions,
  Province,
  Scenario,
} from '../core/types';
import { FACTION_LABELS, PROVINCE_LABELS, TURN_EVENT_LABELS } from './catalogue';
import { deriveTurnMotion, NO_MOTION, type TurnMotion } from './movements';

/**
 * 画面の状態と core への橋渡しだけを行う。
 * 計算はすべて core/ の関数に任せ、ここには計算式を書かない
 */
export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [runSeed, setRunSeed] = useState(0);
  const [selected, setSelected] = useState<PlayerAction[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** 直前のターンに地図上で起きた進軍と戦闘。表示のためだけの派生値 */
  const [motion, setMotion] = useState<TurnMotion>(NO_MOTION);
  /**
   * 1年前の状態。状況表示に前年からの増減を添えるために持つ。
   * 表示のためだけの控えで、どの計算にも渡さない
   */
  const [previous, setPrevious] = useState<GameState | null>(null);

  const start = useCallback((difficulty: Difficulty, rulerName: string, scenario: Scenario) => {
    // 乱数の種はここで一度だけ引く。tick() 自体は seed から決定的に動く
    setRunSeed(Math.floor(Math.random() * 1_000_000_000));
    const reunification = scenario === 'reunification';
    const fresh = createInitialState(
      provincesData as Province[],
      factionsData as BarbarianFaction[],
      // JSON をそのまま渡すと複数プレイで共有されるため複製する
      JSON.parse(JSON.stringify(dynastyData)) as Dynasty,
      JSON.parse(JSON.stringify(generalData)) as GeneralSeat,
      difficulty,
      scenario,
      // 史実シナリオでは東もペルシアも実体を持たない
      reunification ? (JSON.parse(JSON.stringify(eastData)) as EastEmpire) : undefined,
      reunification ? (JSON.parse(JSON.stringify(persiaData)) as Persia) : undefined,
    );
    setState(renameRuler(fresh, rulerName));
    setSelected([]);
    setLog([]);
    setMotion(NO_MOTION);
    setPrevious(null);
  }, []);

  const toggleAction = useCallback((action: PlayerAction, key: string) => {
    setSelected((current) => {
      const existing = current.findIndex((a) => actionKey(a) === key);
      if (existing >= 0) return current.filter((_, i) => i !== existing);
      // 要求への応答は枠を消費しないので、上限の判定から外す
      if (
        consumesActionSlot(action) &&
        current.filter(consumesActionSlot).length >= MAX_ACTIONS_PER_TURN
      ) {
        return current;
      }
      return [...current, action];
    });
  }, []);

  const clearActions = useCallback(() => setSelected([]), []);

  /** 在位中の皇帝の名を付け替える。表示だけの変更でターンは進まない */
  const rename = useCallback((name: string) => {
    setState((current) => (current === null ? current : renameRuler(current, name)));
  }, []);

  /*
   * setState の更新関数の中で他の状態を触らない。
   * React は更新関数を複数回呼ぶことがあり、副作用を持たせると
   * 記録が二重に積まれる（実際に全行が二重に出ていた）
   */
  const endTurn = useCallback(() => {
    if (state === null || state.status !== 'ongoing') return;
    /*
     * 枠の勘定は tick() が行う。ここで一律に切ると、枠を消費しない
     * 行動（要求への応答・官職の任命）が3つめ以降に来たときに
     * 黙って捨てられる
     */
    const applied = selected;
    /*
     * 会戦が選ばれていれば beginTurn() は年を進めず戦場を開く。
     * その場合の記録と進軍は concludeBattle() の側で作る
     */
    const next = beginTurn(state, applied as PlayerActions, runSeed + state.turn);
    setState(next);
    if (next.battlefield !== null) return;
    setPrevious(state);
    setLog((entries) => [describeTurn(state, next), ...entries].slice(0, 40));
    setMotion(deriveTurnMotion(state, next, applied));
    setSelected([]);
  }, [state, selected, runSeed]);

  /** 戦場に布陣する。年はまだ進まない */
  const deploy = useCallback((deployment: BattleDeployment) => {
    setState((current) => (current === null ? current : deployBattle(current, deployment)));
  }, []);

  /*
   * 一度の激突。乱数の種は年と激突の回数からずらす。
   * 同じ種を使い回すと、どの回も同じ目になる
   */
  const fight = useCallback(
    (orders: BattleOrders) => {
      setState((current) =>
        current === null || current.battlefield === null
          ? current
          : advanceBattle(
              current,
              orders,
              runSeed + current.turn * 100 + current.battlefield.round,
            ),
      );
    },
    [runSeed],
  );

  /** 決着した戦場を畳み、預けていた行動でその年を進める */
  const finishBattle = useCallback(() => {
    if (state === null || state.battlefield === null) return;
    const applied = state.battlefield.pendingActions;
    const next = concludeBattle(state, runSeed + state.turn);
    setState(next);
    setPrevious(state);
    setLog((entries) => [describeTurn(state, next), ...entries].slice(0, 40));
    setMotion(deriveTurnMotion(state, next, applied));
    setSelected([]);
  }, [state, runSeed]);

  const save = useCallback(() => {
    if (state === null) return;
    download(serialize(state, new Date().toISOString()), suggestFileName(state));
  }, [state]);

  const load = useCallback(async (file: File) => {
    const result = deserialize(await file.text());
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setRunSeed(Math.floor(Math.random() * 1_000_000_000));
    setState(result.state);
    setSelected([]);
    setLog([`${result.state.year}年 — セーブデータを読み込んだ`]);
    setMotion(NO_MOTION);
    // 読み込んだ直後は比べる前年が無い
    setPrevious(null);
  }, []);

  const quit = useCallback(() => {
    setState(null);
    setSelected([]);
    setLog([]);
    setMotion(NO_MOTION);
    setPrevious(null);
  }, []);

  const score = useMemo(() => (state ? evaluateScore(state) : null), [state]);

  return {
    state,
    previous,
    selected,
    log,
    score,
    loadError,
    motion,
    start,
    toggleAction,
    clearActions,
    rename,
    endTurn,
    deploy,
    fight,
    finishBattle,
    quit,
    save,
    load,
  };
}

/** 選択済み判定のための一意キー。表示用であって計算ではない */
export function actionKey(action: PlayerAction): string {
  const parts: string[] = [action.type];
  if ('factionId' in action) parts.push(action.factionId);
  if ('provinceId' in action) parts.push(action.provinceId);
  // 同じ官職の候補どうしを区別する。入れないと3人の候補が同じキーになる
  if ('officialId' in action) parts.push(action.officialId);
  if ('target' in action) {
    parts.push(
      action.target.kind === 'east'
        ? 'east'
        : action.target.kind === 'roman'
          ? action.target.houseId
          : action.target.factionId,
    );
  }
  // 会戦は「誰と戦うか」と「誰が率いるか」で別の行動になる
  if ('foe' in action) {
    parts.push(action.foe.kind === 'barbarian' ? action.foe.factionId : action.foe.kind);
    parts.push(action.leader);
    // 動員する属州が変われば別の行動として扱う
    if (action.mobilize && action.mobilize.length > 0) parts.push(action.mobilize.join('+'));
  }
  if ('usurperId' in action) parts.push(action.usurperId);
  return parts.join(':');
}

/** 1ターンで何が起きたかを日本語にする。差分を読むだけで計算はしない */
function describeTurn(before: GameState, after: GameState): string {
  const events: string[] = [];

  const treasuryDelta = Math.round(after.treasury - before.treasury);
  events.push(`国庫 ${treasuryDelta >= 0 ? '+' : ''}${treasuryDelta}`);

  // 状態の差分からは読み取れない出来事は core が記録している
  for (const id of after.turnEvents) events.push(TURN_EVENT_LABELS[id]);

  if (after.dynasty.history.length > before.dynasty.history.length) {
    const record = after.dynasty.history[after.dynasty.history.length - 1];
    events.push(
      `${record.name}${record.cause === 'assassination' ? 'が暗殺された' : 'が崩御した'}`,
      record.outcome === 'crisis'
        ? '継承危機'
        : `${after.dynasty.ruler.name}が継承（${
            record.outcome === 'heir' ? '嫡子' : '兄弟・傍系'
          }）`,
    );
  }

  for (const id of after.firedEventIds) {
    if (before.firedEventIds.includes(id)) continue;
    const event = findEvent(id);
    if (event) events.push(`【${event.title}】`);
  }

  for (const id of Object.keys(after.provinces) as (keyof typeof after.provinces)[]) {
    if (before.provinces[id].control > 0 && after.provinces[id].control <= 0) {
      events.push(`${PROVINCE_LABELS[id]} を喪失`);
    }
  }

  for (const id of Object.keys(after.factions) as (keyof typeof after.factions)[]) {
    const was = before.factions[id].stance;
    const now = after.factions[id].stance;
    if (was === now) continue;
    if (now === 'settled') events.push(`${FACTION_LABELS[id]} が定住`);
    else if (now === 'foederati') events.push(`${FACTION_LABELS[id]} と同盟`);
    else if (was === 'foederati') events.push(`${FACTION_LABELS[id]} が離反`);
  }

  return `${after.year}年 — ${events.join(' / ')}`;
}

/** 文字列をファイルとして保存させる。ブラウザ固有の処理なので ui 側に置く */
function download(contents: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
