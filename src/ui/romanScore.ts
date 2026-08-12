/**
 * 古代ローマ風の音楽を Web Audio で合成する。
 *
 * 音源ファイルを持たない。外部フォントを読み込まず雷紋も CSS で描くのと
 * 同じ方針で、配信サイズを増やさずに音を付けるため。
 * 権利の問題も起きない（この譜面と音色はこのコードそのもの）。
 *
 * ローマの音楽はほとんど現存しないので、当時の音楽論と楽器から組む:
 *
 * - **旋法** — ドリア旋法。ギリシアから受け継いだ旋法で、
 *   長調・短調の機能和声を使わない。終止形を作らないので進行感が出ず、
 *   行列のように淡々と続く
 * - **ドローン** — 主音と5度を鳴らしっぱなしにする。和音は動かさない
 * - **アウロス**（複簧の管楽器）— 鋸歯波を共振の強い低域通過で削り、
 *   鼻にかかった音にする。旋律はこれが吹く
 * - **リュラ**（竪琴）— 三角波の短い減衰。小節頭で分散和音を爪弾く
 * - **ティンパヌム**（片面太鼓）— 低いサイン波の落ちる音。行進の脈
 * - **残響** — 石造の広間を模した長い残響。指数減衰の雑音から作る
 */

/** 主音。D4。ドリア旋法の基準にする */
const TONIC_HZ = 293.66;

/** 行列の歩調。速くすると軍楽になり、荘重さが消える */
const BPM = 66;
const BEAT = 60 / BPM;

/** 全体の音量。管弦楽より控えめにして、長時間の再生でも疲れないようにする */
const MASTER_GAIN = 0.22;

/**
 * 何秒先まで先読みして予約するか。途切れずに繰り返すために要る。
 * 起こす回数を減らすほどターン送りの描画と衝突しにくい
 */
const SCHEDULE_AHEAD = 2.0;
const SCHEDULER_INTERVAL_MS = 600;

/** ドリア旋法の音度（主音からの半音数）。D E F G A B C D */
const DORIAN = [0, 2, 3, 5, 7, 9, 10, 12];

/** 音度と長さ（拍）で書いた旋律。1つの句がちょうど16拍になる */
type Phrase = [degree: number, beats: number][];

const PHRASE_A: Phrase = [
  [0, 3], [2, 1], [3, 2], [2, 2],
  [4, 3], [3, 1], [2, 2], [1, 2],
];

const PHRASE_B: Phrase = [
  [4, 2], [5, 2], [6, 2], [5, 2],
  [4, 3], [3, 1], [2, 2], [0, 2],
];

/** 下降して終わる句。区切りに置く */
const PHRASE_C: Phrase = [
  [7, 3], [6, 1], [5, 2], [4, 2],
  [3, 3], [2, 1], [1, 2], [0, 2],
];

/**
 * 句の並び。A A B A C B A A で1周する。
 * 同じ句を続けすぎると飽き、変えすぎると行列らしさが消える
 */
const FORM: Phrase[] = [PHRASE_A, PHRASE_A, PHRASE_B, PHRASE_A, PHRASE_C, PHRASE_B, PHRASE_A, PHRASE_A];

function hzOf(degree: number, octave = 0): number {
  const semitones = DORIAN[degree % DORIAN.length] + 12 * (Math.floor(degree / DORIAN.length) + octave);
  return TONIC_HZ * Math.pow(2, semitones / 12);
}

/**
 * 石造の広間の残響。指数で減衰する雑音を畳み込み用の応答にする。
 * 実測の応答を持ってくるとファイルが要るので、その場で作る
 */
function buildHallImpulse(context: AudioContext): AudioBuffer {
  /*
   * 畳み込みの負荷は応答の長さに比例する。2.6秒だとターン送りの
   * 描画と競合して p90 が跳ねたので、石の広間らしさを保てる範囲で詰める
   */
  const seconds = 1.6;
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      // 立ち上がりを少し遅らせると、広い石の空間に聞こえる
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2) * (t < 0.02 ? t / 0.02 : 1);
    }
  }
  return buffer;
}

export interface RomanScore {
  start: () => void;
  stop: () => void;
  playing: boolean;
}

/**
 * 譜面を鳴らす装置を作る。
 * AudioContext は操作をきっかけにしか作れないので、start() まで作らない
 */
export function createRomanScore(): RomanScore {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let timer: number | null = null;
  /** 次に予約する拍の絶対時刻と、その通し番号 */
  let nextBeatTime = 0;
  let beatIndex = 0;
  const score: RomanScore = { start, stop, playing: false };

  /** アウロス。旋律を吹く */
  function playAulos(at: number, hz: number, seconds: number): void {
    if (context === null || master === null) return;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 6;
    // 倍音を残しつつ丸める。息を吹き込むように少し開いてから閉じる
    filter.frequency.setValueAtTime(hz * 2, at);
    filter.frequency.linearRampToValueAtTime(hz * 5, at + seconds * 0.3);
    filter.frequency.linearRampToValueAtTime(hz * 2.5, at + seconds);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.5, at + 0.09);
    gain.gain.setValueAtTime(0.5, at + seconds * 0.75);
    gain.gain.linearRampToValueAtTime(0, at + seconds);

    // 2本の管をわずかにずらす。複簧の唸りに近づく
    for (const detune of [-6, 6]) {
      const osc = context.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(at);
      osc.stop(at + seconds + 0.05);
    }
    filter.connect(gain).connect(master);
  }

  /** リュラ。爪弾いてすぐ減衰する */
  function pluckLyre(at: number, hz: number): void {
    if (context === null || master === null) return;
    const osc = context.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.22, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 1.1);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + 1.2);
  }

  /** ティンパヌム。音程の落ちる低い打音 */
  function strikeDrum(at: number, level: number): void {
    if (context === null || master === null) return;
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(96, at);
    osc.frequency.exponentialRampToValueAtTime(44, at + 0.16);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + 0.55);
  }

  /**
   * 1拍ぶんを予約する。
   * 旋律は句の切れ目でしか鳴らさないので、拍の通し番号から
   * 「いま句のどこにいるか」を数え直している
   */
  function scheduleBeat(beat: number, at: number): void {
    // 太鼓。小節の頭を強く、3拍目を弱く打つ
    const beatInBar = beat % 4;
    if (beatInBar === 0) strikeDrum(at, 0.5);
    else if (beatInBar === 2) strikeDrum(at, 0.22);

    // リュラ。2小節ごとに主音・4度・5度を爪弾く
    if (beat % 8 === 0) {
      pluckLyre(at, hzOf(0, -1));
      pluckLyre(at + BEAT * 0.5, hzOf(3, -1));
      pluckLyre(at + BEAT * 1.0, hzOf(4, -1));
    }

    // 旋律。句の中の位置を拍から割り出す
    const formBeat = beat % (FORM.length * 16);
    const phrase = FORM[Math.floor(formBeat / 16)];
    let cursor = 0;
    for (const [degree, beats] of phrase) {
      if (cursor === formBeat % 16) {
        playAulos(at, hzOf(degree), BEAT * beats * 0.95);
        break;
      }
      cursor += beats;
      if (cursor > formBeat % 16) break;
    }
  }

  function tick(): void {
    if (context === null) return;
    while (nextBeatTime < context.currentTime + SCHEDULE_AHEAD) {
      scheduleBeat(beatIndex, nextBeatTime);
      beatIndex++;
      nextBeatTime += BEAT;
    }
  }

  function start(): void {
    if (score.playing) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return;
    context = new Ctor();

    const reverb = context.createConvolver();
    reverb.buffer = buildHallImpulse(context);
    const wet = context.createGain();
    wet.gain.value = 0.45;

    master = context.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(MASTER_GAIN, context.currentTime + 2.5);
    master.connect(context.destination);
    master.connect(reverb).connect(wet).connect(context.destination);

    // ドローン。主音と5度を鳴らし続ける。和音は動かさない
    for (const [hz, level] of [
      [hzOf(0, -2), 0.16],
      [hzOf(4, -2), 0.11],
    ] as [number, number][]) {
      const osc = context.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = hz;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = hz * 4;
      const gain = context.createGain();
      gain.gain.value = level;
      // ゆっくりした揺れ。機械的な持続音に聞こえないようにする
      const lfo = context.createOscillator();
      lfo.frequency.value = 0.13;
      const lfoGain = context.createGain();
      lfoGain.gain.value = level * 0.35;
      lfo.connect(lfoGain).connect(gain.gain);
      lfo.start();
      osc.connect(filter).connect(gain).connect(master);
      osc.start();
    }

    nextBeatTime = context.currentTime + 0.2;
    beatIndex = 0;
    tick();
    timer = window.setInterval(tick, SCHEDULER_INTERVAL_MS);
    score.playing = true;
  }

  function stop(): void {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    if (context !== null) {
      // 予約済みの音が切れる前に、少しだけ絞ってから閉じる
      const closing = context;
      if (master !== null) {
        master.gain.cancelScheduledValues(closing.currentTime);
        master.gain.setValueAtTime(master.gain.value, closing.currentTime);
        master.gain.linearRampToValueAtTime(0, closing.currentTime + 0.4);
      }
      window.setTimeout(() => void closing.close(), 600);
      context = null;
      master = null;
    }
    score.playing = false;
  }

  return score;
}
