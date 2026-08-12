// 数値定数はすべてここに集約する。

import type { Difficulty, DifficultySettings, Scenario } from './types';

/**
 * セーブデータの形式版。互換性のない変更をしたら上げる。
 * 2: 軍司令官（general）を追加。空で補える情報ではないため旧版は読めない
 * 3: 君主に名前（name）と後継者の名前候補（namePool）を追加
 * 4: シナリオ（scenario）と東ローマ・ペルシア（east / persia）を追加。
 *    空で補える情報ではないため旧版は読めない
 * 5: プラエトリア長官（prefect）と属州総督（governors）を追加
 * 6: 蛮族の郷里（homelands）と、東ローマ・ペルシアの軍司令官（commander）を追加
 * 7: ペルシアとの関係（persia.relations）を追加
 * 8: 僭称帝国（usurpers）と属州の動揺（upheavalYearsRemaining）を追加
 * 9: 東方帝（east.vassalRuler）・統一年（unifiedYear）・戦場（battlefield）を追加
 * 10: 戦場に指揮官の機動の巧拙（battlefield.maneuver）を追加
 */
export const SAVE_VERSION = 11;

export const STARTING_YEAR = 395;
export const ENDING_YEAR = 476;
export const TOTAL_TURNS = 81;

/**
 * シナリオごとの終わりの年。
 *
 * **史実は476年で終える。** ロムルス・アウグストゥルスの廃位が
 * この模型の終着点で、調整済みの釣り合いもすべてこの長さで測ってある。
 *
 * **統一は565年まで続く。** ユスティニアヌス1世の没年。
 * 東を併合できた世界線では、6世紀に東方から巻き返しが来る。
 * ベリサリウスとナルセスを迎え撃てるかがこのシナリオの山場になる
 */
export const SCENARIO_ENDING_YEAR: Record<Scenario, number> = {
  historical: 476,
  reunification: 565,
};

export function endingYearOf(scenario: Scenario): number {
  return SCENARIO_ENDING_YEAR[scenario];
}

export function totalTurnsOf(scenario: Scenario): number {
  return SCENARIO_ENDING_YEAR[scenario] - STARTING_YEAR;
}

export const INITIAL_TREASURY = 500;
export const INITIAL_TAX_BASE = 100;
export const INITIAL_FIELD_ARMY = 100;
export const INITIAL_LEGITIMACY = 80;
export const INITIAL_SENATE_SUPPORT = 60;
export const INITIAL_EAST_RELATIONS = 60;
export const INITIAL_FOEDERATI_LOYALTY = 70;

/**
 * 属州収入に対する徴税効率。
 * 元老院の非協力による減収（SENATE_INCOME_FLOOR）を織り込んだ値
 */
export const TAX_RATE = 0.8;

/** 野戦軍1ユニットあたりの維持費（ソリドゥス/ターン） */
export const ARMY_UPKEEP_PER_UNIT = 2;

/** 宮廷費（固定） */
export const COURT_UPKEEP = 50;

/** 国庫が負に転じたターンに脱走する野戦軍の割合 */
export const DESERTION_RATE = 0.1;

/** これ以下の野戦軍は事実上壊滅とみなす（脱走は乗算的減衰のため厳密に0にはならない） */
export const FIELD_ARMY_COLLAPSE_THRESHOLD = 5;

// ── 蛮族AI・戦闘 ──────────────────────────────────────

/** foederatiLoyalty がこれを下回るとフォエデラティが寝返る */
export const FOEDERATI_DEFECTION_LOYALTY_THRESHOLD = 20;

/** 境外の勢力がこの戦力未満なら侵入を試みない（初期戦力の差で侵入時期が自然に分散する） */
export const MIN_STRENGTH_TO_ADVANCE = 55;

/**
 * 境外の勢力が毎ターン帝国領へ侵入を試みる確率。
 *
 * これは1勢力あたりの率なので、勢力の数を増やすと帝国が受ける
 * 侵入の総量がそのまま増える。8勢力から13勢力に増やしたとき、
 * 0.3 のままでは中級・上級の生存率が 0% に落ちた。
 * 帝国が1年に受ける侵入の期待値を元の水準に戻すため 8/13 を掛けてある
 */
export const ADVANCE_PROBABILITY = 0.185;

/** 境外で待機している勢力の戦力成長率（ターンあたり） */
/**
 * 境外の勢力が、西ではなく**東ローマへ攻め入る**確率。
 *
 * ゴートもフンも実際には東の管区（トラキア・イリュリクム）を
 * 繰り返し荒らしている。西へ攻め入る判定より先に引き、
 * 当たればその年は西へ来ない。
 *
 * **西にとっては猶予と引き換えの取引になる。** その年は攻められないが、
 * 東で掠めた勢力は通常より大きく育って戻ってくる
 */
export const EAST_RAID_PROBABILITY = 0.1;
/** 東を荒らした年の成長率。境外での通常の成長より大きい */
export const EAST_RAID_GROWTH_RATE = 0.065;
/** 統一シナリオで、荒らされた東方属州が失う支配度 */
export const EAST_RAID_CONTROL_DAMAGE = 7;

/**
 * 連合が瓦解したあとの毎年の目減り。
 * 成長率（EXTERIOR_GROWTH_RATE）より速く削れる形にして、
 * 数十年で脅威として消えるようにする
 */
export const FACTION_COLLAPSE_DECAY_RATE = 0.11;

export const EXTERIOR_GROWTH_RATE = 0.05;

/**
 * 略奪だけを行う民（raider）が属州の支配度を削れる下限。
 * 掠めはするが土地を奪い切ることはないので、この水準より下へは落とせない。
 * SETTLE_CONTROL_THRESHOLD より十分上に取り、略奪だけで定住や
 * 土地の要求の条件が整うことがないようにしてある
 */
export const RAIDER_MIN_CONTROL = 55;

/**
 * 略奪だけを行う民の戦力の上限。
 *
 * 略奪する民は掠めた年のうちに境外へ引き揚げるので、
 * 境外での成長（EXTERIOR_GROWTH_RATE）がほぼ毎年かかり続ける。
 * 上限を置かないと 20 で始まったマウリが476年には 460 まで膨らみ、
 * 山地の襲撃者ではなく最大の脅威になってしまう。
 * 王国を建てず版図も増えない民は人も増えない、という形にする。
 *
 * MIN_STRENGTH_TO_ADVANCE より必ず大きく取ること。45 にしたときは
 * 閾値の 55 に届かず、マウリが一度も山を降りない飾りになった
 */
export const RAIDER_MAX_STRENGTH = 62;

/** 属州の control がこれを下回ると定住されうる */
export const SETTLE_CONTROL_THRESHOLD = 30;

/** 定住には守備隊のこの倍率以上の戦力が必要 */
export const SETTLE_STRENGTH_MULTIPLIER = 1.5;

/** 守備側の戦力補正（本国の地の利） */
export const DEFENSE_MULTIPLIER = 1.2;

/** 野戦軍のうち、1回の戦闘の防衛に振り向けられる戦力の割合 */
export const FIELD_ARMY_DEFENSE_SHARE = 0.2;

/** 戦闘の乱数幅（±） */
export const COMBAT_RANDOMNESS = 0.3;

/** 略奪成功時に属州 control が受けるダメージ */
export const RAID_CONTROL_DAMAGE = 8;

/** 略奪成功時に国庫が失う額 */
export const RAID_TREASURY_LOOT = 20;

/** 戦闘の優劣差に対する守備隊損耗係数 */
export const GARRISON_LOSS_FACTOR = 0.3;

/** 撃退に成功したターンの守備隊損耗係数（敗北時より軽い） */
export const GARRISON_LOSS_FACTOR_ON_VICTORY = 0.15;

/** 戦闘の優劣差に対する攻撃側損耗係数 */
export const ATTACKER_LOSS_FACTOR = 0.4;

/** フォエデラティが駐屯先属州の防衛に加える戦力の割合 */
export const FOEDERATI_DEFENSE_SHARE = 0.6;

/** Africa 喪失時に Italia の control が受ける恒久ペナルティ（穀物供給途絶） */
export const ITALIA_GRAIN_LOSS_PENALTY = 20;

// ── パラメータの上下限 ────────────────────────────────

export const MIN_CONTROL = 0;
export const MAX_CONTROL = 100;
export const MIN_TAX_BASE = 0;
export const MAX_TAX_BASE = 100;
export const MIN_LEGITIMACY = 0;
export const MAX_LEGITIMACY = 100;
export const MIN_SENATE_SUPPORT = 0;
export const MAX_SENATE_SUPPORT = 100;
export const MIN_EAST_RELATIONS = 0;
export const MAX_EAST_RELATIONS = 100;
export const MIN_FOEDERATI_LOYALTY = 0;
export const MAX_FOEDERATI_LOYALTY = 100;

// ── 支配度・税基盤の更新（コアループ ステップ6） ──────

/** 敵勢力のいない属州が毎ターン回復する control */
export const CONTROL_RECOVERY_PER_TURN = 4;

/** 略奪1回につき恒久的に失われる taxBase（同じく勢力数で割り直してある） */
export const RAID_TAX_BASE_LOSS = 0.6;

/** 蛮族1勢力の定住につき恒久的に失われる taxBase */
export const SETTLE_TAX_BASE_LOSS = 7;

/**
 * 元老院の非協力が徴税に与える影響の下限。
 * senateSupport が0でもこの割合の収入は得られる
 */
export const SENATE_INCOME_FLOOR = 0.55;

/**
 * 元老院支持の自然減。弱体化する宮廷から貴族が離れていく。
 * これがないと senateSupport は増税などが発火しない限り不動で、
 * domestic_appease_senate が発火条件に到達しない死んだ選択肢になる
 */
export const SENATE_SUPPORT_NATURAL_DECAY = 0.3;

// ── 正統性（コアループ ステップ7） ────────────────────

/** 属州の control が0に落ちた際の正統性低下 */
export const LEGITIMACY_LOSS_PER_PROVINCE_LOST = 10;

/** 蛮族の定住を許した際の正統性低下 */
export const LEGITIMACY_LOSS_PER_SETTLEMENT = 5;

/** 侵攻を撃退した際の正統性上昇 */
export const LEGITIMACY_GAIN_PER_VICTORY = 2;

/**
 * 476年到達時にこれを下回っていると、軍と属州が残っていても
 * 「名前だけの傀儡国家」として崩壊扱いにする
 */
export const SURVIVAL_MIN_LEGITIMACY = 20;

/** これを下回ると簒奪者イベントの判定が始まる */
export const USURPER_LEGITIMACY_THRESHOLD = 25;

/** 閾値を下回っているターンに簒奪者が現れる確率 */
export const USURPER_PROBABILITY = 0.25;

/** 簒奪未遂で失われる野戦軍の割合 */
export const USURPER_ARMY_LOSS_RATE = 0.15;

/** 簒奪未遂による正統性低下 */
export const USURPER_LEGITIMACY_LOSS = 8;

// ── フォエデラティの給金と忠誠 ────────────────────────

/** 給金を支払えたターンの忠誠回復 */
export const FOEDERATI_LOYALTY_RECOVERY = 4;

/** 給金を支払えなかったターンの忠誠低下 */
export const FOEDERATI_LOYALTY_DECAY_UNPAID = 14;

// ── プレイヤーアクション ──────────────────────────────

/** 1ターンに選べるアクション数の上限 */
export const MAX_ACTIONS_PER_TURN = 2;

// 交渉
/** 貢納を受けた勢力の忠誠上昇 */
export const TRIBUTE_LOYALTY_GAIN = 5;
export const MARRIAGE_COST = 120;
export const MARRIAGE_LOYALTY_GAIN = 10;
export const MARRIAGE_LEGITIMACY_LOSS = 3;

// 蛮族の要求（金・土地・称号）
/**
 * 属州に入った敵対勢力が、その年に要求を突きつける確率。
 * 0.3 では要求が絶え間なく、無視する遊び方の生存率が
 * 49% → 30% まで落ちて単なる難易度上げになっていた
 */
export const DEMAND_PROBABILITY = 0.09;
/** 金の要求額は戦力に比例する。強大な勢力ほど高く付く */
export const DEMAND_GOLD_PER_STRENGTH = 0.8;
/** 支配度がこれを下回った属州は、その土地そのものを要求される */
export const DEMAND_LAND_CONTROL_THRESHOLD = 32;
/** 土地を要求できない場合に、金ではなく称号を求める確率 */
export const DEMAND_TITLE_SHARE = 0.35;
/** 称号を認めた際の元老院支持の低下。蛮族に官位を与えたことへの反発 */
export const DEMAND_TITLE_SENATE_LOSS = 6;
/** 称号を認めた際の正統性の低下 */
export const DEMAND_TITLE_LEGITIMACY_LOSS = 3;
/**
 * 要求を突きつけたまま答えを得られない勢力の、攻撃側戦力への補正。
 *
 * 拒否の代償は「今年の戦闘が重くなる」で受ける。
 * 戦力の複利成長で罰する形にすると、飲んでも拒んでも損という
 * ただの難易度税になり、選択にならなかった（放置の成長率 0.07 で
 * 生存率が 52% → 29% に落ちた）
 */
export const DEMAND_REFUSAL_POWER_BONUS = 0.35;
/**
 * 答えを得られない勢力が定住に踏み切る支配度の上乗せ。
 *
 * 拒否の代償が「その年の戦闘が重い」だけだと、恒久的に資源を削る
 * 応諾のほうが常に損になり、拒否一択になる（計測では応諾26〜33%に
 * 対して拒否35%）。一時的な罰では恒久的な支払いに釣り合わない。
 * 要求を無視した土地はそのまま奪われうる、という形で釣り合わせる
 */
export const DEMAND_REFUSAL_SETTLE_CONTROL_BONUS = 15;
/**
 * 称号を認めて味方にした勢力の給金の割引率。
 * 相手が求めたのは金ではなく地位なので、雇うより安く付く。
 * これが無いとフォエデラティ契約に完全に劣り、選ぶ理由が消える
 */
export const DEMAND_TITLE_WAGE_DISCOUNT = 0.6;
/**
 * 金の要求を飲んだ勢力が失う戦力の割合。
 *
 * 引き揚げさせるだけでは、境外で毎年成長して数年後に戻ってくるので
 * 金を払う意味がほとんど無かった。金を受け取った軍は一部が散る、
 * という形にして、払った分だけ脅威の総量が恒久的に減るようにする
 */
export const DEMAND_GOLD_DISPERSAL_RATE = 0.3;

// 雇用（フォエデラティ契約）
export const FOEDERATI_HIRE_COST = 60;
/** 給金は勢力の戦力に比例する。強力な勢力を雇えばそれだけ高くつく */
export const FOEDERATI_DEMAND_PER_STRENGTH = 0.5;
/**
 * 契約が続く限り給金の要求は毎ターン膨らむ。
 * 「今日を凌ぐ判断が、10年後の帝国を殺す」構造の中核。
 * 複利なので81ターンで約2.6倍に達する（これ以上大きいと発散する）
 */
export const FOEDERATI_DEMAND_ESCALATION = 0.012;
/**
 * 駐屯するフォエデラティ1勢力が毎ターン恒久的に削る税基盤。
 * 給金を払い続けても土地は荒れ、税収基盤は戻らない
 */
export const FOEDERATI_TAX_BASE_DRAIN = 0.12;
export const FOEDERATI_HIRE_LEGITIMACY_LOSS = 2;

// 軍事
/** 派遣先属州の防衛に振り向けられる野戦軍の割合 */
export const DEPLOY_ARMY_DEFENSE_SHARE = 0.5;
/** 派遣による野戦軍の損耗率 */
export const DEPLOY_ATTRITION_RATE = 0.04;
export const DEFEND_COST = 40;
/**
 * 6 では戦闘損耗ですぐ溶けて元が取れず、入れると生存率が下がっていた。
 *
 * 勢力を14に増やしたあとは 10 でも足りない。戦線が同時に2つ3つ開くと、
 * 1属州の守備を厚くする手は野戦軍を増やす手に完全に負ける
 * （`defensive` が中級 0%、`passive` と区別が付かなくなっていた）
 */
export const DEFEND_GARRISON_GAIN = 14;
export const CONSCRIPT_COST = 150;
export const CONSCRIPT_ARMY_GAIN = 15;
export const CONSCRIPT_SENATE_LOSS = 5;

/*
 * 属州での募兵。中央の徴募（CONSCRIPT_*）と違い、
 * **その土地の豊かさと支配度で穫れ高が変わる。** 安いが、
 * 徴兵はその属州の支配度を削る（若者を連れていかれた土地は荒れる）。
 *
 * 中央の徴募が「金で兵を買う」なら、こちらは「土地から兵を出す」。
 * 豊かな属州を持っているほど効くので、循環の罠の裏返しになる
 */
export const PROVINCE_RECRUIT_COST = 70;
/** その属州の税収基礎に対する徴募量の係数。支配度にも比例する */
export const PROVINCE_RECRUIT_PER_BASE_TAX = 0.075;
/** 徴募でその属州が失う支配度 */
export const PROVINCE_RECRUIT_CONTROL_LOSS = 6;
/** 徴募でその属州の守備隊に残る割合（募った兵の一部はその場に残る） */
export const PROVINCE_RECRUIT_GARRISON_SHARE = 0.25;

/*
 * 会戦への動員。属州の守備隊を戦場へ連れ出す。
 *
 * 勝てば分厚いが、その属州は薄くなる。「今日を凌ぐ判断が
 * 10年後の帝国を殺す」構造を会戦の場でも作る
 */
/** 動員でその属州から連れ出す守備隊の割合 */
export const MOBILIZE_GARRISON_SHARE = 0.5;
/** 連れ出した守備隊が会戦の戦力になる効率。行軍で目減りする */
export const MOBILIZE_EFFICIENCY = 0.8;
/** 1回の会戦に動員できる属州の数 */
export const MOBILIZE_MAX_PROVINCES = 2;

// 内政
/** 徴税強化で得られる追加収入（通常収入に対する倍率） */
export const RAISE_TAXES_INCOME_MULTIPLIER = 0.5;
export const RAISE_TAXES_SENATE_LOSS = 8;
export const RAISE_TAXES_CONTROL_LOSS = 2;
export const REORGANIZE_COST = 60;
/**
 * 軍の再編は兵を生み出さず、属州の守備隊から野戦軍へ移すだけの
 * ゼロサムな再配分にする。各属州の garrison からこの割合を引き抜く。
 * 守備隊が尽きれば得られる兵も尽きるため、金がある限り毎ターン
 * 撃ち続けて兵を無限に増やすことができなくなる
 */
export const REORGANIZE_GARRISON_DRAW_RATE = 0.2;
/** 再配分に伴う損失。引き抜いた兵の全部が野戦軍にはならない */
export const REORGANIZE_TRANSFER_EFFICIENCY = 0.9;
export const APPEASE_SENATE_GAIN = 12;
export const APPEASE_SENATE_LEGITIMACY_GAIN = 4;
/** 免税特権の追認による恒久的な税基盤の損失 */
export const APPEASE_SENATE_TAX_BASE_LOSS = 2;

/**
 * 荒地への入植。**税基盤を戻せる唯一の手**。
 *
 * 略奪と定住で失われた耕地に退役兵と捕虜を入れて起こし直す。
 * 元老院への譲歩（元老院 +12 / 税基盤 −2）のちょうど逆向きで、
 * 荒れた大所領を国家が接収するぶん貴族の支持を失う。
 *
 * **戻る量は失う量より小さく取る。** 1件の定住で −7 失うのに対し
 * 1回の入植で戻るのは +3 なので、削られる速さには追いつかない。
 * 「属州を失うと帝国が痩せる」という循環の罠は残したまま、
 * 立て直す手だけを与えている
 */
export const RESETTLE_COST = 110;
export const RESETTLE_TAX_BASE_GAIN = 6;
export const RESETTLE_SENATE_LOSS = 8;

/*
 * 元老院の機嫌を取る手は3つ。**差し出すものをそれぞれ変える。**
 * 免税特権の追認は税基盤、競技会は国庫、執政官位は正統性を削る。
 * 「何を差し出して機嫌を取るか」を選ばせることが狙いなので、
 * どれか1つが常に得になってはいけない
 */

/** 競技会（ludi）。戦車競走と見世物にかかる費用 */
export const SENATE_GAMES_COST = 90;
export const SENATE_GAMES_SENATE_GAIN = 9;
/** 民衆も沸くので正統性にも効く。免税特権の追認より大きく取る */
export const SENATE_GAMES_LEGITIMACY_GAIN = 6;

/**
 * 執政官位（コンスル）の授与。
 *
 * この時代の執政官は実権のない名誉職で、皇帝が毎年貴族に与える褒賞だった。
 * 金も土地も要らないが、その年の栄誉は皇帝ではなくその貴族のものになる。
 * 軍司令官が戦勝の名声を持っていくのと同じ構図を、元老院に対して作る
 */
export const SENATE_CONSULSHIP_SENATE_GAIN = 16;
export const SENATE_CONSULSHIP_LEGITIMACY_LOSS = 5;

// ── マギステル・ミリトゥム（軍司令官） ────────────────

/**
 * 将軍の軍事能力の生成範囲。
 * 君主より上を広く取る。凡庸な皇帝の下でも名将が出うる、という
 * この時代の実態（スティリコ・アエティウス）を数値で表す
 */
export const GENERAL_ABILITY_ROLL_MIN = 4;
export const GENERAL_ABILITY_ROLL_MAX = 9;

/**
 * まれに出る名将。
 *
 * 東は6世紀にベリサリウス（軍事10）とナルセス（軍事9）を確実に得るのに、
 * 西は史実の顔ぶれ（`data/leaders.json` の `westCommanders`）が尽きた
 * あとは 4〜9 の抽選しか無く、一方的に不利だった。
 * 史実に該当する将がいない年でも、まれに桁違いの将が出るようにする。
 *
 * **新しい仕組みではない。** 抽選の幅を広げるだけ
 */
export const EXCEPTIONAL_GENERAL_PROBABILITY = 0.12;
export const EXCEPTIONAL_GENERAL_ABILITY = 10;

/**
 * 史実の将を迎えるのに必要な残り任期。
 * これを下回る年に任命したときは、その将ではなく通常の抽選になる
 * （アエティウスを453年に迎えて1年で退かれても意味がないため）
 */
export const HISTORIC_GENERAL_MIN_YEARS = 5;

/** 在職年数の範囲。任期を終えると自ら職を退く */
export const GENERAL_MIN_TERM = 8;
export const GENERAL_MAX_TERM = 28;

/**
 * 将軍の軍事能力1点あたり、戦闘の防御側戦力にかかる補正。
 * 君主の能力補正（ABILITY_MODIFIER_PER_POINT）と同じ形で、
 * ABILITY_NEUTRAL を基準に上下する
 */
export const GENERAL_DEFENSE_PER_POINT = 0.05;

/** 空位のあいだ防御側戦力にかかる罰。指揮官のいない軍は弱い */
export const GENERAL_VACANT_DEFENSE_PENALTY = 0.12;

/**
 * 有能な将軍が毎年削る正統性（ABILITY_NEUTRAL を超えた1点あたり）。
 *
 * 軍が皇帝ではなく将軍に従っている、という状態を既存のパラメータで表す。
 * 「強い将軍は帝国を守るが帝位を痩せさせる」というこの時代の構図が
 * ここで成立する
 */
export const GENERAL_LEGITIMACY_DRAIN_PER_POINT = 0.35;

/**
 * 将軍が持っていく戦勝の名声（ABILITY_NEUTRAL を超えた1点あたり）。
 *
 * 撃退で得られる legitimacy をこの割合だけ削る。名将の下では勝っても
 * 帝位は輝かない、という形にしないと「強い将軍を置く → 勝つ →
 * 正統性が回復する」で自己強化してしまい、取引にならなかった
 * （計測では名将を抱えても最終正統性が空位のときと同じ83だった）
 */
export const GENERAL_VICTORY_CREDIT_PER_POINT = 0.12;

/** 将軍の軍事能力1点あたり、簒奪者の確率に加算される値 */
export const GENERAL_USURPER_BONUS_PER_POINT = 0.02;

/** 任命の費用 */
export const GENERAL_APPOINT_COST = 80;

/**
 * 解任で失う野戦軍の割合。その将に従っていた兵が離れる。
 * スティリコ408年、アエティウス454年——除いた側が軍を失う
 */
export const GENERAL_DISMISS_ARMY_LOSS_RATE = 0.15;

/** 解任で回復する正統性 */
export const GENERAL_DISMISS_LEGITIMACY_GAIN = 8;

/** 将軍が簒奪を起こしたときに追加で失う野戦軍の割合 */
export const GENERAL_USURP_EXTRA_ARMY_LOSS = 0.1;

// ── 官職（プラエトリア長官・属州総督） ────────────────

/**
 * 官職の能力・野心の生成範囲。
 * 君主(3〜8)より少し広く取る。凡庸な皇帝の下に有能な官僚が並ぶ、
 * という軍司令官と同じ考え方
 */
export const OFFICIAL_ABILITY_ROLL_MIN = 3;
export const OFFICIAL_ABILITY_ROLL_MAX = 9;
export const OFFICIAL_AMBITION_ROLL_MIN = 1;
export const OFFICIAL_AMBITION_ROLL_MAX = 9;

/** 任命候補の人数。多すぎると選択が作業になるので3人 */
export const OFFICIAL_CANDIDATE_COUNT = 3;

// プラエトリア長官
export const PREFECT_APPOINT_COST = 100;
export const PREFECT_MIN_TERM = 10;
export const PREFECT_MAX_TERM = 28;
/**
 * 長官の能力1点あたり税収にかかる補正（ABILITY_NEUTRAL 基準）。
 * 徴税機構を握っているので税収に効く。軍事には一切効かない
 */
export const PREFECT_INCOME_PER_POINT = 0.03;
/** 空位のあいだ税収にかかる罰。徴税機構に頭がいない状態 */
export const PREFECT_VACANT_INCOME_PENALTY = 0.05;
/**
 * 長官の能力1点あたり、元老院支持の自然減にかかる軽減。
 * 貴族との折衝が職務なので、有能なら離反を抑えられる
 */
export const PREFECT_SENATE_DECAY_PER_POINT = 0.02;
/** 解任で回復する正統性。長官は軍を持たないので兵は離れない */
export const PREFECT_DISMISS_LEGITIMACY_GAIN = 3;

// 属州総督
export const GOVERNOR_APPOINT_COST = 30;
export const GOVERNOR_MIN_TERM = 12;
export const GOVERNOR_MAX_TERM = 32;
/** 総督の能力1点あたり、その属州の支配度の自然回復にかかる補正 */
export const GOVERNOR_CONTROL_RECOVERY_PER_POINT = 0.12;
/** 総督の能力1点あたり、その属州の守備隊の戦闘力にかかる補正 */
export const GOVERNOR_DEFENSE_PER_POINT = 0.04;
/** 空位の属州にかかる守備の罰 */
export const GOVERNOR_VACANT_DEFENSE_PENALTY = 0.06;

// ── 反乱 ──────────────────────────────────────────────

/**
 * 属州総督の反乱。
 *
 * 簒奪(checkUsurper)とは別口で、野心の高い総督が独立を図る。
 * この時代の西ローマはガリアやブリタンニアで実際に何度も僭称帝が
 * 立っており、崩壊は中央からではなく属州から始まった。
 *
 * **正統性に関わらず毎年判定する。** 当初は正統性が閾値を下回った年に
 * だけ起こしていたが、それだと順調な帝国では一度も起きず、
 * 「属州はいつ離れてもおかしくない」という緊張が出なかった。
 * 正統性は確率を押し上げる要因として残す
 */
export const GOVERNOR_REVOLT_BASE_PROBABILITY = 0.0007;
/** 野心が ABILITY_NEUTRAL を超えた1点あたりの上乗せ */
export const GOVERNOR_REVOLT_AMBITION_PER_POINT = 0.0008;
/**
 * 正統性の低さが確率をどれだけ押し上げるか。
 * この正統性を下回るほど線形に効き、0で最大になる
 */
export const GOVERNOR_REVOLT_LEGITIMACY_PRESSURE_FROM = 45;
export const GOVERNOR_REVOLT_LOW_LEGITIMACY_BONUS = 0.05;
/** 属州が荒れているほど反乱しやすい。支配度がこれを下回ると上乗せ */
export const GOVERNOR_REVOLT_LOW_CONTROL_THRESHOLD = 50;
export const GOVERNOR_REVOLT_LOW_CONTROL_BONUS = 0.008;
/** 1属州あたりの反乱確率の上限 */
export const GOVERNOR_REVOLT_PROBABILITY_CAP = 0.12;
/** 反乱でその属州が失う支配度 */
export const GOVERNOR_REVOLT_CONTROL_LOSS = 25;
/** 反乱で総督に付いていく守備隊の割合 */
export const GOVERNOR_REVOLT_GARRISON_LOSS_RATE = 0.5;
export const GOVERNOR_REVOLT_LEGITIMACY_LOSS = 6;

/**
 * 皇帝の兄弟（傍系の一族）の挙兵。
 *
 * 成人した一族がいるのに帝位が揺らいでいる年に起きる。
 * 後継者がいることは継承危機を防ぐ利点だが、同時に
 * 帝位を狙う者を抱えることでもある、という取引にする
 */
/** 総督と同じく、正統性に関わらず毎年判定する */
export const BROTHER_REVOLT_BASE_PROBABILITY = 0.002;
/** 成人した一族1人あたりの上乗せ */
export const BROTHER_REVOLT_PER_ADULT = 0.002;
/** 正統性の低さによる上乗せ。この値を下回るほど線形に効く */
export const BROTHER_REVOLT_LEGITIMACY_PRESSURE_FROM = 40;
export const BROTHER_REVOLT_LOW_LEGITIMACY_BONUS = 0.08;
export const BROTHER_REVOLT_PROBABILITY_CAP = 0.15;
/** 挙兵に付いていく野戦軍の割合 */
export const BROTHER_REVOLT_ARMY_LOSS_RATE = 0.18;
export const BROTHER_REVOLT_LEGITIMACY_LOSS = 10;

// ── 蛮族の本拠地の征服 ────────────────────────────────

/**
 * 帝国外への遠征。属州の防衛と違い、こちらから攻め込む。
 * 補給線が伸びるので本国の防衛派遣(0.5)より多くを割く必要がある
 */
export const CONQUEST_ARMY_SHARE = 0.7;
/** 遠征の損耗。東方への遠征(0.06)より重い。道も港もない土地へ攻め込む */
export const CONQUEST_ATTRITION_RATE = 0.07;
/** 勝った年に本拠地の支配度が受けるダメージ */
export const CONQUEST_CONTROL_DAMAGE = 25;
/** 併合した直後の支配度。奪ったばかりの異民族の地なので低い */
export const CONQUEST_INITIAL_CONTROL = 25;
/** 本拠地を守る側が、その勢力の戦力から出す割合 */
export const HOMELAND_DEFENSE_STRENGTH_SHARE = 0.5;

/**
 * 連合の防御補正。
 *
 * 帝国外へ攻め込むと、狙われた勢力以外の敵対勢力も加勢する。
 * 他勢力の戦力の合計にこの割合を掛けて守備側に足す。
 * 「蛮族同士が連合してくる」という想定を数値にしたもので、
 * 属州を守るのと違って遠征が重くなる主因になる
 */
export const COALITION_DEFENSE_SHARE = 0.25;

/**
 * 連合の高まり。すでに西が奪った郷里1つにつき、上の割合をこの率だけ増す。
 *
 * これが無いと、一度連合を破った帝国はそのまま境外を平らげてしまう
 * （初級で8勢力すべての郷里を取る局が出た）。奪われるほど残りが
 * 結束を固める形にして、遠征を重ねるほど次が重くなるようにする
 */
export const COALITION_RALLY_PER_HOMELAND = 0.35;

/** 併合した本拠地が毎年回復する支配度。属州(4)より遅い */
export const HOMELAND_CONTROL_RECOVERY = 2.5;
/**
 * 併合した本拠地を蛮族が取り返しに来る確率。
 * その勢力が健在なかぎり郷里を諦めない
 */
export const HOMELAND_RECLAIM_PROBABILITY = 0.12;
/** 取り返しの攻撃が通った年に失う支配度 */
export const HOMELAND_RECLAIM_CONTROL_DAMAGE = 12;
/** 征服で得る正統性。異民族を平らげた皇帝の名声 */
export const CONQUEST_LEGITIMACY_GAIN = 6;
/** 本拠地を失った勢力の戦力に掛かる減衰。郷里を失えば人が集まらない */
export const HOMELAND_LOST_STRENGTH_PENALTY = 0.75;

/**
 * 族長の軍事能力が攻撃側戦力に掛ける補正（ABILITY_NEUTRAL 基準の1点あたり）。
 * アッティラやガイセリックの下では同じ兵力でも重くなる
 */
export const CHIEF_MILITARY_PER_POINT = 0.05;

/** 東ローマ・ペルシアの将が自軍に掛ける補正（同じく1点あたり） */
export const FOREIGN_COMMANDER_PER_POINT = 0.04;

// ── 会戦と僭称帝国 ────────────────────────────────────

/**
 * 会戦。属州の攻防と違い、野戦軍どうしが正面からぶつかる。
 *
 * 属州の防衛（FIELD_ARMY_DEFENSE_SHARE 0.2）と違って軍の大半を
 * 投じるので、勝てば相手の軍を大きく削れる代わりに、負ければ
 * 帝国の主力が一度に失われる。**率いる者が要る。**
 * 皇帝自身か軍司令官がいなければ挑めない
 */
export const PITCHED_ARMY_SHARE = 0.85;
/** 皇帝が自ら率いるのに要る軍事能力。これ未満なら将軍に任せるしかない */
export const PITCHED_RULER_MIN_MILITARY = 6;
/** 勝った側が相手に与える損害の係数 */
export const PITCHED_WINNER_DAMAGE = 0.7;
/** 負けた側が失う戦力の係数 */
export const PITCHED_LOSER_DAMAGE = 0.55;
/** 会戦に勝って得る正統性。撃退（2）より大きい */
export const PITCHED_VICTORY_LEGITIMACY = 8;
/** 会戦に負けて失う正統性 */
export const PITCHED_DEFEAT_LEGITIMACY = 6;

/**
 * 大敗の閾値。負けた側の戦力に対する margin の比がこれを超えると
 * 単なる敗北ではなく壊走になり、属州が動揺する
 */
export const PITCHED_ROUT_MARGIN_RATIO = 0.6;
/** 大敗で失う正統性（PITCHED_DEFEAT_LEGITIMACY に上乗せ） */
export const PITCHED_ROUT_LEGITIMACY = 12;
/** 皇帝が自ら率いて大敗したときに捕虜になる確率 */
export const PITCHED_CAPTURE_PROBABILITY = 0.35;
/** 君主が捕虜になったときの正統性の低下。ウァレリアヌスの故事 */
export const PITCHED_CAPTURE_LEGITIMACY = 30;

/**
 * 属州の動揺。大敗や捕縛の直後、総督の反乱判定にこの上乗せが掛かる。
 * 通常の基礎確率（0.0007）に対して桁違いに大きい。
 * 「敗報が届いた属州は離れる」という形にするため
 */
export const UPHEAVAL_REVOLT_BONUS = 0.35;
/** 大敗で動揺が続く年数 */
export const UPHEAVAL_YEARS_ON_ROUT = 2;
/** 君主捕縛で動揺が続く年数 */
export const UPHEAVAL_YEARS_ON_CAPTURE = 4;

/** 僭称帝国が引き継ぐ守備隊の割合。残りは離散する */
export const USURPER_GARRISON_SHARE = 0.8;
/**
 * 僭称帝国の初期兵力に上乗せされる、その属州の税収基礎ぶんの係数。
 * 0.12 ではブリタンニア帝国が兵8で、討伐が作業になっていた。
 * 豊かな属州が離れるほど手強い僭称帝国になるようにする
 */
export const USURPER_STRENGTH_PER_BASE_TAX = 0.3;
/** 僭称帝国が毎年蓄える兵力の伸び */
export const USURPER_GROWTH_RATE = 0.04;
/** 僭称帝国の出現で失う正統性 */
export const USURPER_EMPIRE_LEGITIMACY_LOSS = 14;
/** 討伐に投じる野戦軍の割合 */
export const SUPPRESS_ARMY_SHARE = 0.6;
/** 討伐の損耗 */
export const SUPPRESS_ATTRITION_RATE = 0.05;
/** 討伐に成功して戻る正統性 */
export const SUPPRESS_LEGITIMACY_GAIN = 10;
/** 取り戻した属州の支配度 */
export const SUPPRESS_RECOVERED_CONTROL = 30;

// ── 首都と主要属州の占領 ──────────────────────────────

/**
 * 自国の都が「敵手にある」とみなす支配度。
 * イタリアは 0 で崩壊してしまうので、その手前を拾う必要がある
 */
export const CAPITAL_FALLEN_CONTROL_THRESHOLD = 25;
/** 都を押さえられているあいだ、毎年これだけ動揺が積まれる */
export const CAPITAL_FALLEN_UPHEAVAL_YEARS = 1;

/** 大都市を含む属州を失ったときの、正統性への追加の代償 */
export const MAJOR_PROVINCE_LOST_LEGITIMACY = 8;
/** 同じく元老院支持への代償。都と穀倉を失えば貴族は離れる */
export const MAJOR_PROVINCE_LOST_SENATE = 10;

/** 東ローマの都を落とされたときに失う野戦軍の割合 */
export const EAST_CAPITAL_LOST_ARMY_LOSS = 0.35;
/** 同じく、残る東方属州が失う支配度 */
export const EAST_CAPITAL_LOST_CONTROL_LOSS = 20;

/** ペルシアが押さえた大都市を取り返したときに削れる戦力の割合 */
export const PERSIA_MAJOR_PROVINCE_LOST_STRENGTH = 0.25;

// ── 東西の分割相続 ────────────────────────────────────

/**
 * 統一を果たした皇帝の死に際して、成人した後継者が複数いれば
 * 帝国は東西に割れる。395年のテオドシウス1世の死と同じことが
 * もう一度起きる、という円環をここで閉じる。
 *
 * 分け与えられた東は、兄の帝国の野戦軍のこの割合しか持てない。
 * **土地の数では差を付けず、軍で「西ローマ優位」を作る**
 */
export const EAST_PARTITION_ARMY_SHARE = 0.45;
/** 分割された東方属州が引き継ぐ支配度 */
export const EAST_PARTITION_CONTROL = 55;
/** 帝国が割れたときに失う正統性。全土の帝ではなくなる */
export const PARTITION_LEGITIMACY_LOSS = 10;

/**
 * 代替わりの動揺が続く年数。
 * 新しい状態は持たせず、君主の即位年から導く
 */
export const SUCCESSION_UNREST_YEARS = 2;
/**
 * 代替わりの年に蛮族の侵入確率へ掛かる係数。
 * 帝位が定まらない隙を突かれる、という形。
 * 既存の ADVANCE_PROBABILITY に掛かるだけで新しい仕組みではない
 */
export const SUCCESSION_UNREST_ADVANCE_MULTIPLIER = 1.8;
/** 同じく、ペルシアの攻勢の確率に掛かる係数 */
export const SUCCESSION_UNREST_PERSIA_MULTIPLIER = 1.6;

// ── 従属国としての東ローマ ────────────────────────────

/**
 * 分割で生まれた東は独立国ではなく、西の宗主権のもとにある従属国。
 * 「西ローマの東方帝」という位置づけで、兵権も貢納も西に属する。
 *
 * **新しい資源は作らない。** 貢納は既存の収入計算に、
 * 兵権は既存の防衛戦力に足すだけ
 */

/** 従属国の属州の収入のうち、西へ貢納として入る割合 */
export const VASSAL_TRIBUTE_SHARE = 0.45;
/** 従属国の野戦軍のうち、西の属州防衛に使える割合。これが「兵権」 */
export const VASSAL_ARMY_SHARE = 0.35;

/** 東帝の野心の範囲。独立の確率にのみ効く */
export const VASSAL_AMBITION_MIN = 2;
export const VASSAL_AMBITION_MAX = 9;
/** 独立を図る基礎確率（毎年） */
export const VASSAL_INDEPENDENCE_BASE = 0.01;
/** 野心が ABILITY_NEUTRAL を超えた1点あたりの上乗せ */
export const VASSAL_INDEPENDENCE_PER_AMBITION = 0.035;
/**
 * 西の正統性が低いほど独立されやすい。
 * この値を下回った分が線形に効く（既存の反乱と同じ考え方）
 */
export const VASSAL_INDEPENDENCE_LEGITIMACY_FROM = 60;
export const VASSAL_INDEPENDENCE_LOW_LEGITIMACY_BONUS = 0.12;
/** 独立されたときに失う正統性 */
export const VASSAL_INDEPENDENCE_LEGITIMACY_LOSS = 12;

// ── 難易度 ────────────────────────────────────────────

export const DEFAULT_DIFFICULTY: Difficulty = 'standard';

/** 既定のシナリオ。史実（延命）がこのゲームの本編 */
export const DEFAULT_SCENARIO: Scenario = 'historical';

/**
 * 難易度ごとの補正倍率。
 * 中級(standard)はすべて 1.0 で、これまで調整してきたバランスが
 * そのまま中級になる。初級・上級はそこからの差分としてのみ定義する。
 *
 * 触る対象は「主題」の2つのジレンマに直結する3点と、
 * 史実展開の再現度の合計4点に絞る。
 * 循環の罠 → 税収と蛮族の圧力
 * 短期と長期の取引 → フォエデラティの給金要求の膨張率
 * 史実展開 → 有害な歴史イベントの発火確率と被害量
 */
export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
  beginner: {
    incomeMultiplier: 1.25,
    barbarianPowerMultiplier: 0.85,
    foederatiEscalationMultiplier: 0.6,
    // 史実よりかなり西ローマ有利。災厄はめったに起きず、起きても軽い
    historicalSeverityMultiplier: 0.3,
  },
  standard: {
    incomeMultiplier: 1,
    barbarianPowerMultiplier: 1,
    foederatiEscalationMultiplier: 1,
    // 史実より西ローマ有利
    historicalSeverityMultiplier: 0.6,
  },
  veteran: {
    incomeMultiplier: 0.85,
    barbarianPowerMultiplier: 1.15,
    foederatiEscalationMultiplier: 1.4,
    /*
     * 史実に近い。ただし 1.0 では史実の災厄が連鎖して生存率が1%まで
     * 落ち、上達が結果に反映されなくなるため僅かに緩めている。
     * 「史実通りに崩壊へ向かうが、極めて上手ければ稀に凌げる」水準
     */
    historicalSeverityMultiplier: 0.85,
  },
};

// ── 王朝システム ──────────────────────────────────────

export const MIN_ABILITY = 1;
export const MAX_ABILITY = 10;

/**
 * 能力の生成範囲。極端な君主が出ないよう MIN/MAX より内側に絞る。
 * 生成される能力はこの範囲、設定からの変更は MIN/MAX まで許す。
 * 「名君と暗君のガチャ」は歴史のダイナミズムとして残す。
 * 分散の主因は能力ではなく継承イベントであることが計測で判明した
 * ため (能力を全君主5に固定しても変動係数は 1.01→1.06 と不変)、
 * 範囲を狭めても再現性は上がらない
 */
export const ABILITY_ROLL_MIN = 3;
export const ABILITY_ROLL_MAX = 8;

/**
 * まれに出る名君。
 *
 * 通常の抽選は 3〜8 なので、9・10 の君主は決して生まれなかった。
 * 東がユスティニアヌスとベリサリウスを確実に得るのに対し、
 * 西には桁違いの人物が出る目が無く、一方的に不利になっていた。
 * マヨリアヌスのような「late Roman には稀に出た有能な帝」を表す。
 *
 * **新しい仕組みではない。** 抽選の幅を広げるだけで、
 * 能力はこれまでどおり既存の計算式に掛かる補正としてしか働かない
 */
export const EXCEPTIONAL_RULER_PROBABILITY = 0.1;
export const EXCEPTIONAL_ABILITY_ROLL_MIN = 7;
export const EXCEPTIONAL_ABILITY_ROLL_MAX = 10;

/**
 * 補正倍率の中心となる能力値。この値で倍率が 1.0 になる。
 * 平均的な君主のとき既存の数値バランスがそのまま維持される
 */
export const ABILITY_NEUTRAL = 5;

/**
 * 能力1あたりの補正幅。ABILITY_NEUTRAL からの差にこれを掛ける。
 * 能力1〜10で概ね ±30% の揺れに収まる
 */
export const ABILITY_MODIFIER_PER_POINT = 0.06;

// 寿命
export const MIN_LIFESPAN = 35;
export const MAX_LIFESPAN = 72;
/** 即位時の年齢の範囲 */
export const MIN_ACCESSION_AGE = 16;
export const MAX_ACCESSION_AGE = 40;
/** 継承者が成人と見なされる年齢 */
export const ADULT_AGE = 16;
/**
 * 最低在位年数。極端に短い連続交代を避けるため、
 * 即位からこの年数が経つまでは寿命・暗殺のどちらでも死なない
 */
export const MIN_REIGN_YEARS = 4;

// 暗殺
/** legitimacy が最大のときの暗殺確率 */
export const ASSASSINATION_BASE_PROBABILITY = 0.005;
/** legitimacy が0のときに加算される暗殺確率 */
export const ASSASSINATION_MAX_BONUS = 0.06;

// 継承
/** 成人した嫡子が継いだときの正統性低下 */
export const SUCCESSION_LEGITIMACY_LOSS_HEIR = 3;
/** 継承危機（継承者がいない）ときの正統性低下 */
/**
 * 子がおらず兄弟・傍系が継いだときの正統性の低下。
 *
 * 嫡子の継承（小）と王朝の断絶（大）の中間に置く。
 * 血は続いているので断絶ほどではないが、直系ではないぶん
 * 嫡子の継承よりは揺れる
 */
export const SUCCESSION_LEGITIMACY_LOSS_SIBLING = 8;

export const SUCCESSION_LEGITIMACY_LOSS_CRISIS = 18;
/** 継承危機が簒奪者確率を上げている年数。毎ターン1減って自然に消える */
export const SUCCESSION_CRISIS_DURATION = 5;
/** 継承危機中に簒奪者確率へ加算される値 */
export const SUCCESSION_CRISIS_USURPER_BONUS = 0.2;
/**
 * 継承による正統性低下の下限。
 * 「正統性低下→暗殺→継承危機→さらに低下」の死のスパイラルを
 * 継承だけで底まで落とさないための減衰装置
 */
export const SUCCESSION_LEGITIMACY_FLOOR = 15;
/** 簒奪者確率の上限。継承危機と低正統性が重なっても発散させない */
export const USURPER_PROBABILITY_CAP = 0.5;

/**
 * 正統性の自然減。統治能力が高いほど小さくなる。
 * 何もしなければ権威は摩耗していく
 */
export const LEGITIMACY_NATURAL_DECAY = 0.5;
/** 君主が子をもうける年あたりの確率 */
export const CHILD_BIRTH_PROBABILITY = 0.12;
/** 抱えられる継承候補の上限 */
export const MAX_DYNASTY_MEMBERS = 6;

// 婚姻外交
/** 蛮族との婚姻が成立する確率（交渉能力で補正される） */
export const MARRIAGE_BARBARIAN_SUCCESS_BASE = 0.75;
/** 東ローマとの婚姻が成立する確率。帝室との縁組なので難しい */
export const MARRIAGE_EAST_SUCCESS_BASE = 0.35;
/** 東ローマとの婚姻を申し込める最低の eastRelations */
export const MARRIAGE_EAST_MIN_RELATIONS = 50;
/** 蛮族との婚姻の即時効果 */
export const MARRIAGE_BARBARIAN_LOYALTY_GAIN = 12;
export const MARRIAGE_BARBARIAN_SENATE_LOSS = 8;
/** 東ローマとの婚姻の即時効果 */
export const MARRIAGE_EAST_RELATIONS_GAIN = 15;
export const MARRIAGE_EAST_LEGITIMACY_GAIN = 8;
/**
 * ローマの元老院貴族の家門との婚姻が成立する確率。
 * 皇帝との縁組はこの階層にとって最上の栄誉なので、三者のうち最も通りやすい
 */
export const MARRIAGE_ROMAN_SUCCESS_BASE = 0.85;
/**
 * 縁組を申し込める最低の senateSupport。
 * 帝室を後ろ盾と見なさなくなった元老院は娘を出さない
 */
export const MARRIAGE_ROMAN_MIN_SENATE_SUPPORT = 30;
/** ローマ貴族との婚姻の即時効果 */
export const MARRIAGE_ROMAN_SENATE_GAIN = 14;
export const MARRIAGE_ROMAN_LEGITIMACY_GAIN = 5;
/**
 * 持参財産に伴う免税特権の追認。元老院への譲歩と同じだけ恒久的に失う。
 *
 * 当初は譲歩の倍（4）にしていたが、この縁組は譲歩と違って金と行動枠も
 * 払ううえに君主に一度きりなので、恒久の代償まで倍にすると三者の縁組の中で
 * 一方的に最下位になった（初級 41% 対 蛮族 44% / 東 47%）。
 * 2 に揃えると 48% と他の二者に並ぶ
 */
export const MARRIAGE_ROMAN_TAX_BASE_LOSS = 2;
/** 子が生まれたときに追加で発生する効果 */
export const MARRIAGE_HEIR_BORN_LOYALTY_GAIN = 10;
export const MARRIAGE_HEIR_BORN_EAST_RELATIONS_GAIN = 10;
/** 貴族の家に帝室の血を引く子が生まれると、その家門ぐるみで王朝を支える */
export const MARRIAGE_HEIR_BORN_SENATE_GAIN = 10;
/** 混血の後継者が即位したときの正統性への負の補正 */
export const MIXED_BLOOD_LEGITIMACY_PENALTY = 6;

// 東帝国
/** 援軍を要請できる最低の eastRelations */
export const EAST_AID_MIN_RELATIONS = 30;
export const EAST_AID_TREASURY_GAIN = 200;
export const EAST_AID_ARMY_GAIN = 10;
export const EAST_AID_RELATIONS_LOSS = 12;
export const EAST_TITLE_COST = 80;
export const EAST_TITLE_LEGITIMACY_GAIN = 10;
export const EAST_TITLE_RELATIONS_LOSS = 6;

/**
 * 修好。使者と贈り物を送って東との関係を戻す。
 *
 * 援軍要請(−12)と帝位の承認(−6)は関係を削る一方で、戻す手段が無かった。
 * 関係30を割ると援軍が撃てなくなるので、東帝国の欄が
 * 「3回使ったら終わり」の一方通行になっていた。
 *
 * 金額は「援軍要請との往復で儲からない」ことを条件に決める。
 * 関係12ぶんの回復に 100 × 12/8 = 150 かかるので、
 * 援軍の +200 に対する差益は 50 しかない。この差益のために
 * 行動枠を2.5回ぶん使うのは徴税強化(1枠で150以上)に明確に劣るため、
 * 無限に金を生む手にはならない
 */
export const EAST_IMPROVE_COST = 100;
export const EAST_IMPROVE_RELATIONS_GAIN = 8;

// ── 統一シナリオ: 東ローマとの戦争 ────────────────────

/**
 * 宣戦の代償。ローマ人がローマ人と戦うことへの反発。
 * 正統性と元老院支持を先払いさせ、統一を「安い拡大」にしない
 */
export const EAST_DECLARE_WAR_LEGITIMACY_LOSS = 12;
export const EAST_DECLARE_WAR_SENATE_LOSS = 10;

/** 交戦中は毎年これだけ正統性が余分に減る。同胞と戦い続ける負担 */
export const EAST_WAR_LEGITIMACY_DRAIN = 0.8;

/** 東方へ侵攻するとき、遠征に振り向ける野戦軍の割合 */
export const EAST_INVADE_ARMY_SHARE = 0.7;
/** 遠征の損耗。本国の防衛派遣(0.04)より重い */
export const EAST_INVADE_ATTRITION_RATE = 0.06;
/** 東の野戦軍が属州防衛に加える割合 */
export const EAST_DEFENSE_ARMY_SHARE = 0.25;
/** 侵攻に勝った年に東方属州の支配度が受けるダメージ */
export const EAST_INVADE_CONTROL_DAMAGE = 35;
/** 征服した直後の支配度。奪ったばかりの土地は言うことを聞かない */
export const EAST_CONQUEST_CONTROL = 35;
/** 戦闘の優劣差に対する東の軍の損耗係数 */
export const EAST_ARMY_LOSS_FACTOR = 0.35;
/** 同じく西の野戦軍の損耗係数 */
export const WEST_ARMY_LOSS_FACTOR = 0.3;
/** 東の軍が毎年回復する割合 */
export const EAST_ARMY_GROWTH_RATE = 0.02;
/**
 * 東の軍の上限。
 *
 * 掛け算だけで伸ばしていたので、171ターンの統一シナリオでは
 * 195 が 28倍まで膨らんだ。天井を置いて頭打ちにする
 */
export const EAST_ARMY_MAX = 520;
/**
 * 東の軍が毎年立て直す最低量。
 *
 * 掛け算だけだと一度壊滅させた東は二度と戻れず、
 * 6世紀のユスティニアヌスの巻き返しが起こらない。
 * 東ローマは版図を失っても徴募の基盤（アナトリアと東方）を保っていた、
 * という形で、削り切っても毎年これだけは戻るようにする
 */
export const EAST_ARMY_REBUILD = 1.6;
/** 交戦中に東が攻め返してくる確率 */
export const EAST_COUNTERATTACK_PROBABILITY = 0.35;
/**
 * 東の司令官の力量が**攻め返す頻度**に効く量。能力1点あたり。
 *
 * 戦力への補正（FOREIGN_COMMANDER_PER_POINT）とは別に置く。
 * 有能な将は一撃が重いだけでなく、休まず戦役を起こす。
 * ベリサリウス（軍事10）とイッルス（軍事6）の差を、
 * 戦力だけで表すと 1.20 対 1.04 にしかならず、
 * 6世紀が別の時代に見えなかった
 */
export const EAST_COMMANDER_TEMPO_PER_POINT = 0.09;

/**
 * ユスティニアヌス1世の即位年。
 *
 * 西方の回復（renovatio imperii）を掲げ、ベリサリウスとナルセスを
 * 西へ送り込んだ。**この年、東方属州を西に握られていれば、
 * 講和していようと従属していようと東は戦端を開く。**
 *
 * これが無いと、統一したあと講和した相手にはユスティニアヌスが
 * 無関係になり、6世紀が何も起きない89年になっていた
 */
export const JUSTINIAN_RECONQUEST_YEAR = 527;

/** 講和できるようになるまでの最低交戦年数。開戦即講和を防ぐ */
export const EAST_PEACE_MIN_WAR_YEARS = 3;
/** 講和した時点の東との関係 */
export const EAST_PEACE_RELATIONS = 20;

// ── 統一シナリオ: サーサーン朝ペルシア ────────────────

/**
 * ローマ同士が交戦している年に、ペルシアが介入を始める確率。
 * 統一を狙うほどペルシアを呼び込む、という取引にする
 */
export const PERSIA_INTERVENTION_PROBABILITY = 0.4;

// ── ペルシアとの修好 ──────────────────────────────────

/**
 * 西とサーサーン朝の関係の初期値。
 *
 * 史実の西ローマとペルシアにはほとんど直接の往来が無かったので低く置く。
 * 東ローマとの関係（60）より冷たいところから始める
 */
/**
 * サーサーン朝本土への遠征。**ローマを統一したあとにだけ選べる。**
 *
 * 都クテシフォンはこの地図では属州ではないので落とせない。
 * 代わりに本土を突いてその戦力そのものを削る形にしてある。
 * 削り切ればペルシアは介入を取り下げ、東方戦線が閉じる
 */
export const PERSIA_INVADE_ARMY_SHARE = 0.8;
/** 遠征そのものの損耗。境外の遠征なので属州の防衛より重い */
export const PERSIA_INVADE_ATTRITION_RATE = 0.12;
/**
 * 本土を守りに出るペルシアの戦力の割合。
 *
 * 全戦力を DEFENSE_MULTIPLIER 込みで立てていたときは、野戦軍320で
 * 挑んでも勝率16%、屈服させるのに平均17.6回の遠征が要り、
 * 事実上「選べない行動」になっていた。蛮族の郷里への遠征が
 * その勢力の戦力の半分を守りに立てるのと同じ考え方で share を置く
 */
export const PERSIA_HOME_DEFENSE_SHARE = 0.72;
/** 勝ったときに削るペルシアの戦力の割合 */
export const PERSIA_INVADE_STRENGTH_LOSS = 0.35;
/** これを下回るとペルシアは介入を取り下げる */
export const PERSIA_SUBDUED_THRESHOLD = 30;
/** 屈服させたときに得る正統性 */
export const PERSIA_SUBDUED_LEGITIMACY_GAIN = 12;

export const PERSIA_INITIAL_RELATIONS = 20;
export const MIN_PERSIA_RELATIONS = 0;
export const MAX_PERSIA_RELATIONS = 100;
/** 使者と贈り物の費用。東への修好より遠く、高く付く */
export const PERSIA_IMPROVE_COST = 110;
/** 1回の修好で戻る関係。交渉能力で補正される */
export const PERSIA_IMPROVE_RELATIONS_GAIN = 12;
/**
 * 関係が満点のときに介入の確率へ掛かる係数。
 * 0.45 なら 0.4 → 0.18 まで下がる。**介入そのものを止めることはできない。**
 * 止められてしまうと「ペルシアをラスボスとして機能させる」という
 * 主題が金で買えることになるため
 */
export const PERSIA_RELATIONS_INTERVENTION_FLOOR = 0.45;
/** 同じく、動き出したあとの毎年の攻勢の確率に掛かる係数 */
export const PERSIA_RELATIONS_ATTACK_FLOOR = 0.55;
/**
 * 一度介入したペルシアに対する修好の効きの弱まり。
 * 剣を抜いた相手に贈り物はあまり通らない
 */
export const PERSIA_IMPROVE_AT_WAR_PENALTY = 0.5;
/**
 * 介入までに要するローマ内戦の年数。
 *
 * 開戦の翌年から動けるようにすると、西が東方属州を1つ取る前に
 * ペルシアが東を食べ尽くしてしまい、統一が成立しなかった
 * （計測では4州すべてを取れた局が1%）。
 * 「内戦が長引いたのを見て動く」形にして、緒戦の窓を開ける
 */
export const PERSIA_MIN_WAR_YEARS = 4;
/** 介入後、ペルシアが毎年強くなる割合 */
export const PERSIA_GROWTH_RATE = 0.008;
/** ペルシアの戦力の上限。東の軍と同じ理由で天井を置く */
export const PERSIA_MAX_STRENGTH = 560;
/** 介入後、ペルシアが東方属州を攻める確率 */
export const PERSIA_ATTACK_PROBABILITY = 0.15;
/** ペルシアが攻撃に振り向ける戦力の割合 */
export const PERSIA_ATTACK_SHARE = 0.45;
/** ペルシアが属州防衛に振り向ける戦力の割合 */
export const PERSIA_DEFENSE_SHARE = 0.22;
/** ペルシアの攻撃が通った年の支配度ダメージ */
export const PERSIA_ATTACK_CONTROL_DAMAGE = 8;
/** この支配度を下回った東方属州はペルシアに奪われる */
export const PERSIA_SEIZE_CONTROL_THRESHOLD = 20;
/** 戦闘の優劣差に対するペルシアの損耗係数 */
export const PERSIA_LOSS_FACTOR = 0.45;
/** 属州を1つ奪うたびにペルシアが得る戦力 */
export const PERSIA_SEIZE_STRENGTH_GAIN = 25;
/**
 * ペルシアが握った属州の支配度。
 *
 * 征服直後の支配度(EAST_CONQUEST_CONTROL)のままにすると、
 * 一度の戦闘で取り返せてしまい関門にならない。
 * ペルシアの統治は根を張っている、という形で2勝ぶんの厚みを持たせる
 */
export const PERSIA_HOLD_CONTROL = 70;

// ── 戦場（会戦の戦列マップ） ──────────────────────────

/**
 * 戦術の優劣が会戦の攻撃側戦力に掛かる幅。
 *
 * **戦術は戦略の結果を置き換えない。** 戦場で積んだ優劣は
 * この幅の1つの倍率になり、既存の `giveBattle()` に掛かるだけ。
 * 中庸に戦えば 1.0 になるので、既存の釣り合いは動かない
 */
export const BATTLE_TACTICS_MIN = 0.7;
export const BATTLE_TACTICS_MAX = 1.45;
/** 兵力比の差1に対して倍率が動く量 */
export const BATTLE_TACTICS_SPREAD = 0.55;

/** 決着が付かなくても、この回数で会戦は終わる */
export const BATTLE_MAX_ROUNDS = 5;

/**
 * 野戦軍の兵科の内訳。
 *
 * 後期ローマ軍は歩兵が主体だが、コミタテンセスには
 * 相当数の騎兵（ウェクシラティオ）が付いていた
 */
export const BATTLE_COMPOSITION_INFANTRY = 0.6;
export const BATTLE_COMPOSITION_CAVALRY = 0.25;
export const BATTLE_COMPOSITION_ARCHERS = 0.15;

/** 蛮族の兵科の内訳。歩兵の群れが主体 */
export const BATTLE_FOE_BARBARIAN_INFANTRY = 0.65;
export const BATTLE_FOE_BARBARIAN_CAVALRY = 0.25;
export const BATTLE_FOE_BARBARIAN_ARCHERS = 0.1;
/** 東ローマ軍の内訳。西とほぼ同じ形だが弓が厚い */
export const BATTLE_FOE_EAST_INFANTRY = 0.5;
export const BATTLE_FOE_EAST_CAVALRY = 0.3;
export const BATTLE_FOE_EAST_ARCHERS = 0.2;
/** サーサーン朝の内訳。重装騎兵（クリバナリウス）と弓騎兵の軍 */
export const BATTLE_FOE_PERSIA_INFANTRY = 0.35;
export const BATTLE_FOE_PERSIA_CAVALRY = 0.4;
export const BATTLE_FOE_PERSIA_ARCHERS = 0.25;

/** 隊の初期士気 */
export const BATTLE_START_MORALE = 100;

/**
 * 戦力1あたりの兵員数。
 *
 * `fieldArmy` や `strength` はこの模型では抽象的な数だが、
 * 戦場では実際の兵数として見せる。西ローマの野戦軍（コミタテンセス）は
 * ノティティア・ディグニタトゥムの記載でおよそ10万規模なので、
 * 開始時の野戦軍 120〜150 がその桁に収まるようこの倍率を取る。
 *
 * **表示のためだけの倍率。** どの計算式にも掛からない
 */
export const MEN_PER_STRENGTH = 1000;

/**
 * 兵科の相性。攻める側の兵科が受ける側の兵科に対して得る倍率。
 * 騎兵は弓を蹴散らし、弓は歩兵を削り、歩兵の槍衾は騎兵を止める
 */
export const BATTLE_MATCHUP_ADVANTAGE = 1.35;
export const BATTLE_MATCHUP_DISADVANTAGE = 0.75;

/** 命令ごとの攻撃補正 */
export const BATTLE_ORDER_ATTACK_ADVANCE = 1;
/** 迂回は側面を突くので与える損害が増える */
export const BATTLE_ORDER_ATTACK_FLANK = 1.5;
/** 退却中はほとんど反撃できない */
export const BATTLE_ORDER_ATTACK_WITHDRAW = 0.25;

/** 命令ごとの被害補正。受ける損害に掛かる */
export const BATTLE_ORDER_DEFENSE_ADVANCE = 1;
/** 迂回すると正面が空く。そのぶん無防備に受ける */
export const BATTLE_ORDER_DEFENSE_FLANK = 1.4;
/** 退却すれば損害は減るが、その戦列は前へ出られない */
export const BATTLE_ORDER_DEFENSE_WITHDRAW = 0.5;

/**
 * 攻撃力に対して実際に削れる兵力の割合。
 *
 * 0.5 にしていたときは、一度の激突で戦列が丸ごと消えた。
 * 5回の激突に分ける意味が無くなり、布陣を決めた時点で決着していた
 */
export const BATTLE_DAMAGE_RATE = 0.16;

/** 兵力を1割失うごとに落ちる士気 */
export const BATTLE_MORALE_LOSS_PER_LOSS_RATIO = 120;
/** 激突するだけで毎回減る士気 */
export const BATTLE_MORALE_DRAIN_PER_ROUND = 4;
/** 退却した戦列が取り戻す士気 */
export const BATTLE_MORALE_RECOVERY_WITHDRAW = 12;

/**
 * 指揮官の能力が士気の粘りに効く量。
 *
 * **攻撃力そのものには掛けない。** 指揮官の補正は既に `giveBattle()` の
 * 攻撃側戦力に入っているので、戦場でも同じものを掛けると二重取りになる。
 */
export const BATTLE_LEADER_MORALE_SCALE = 0.06;

/**
 * 指揮官の能力が**機動の巧拙**に効く量。能力1点あたり。
 *
 * 掛かるのは前進の攻撃力ではなく、迂回と退却という
 * **手順の要る動きの成否**だけ。有能な将は側面をより深く突き、
 * 正面を空ける隙を小さくし、下がるときも整然と下がる。
 *
 * 前進に掛けないので、中庸に指したときの交換比（`baselineExchange`）は
 * 指揮官によらず変わらない。つまり調整済みの釣り合いは動かず、
 * 「有能な将のもとでは戦術が効く」という差だけが出る
 */
export const BATTLE_LEADER_MANEUVER_SCALE = 0.055;

/** 地形ごとの兵科補正 */
export const BATTLE_TERRAIN_MODIFIERS: Record<
  'plain' | 'hill' | 'forest' | 'desert' | 'river',
  { infantry: number; cavalry: number; archers: number }
> = {
  // 平原は騎兵の土地
  plain: { infantry: 1, cavalry: 1.25, archers: 1 },
  // 丘は歩兵が踏ん張り、騎兵の突撃が死ぬ
  hill: { infantry: 1.2, cavalry: 0.75, archers: 1.05 },
  // 森は射線が通らず、騎兵も走れない
  forest: { infantry: 1.15, cavalry: 0.65, archers: 0.7 },
  // 砂漠は重装歩兵に酷で、騎兵と弓の土地
  desert: { infantry: 0.8, cavalry: 1.2, archers: 1.15 },
  // 渡河点は前へ出た者が損をする
  river: { infantry: 1.05, cavalry: 0.8, archers: 1.2 },
};

/** 渡河点で前進した戦列が余分に受ける損害 */
export const BATTLE_RIVER_ADVANCE_PENALTY = 1.25;
