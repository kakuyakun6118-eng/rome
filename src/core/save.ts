import { SAVE_VERSION } from './constants';
import type { GameState } from './types';

export interface SaveFile {
  version: number;
  savedAt: string;
  state: GameState;
}

export type LoadResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };

/** state を JSON 化する。UI はこの文字列をダウンロードさせるだけ */
export function serialize(state: GameState, savedAt: string): string {
  const save: SaveFile = { version: SAVE_VERSION, savedAt, state };
  return JSON.stringify(save, null, 2);
}

const REQUIRED_NUMBERS: (keyof GameState)[] = [
  'turn',
  'year',
  'treasury',
  'taxBase',
  'fieldArmy',
  'legitimacy',
  'senateSupport',
  'eastRelations',
  'foederatiLoyalty',
];

/**
 * セーブデータを読み込む。
 * 壊れたファイルや別バージョンを読み込んで静かに不正な状態で
 * 動き続けないよう、ここで弾く
 */
export function deserialize(json: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'JSON として読めません' };
  }

  if (parsed === null || typeof parsed !== 'object') {
    return { ok: false, error: 'セーブデータの形式が違います' };
  }

  const save = parsed as Partial<SaveFile>;
  if (save.version !== SAVE_VERSION) {
    return {
      ok: false,
      error: `対応していないセーブ形式です（版 ${String(save.version)} / 対応 ${SAVE_VERSION}）`,
    };
  }

  const state = save.state;
  if (state === null || typeof state !== 'object') {
    return { ok: false, error: 'セーブデータに状態が入っていません' };
  }

  for (const key of REQUIRED_NUMBERS) {
    if (!Number.isFinite(state[key] as number)) {
      return { ok: false, error: `状態が壊れています（${key}）` };
    }
  }
  if (
    state.provinces === undefined ||
    state.factions === undefined ||
    state.dynasty === undefined ||
    state.difficulty === undefined
  ) {
    return { ok: false, error: '状態に不足があります' };
  }
  if (state.general === undefined || !Array.isArray(state.general.history)) {
    return { ok: false, error: '状態が壊れています（general）' };
  }
  if (
    state.prefect === undefined ||
    !Array.isArray(state.prefect.candidates) ||
    state.governors === undefined
  ) {
    return { ok: false, error: '状態が壊れています（官職）' };
  }
  if (state.scenario === undefined) {
    return { ok: false, error: '状態に不足があります（scenario）' };
  }
  if (state.east === undefined || !Array.isArray(state.east.provinces)) {
    return { ok: false, error: '状態が壊れています（east）' };
  }
  if (state.persia === undefined || !Array.isArray(state.persia.seizedProvinces)) {
    return { ok: false, error: '状態が壊れています（persia）' };
  }
  if (!Array.isArray(state.firedEventIds)) {
    return { ok: false, error: '状態が壊れています（firedEventIds）' };
  }

  /*
   * turnEvents はその年のあいだしか意味を持たない一時的な記録なので、
   * 無ければ空で補う。これだけのために古いセーブを弾かない
   */
  if (!Array.isArray(state.turnEvents)) {
    return { ok: true, state: { ...state, turnEvents: [] } };
  }

  return { ok: true, state };
}

/** 保存ファイル名。年・シナリオ・難易度が分かるようにする */
export function suggestFileName(state: GameState): string {
  return `western-rome-${state.year}-${state.scenario}-${state.difficulty}.json`;
}
