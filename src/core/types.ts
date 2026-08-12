// Phase 0: 型定義のみ。ロジックは含まない。

// ── 属州 ──────────────────────────────────────────────

export type ProvinceId =
  | 'Gallia'
  | 'Hispania'
  | 'Britannia'
  | 'Africa'
  | 'Italia'
  | 'Illyricum'
  | 'Noricum';

export interface Province {
  id: ProvinceId;
  /** 支配度。0〜100 */
  control: number;
  baseTax: number;
  garrison: number;
}

// ── 蛮族勢力 ──────────────────────────────────────────

/**
 * 蛮族勢力。
 *
 * 郷里（homelands）を持つのは、帝国の外に定住地が特定できる勢力だけ。
 * フンやアランのような遊牧民、西ゴートやヴァンダルのように
 * この時代ずっと動き続けていた民は郷里を持たず、地図でも駒で描く
 */
export type BarbarianFactionId =
  // 郷里を持つ（地図では領域）
  | 'Franks'
  | 'Burgundians'
  | 'Suebi'
  | 'Saxons'
  | 'Gepids'
  | 'Scoti'
  // 郷里を持たない（地図では駒）
  | 'Visigoths'
  | 'Vandals'
  | 'Huns'
  | 'Alans'
  | 'Ostrogoths'
  | 'Heruli'
  | 'Alemanni'
  | 'Mauri';

export type BarbarianStance = 'hostile' | 'foederati' | 'settled';

export type BarbarianDemandType = 'gold' | 'land' | 'title';

export interface BarbarianDemand {
  type: BarbarianDemandType;
  amount: number;
  targetProvince?: ProvinceId;
}

/** 属州の外（帝国境外）にいる状態を 'exterior' として区別する */
export type BarbarianLocation = ProvinceId | 'exterior';

export interface BarbarianFaction {
  id: BarbarianFactionId;
  strength: number;
  stance: BarbarianStance;
  location: BarbarianLocation;
  demand: BarbarianDemand | null;
  /** 帝国境外から侵入する際にたどる属州の経路（史実の進路を模す） */
  route: ProvinceId[];
  /** route 上で次に狙う位置のインデックス */
  routeIndex: number;
  /**
   * 略奪だけを行う民か。
   *
   * マウリ（ムーア人）のように、属州を奪って王国を建てるのではなく
   * 山地から降りてきて掠め、また引き揚げる民を表す。
   * 定住せず、支配度を奪い切ることもなく、略奪した年のうちに境外へ戻る。
   * 侵入して恒久占領する型に当てはめると、アフリカに常設の戦線ができて
   * 穀物供給が途絶し、生存率が中級 17% → 2% まで落ちた
   */
  raider?: boolean;
  /**
   * 連合が瓦解する年。これを過ぎると戦力が毎年削れていく。
   *
   * フンだけが持つ。アッティラの死（453年）とネダオの戦い（454年）で
   * フン連合は実際に砕け、従っていた諸族が離れていった。
   * 開始戦力を上げて440年代の脅威を作ると、この解体が無い模型では
   * そのまま170ターン居座り続けて統一シナリオの6世紀が成立しない
   */
  collapseYear?: number;
}

// ── 君主と王朝 ────────────────────────────────────────

/**
 * 君主の能力。3つのみ。増やさない。各1〜10。
 * これは資源ではなく、既存の計算式に対する補正倍率の元になる値
 */
export interface RulerAbilities {
  /** 軍事 — 戦闘解決の防御側戦力を補正する */
  military: number;
  /** 統治 — 税収と legitimacy の自然減を補正する */
  governance: number;
  /** 交渉 — 貢納コストと交渉成功率を補正する */
  diplomacy: number;
}

/** 婚姻相手の出自 */
export type MarriageOrigin =
  | { kind: 'barbarian'; factionId: BarbarianFactionId }
  | { kind: 'east' }
  /**
   * 西ローマの元老院貴族の家門。houseId は data/houses.json から引く。
   * 唯一「混血にならない」縁組で、生まれた子は純粋なローマ人として
   * 継承の正統性を削らない
   */
  | { kind: 'roman'; houseId: string };

/** 王朝の血統。ローマ系か、混血の場合はどの勢力の血が入っているか */
export type Lineage = 'roman' | 'east' | BarbarianFactionId;

export interface Spouse {
  id: string;
  origin: MarriageOrigin;
  marriedYear: number;
}

/** 継承候補となる王朝の一員 */
export interface DynastyMember {
  id: string;
  /** 表示名。プレイヤーが付け替えられる */
  name: string;
  birthYear: number;
  abilities: RulerAbilities;
  /** 出身家系 */
  lineage: Lineage;
  /** 嫡子か（庶子・傍系は継承時の正統性低下が大きい） */
  legitimate: boolean;
  /** 混血の後継者は legitimacy に負の補正がつく */
  mixedBlood: boolean;
  /** 混血によって得た、その勢力に対する請求権 */
  claims: BarbarianFactionId[];
}

export interface Ruler extends DynastyMember {
  accessionYear: number;
  /** 天命で定めた没年。暗殺されるとこの年より早く死ぬ */
  fatedDeathYear: number;
  deathYear: number | null;
  spouse: Spouse | null;
  /** 子の DynastyMember.id */
  childIds: string[];
}

/**
 * 継承の結末。
 *
 * `heir` は皇帝自身の成人した嫡子、`sibling` は子がおらず兄弟や
 * 傍系の一族が継いだ場合、`crisis` は一族が尽きて王朝の外から
 * 担ぎ出された場合。血の近さの順に正統性の低下が大きくなる
 */
export type SuccessionOutcome = 'heir' | 'sibling' | 'crisis';

export interface DeathRecord {
  rulerId: string;
  /** 年代記に出すための名。id からは引けないので記録時に残す */
  name: string;
  year: number;
  cause: 'natural' | 'assassination';
  outcome: SuccessionOutcome;
  /**
   * その皇帝が属した王朝の名。血統が断裂すると王朝そのものが替わるので、
   * 家系図で代を辿るには没時の王朝を記録しておく必要がある
   */
  dynastyName: string;
}

export interface Dynasty {
  name: string;
  /**
   * 今の王朝が興った年。血統が断裂して新王朝が立つたびに更新される。
   * 家系図の見出しに使う表示用の値で、どの計算式にも入らない
   */
  foundedYear: number;
  /**
   * 後継者に自動で付ける名前の候補。
   * データは JSON から読み、コードには書かない
   */
  namePool: string[];
  ruler: Ruler;
  /** 継承候補（君主の子や傍系） */
  members: DynastyMember[];
  /** 成立済みの婚姻のうち、子の誕生を待っている効果 */
  pendingMarriages: PendingMarriage[];
  /** 歴代の死と継承の記録 */
  history: DeathRecord[];
  /** 継承危機の余韻。0より大きい間は簒奪者の確率が上がる */
  crisisYearsRemaining: number;
  /**
   * 君主能力を設定から変更したセーブに立つフラグ。
   * スコア比較を無意味にしないため必ず記録に残す
   */
  abilitiesAdjusted: boolean;
}

// ── マギステル・ミリトゥム（軍司令官） ────────────────

/**
 * 軍司令官。
 *
 * 395〜476年の西ローマを実際に動かしていたのは皇帝ではなくこの職で、
 * スティリコ・アエティウス・リキメルはいずれも皇帝ではない。
 *
 * 7パラメータには含めず、王朝と同じく GameState の別サブ構造として持つ。
 * 新しい資源ではなく、既存の計算式（戦闘の防御側戦力・legitimacy の
 * 自然減・簒奪者の確率）に対する補正としてのみ作用する
 */
export interface General {
  id: string;
  /** 軍事。君主の軍事能力と同じ尺度 */
  military: number;
  appointedYear: number;
  /** 天命で定めた退任年。これを過ぎると職を退く */
  retiresYear: number;
}

export type GeneralEnd = 'dismissed' | 'retired' | 'usurped';

export interface GeneralRecord {
  generalId: string;
  military: number;
  fromYear: number;
  toYear: number;
  end: GeneralEnd;
}

/** 軍司令官の職。空位でも遊べるが、その間は防衛が弱くなる */
export interface GeneralSeat {
  current: General | null;
  /** 歴代の記録。年代記に出す */
  history: GeneralRecord[];
}

/** 子が生まれてから発生する婚姻の効果 */
export interface PendingMarriage {
  origin: MarriageOrigin;
  marriedYear: number;
}

// ── 難易度 ────────────────────────────────────────────

export type Difficulty = 'beginner' | 'standard' | 'veteran';

/**
 * 難易度は新しいメカニクスを足さず、既存の計算式に掛ける倍率
 * としてのみ作用する。中級(standard)はすべて 1.0 で、
 * 調整済みの基準バランスがそのまま中級になる
 */
export interface DifficultySettings {
  /** 税収にかかる倍率 */
  incomeMultiplier: number;
  /** 蛮族の攻撃側戦力にかかる倍率 */
  barbarianPowerMultiplier: number;
  /** フォエデラティの給金要求の膨張率にかかる倍率 */
  foederatiEscalationMultiplier: number;
  /**
   * 史実の災厄がどれだけ再現されるか。
   * 有害な歴史イベントの発火確率と被害量の両方に掛かる。
   * 1.0 で史実通り、小さいほど西ローマに有利な歴史になる
   */
  historicalSeverityMultiplier: number;
}

/**
 * その年に起きたが、前後の状態を見比べても復元できない出来事。
 *
 * 脱走も簒奪未遂も野戦軍を減らすだけなので、記録しないと
 * プレイヤーには「理由の説明なく軍が消えた」としか見えない。
 * 表示する文言は ui 側で当てる。core に画面用の文字列は置かない
 */
export type TurnEventId =
  | 'desertion'
  | 'usurper_attempt'
  /** 簒奪を起こしたのが軍司令官だった年 */
  | 'general_usurped'
  /** 軍司令官が任期を終えて職を退いた年 */
  | 'general_retired'
  /** プラエトリア長官が任期を終えて職を退いた年 */
  | 'prefect_retired'
  /** 属州総督が任期を終えて職を退いた年 */
  | 'governor_retired'
  /** 蛮族の本拠地を征服した年 */
  | 'homeland_conquered'
  /** 征服した本拠地を蛮族に取り返された年 */
  | 'homeland_lost'
  /** 属州総督が反乱を起こした年 */
  | 'governor_revolt'
  /** 皇帝の兄弟（傍系の一族）が帝位を狙って挙兵した年 */
  | 'brother_revolt'
  /** 東ローマとの戦端が開かれた年 */
  | 'east_war_declared'
  /** 東方の属州を1つ征服した年 */
  | 'east_province_taken'
  /** 東ローマに攻め返され、東方の属州を奪い返された年 */
  | 'east_province_lost'
  /** 東ローマと講和した年 */
  | 'east_peace'
  /** ペルシアが介入を始めた年 */
  | 'persia_intervened'
  /** ペルシアが属州を奪った年 */
  | 'persia_offensive'
  /** 会戦に勝った年 */
  | 'pitched_victory'
  /** 会戦に敗れた年 */
  | 'pitched_defeat'
  /** 会戦で大敗し、属州が動揺した年 */
  | 'pitched_rout'
  /** 君主が捕虜になった年 */
  | 'ruler_captured'
  /** 総督が皇帝を僭称して属州ごと離れた年 */
  | 'usurper_empire'
  /** 僭称帝国との戦に勝った年（まだ潰し切れていない） */
  | 'usurper_battle_won'
  /** 僭称帝国との戦に敗れた年 */
  | 'usurper_battle_lost'
  /** 僭称帝国を平らげ、属州を取り戻した年 */
  | 'usurper_suppressed'
  /** 統一した帝国が代替わりで東西に割れた年 */
  | 'empire_partitioned'
  /** 東方が西の従属国になった年 */
  | 'east_vassalized'
  /** 従属国だった東ローマが独立した年 */
  | 'east_independence'
  /** 東方属州をすべて手中に収めた年 */
  | 'rome_reunified'
  /** ユスティニアヌス1世が西方の回復を掲げて戦端を開いた年 */
  | 'justinian_reconquest'
  /** 血統が断裂し、新しい王朝が興った年 */
  | 'dynasty_founded'
  /** 蛮族が西ではなく東ローマへ攻め入った年 */
  | 'barbarian_east_raid'
  /** ペルシア本土への遠征に勝った年 */
  | 'persia_invaded'
  /** ペルシアを屈服させ、介入を取り下げさせた年 */
  | 'persia_subdued';

// ── 官職（プラエトリア長官・属州総督） ────────────────

/**
 * 官職に就く人物。
 *
 * 君主能力や軍司令官と同じく**新しい資源ではない**。
 * 既存の計算式に対する補正としてのみ作用する。
 *
 * `ambition`（野心）は反乱の確率にだけ効く。有能な人物ほど
 * 帝国の役に立つが、同時に帝位に手が届いてしまうという
 * この時代の構図を、能力とは別の軸で持たせる
 */
export interface Official {
  id: string;
  name: string;
  /** 職務能力。1〜10。ABILITY_NEUTRAL を基準に補正が上下する */
  ability: number;
  /** 野心。1〜10。反乱の確率にのみ効く */
  ambition: number;
  appointedYear: number;
  /** 任期。この年になると自ら退く */
  retiresYear: number;
}

/**
 * プラエトリア長官（praefectus praetorio）。
 *
 * 近衛隊は312年に解散しているので、この時代の長官は軍の指揮官ではなく
 * 税務・軍糧・属州行政を統べる文官の筆頭。軍を率いるのは
 * マギステル・ミリトゥムのほうで、役割は重ならない。
 *
 * 作用先は既存の2つの式に限る:
 * - 税収（徴税機構を握っているため）
 * - 元老院支持の自然減（貴族との折衝が職務のため）
 */
export interface PrefectSeat {
  current: Official | null;
  /**
   * 任命の候補。空位のあいだだけ並ぶ。
   * 誰を選ぶかをプレイヤーに決めさせるため state に持たせる。
   * 毎ターン引き直すと選択が無意味になるので、空位になった年に一度だけ作る
   */
  candidates: Official[];
  history: OfficialRecord[];
}

/** 属州総督。担当する属州の統治と防衛にだけ効く */
export interface Governor extends Official {
  /** 属州、または征服した郷里 */
  provinceId: GovernedId;
}

export interface GovernorSeat {
  current: Governor | null;
  candidates: Governor[];
}

/**
 * 総督を置ける土地。属州と、**征服した蛮族の郷里**。
 *
 * 郷里も `control` / `garrison` を持つので、属州とまったく同じ働き方で
 * 総督が効く。奪ったまま放り出さず、統治して守れるようにする
 */
export type GovernedId = ProvinceId | BarbarianFactionId;

export type OfficialEnd = 'retired' | 'dismissed' | 'revolted';

export interface OfficialRecord {
  officialId: string;
  name: string;
  fromYear: number;
  toYear: number;
  ability: number;
  end: OfficialEnd;
}

// ── 蛮族の本拠地 ──────────────────────────────────────

/**
 * 帝国の外にある各勢力の郷里。
 *
 * 7パラメータには含めない別サブ構造。征服すると `owner` が 'west' になり、
 * 西の収入と保持属州数に加わる。属州（`provinces`）に混ぜないのは、
 * 蛮族AIの進路や既存の計算式に紛れ込ませないため
 */
export interface Homeland {
  /** 郷里を持つ勢力。地図の領域もこの id で引く */
  factionId: BarbarianFactionId;
  /** 表示名（ゲルマニア、ダキアなど）。データから読む */
  name: string;
  control: number;
  baseTax: number;
  garrison: number;
  owner: 'barbarian' | 'west';
}

// ── 東ローマ・ペルシアの軍司令官 ──────────────────────

/**
 * 敵国の将。西の軍司令官と同じく戦闘の防御・攻撃を補正するだけで、
 * 新しい資源ではない。名と能力を持ち、地図から見られる
 */
export interface ForeignCommander {
  name: string;
  military: number;
}

// ── シナリオ ──────────────────────────────────────────

/**
 * 遊ぶ世界線。
 *
 * `historical` は395〜476年の史実で、勝利は延命。既存の調整済みバランスそのもの。
 * `reunification` は「東を併合してローマを統一できた世界線」で、
 * 勝利条件も敵も別物になる。史実側の数値には影響させない
 */
export type Scenario = 'historical' | 'reunification';

// ── 東ローマ帝国 ──────────────────────────────────────

export type EastProvinceId = 'Thracia' | 'Asiana' | 'Oriens' | 'Aegyptus';

/**
 * 東方の属州。西の属州と同じ形だが、持ち主が変わる。
 * 西の `provinces` に混ぜないのは、史実シナリオで
 * 収入計算や蛮族の進路に紛れ込ませないため
 */
export interface EastProvince {
  id: EastProvinceId;
  control: number;
  baseTax: number;
  garrison: number;
  /**
   * 征服すると 'west' に変わり、西の収入に加算されるようになる。
   * ペルシアに奪われた属州は 'persia' になり、取り返さない限り統一できない
   */
  owner: 'east' | 'west' | 'persia';
}


/**
 * 東ローマの立ち位置。
 *
 * `vassal` は西の宗主権のもとにある従属国。西が東を平らげたあと、
 * 複数の後継者に分けられて生まれる「西ローマの東方帝」がこれにあたる。
 * 兵権は西にあり、貢納も西へ入るが、野心の高い東帝は独立を図る
 */
export type EastStance = 'peace' | 'war' | 'vassal';

/** 従属国の東帝。西の宗主権のもとで東方を治める */
export interface VassalRuler {
  name: string;
  /** 野心。1〜10。独立の確率にのみ効き、他には一切効かない */
  ambition: number;
}

export interface EastEmpire {
  /** 東の野戦軍。西との戦争でのみ使う */
  army: number;
  /** 東の軍司令官。西と同じくマギステル・ミリトゥムを置く */
  commander: ForeignCommander;
  stance: EastStance;
  /** 開戦した年。講和の可否や正統性の判定に使う */
  warStartYear: number | null;
  /** 従属国のときの東帝。独立するまで居座る */
  vassalRuler: VassalRuler | null;
  provinces: EastProvince[];
}

// ── サーサーン朝ペルシア ──────────────────────────────

export interface Persia {
  strength: number;
  /** ペルシアの軍司令官（エーラーン・スパーフベド） */
  commander: ForeignCommander;
  /** 介入を始めたか。ローマ同士の戦争が引き金になる */
  intervened: boolean;
  /** 介入を始めた年 */
  interventionYear: number | null;
  /** ペルシアが奪った東方属州。取り返さない限り統一は成立しない */
  seizedProvinces: EastProvinceId[];
  /**
   * 西との関係（0〜100）。
   *
   * 7パラメータには足さない。`eastRelations` と違って新しい資源にはせず、
   * 既存の2つの確率（介入の開始・毎年の攻勢）を下げる補正としてのみ働く。
   * 使者と贈り物でしか動かず、上がっても軍が来るわけではない
   */
  relations: number;
}

// ── 会戦と僭称帝国 ────────────────────────────────────

/** 会戦を率いる者。皇帝自身か、軍司令官か */
export type BattleLeader = 'ruler' | 'general';

/** 会戦の相手。蛮族の軍勢か、東ローマの野戦軍か、ペルシアの軍か */
export type BattleFoe =
  | { kind: 'barbarian'; factionId: BarbarianFactionId }
  | { kind: 'east' }
  | { kind: 'persia' };

/** 会戦の結末。margin の大きさで段が変わる */
export type BattleOutcome = 'victory' | 'defeat' | 'rout' | 'captured';

// ── 戦場（会戦の戦列マップ） ──────────────────────────

/** 戦列。左翼・中央・右翼の3つ */
export type BattleLane = 'left' | 'center' | 'right';

/** 兵科。歩兵・騎兵・弓の3つ。相性は 騎兵 > 弓 > 歩兵 > 騎兵 */
export type BattleArm = 'infantry' | 'cavalry' | 'archers';

/** その戦列にその年に出す命令。前進・迂回・退却 */
export type BattleOrder = 'advance' | 'flank' | 'withdraw';

/** 戦場の地形。属州から引く。兵科ごとの補正としてのみ働く */
export type Terrain = 'plain' | 'hill' | 'forest' | 'desert' | 'river';

/** 戦列に並ぶ一隊。兵科・兵力・士気を持つ */
export interface BattleUnit {
  arm: BattleArm;
  strength: number;
  /** 0〜100。尽きるとその隊は崩れ、兵力ごと戦場から消える */
  morale: number;
}

/** 戦場の片側。3つの戦列に隊を並べる */
export interface BattleSide {
  lanes: Record<BattleLane, BattleUnit[]>;
}

/** 1回の激突の記録。表示のためだけに持つ */
export interface BattleRoundLog {
  round: number;
  lane: BattleLane;
  ourOrder: BattleOrder;
  theirOrder: BattleOrder;
  /** 迂回でこの戦列が突いた相手の戦列。正面なら同じ戦列 */
  ourTarget: BattleLane;
  ourLoss: number;
  theirLoss: number;
  ourBroke: boolean;
  theirBroke: boolean;
}

/**
 * 戦場。会戦を挑んだ年だけ立ち、決着すると消える一時的な状態。
 *
 * 7パラメータには足さず `GameState` の別サブ構造として持つ。
 * **戦術は戦略の結果を置き換えない。** ここで積んだ優劣は
 * `battlefieldTactics()` が返す1つの補正倍率になり、
 * 既存の `giveBattle()` の攻撃側戦力に掛かるだけ。
 * 中庸に戦えば 1.0 になるので、既存の釣り合いは動かない
 */
export interface Battlefield {
  foe: BattleFoe;
  leader: BattleLeader;
  terrain: Terrain;
  /** 戦場になった土地の id（属州・東方属州・`exterior`）。表示は UI 側で引く */
  placeId: string;
  /** 何度目の激突か。1から数える */
  round: number;
  /** `deploy` のあいだは布陣を待っている。`done` なら決着済み */
  phase: 'deploy' | 'engaged' | 'done';
  ours: BattleSide;
  theirs: BattleSide;
  ourStartStrength: number;
  theirStartStrength: number;

  /**
   * 指揮官の能力から来る士気の粘り。戦場を開いた時点で焼き付ける。
   * こうすると激突の解決に `GameState` が要らなくなる
   */
  resilience: number;

  /**
   * 指揮官の能力から来る**機動の巧拙**。迂回と退却の成否にだけ効く。
   * 前進には掛からないので、中庸に指した基準（`baselineExchange`）は動かない
   */
  maneuver: number;

  /**
   * 同じ布陣・同じ敵に**中庸の指し手で臨んだ場合の交換比**。
   * 戦場を開いた時点で一度だけ試算して焼き付ける。
   *
   * 戦術の優劣はこれとの差で測る。兵力で劣る側は中庸に指しても
   * 交換比が悪くなるので、絶対値で測ると数の差を二重に罰してしまう
   */
  baselineExchange: number;

  log: BattleRoundLog[];

  /**
   * 決着したら適用するその年のアクション。
   *
   * 会戦はターンの途中で起きるので、戦場が開いているあいだ
   * その年はまだ進んでいない。ここに預けておくことで、
   * **`tick()` の処理順（収入→支出→行動→蛮族…）を崩さずに**
   * 戦闘画面を挟める。セーブも戦闘の途中で取れる
   */
  pendingActions: PlayerAction[];
}

/**
 * 僭称帝国。
 *
 * 大敗や君主の捕縛で属州が動揺し、野心の高い総督がローマ皇帝を
 * 僭称して離れた国。史実のエデッサの戦い（260年、ウァレリアヌス捕縛）の
 * あとに現れたガリア帝国やパルミラの型を、この時代に置いたもの。
 *
 * 7パラメータには足さず `GameState` の別サブ構造として持つ。
 * 握られた属州は収入にも保持属州数にも数えない
 */
export interface Usurper {
  id: string;
  /** 「ガリア帝国」のように地域名＋帝国 */
  name: string;
  /** 僭称した皇帝の名 */
  emperorName: string;
  /** 握っている属州 */
  provinces: ProvinceId[];
  /** 僭称帝国の兵力。討伐の相手になる */
  strength: number;
  foundedYear: number;
}

// ── 状態モデル（7パラメータ固定） ────────────────────

export interface GameState {
  turn: number;
  /** 395〜476 */
  year: number;

  treasury: number;
  taxBase: number;
  fieldArmy: number;
  legitimacy: number;
  senateSupport: number;
  eastRelations: number;
  foederatiLoyalty: number;

  provinces: Record<ProvinceId, Province>;
  factions: Record<BarbarianFactionId, BarbarianFaction>;

  /** 君主と王朝。7パラメータには含めない別サブ構造 */
  dynasty: Dynasty;

  /** 軍司令官。これも7パラメータには含めない別サブ構造 */
  general: GeneralSeat;

  /** プラエトリア長官。財政と属州行政の長。同じく別サブ構造 */
  prefect: PrefectSeat;

  /** 属州総督。属州ごとに1人。空位もありうる */
  /**
   * 総督。属州は常に席があり、郷里は**征服した年に席ができる**
   * （取り返されると席ごと消える）
   */
  governors: Partial<Record<GovernedId, GovernorSeat>>;

  /**
   * 僭称帝国。会戦の大敗や君主の捕縛をきっかけに現れる。
   * 7パラメータには含めない別サブ構造
   */
  usurpers: Usurper[];

  /**
   * 属州の動揺が残っている年数。会戦の大敗や君主の捕縛で立つ。
   * 総督の反乱判定を押し上げるだけの一時的な値で、資源ではない
   */
  upheavalYearsRemaining: number;

  /**
   * 会戦の戦場。挑んだ年だけ立ち、決着すると `null` に戻る。
   * 開いているあいだ UI は戦闘画面に切り替わる
   */
  battlefield: Battlefield | null;

  /**
   * 蛮族の本拠地。7パラメータには含めない別サブ構造。
   * 征服すると西の領域になる
   */
  /**
   * 郷里。移動を続けた勢力は持たないので、全勢力ぶんは揃わない。
   * 郷里の無い勢力は遠征の相手にならず、戦力そのものを叩くしかない
   */
  homelands: Partial<Record<BarbarianFactionId, Homeland>>;

  /**
   * 東ローマ帝国。7パラメータには含めない別サブ構造。
   * 史実シナリオでは属州も軍も持たない空の状態で、
   * eastRelations だけが従来どおり働く
   */
  east: EastEmpire;

  /**
   * サーサーン朝ペルシア。同じく別サブ構造。
   * ローマ同士が潰し合うと漁夫の利を狙って動き出す
   */
  persia: Persia;

  /** 遊ぶシナリオ。難易度と同じくプレイ開始時の設定 */
  scenario: Scenario;

  /** 難易度。7パラメータではなくプレイ開始時の設定 */
  difficulty: Difficulty;

  /** onceOnly なイベントの再発火防止用 */
  /** 東方属州をすべて手中に収めた年。統一は勝利ではなく通過点として記録する */
  unifiedYear: number | null;

  firedEventIds: string[];

  /** その年に起きた、状態の差分からは読み取れない出来事。毎ターン作り直す */
  turnEvents: TurnEventId[];

  /** Africa の control が一度でも0以下になったか（Italia への恒久ペナルティは一度だけ適用） */
  africaLost: boolean;

  status: GameStatus;
}

/**
 * `unified` は統一シナリオ専用の勝利。
 * 東方属州をすべて西の持ち物にし、なおかつペルシアを退けた状態を指す
 */
export type GameStatus = 'ongoing' | 'survived' | 'collapsed' | 'unified';

// ── プレイヤーアクション（1ターン最大2つ） ──────────

export type ActionCategory = 'diplomacy' | 'hire' | 'military' | 'domestic' | 'east';

export interface NegotiateTributeAction {
  type: 'negotiate_tribute';
  factionId: BarbarianFactionId;
  amount: number;
}

export interface NegotiateSettleAction {
  type: 'negotiate_settle';
  factionId: BarbarianFactionId;
  provinceId: ProvinceId;
}

/**
 * 突きつけられた要求を飲む。
 * 何を差し出すかは要求の種類が決めるので、プレイヤーは相手を選ぶだけ
 */
export interface NegotiateAcceptDemandAction {
  type: 'negotiate_accept_demand';
  factionId: BarbarianFactionId;
}

/**
 * 婚姻同盟。相手は蛮族勢力の族長家・東ローマ帝室・
 * ローマの元老院貴族の家門のいずれか。
 * Task B の診断（枠を増やすと生存率が下がる＝枠は不足していない）に
 * 基づき、無償にせず行動枠を消費させる
 */
export interface NegotiateMarriageAction {
  type: 'negotiate_marriage';
  target: MarriageOrigin;
}

export interface HireFoederatiAction {
  type: 'hire_foederati';
  factionId: BarbarianFactionId;
}

export interface MilitaryDeployAction {
  type: 'military_deploy';
  provinceId: ProvinceId;
}

export interface MilitaryDefendAction {
  type: 'military_defend';
  provinceId: ProvinceId;
}

export interface MilitaryConscriptAction {
  type: 'military_conscript';
}

export interface DomesticRaiseTaxesAction {
  type: 'domestic_raise_taxes';
}

export interface DomesticReorganizeArmyAction {
  type: 'domestic_reorganize_army';
}

export interface DomesticAppeaseSenateAction {
  type: 'domestic_appease_senate';
}

/** 競技会を催す。国庫を割いて元老院と民衆の機嫌を取る */
export interface DomesticHoldGamesAction {
  type: 'domestic_hold_games';
}

/** 執政官位を貴族に授ける。金は要らないが、その年の栄誉は皇帝のものでなくなる */
export interface DomesticGrantConsulshipAction {
  type: 'domestic_grant_consulship';
}

/**
 * 荒地に入植させる。**税基盤を戻せる唯一の手**。
 *
 * 略奪と定住で失われた耕地に、退役兵と捕虜を入れて起こし直す。
 * 国庫を大きく削り、荒れた大所領を国家が接収するので、その土地を
 * 握っていた元老院貴族の支持を失う。元老院への譲歩
 * （元老院 +12 / 税基盤 −2）のちょうど逆向きの取引になる
 */
export interface DomesticResettleLandAction {
  type: 'domestic_resettle_land';
}

export interface EastRequestAidAction {
  type: 'east_request_aid';
}

export interface EastConfirmTitleAction {
  type: 'east_confirm_title';
}

/**
 * 東ローマへの修好。使者と贈り物を送って関係を戻す。
 *
 * 援軍要請（関係 −12）と帝位の承認（関係 −6）は東との関係を削るので、
 * 使い続けると関係30を割って援軍が撃てなくなる。
 * 関係を能動的に戻す手段が無いと、東帝国の欄は
 * 「使い切ったら終わり」の一方通行になっていた
 */
export interface EastImproveRelationsAction {
  type: 'east_improve_relations';
}

/** 東ローマに宣戦する。統一シナリオでのみ選べる */
export interface EastDeclareWarAction {
  type: 'east_declare_war';
}

/**
 * 蛮族の本拠地へ遠征する。支配度を0まで削ると属州として併合できる。
 * 他の敵対勢力が連合して守るので、属州の防衛より重い
 */
export interface ConquerHomelandAction {
  type: 'conquer_homeland';
  factionId: BarbarianFactionId;
}

/** 東方の属州へ侵攻する。統一シナリオでのみ選べる */
export interface EastInvadeAction {
  type: 'east_invade';
  provinceId: EastProvinceId;
}

/**
 * サーサーン朝の本土へ遠征する。**ローマを統一したあとにだけ選べる。**
 *
 * ペルシアの都クテシフォンはこの地図では属州ではないので落とせない。
 * 代わりに本土を突いてその戦力そのものを削る形にしてある。
 * 削り切ればペルシアは介入を取り下げ、東方戦線が閉じる
 */
export interface PersiaInvadeAction {
  type: 'persia_invade';
}

/** その属州で兵を募る。中央の徴募と違い、土地の豊かさと支配度で穫れ高が変わる */
export interface MilitaryRecruitProvinceAction {
  type: 'military_recruit_province';
  provinceId: ProvinceId;
}

/** 野戦軍どうしの会戦を挑む */
export interface MilitaryPitchedBattleAction {
  type: 'military_pitched_battle';
  foe: BattleFoe;
  leader: BattleLeader;
  /**
   * 会戦に動員する属州。守備隊の一部を戦場へ連れ出す。
   * 勝てば分厚いが、その属州は薄くなる
   */
  mobilize?: ProvinceId[];
  /**
   * 戦場（戦列マップ）で積んだ優劣の倍率。攻撃側戦力に掛かる。
   * 省略すると 1.0 で、戦闘画面を経ない場合と同じ扱いになる
   */
  tactics?: number;
}

export interface MilitarySuppressUsurperAction {
  type: 'military_suppress_usurper';
  usurperId: string;
}

export interface PersiaImproveRelationsAction {
  type: 'persia_improve_relations';
}

export interface EastMakePeaceAction {
  type: 'east_make_peace';
}

/**
 * プラエトリア長官を任命する。候補の中から選ぶ。
 * 誰を選ぶかが判断になるので、対象の id を持たせる
 */
export interface AppointPrefectAction {
  type: 'appoint_prefect';
  officialId: string;
}

export interface DismissPrefectAction {
  type: 'dismiss_prefect';
}

/** 属州総督を任命する。属州と候補の両方を指定する */
export interface AppointGovernorAction {
  type: 'appoint_governor';
  /** 属州、または征服した郷里 */
  provinceId: GovernedId;
  officialId: string;
}

export interface DismissGovernorAction {
  type: 'dismiss_governor';
  provinceId: GovernedId;
}

/** 軍司令官を任命する。空位を埋める */
export interface MilitaryAppointGeneralAction {
  type: 'military_appoint_general';
}

/**
 * 軍司令官を解任する。
 * 正統性は戻るが、その将に従っていた兵は離れる
 */
export interface MilitaryDismissGeneralAction {
  type: 'military_dismiss_general';
}

export type PlayerAction =
  | NegotiateTributeAction
  | NegotiateSettleAction
  | NegotiateAcceptDemandAction
  | NegotiateMarriageAction
  | HireFoederatiAction
  | MilitaryDeployAction
  | MilitaryDefendAction
  | MilitaryConscriptAction
  | MilitaryAppointGeneralAction
  | MilitaryDismissGeneralAction
  | DomesticRaiseTaxesAction
  | DomesticReorganizeArmyAction
  | DomesticAppeaseSenateAction
  | DomesticHoldGamesAction
  | DomesticGrantConsulshipAction
  | DomesticResettleLandAction
  | EastRequestAidAction
  | EastConfirmTitleAction
  | AppointPrefectAction
  | DismissPrefectAction
  | AppointGovernorAction
  | DismissGovernorAction
  | ConquerHomelandAction
  | EastImproveRelationsAction
  | EastDeclareWarAction
  | EastInvadeAction
  | EastMakePeaceAction
  | PersiaImproveRelationsAction
  | PersiaInvadeAction
  | MilitaryRecruitProvinceAction
  | MilitaryPitchedBattleAction
  | MilitarySuppressUsurperAction;

/**
 * 1ターンに渡すアクション。
 *
 * 行動枠を消費するものは MAX_ACTIONS_PER_TURN までで、超えた分は
 * tick が捨てる。突きつけられた要求への応答だけは枠を消費しない
 * （consumesActionSlot を参照）ので、要素数は固定にできない
 */
export type PlayerActions = readonly PlayerAction[];

// ── 乱数・コアループ ──────────────────────────────────

export type Seed = number;

export type TickFn = (state: GameState, actions: PlayerActions, seed: Seed) => GameState;

/**
 * プレイヤー行動がそのターンの蛮族AI・戦闘解決にだけ与える影響。
 * ターンをまたいで持ち越さないため GameState には保持しない
 */
export interface TurnModifiers {
  /** 貢納で買収済みの勢力。このターンは攻撃してこない */
  pacified: Set<BarbarianFactionId>;
  /** 野戦軍を派遣した属州。防衛時の野戦軍寄与が上がる */
  reinforced: Set<ProvinceId>;
}

// ── 歴史イベント（data/events.json の型） ────────────

export type ComparisonOperator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq';

export interface StateCondition {
  /** GameState 内へのパス。例: "treasury" / "provinces.Africa.control" */
  field: string;
  operator: ComparisonOperator;
  value: number | string | boolean;
}

export interface EventCondition {
  year?: number;
  minYear?: number;
  maxYear?: number;
  /** すべて満たす必要がある条件（AND） */
  stateConditions?: StateCondition[];
  /**
   * いずれか1つ満たせばよい条件（OR）。
   * 「ヒスパニアまたはガリアにいる」のように発火口を複数持たせるために使う。
   * stateConditions と併用した場合は AND で結ばれる
   */
  anyOf?: StateCondition[];
}

export interface EventEffect {
  /** GameState 内へのパス。例: "treasury" / "provinces.Africa.control" */
  field: string;
  delta?: number;
  set?: number | string | boolean;
}

export interface HistoricalEvent {
  id: string;
  /** 史実上の年（発火条件とは独立した参考情報） */
  year: number;
  title: string;
  description: string;
  condition: EventCondition;
  effects: EventEffect[];
  onceOnly: boolean;
  /**
   * 帝国にとって不利なイベントか。
   * 難易度による緩和は有害なイベントにだけ掛ける。
   * 有益なイベント（カタラウヌムの勝利など）まで弱めると
   * 初級のほうが不利になってしまうため
   */
  harmful: boolean;
}

// ── 勝敗判定 ──────────────────────────────────────────

export interface ScoreResult {
  status: GameStatus;
  finalYear: number;
  provincesHeld: number;
  taxBase: number;
  legitimacy: number;
  score: number;
  /** 君主能力を設定から変更したプレイ。他のスコアと比較できない */
  abilitiesAdjusted: boolean;
  /** 難易度。異なる難易度のスコアは比較できない */
  difficulty: Difficulty;
  /** 歴代君主の数 */
  rulerCount: number;
  /** 継承危機の回数 */
  successionCrises: number;
}
