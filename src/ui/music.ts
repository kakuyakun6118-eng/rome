import { useCallback, useEffect, useRef, useState } from 'react';

import { createRomanScore, type RomanScore } from './romanScore';

/**
 * 背景音楽。
 *
 * 既定では古代ローマ風の譜面を Web Audio でその場で合成する
 * （romanScore.ts）。音源ファイルを持たないので配信サイズが増えず、
 * 権利の問題も起きない。
 *
 * public/music/theme.mp3 を置くとそちらが優先される。
 * 手持ちの曲に差し替えたい場合はファイルを置くだけでよい。
 *
 * 自動再生はブラウザが操作なしでは許さないので、最初の操作
 * （難易度の選択、または音のボタン）まで待ってから鳴らす
 */

/**
 * public/ 以下の配信パス。差し替えはファイルを置き換えるだけで済む。
 * サブパスで公開しても届くよう Vite の BASE_URL から組み立てる
 */
const TRACK_URL = `${import.meta.env.BASE_URL}music/theme.mp3`;

/** 音量。管弦楽の音源を想定して控えめに始める */
const DEFAULT_VOLUME = 0.4;

/** 前回の選択を覚えておく。毎回鳴らされるのを嫌う人がいるため */
const STORAGE_KEY = 'westrome.music';

function storedPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function storePreference(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // プライベートモードなどで書けなくても再生自体は続けられる
  }
}

export interface Music {
  playing: boolean;
  /** ファイルが置かれていればその曲、無ければ合成した譜面 */
  source: 'file' | 'synth';
  toggle: () => void;
  /** 最初の操作で呼ぶ。前回「切」を選んでいれば鳴らさない */
  startIfAllowed: () => void;
}

export function useMusic(): Music {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scoreRef = useRef<RomanScore | null>(null);
  const [fileReady, setFileReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const audio = new Audio(TRACK_URL);
    audio.loop = true;
    audio.volume = DEFAULT_VOLUME;
    audio.preload = 'auto';
    audio.addEventListener('canplaythrough', () => setFileReady(true));
    // ファイルが無いのは異常ではない。合成した譜面に落ちる
    audio.addEventListener('error', () => setFileReady(false));
    audioRef.current = audio;
    scoreRef.current = createRomanScore();
    return () => {
      audio.pause();
      scoreRef.current?.stop();
      audioRef.current = null;
      scoreRef.current = null;
    };
  }, []);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (fileReady && audio !== null) {
      // 操作なしの再生はブラウザに拒否される。拒否されても壊さない
      void audio.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
      return;
    }
    scoreRef.current?.start();
    setPlaying(scoreRef.current?.playing ?? false);
  }, [fileReady]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    scoreRef.current?.stop();
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    if (playing) {
      storePreference(false);
      pause();
    } else {
      storePreference(true);
      play();
    }
  }, [pause, play, playing]);

  const startIfAllowed = useCallback(() => {
    if (!storedPreference()) return;
    play();
  }, [play]);

  return { playing, source: fileReady ? 'file' : 'synth', toggle, startIfAllowed };
}
