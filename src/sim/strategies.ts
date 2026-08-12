import {
  CONSCRIPT_COST,
  PERSIA_IMPROVE_COST,
  DEFEND_COST,
  FOEDERATI_HIRE_COST,
  GENERAL_APPOINT_COST,
  GOVERNOR_APPOINT_COST,
  MARRIAGE_COST,
  MAX_ACTIONS_PER_TURN,
  PREFECT_APPOINT_COST,
} from '../core/constants';
import { consumesActionSlot } from '../core/tick';
import type {
  BarbarianFaction,
  GameState,
  PlayerAction,
  PlayerActions,
  GovernedId,
  ProvinceId,
} from '../core/types';

/**
 * ヘッドレス検証用の自動プレイ方針。
 * ゲームロジックではなく評価用のハーネスなので core/ には置かない。
 * 以下の閾値も方針AIの判断基準であってゲームルールではないため、
 * core/constants.ts ではなくこのファイルに置く
 */
export type Strategy = (state: GameState) => PlayerActions;

/** 限定使用: この兵力を下回ったときだけ蛮族を雇う */
const LIMITED_ARMY_FLOOR = 40;
/** 限定使用: 同時に抱えるフォエデラティの上限 */
const LIMITED_FOEDERATI_CAP = 2;
/** 元老院への譲歩を検討する支持の水準 */
const SENATE_SUPPORT_FLOOR = 40;

function hostileInProvinces(state: GameState): BarbarianFaction[] {
  return Object.values(state.factions).filter(
    (faction) => faction.stance === 'hostile' && faction.location !== 'exterior',
  );
}

/** 侵入を受けている属州のうち最も支配度が低いもの */
function mostThreatenedProvince(state: GameState): ProvinceId | null {
  const invaded = hostileInProvinces(state)
    .map((faction) => faction.location as ProvinceId)
    .sort((a, b) => state.provinces[a].control - state.provinces[b].control);
  return invaded[0] ?? null;
}

/**
 * 行動枠に収める。要求への応答は枠を消費しないので、
 * 枠を使う行動だけを MAX_ACTIONS_PER_TURN まで数える
 */
function pair(actions: PlayerAction[]): PlayerActions {
  const kept: PlayerAction[] = [];
  let slots = 0;
  for (const action of actions) {
    if (!consumesActionSlot(action)) {
      kept.push(action);
      continue;
    }
    if (slots >= MAX_ACTIONS_PER_TURN) continue;
    slots++;
    kept.push(action);
  }
  return kept;
}

/**
 * 枠を消費した行動の数。官職の任命は枠を消費しないので、
 * `actions.length` で数えると残り枠を読み違える
 */
function slotsUsed(actions: PlayerAction[]): number {
  return actions.filter(consumesActionSlot).length;
}

/** 何もしない。受動プレイの基準値 */
export const passive: Strategy = () => [];

/**
 * 正攻法。蛮族は雇わず、自前の軍と属州防衛で凌ぐ。
 * 元老院の支持を保ちながら軍を維持する
 */
export const defensive: Strategy = (state) => {
  const actions: PlayerAction[] = [...administer(state)];
  const threatened = mostThreatenedProvince(state);

  if (threatened) {
    actions.push({ type: 'military_deploy', provinceId: threatened });
    if (state.treasury > DEFEND_COST * 2) {
      actions.push({ type: 'military_defend', provinceId: threatened });
    }
  }

  if (slotsUsed(actions) < MAX_ACTIONS_PER_TURN && state.treasury > CONSCRIPT_COST * 2) {
    actions.push({ type: 'military_conscript' });
  }
  if (slotsUsed(actions) < MAX_ACTIONS_PER_TURN && state.senateSupport < SENATE_SUPPORT_FLOOR) {
    actions.push({ type: 'domestic_appease_senate' });
  }
  if (slotsUsed(actions) < MAX_ACTIONS_PER_TURN && state.treasury < CONSCRIPT_COST) {
    actions.push({ type: 'domestic_raise_taxes' });
  }

  return pair(actions);
};

/**
 * 蛮族依存。目先の戦線を金で埋め続ける。
 * 「短期と長期の取引」で短期を選び続けた場合の帰結を測る
 */
export const foederatiHeavy: Strategy = (state) => {
  const actions: PlayerAction[] = [];

  const hostileAtBorder = Object.values(state.factions).filter(
    (faction) => faction.stance === 'hostile',
  );

  for (const faction of hostileAtBorder) {
    if (slotsUsed(actions) >= MAX_ACTIONS_PER_TURN) break;
    if (state.treasury > FOEDERATI_HIRE_COST * 2) {
      actions.push({ type: 'hire_foederati', factionId: faction.id });
    }
  }

  // 雇えないなら土地を与えて黙らせる
  const invader = hostileInProvinces(state)[0];
  if (slotsUsed(actions) < MAX_ACTIONS_PER_TURN && invader && invader.location !== 'exterior') {
    actions.push({
      type: 'negotiate_settle',
      factionId: invader.id,
      provinceId: invader.location,
    });
  }

  if (slotsUsed(actions) < MAX_ACTIONS_PER_TURN && state.treasury < MARRIAGE_COST) {
    actions.push({ type: 'domestic_raise_taxes' });
  }

  return pair(actions);
};

/**
 * 限定使用。自軍が細ったときだけ少数のフォエデラティを雇い、
 * 平時は自前の軍で凌ぐ。短期と長期の折衷案
 */
export const limitedFoederati: Strategy = (state) => {
  const actions: PlayerAction[] = [...administer(state)];
  const foederatiCount = Object.values(state.factions).filter(
    (faction) => faction.stance === 'foederati',
  ).length;
  const invader = hostileInProvinces(state)[0];

  if (
    invader &&
    state.fieldArmy < LIMITED_ARMY_FLOOR &&
    foederatiCount < LIMITED_FOEDERATI_CAP &&
    state.treasury > FOEDERATI_HIRE_COST * 2
  ) {
    actions.push({ type: 'hire_foederati', factionId: invader.id });
  }

  const threatened = mostThreatenedProvince(state);
  if (slotsUsed(actions) < MAX_ACTIONS_PER_TURN && threatened) {
    actions.push({ type: 'military_deploy', provinceId: threatened });
  }
  if (slotsUsed(actions) < MAX_ACTIONS_PER_TURN && state.treasury > CONSCRIPT_COST * 2) {
    actions.push({ type: 'military_conscript' });
  }
  if (slotsUsed(actions) < MAX_ACTIONS_PER_TURN && state.treasury < CONSCRIPT_COST) {
    actions.push({ type: 'domestic_raise_taxes' });
  }

  return pair(actions);
};

/**
 * 宥和。突きつけられた要求を最優先で飲み、残った枠で軍を維持する。
 * 「要求に答える」ことが本当に選択肢として成立しているかを測るための方針
 */
export const appeaser: Strategy = (state) => {
  const actions: PlayerAction[] = [...administer(state)];

  /*
   * 金の要求は administer() が既定で飲んでいる。
   * この方針の持ち味は、土地と称号まで飲むことのほう
   */
  const demanding = Object.values(state.factions).filter(
    (faction) =>
      faction.stance === 'hostile' && faction.demand !== null && faction.demand.type !== 'gold',
  );
  for (const faction of demanding) {
    actions.push({ type: 'negotiate_accept_demand', factionId: faction.id });
  }

  const threatened = mostThreatenedProvince(state);
  if (slotsUsed(actions) < MAX_ACTIONS_PER_TURN && threatened) {
    actions.push({ type: 'military_deploy', provinceId: threatened });
  }
  if (slotsUsed(actions) < MAX_ACTIONS_PER_TURN && state.treasury > CONSCRIPT_COST * 2) {
    actions.push({ type: 'military_conscript' });
  }
  if (slotsUsed(actions) < MAX_ACTIONS_PER_TURN && state.treasury < CONSCRIPT_COST) {
    actions.push({ type: 'domestic_raise_taxes' });
  }

  return pair(actions);
};


/**
 * 空いた官職を埋める手を、優先度の高い順に返す。
 *
 * これは方針の違いではなく事務なので、`passive` 以外のすべての方針が使う。
 * `general` だけが官職を埋めていたときは、空位の減収と守備の罰が
 * 他の方針にだけ掛かり続け、「将軍を使うかどうか」ではなく
 * 「官職を埋めるかどうか」を測っていた
 *
 * 長官は帝国全体の税収に効くので先に埋める。総督は担当属州にしか
 * 効かないので、収入の大きい属州から順に埋める。
 * 候補は能力が最も高い者を選ぶ（野心は見ない。野心の高い有能な人物を
 * 使うかどうかがプレイヤーの判断になる部分なので、方針AIは単純に能力で選ぶ）
 */
function refillOffices(state: GameState): PlayerAction[] {
  const actions: PlayerAction[] = [];

  if (state.prefect.current === null && state.prefect.candidates.length > 0) {
    const best = [...state.prefect.candidates].sort((a, b) => b.ability - a.ability)[0];
    if (state.treasury > PREFECT_APPOINT_COST * 2) {
      actions.push({ type: 'appoint_prefect', officialId: best.id });
    }
  }

  // 併合した郷里の席も埋める（属州と同じ扱い）
  const vacant = (Object.keys(state.governors) as GovernedId[]).filter((id) => {
    const seat = state.governors[id];
    return seat !== undefined && seat.current === null && seat.candidates.length > 0;
  });
  for (const id of vacant) {
    if (state.treasury <= GOVERNOR_APPOINT_COST * 2) break;
    const seat = state.governors[id];
    if (seat === undefined) continue;
    const best = [...seat.candidates].sort((a, b) => b.ability - a.ability)[0];
    actions.push({ type: 'appoint_governor', provinceId: id, officialId: best.id });
  }

  return actions;
}

/**
 * どの方針でも同じように打つ事務の手。
 *
 * 空いた官職を埋め、軍司令官が空位なら任命する。
 * どちらも「方針」ではなく、まともな宮廷なら必ずやることなので、
 * これを `general` だけがやっていたときは方針の違いではなく
 * 「宮廷が機能しているかどうか」を測っていた。
 * 実際、中位の3方針が 0〜5% に潰れていた原因の大半がこれで、
 * 事務を揃えたところ `appeaser` が初級 5% → 12% に戻った。
 *
 * `general` 方針だけの持ち味は「いつ将軍を切るか」のほうに残す。
 * `passive` は何もしない基準値なのでこれも使わない
 */
function administer(state: GameState): PlayerAction[] {
  const actions = refillOffices(state);
  if (state.general.current === null && state.treasury > GENERAL_APPOINT_COST * 2) {
    actions.push({ type: 'military_appoint_general' });
  }
  /*
   * 払える金の要求は飲む。これも方針ではなく既定の手で、
   * 計測でも「金のみ飲む」が最良（拒否と並ぶ）と出ている。
   * `general` だけがこれをやっていたときは、他の方針が
   * 未応答の要求による攻撃補正（DEMAND_REFUSAL_POWER_BONUS）と
   * 定住されやすさを一方的に背負っていた
   */
  for (const faction of Object.values(state.factions)) {
    if (faction.stance !== 'hostile' || faction.demand === null) continue;
    if (faction.demand.type !== 'gold' || state.treasury < faction.demand.amount) continue;
    actions.push({ type: 'negotiate_accept_demand', factionId: faction.id });
  }
  return actions;
}

/**
 * 軍司令官を使う方針。
 * 空位なら任命し、正統性が簒奪の圏内に落ちたときだけ名将を切る。
 * 史実の408年（スティリコ）・454年（アエティウス）と同じ形
 */
const GENERAL_PURGE_LEGITIMACY = 35;
const GENERAL_PURGE_MIN_MILITARY = 7;

export const generalMinded: Strategy = (state) => {
  const actions: PlayerAction[] = [...administer(state)];

  const slots = () => actions.filter(consumesActionSlot).length;
  const general = state.general.current;
  if (
    general !== null &&
    general.military >= GENERAL_PURGE_MIN_MILITARY &&
    state.legitimacy < GENERAL_PURGE_LEGITIMACY
  ) {
    actions.push({ type: 'military_dismiss_general' });
  }

  const threatened = mostThreatenedProvince(state);
  if (slots() < MAX_ACTIONS_PER_TURN && threatened) {
    actions.push({ type: 'military_deploy', provinceId: threatened });
  }
  if (slots() < MAX_ACTIONS_PER_TURN && state.treasury > CONSCRIPT_COST * 2) {
    actions.push({ type: 'military_conscript' });
  }
  if (slots() < MAX_ACTIONS_PER_TURN && state.treasury < CONSCRIPT_COST) {
    actions.push({ type: 'domestic_raise_taxes' });
  }

  return pair(actions);
};

/**
 * 統一シナリオ用。本国を固めてから東へ攻め込む。
 *
 * 本国が崩れていては遠征どころではないので、
 * 「本国が落ち着いている年だけ東を攻める」形にする。
 * 統一が現実的に狙えるのかを測るための方針
 */
/** この兵力を超えるまでは東へ攻め込まない */
const UNIFY_ARMY_FLOOR = 110;
/** 本国にこれ以上の敵がいる年は遠征しない */
const UNIFY_MAX_HOME_THREATS = 2;
/** ペルシアへの修好をここまで重ねる */
const UNIFY_PERSIA_RELATIONS_TARGET = 70;
/** この正統性を下回ったら宣戦しない（同胞との戦は正統性を食う） */
const UNIFY_MIN_LEGITIMACY = 45;

export const unifier: Strategy = (state) => {
  const actions: PlayerAction[] = [...administer(state)];
  const slots = () => actions.filter(consumesActionSlot).length;

  const homeThreats = hostileInProvinces(state).length;
  const homeQuiet = homeThreats <= UNIFY_MAX_HOME_THREATS;
  const strongEnough = state.fieldArmy >= UNIFY_ARMY_FLOOR;

  if (state.east.stance === 'war') {
    // 開戦したら、まだ手に入れていない属州のうち最も支配度が低いものを叩く
    const target = state.east.provinces
      .filter((p) => p.owner !== 'west')
      .sort((a, b) => a.control - b.control)[0];
    if (target && slots() < MAX_ACTIONS_PER_TURN && state.fieldArmy > UNIFY_ARMY_FLOOR / 2) {
      actions.push({ type: 'east_invade', provinceId: target.id });
    }
  } else if (
    homeQuiet &&
    strongEnough &&
    state.legitimacy >= UNIFY_MIN_LEGITIMACY &&
    slots() < MAX_ACTIONS_PER_TURN
  ) {
    actions.push({ type: 'east_declare_war' });
  }

  // 本国の守り
  const threatened = mostThreatenedProvince(state);
  if (slots() < MAX_ACTIONS_PER_TURN && threatened) {
    actions.push({ type: 'military_deploy', provinceId: threatened });
  }
  // 遠征には兵が要る。金がある限り徴募し続ける
  if (slots() < MAX_ACTIONS_PER_TURN && state.treasury > CONSCRIPT_COST * 2) {
    actions.push({ type: 'military_conscript' });
  }
  if (slots() < MAX_ACTIONS_PER_TURN && state.treasury < CONSCRIPT_COST) {
    actions.push({ type: 'domestic_raise_taxes' });
  }
  /*
   * ペルシアが動き出す前に修好を重ねておく。介入そのものは止められないが、
   * 動き出す年を遅らせられる。**軍が揃い、枠が余った年にだけ**打つ。
   * 徴募より先に置いたときは統一率が 4% → 0% に落ちた。
   * 2つしかない枠を毎年の使節に食われ、東の野戦軍（175）を上回る
   * 兵力を作れなくなるため。修好が軍備と枠を争うこと自体は
   * 設計どおりの取引で、方針AIの側で順序を決めている
   */
  if (
    slots() < MAX_ACTIONS_PER_TURN &&
    !state.persia.intervened &&
    // 軍が揃ってから。徴募より先に使節へ枠を割くと東へ攻め込めなくなる
    strongEnough &&
    state.persia.relations < UNIFY_PERSIA_RELATIONS_TARGET &&
    state.treasury > PERSIA_IMPROVE_COST * 3
  ) {
    actions.push({ type: 'persia_improve_relations' });
  }

  return pair(actions);
};

/**
 * 境外へ攻め出る方針。
 *
 * `general` と同じ土台に、余力のある年だけ蛮族の郷里への遠征を足す。
 * 「拡大はこの帝国には本来無理だった」という主題が郷里の征服でも
 * 崩れていないかを測るための方針で、生存率が `general` を上回るなら
 * 遠征が安すぎることになる
 */
/** この兵力を超えるまでは境外へ出ない */
const CONQUER_ARMY_FLOOR = 105;
/** 本国にこれ以上の敵がいる年は遠征しない */
const CONQUER_MAX_HOME_THREATS = 2;

export const conqueror: Strategy = (state) => {
  const base = generalMinded(state);
  const homeThreats = hostileInProvinces(state).length;
  if (
    state.fieldArmy < CONQUER_ARMY_FLOOR ||
    homeThreats > CONQUER_MAX_HOME_THREATS ||
    state.treasury < CONSCRIPT_COST
  ) {
    return base;
  }

  // 狙うのは守りの薄い郷里から。族長が境外に残っている勢力は本国の脅威でもある
  const target = Object.values(state.homelands)
    .filter((h) => h.owner !== 'west' && state.factions[h.factionId].stance !== 'foederati')
    .sort((a, b) => a.garrison - b.garrison)[0];
  if (target === undefined) return base;

  return pair([{ type: 'conquer_homeland', factionId: target.factionId }, ...base]);
};

export const strategies: Record<string, Strategy> = {
  passive,
  limited: limitedFoederati,
  defensive,
  foederati: foederatiHeavy,
  appeaser,
  general: generalMinded,
  conqueror,
  unifier,
};
