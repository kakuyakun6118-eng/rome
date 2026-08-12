import {
  CONSCRIPT_COST,
  PROVINCE_RECRUIT_COST,
  DEFEND_COST,
  EAST_AID_MIN_RELATIONS,
  EAST_IMPROVE_COST,
  EAST_PEACE_MIN_WAR_YEARS,
  EAST_TITLE_COST,
  MAX_EAST_RELATIONS,
  MAX_PERSIA_RELATIONS,
  MAX_TAX_BASE,
  RESETTLE_COST,
  PERSIA_IMPROVE_COST,
  FOEDERATI_HIRE_COST,
  GENERAL_APPOINT_COST,
  MARRIAGE_COST,
  MARRIAGE_EAST_MIN_RELATIONS,
  MARRIAGE_ROMAN_MIN_SENATE_SUPPORT,
  REORGANIZE_COST,
  SENATE_GAMES_COST,
} from '../core/constants';
import { availableBattleLeaders, canGiveBattle } from '../core/battle';
import { canInvadePersia, invadableEastProvinces } from '../core/east';
import { troopsOf } from '../core/battlefield';
import type {
  BarbarianDemandType,
  BattleArm,
  BattleFoe,
  BattleLane,
  BattleLeader,
  BattleOrder,
  BarbarianFactionId,
  EastProvinceId,
  GameState,
  GeneralEnd,
  PlayerAction,
  ProvinceId,
  Scenario,
  SuccessionOutcome,
  Terrain,
  TurnEventId,
} from '../core/types';

/** 表示名。ゲームロジックではなく画面用のラベル */
export const PROVINCE_LABELS: Record<ProvinceId, string> = {
  Italia: 'イタリア',
  Gallia: 'ガリア',
  Hispania: 'ヒスパニア',
  Britannia: 'ブリタンニア',
  Africa: 'アフリカ',
  Illyricum: 'イリュリクム',
  Noricum: 'ノリクム',
};

export const FACTION_LABELS: Record<BarbarianFactionId, string> = {
  Visigoths: '西ゴート',
  Vandals: 'ヴァンダル',
  Huns: 'フン',
  Franks: 'フランク',
  Burgundians: 'ブルグント',
  Suebi: 'スエビ',
  Alans: 'アラン',
  Saxons: 'サクソン',
  Gepids: 'ゲピード',
  Scoti: 'スコティ',
  Ostrogoths: '東ゴート',
  Heruli: 'ヘルール',
  Alemanni: 'アラマンニ',
  Mauri: 'マウリ',
};

/** 要求の種類。何を差し出すことになるかを添える */
export const DEMAND_LABELS: Record<BarbarianDemandType, string> = {
  gold: '金',
  land: '土地',
  title: '称号',
};

export const DEMAND_DETAILS: Record<BarbarianDemandType, string> = {
  gold: '国庫から払う。引き揚げさせ、その軍の一部を散らす',
  land: 'その属州を割譲する。税基盤を永久に失う',
  title: '官位を与えて味方に付ける。代償は元老院の支持と正統性',
};

/**
 * 状態の差分からは読み取れない出来事の文言。
 * 脱走も簒奪未遂も野戦軍が減るだけなので、書かないと理由が分からない
 */
export const TURN_EVENT_LABELS: Record<TurnEventId, string> = {
  desertion: '給金が尽き、兵が脱走した',
  usurper_attempt: '僭称者が立ち、軍の一部が離反した',
  general_usurped: '軍司令官が帝位を狙って蜂起し、職を離れた',
  general_retired: '軍司令官が任期を終えて職を退いた',
  prefect_retired: 'プラエトリア長官が任期を終えて職を退いた',
  governor_retired: '属州総督が任期を終えて職を退いた',
  homeland_conquered: '蛮族の郷里を征服し、帝国の版図に加えた',
  homeland_lost: '征服した郷里を蛮族に取り返された',
  governor_revolt: '属州総督が反旗を翻し、守備隊を連れて独立した',
  brother_revolt: '一族の者が帝位を狙って挙兵し、軍の一部が離れた',
  east_war_declared: '東ローマに宣戦した。ローマ人がローマ人と戦う',
  east_province_taken: '東方の属州を征服した',
  east_province_lost: '東ローマに東方の属州を奪い返された',
  east_peace: '東ローマと講和した',
  persia_intervened: 'サーサーン朝ペルシアが介入を始めた',
  persia_offensive: 'ペルシアが東方の属州を奪った',
  pitched_victory: '会戦に勝ち、敵の主力を打ち破った',
  pitched_defeat: '会戦に敗れ、野戦軍を大きく損なった',
  pitched_rout: '会戦で大敗した。敗報に属州が動揺している',
  ruler_captured: '君主が敵手に落ちた。属州は大きく動揺している',
  usurper_empire: '属州総督がローマ皇帝を僭称し、属州ごと離れた',
  usurper_battle_won: '僭称帝国の軍を破ったが、まだ平らげてはいない',
  usurper_battle_lost: '僭称帝国の軍に敗れた',
  usurper_suppressed: '僭称帝国を平らげ、属州を取り戻した',
  empire_partitioned: '複数の後継者に帝国が分けられ、東方帝が立った',
  east_vassalized: '東方は西の宗主権のもとに置かれた。兵権も貢納も西にある',
  east_independence: '東方帝が宗主権を振り払い、東ローマが独立した',
  rome_reunified: 'ローマ全土が再び一人の皇帝のもとに統一された',
  justinian_reconquest:
    'ユスティニアヌス1世が西方の回復を掲げ、ベリサリウスを西へ送り込んだ',
  dynasty_founded: '血統が断裂し、新しい王朝が興った',
  barbarian_east_raid: '蛮族が西ではなく東ローマへ攻め入った',
  persia_invaded: 'ペルシア本土への遠征に勝ち、その戦力を削った',
  persia_subdued: 'ペルシアを屈服させ、介入を取り下げさせた',
};

/** 会戦を率いる者 */
export const BATTLE_LEADER_LABELS = {
  ruler: '皇帝が親征',
  general: '軍司令官に任せる',
} as const;

/** 会戦の結末 */
export const BATTLE_OUTCOME_LABELS = {
  victory: '勝利',
  defeat: '敗北',
  rout: '大敗',
  captured: '君主捕縛',
} as const;

/** 戦列 */
export const BATTLE_LANE_LABELS: Record<BattleLane, string> = {
  left: '左翼',
  center: '中央',
  right: '右翼',
};

/** 兵科 */
export const BATTLE_ARM_LABELS: Record<BattleArm, string> = {
  infantry: '歩兵',
  cavalry: '騎兵',
  archers: '弓兵',
};

/** 兵科の印。外部のアイコンを読み込まず文字で置く */
export const BATTLE_ARM_MARKS: Record<BattleArm, string> = {
  infantry: '≡',
  cavalry: '△',
  archers: '↟',
};

/** その戦列に出す命令 */
export const BATTLE_ORDER_LABELS: Record<BattleOrder, string> = {
  advance: '前進',
  flank: '迂回',
  withdraw: '退却',
};

export const BATTLE_ORDER_DETAILS: Record<BattleOrder, string> = {
  advance: '正面からぶつかる。与える損害も受ける損害も等倍',
  flank: '隣の敵戦列の側面を突く。損害は増えるが、自分の正面は手薄になる',
  withdraw: '後ろへ下がる。ほとんど反撃できないが損害は半減し、士気が戻る',
};

/**
 * 兵数の表記。千人・万人でまとめる。
 *
 * 兵員数そのものは core の `troopsOf()` から引く。
 * ここでやるのは桁の丸めと単位付けだけで、計算はしていない
 */
export function formatTroops(strength: number): string {
  const men = troopsOf(strength);
  if (men >= 10000) return `${(men / 10000).toFixed(1)}万人`;
  if (men >= 1000) return `${(men / 1000).toFixed(1)}千人`;
  return `${Math.round(men / 10) * 10}人`;
}

/** 戦場の地形 */
export const TERRAIN_LABELS: Record<Terrain, string> = {
  plain: '平原',
  hill: '丘陵',
  forest: '森林',
  desert: '砂漠',
  river: '渡河点',
};

export const TERRAIN_DETAILS: Record<Terrain, string> = {
  plain: '騎兵の土地。歩兵と弓兵は等倍',
  hill: '歩兵が踏ん張る。騎兵の突撃は通らない',
  forest: '射線が通らず騎兵も走れない。歩兵の土地',
  desert: '重装歩兵には堪える。騎兵と弓兵の土地',
  river: '弓兵が利く。前へ出た戦列は余計に削られる',
};

/** 継承の結末。血の近い順に3段 */
export const SUCCESSION_LABELS: Record<SuccessionOutcome, string> = {
  heir: '嫡子が継承',
  sibling: '兄弟・傍系が継承',
  crisis: '継承危機',
};

/** 軍司令官が職を離れた理由 */
export const GENERAL_END_LABELS: Record<GeneralEnd, string> = {
  retired: '任期満了',
  dismissed: '解任',
  usurped: '蜂起',
};

/**
 * 君主名の長さの上限。画面の収まりのためで、ゲームルールではない。
 * 開始画面と君主の欄の両方で使うのでここに置く
 */
export const RULER_NAME_MAX_LENGTH = 12;

export const STANCE_LABELS = {
  hostile: '敵対',
  foederati: '同盟',
  settled: '定住',
} as const;

export const DIFFICULTY_LABELS = {
  beginner: '初級',
  standard: '中級',
  veteran: '上級',
} as const;

/** 婚姻の相手の種類。相手ごとに差し出すものが違う */
export type MarriageKind = 'roman' | 'barbarian' | 'east';

export type TargetKind =
  | 'none'
  | 'province'
  | 'faction'
  | 'faction-province'
  | 'marriage'
  | 'east-province'
  | 'homeland'
  | 'battle'
  | 'usurper';

export interface ActionTemplate {
  id: string;
  category: string;
  label: string;
  detail: string;
  cost: number | null;
  target: TargetKind;
  /** 選べない理由。null なら選べる */
  blockedReason: (state: GameState) => string | null;
  /**
   * 相手として選べる勢力を絞る。
   * 省略すると全勢力。要求への応答のように、対象が限られる行動で使う
   */
  factionFilter?: (state: GameState, id: BarbarianFactionId) => boolean;
  build: (target: {
    province?: ProvinceId;
    faction?: BarbarianFactionId;
    /** 婚姻の相手の種類。'roman' なら house で家門を選ぶ */
    marriage?: MarriageKind;
    house?: string;
    eastProvince?: EastProvinceId;
    foe?: BattleFoe;
    leader?: BattleLeader;
    /** 会戦に動員する属州 */
    mobilize?: ProvinceId[];
    usurperId?: string;
  }) => PlayerAction | null;
  /** このシナリオでだけ出す。省略すると常に出す */
  scenario?: Scenario;
}

/** 会戦に応じる相手。戦場に出ている敵だけが並ぶ */
export function battleFoes(state: GameState): BattleFoe[] {
  const foes: BattleFoe[] = [];
  for (const id of Object.keys(state.factions) as BarbarianFactionId[]) {
    const foe: BattleFoe = { kind: 'barbarian', factionId: id };
    if (canGiveBattle(state, foe)) foes.push(foe);
  }
  if (canGiveBattle(state, { kind: 'east' })) foes.push({ kind: 'east' });
  if (canGiveBattle(state, { kind: 'persia' })) foes.push({ kind: 'persia' });
  return foes;
}

export function battleFoeLabel(foe: BattleFoe): string {
  if (foe.kind === 'barbarian') return FACTION_LABELS[foe.factionId];
  return foe.kind === 'east' ? '東ローマの野戦軍' : 'ペルシアの軍';
}

export function battleFoeKey(foe: BattleFoe): string {
  return foe.kind === 'barbarian' ? `barbarian:${foe.factionId}` : foe.kind;
}

const needsGold = (cost: number) => (state: GameState) =>
  state.treasury < cost ? `国庫が足りない（${cost} 必要）` : null;

export const ACTION_TEMPLATES: ActionTemplate[] = [
  {
    id: 'negotiate_tribute',
    category: '交渉',
    label: '貢納を贈る',
    detail: '金を払ってこの1年の侵攻を止める。同盟勢力なら忠誠も上がる',
    cost: null,
    target: 'faction',
    blockedReason: () => null,
    build: ({ faction }) =>
      faction ? { type: 'negotiate_tribute', factionId: faction, amount: 60 } : null,
  },
  {
    id: 'negotiate_accept_demand',
    category: '交渉',
    label: '要求を飲む',
    detail: '突きつけられた要求に応じる。金・土地・称号のどれを払うかは相手が決める（行動枠を消費しない）',
    cost: null,
    target: 'faction',
    blockedReason: (state) =>
      Object.values(state.factions).some((f) => f.stance === 'hostile' && f.demand !== null)
        ? null
        : '要求を受けていない',
    factionFilter: (state, id) =>
      state.factions[id].stance === 'hostile' && state.factions[id].demand !== null,
    build: ({ faction }) =>
      faction ? { type: 'negotiate_accept_demand', factionId: faction } : null,
  },
  {
    id: 'negotiate_settle',
    category: '交渉',
    label: '土地を与えて定住させる',
    detail: '戦線は消えるが、その属州の税収と帝国の税基盤を永久に失う',
    cost: null,
    target: 'faction-province',
    blockedReason: () => null,
    build: ({ faction, province }) =>
      faction && province
        ? { type: 'negotiate_settle', factionId: faction, provinceId: province }
        : null,
  },
  {
    id: 'negotiate_marriage',
    category: '交渉',
    label: '婚姻同盟を結ぶ',
    detail: '君主が縁組する。子が生まれて初めて追加の効果が出る',
    cost: MARRIAGE_COST,
    target: 'marriage',
    blockedReason: (state) =>
      state.dynasty.ruler.spouse !== null
        ? '君主はすでに既婚'
        : needsGold(MARRIAGE_COST)(state),
    build: ({ faction, marriage, house }) => {
      if (marriage === 'east') return { type: 'negotiate_marriage', target: { kind: 'east' } };
      if (marriage === 'roman') {
        return house
          ? { type: 'negotiate_marriage', target: { kind: 'roman', houseId: house } }
          : null;
      }
      return faction
        ? { type: 'negotiate_marriage', target: { kind: 'barbarian', factionId: faction } }
        : null;
    },
  },
  {
    id: 'hire_foederati',
    category: '雇用',
    label: 'フォエデラティ契約',
    detail: '敵を傭兵にする。安く戦線が埋まるが給金は年々膨らみ、途切れれば寝返る',
    cost: FOEDERATI_HIRE_COST,
    target: 'faction',
    blockedReason: needsGold(FOEDERATI_HIRE_COST),
    build: ({ faction }) => (faction ? { type: 'hire_foederati', factionId: faction } : null),
  },
  {
    id: 'military_deploy',
    category: '軍事',
    label: '野戦軍を派遣',
    detail: 'その属州の防衛に野戦軍を厚く振り向ける。行軍で軍は少し損耗する',
    cost: null,
    target: 'province',
    blockedReason: () => null,
    build: ({ province }) => (province ? { type: 'military_deploy', provinceId: province } : null),
  },
  {
    id: 'military_defend',
    category: '軍事',
    label: '属州を防備',
    detail: 'その属州の守備隊を厚くする。野戦軍は動かさないので他の戦線は薄くならない',
    cost: DEFEND_COST,
    target: 'province',
    blockedReason: needsGold(DEFEND_COST),
    build: ({ province }) => (province ? { type: 'military_defend', provinceId: province } : null),
  },
  {
    id: 'military_conscript',
    category: '軍事',
    label: '徴募',
    detail: '金をかけて野戦軍を増やす。徴募の負担で元老院の支持は下がる',
    cost: CONSCRIPT_COST,
    target: 'none',
    blockedReason: needsGold(CONSCRIPT_COST),
    build: () => ({ type: 'military_conscript' }),
  },
  {
    id: 'military_recruit_province',
    category: '軍事',
    label: '属州で募兵',
    detail:
      'その土地から兵を出す。中央の徴募より安いが、集まる兵の数は属州の豊かさと支配度しだい。' +
      '兵を出した土地は荒れる（支配度が下がる）',
    cost: PROVINCE_RECRUIT_COST,
    target: 'province',
    blockedReason: needsGold(PROVINCE_RECRUIT_COST),
    build: ({ province }) =>
      province ? { type: 'military_recruit_province', provinceId: province } : null,
  },
  {
    id: 'military_appoint_general',
    category: '軍事',
    label: '軍司令官を任命',
    detail: '空位を埋める。軍は強くなるが、有能な将ほど戦勝の名声は皇帝ではなく将軍のものになる',
    cost: GENERAL_APPOINT_COST,
    target: 'none',
    blockedReason: (state) =>
      state.general.current !== null
        ? '軍司令官は在職中'
        : needsGold(GENERAL_APPOINT_COST)(state),
    build: () => ({ type: 'military_appoint_general' }),
  },
  {
    id: 'military_dismiss_general',
    category: '軍事',
    label: '軍司令官を解任',
    detail: '正統性は戻るが、その将に従っていた兵は離れる',
    cost: null,
    target: 'none',
    blockedReason: (state) => (state.general.current === null ? '軍司令官は空位' : null),
    build: () => ({ type: 'military_dismiss_general' }),
  },
  {
    id: 'military_pitched_battle',
    category: '軍事',
    label: '会戦を挑む',
    detail:
      '野戦軍の大半を投じて敵の主力と正面からぶつかる。勝てば相手の軍を大きく削れるが、' +
      '大敗すれば属州が動揺し、野心の高い総督が皇帝を僭称して離れる。' +
      '皇帝自身（軍事6以上）か軍司令官が率いる必要がある',
    cost: null,
    target: 'battle',
    blockedReason: (state) =>
      availableBattleLeaders(state).length === 0
        ? '会戦を率いる者がいない（皇帝の軍事6以上、または軍司令官）'
        : battleFoes(state).length === 0
          ? '会戦に応じる敵がいない'
          : null,
    build: ({ foe, leader, mobilize }) =>
      foe && leader ? { type: 'military_pitched_battle', foe, leader, mobilize } : null,
  },
  {
    id: 'military_suppress_usurper',
    category: '軍事',
    label: '僭称帝国を討つ',
    detail: '離れた属州を武力で取り戻す。勝てば正統性がよく戻るが、相手もローマの正規軍だ',
    cost: null,
    target: 'usurper',
    blockedReason: (state) =>
      state.usurpers.length === 0 ? '僭称帝国は現れていない' : null,
    build: ({ usurperId }) =>
      usurperId ? { type: 'military_suppress_usurper', usurperId } : null,
  },
  {
    id: 'conquer_homeland',
    category: '軍事',
    label: '蛮族の郷里へ遠征',
    detail:
      '境外にあるその勢力の本拠地を攻める。取れば帝国の版図が広がるが、' +
      '他の敵対勢力が加勢に来るので属州を守るよりはるかに重い',
    cost: null,
    target: 'homeland',
    blockedReason: (state) =>
      Object.values(state.homelands).every(
        (h) => h.owner === 'west' || state.factions[h.factionId].stance === 'foederati',
      )
        ? '境外に攻める先がない'
        : null,
    build: ({ faction }) => (faction ? { type: 'conquer_homeland', factionId: faction } : null),
  },
  {
    id: 'domestic_raise_taxes',
    category: '内政',
    label: '徴税を強化',
    detail: '目先の収入を増やすが、元老院の支持と属州の支配度を削る',
    cost: null,
    target: 'none',
    blockedReason: () => null,
    build: () => ({ type: 'domestic_raise_taxes' }),
  },
  {
    id: 'domestic_reorganize_army',
    category: '内政',
    label: '軍を再編',
    detail: '属州の守備隊を野戦軍に組み替える。機動力は増すが属州の守りは薄くなる',
    cost: REORGANIZE_COST,
    target: 'none',
    blockedReason: needsGold(REORGANIZE_COST),
    build: () => ({ type: 'domestic_reorganize_army' }),
  },
  {
    id: 'domestic_appease_senate',
    category: '内政',
    label: '元老院に譲歩',
    detail: '支持と正統性を買う。免税特権の追認で税基盤は永久に減る',
    cost: null,
    target: 'none',
    blockedReason: () => null,
    build: () => ({ type: 'domestic_appease_senate' }),
  },
  {
    id: 'domestic_hold_games',
    category: '内政',
    label: '競技会を催す',
    detail: '戦車競走と見世物で元老院と民衆の機嫌を取る。削るのは国庫',
    cost: SENATE_GAMES_COST,
    target: 'none',
    blockedReason: needsGold(SENATE_GAMES_COST),
    build: () => ({ type: 'domestic_hold_games' }),
  },
  {
    id: 'domestic_grant_consulship',
    category: '内政',
    label: '執政官位を授ける',
    detail: '名誉職を貴族に与える。金も土地も要らないが、その年の栄誉は皇帝のものでなくなる',
    cost: null,
    target: 'none',
    blockedReason: () => null,
    build: () => ({ type: 'domestic_grant_consulship' }),
  },
  {
    id: 'domestic_resettle_land',
    category: '内政',
    label: '荒地に入植させる',
    detail:
      '荒れた耕地に退役兵と捕虜を入れて起こし直す。税基盤を戻せる唯一の手だが、' +
      '大所領を接収して分け与えるので元老院の支持を失う。' +
      '定住1件で失う7に対し戻るのは3で、削られる速さには追いつかない',
    cost: RESETTLE_COST,
    target: 'none',
    blockedReason: (state) =>
      state.taxBase >= MAX_TAX_BASE ? '起こす荒地がない' : needsGold(RESETTLE_COST)(state),
    build: () => ({ type: 'domestic_resettle_land' }),
  },
  {
    id: 'east_request_aid',
    category: '東帝国',
    label: '援軍を要請',
    detail: '東ローマから金と兵を得るが、東との関係は損なわれる',
    cost: null,
    target: 'none',
    blockedReason: (state) =>
      state.eastRelations < EAST_AID_MIN_RELATIONS
        ? `東との関係が足りない（${EAST_AID_MIN_RELATIONS} 必要）`
        : null,
    build: () => ({ type: 'east_request_aid' }),
  },
  {
    id: 'east_confirm_title',
    category: '東帝国',
    label: '帝位の承認を得る',
    detail: '東ローマに帝位を認めさせ、正統性を高める',
    cost: EAST_TITLE_COST,
    target: 'none',
    blockedReason: needsGold(EAST_TITLE_COST),
    build: () => ({ type: 'east_confirm_title' }),
  },
  {
    id: 'east_improve_relations',
    category: '東帝国',
    label: '東ローマへ修好',
    detail: '使者と贈り物を送って関係を戻す。援軍要請と帝位の承認で損なった関係はこれで埋め合わせる',
    cost: EAST_IMPROVE_COST,
    target: 'none',
    blockedReason: (state) =>
      state.east.stance === 'war'
        ? '交戦中は使者が通らない'
        : state.eastRelations >= MAX_EAST_RELATIONS
          ? '関係はすでに最良'
          : needsGold(EAST_IMPROVE_COST)(state),
    build: () => ({ type: 'east_improve_relations' }),
  },
  {
    id: 'east_declare_war',
    category: '東帝国',
    label: '東ローマに宣戦',
    detail: 'ローマ人がローマ人と戦う。正統性と元老院の支持を先払いし、東との関係は断たれる',
    cost: null,
    target: 'none',
    scenario: 'reunification',
    blockedReason: (state) => (state.east.stance === 'war' ? 'すでに交戦中' : null),
    build: () => ({ type: 'east_declare_war' }),
  },
  {
    id: 'east_invade',
    category: '東帝国',
    label: '東方へ侵攻',
    detail:
      '野戦軍を遠征に出す。支配度を0まで削ると属州を併合できる。' +
      'ペルシアが握る属州は東ローマと講和したあとでも攻められる',
    cost: null,
    target: 'east-province',
    scenario: 'reunification',
    blockedReason: (state) =>
      state.east.provinces.every((p) => p.owner === 'west')
        ? '東方はすべて手中にある'
        : invadableEastProvinces(state).length === 0
          ? '宣戦していない（ペルシアが握る属州なら講和後でも攻められる）'
          : null,
    build: ({ eastProvince }) =>
      eastProvince ? { type: 'east_invade', provinceId: eastProvince } : null,
  },
  {
    id: 'persia_improve_relations',
    category: '東帝国',
    label: 'ペルシアへ修好',
    detail:
      'サーサーン朝に使者と贈り物を送る。介入を始める年が遅くなり、' +
      '動き出したあとの攻勢も鈍る。ただし介入そのものは止められない',
    cost: PERSIA_IMPROVE_COST,
    target: 'none',
    scenario: 'reunification',
    blockedReason: (state) =>
      state.persia.relations >= MAX_PERSIA_RELATIONS
        ? '関係はすでに最良'
        : needsGold(PERSIA_IMPROVE_COST)(state),
    build: () => ({ type: 'persia_improve_relations' }),
  },
  {
    id: 'persia_invade',
    category: '東帝国',
    label: 'ペルシアへ遠征',
    detail:
      'サーサーン朝の本土を突き、その戦力そのものを削る。削り切れば介入を取り下げさせられる。' +
      'ローマを統一したあとにだけ選べる。王の軍が総出で守るので、属州を攻めるより重い',
    cost: null,
    target: 'none',
    scenario: 'reunification',
    blockedReason: (state) =>
      !state.persia.intervened
        ? 'ペルシアはまだ動いていない'
        : state.persia.strength <= 0
          ? 'ペルシアはすでに屈服している'
          : !canInvadePersia(state)
            ? 'ローマを統一するまで東の向こうへは手が届かない'
            : null,
    build: () => ({ type: 'persia_invade' }),
  },
  {
    id: 'east_make_peace',
    category: '東帝国',
    label: '東ローマと講和',
    detail: '奪った属州は保持したまま戦端を閉じる。ペルシアは引かない',
    cost: null,
    target: 'none',
    scenario: 'reunification',
    blockedReason: (state) => {
      if (state.east.stance !== 'war' || state.east.warStartYear === null) return '交戦していない';
      const years = state.year - state.east.warStartYear;
      return years < EAST_PEACE_MIN_WAR_YEARS
        ? `開戦から${EAST_PEACE_MIN_WAR_YEARS}年は講和できない（あと${EAST_PEACE_MIN_WAR_YEARS - years}年）`
        : null;
    },
    build: () => ({ type: 'east_make_peace' }),
  },
];

/** 東方属州の表示名 */
export const EAST_PROVINCE_LABELS: Record<EastProvinceId, string> = {
  Thracia: 'トラキア',
  Asiana: 'アシア',
  Oriens: 'オリエンス（シリア）',
  Aegyptus: 'エジプト',
};

export const EAST_OWNER_LABELS = {
  east: '東ローマ',
  west: '自国',
  persia: 'ペルシア',
} as const;

export const SCENARIO_LABELS: Record<Scenario, string> = {
  historical: '史実',
  reunification: '統一',
};

export const MARRIAGE_EAST_REQUIREMENT = MARRIAGE_EAST_MIN_RELATIONS;
export const MARRIAGE_ROMAN_REQUIREMENT = MARRIAGE_ROMAN_MIN_SENATE_SUPPORT;
