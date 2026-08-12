import { useEffect, useState } from 'react';

import manifest from './terrainArt.json';
import type { Terrain } from '../core/types';

/**
 * 戦場の地の画。
 *
 * 登録されていればその画を敷き、無ければ `BattleMap` が線と面で描く
 * 地形にそのまま落ちる。**1枚も置かなくても遊べる**ので、
 * 肖像や会戦のイメージ画と同じく後から足していける。
 *
 * 画に**兵を描き込まない**ことが要。兵は状態から描くもので、
 * 背景に焼き込むと兵数が変わっても動かず、崩れも進軍も表せない
 */

interface TerrainArtEntry {
  terrain: Terrain;
  file: string;
}

const MANIFEST = manifest as {
  version: number;
  basePath: string;
  entries: TerrainArtEntry[];
};

function artUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${MANIFEST.basePath.replace(/^\//, '')}${file}`;
}

/**
 * その地形の画の URL。**読み込みに成功するまで `null` を返す。**
 *
 * SVG の `<image>` は読み込みに失敗しても穴が開くだけで気付けないので、
 * 先に読み込んでから差し替える。失敗した画は線画のままになる
 */
export function useTerrainArt(terrain: Terrain): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const entry = MANIFEST.entries.find((e) => e.terrain === terrain);
    if (entry === undefined) {
      setUrl(null);
      return;
    }
    const src = artUrl(entry.file);
    const img = new Image();
    let alive = true;
    img.onload = () => {
      if (alive) setUrl(src);
    };
    img.onerror = () => {
      if (alive) setUrl(null);
    };
    img.src = src;
    return () => {
      alive = false;
      setUrl(null);
    };
  }, [terrain]);

  return url;
}
