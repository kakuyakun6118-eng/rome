#!/usr/bin/env python3
"""戦場の地の画を手続き的に描き起こす。

`src/ui/public/terrain/` に 960x894 の WebP を5枚書き出す（布陣図と同じ比率）。
`src/ui/terrainArt.json` に登録すると布陣図の地がその画になる。

**絵描きの代わりではない。** 標高場に陰影を付けて色を乗せた地で、
写実的に描かれた戦場画とは別物。より良い画が用意できたら
同じファイル名で置き換えればよい。

**地面は透視で敷く。** 布陣図は敵を上端・我が軍を下端に置く俯瞰なので、
地も「手前が近く、上が遠い」平面として描かないと地面に見えない。
真上から見た模様をそのまま貼っていたときは、起伏が迷彩の斑にしか
見えなかった。地物は世界座標に置いて画面へ投影するので、遠近は
大きさ・細かさ・霞のすべてに自動で効く。

兵は描かない。兵はゲームの状態から SVG で描いていて、
背景に焼き込むと兵数が変わっても駒が動かなくなる。

上端と下端の帯には隊と兵数の札が乗るので、目立つ地物はそこには置かない。

依存: numpy, Pillow
実行: python3 scripts/generate-terrain.py
"""

from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageFilter

W, H = 960, 894
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "ui", "public", "terrain")

# 上端と下端は隊と兵数の札が乗る帯。地物を抑えて読みやすくする
TOP_BAND = 0.24
BOTTOM_BAND = 0.24

# ── 透視 ──────────────────────────────────────────────
#
# 画面下端を距離 1.0 とし、上端が 1/(1-Q)。Q を上げるほど奥が深くなる。
# 0.86 まで上げると上端付近が潰れて模様が消えたので、4倍強に留める。
Q = 0.775
# 距離 1.0 のところで画面幅が世界のどれだけを写すか。
# 小さくすると寄った絵になり、起伏が1つ2つしか入らない
SPREAD = 1.35

# 格子の一辺。世界座標はこの周期で繰り返す
GRID = 64

Rgb = tuple[int, int, int]


# ── 座標 ──────────────────────────────────────────────


def ground() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """画面の各画素が写している地面の位置と、視点からの距離。

    戻り値は (世界X, 世界Y, 距離)。世界Yは距離そのもので、
    行ごとに一定になる（水平な地面を斜めから見ているため）
    """
    t = np.linspace(0.0, 1.0, H, dtype=np.float64)[:, None]  # 0=上(奥) 1=下(手前)
    s = 1.0 - t
    dist = 1.0 / (1.0 - s * Q)
    xs = np.linspace(0.0, 1.0, W, dtype=np.float64)[None, :] - 0.5
    wx = xs * dist * SPREAD
    wy = np.broadcast_to(dist, (H, W)).copy()
    return wx, wy, np.broadcast_to(dist, (H, W)).copy()


def project(wx: np.ndarray, wy: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """世界座標を画面へ戻す。地物を世界に置いてから描くために使う。"""
    s = (1.0 - 1.0 / wy) / Q
    y = H * (1.0 - s)
    x = W * (wx / (wy * SPREAD) + 0.5)
    return x, y


DIST_NEAR = 1.0
DIST_FAR = 1.0 / (1.0 - Q)


# ── 素材 ──────────────────────────────────────────────


def _box(a: np.ndarray, r: int, axis: int) -> np.ndarray:
    if r < 1:
        return a
    pad = [(0, 0), (0, 0)]
    pad[axis] = (r, r)
    p = np.pad(a, pad, mode="edge")
    c = np.cumsum(p, axis=axis, dtype=np.float32)
    zero = np.zeros_like(np.take(c, [0], axis=axis))
    c = np.concatenate([zero, c], axis=axis)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return (hi - lo) / float(2 * r + 1)


def _blur(a: np.ndarray, sigma: float) -> np.ndarray:
    """浮動小数のままぼかす。

    **8bit に丸めてから Pillow でぼかしてはいけない。** なだらかな面は
    隣り合う画素の差が 1/255 を切るので階段状の段差ができ、
    そこに陰影（傾きの微分）を掛けると等高線が浮き出る。
    実際、砂漠の砂丘に細かい輪郭線が何本も走った。
    箱ぼかしを3回重ねてガウスに近似する
    """
    if sigma <= 0:
        return a
    r = max(1, int(sigma * 1.2))
    out = a.astype(np.float32)
    for _ in range(3):
        out = _box(_box(out, r, 0), r, 1)
    return out


def _sample(grid: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """格子の値を任意の位置で拾う。周期境界。

    格子の折れ目が陰影に出ないよう、補間の重みに smoothstep を掛ける。
    線形のままだと格子の境で傾きが折れ、微分した陰影に網目が浮く
    """
    gh, gw = grid.shape
    u0 = np.floor(u)
    v0 = np.floor(v)
    fu = (u - u0).astype(np.float32)
    fv = (v - v0).astype(np.float32)
    fu = fu * fu * (3.0 - 2.0 * fu)
    fv = fv * fv * (3.0 - 2.0 * fv)
    iu = u0.astype(np.int64) % gw
    iv = v0.astype(np.int64) % gh
    ju = (iu + 1) % gw
    jv = (iv + 1) % gh
    a = grid[iv, iu]
    b = grid[iv, ju]
    c = grid[jv, iu]
    d = grid[jv, ju]
    return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv


def world_fbm(rng: np.random.Generator, wx: np.ndarray, wy: np.ndarray,
              cells: float = 2.0, octaves: int = 4, gain: float = 0.5,
              ridged: bool = False, aspect: float = 1.0) -> np.ndarray:
    """世界座標の上で組む標高場。

    周波数は世界の尺度なので、奥にある起伏は自動で小さく細かく写る。
    **octaves を増やしすぎない。** 6段まで重ねると細かい皺が全面に立ち、
    丘陵も砂漠も「くしゃくしゃの紙」に見えた
    """
    total = np.zeros((H, W), dtype=np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        f = cells * (2.0 ** o)
        g = rng.random((GRID, GRID)).astype(np.float32)
        n = _sample(g, wx * f / aspect, wy * f)
        if ridged:
            n = 1.0 - np.abs(n * 2.0 - 1.0)
        total += n * amp
        norm += amp
        amp *= gain
    out = total / norm
    return (out - out.min()) / max(1e-6, out.max() - out.min())


def _nearest(grid: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """区画の識別値。格子の升目ごとに1つの値を返す（補間しない）。"""
    gh, gw = grid.shape
    return grid[u.astype(np.int64) % gh, v.astype(np.int64) % gw]


def parcels(rng: np.random.Generator, wx: np.ndarray, wy: np.ndarray,
            size: float = 0.40, wobble: float = 0.30) -> tuple[np.ndarray, np.ndarray]:
    """世界座標を耕地の区画に切る。戻り値は (区画の識別値, 畦までの距離)。

    雲のような濃淡で作物を塗り分けていたときは、畑ではなく苔の斑に
    見えた。**畑には境界がある。** 少し回した格子で切り、境目を
    波打たせて畦の曲がりを出す。世界座標で切るので、奥ほど細かく写る
    """
    a = 0.38
    u = (wx * np.cos(a) - wy * np.sin(a)) / size
    v = (wx * np.sin(a) + wy * np.cos(a)) / size
    g1 = rng.random((GRID, GRID)).astype(np.float32)
    g2 = rng.random((GRID, GRID)).astype(np.float32)
    u = u + (_sample(g1, u * 0.55, v * 0.55) - 0.5) * wobble
    v = v + (_sample(g2, u * 0.55, v * 0.55) - 0.5) * wobble
    iu, iv = np.floor(u), np.floor(v)
    cid = _nearest(rng.random((GRID, GRID)).astype(np.float32), iu, iv)
    fu, fv = u - iu, v - iv
    edge = np.minimum(np.minimum(fu, 1 - fu), np.minimum(fv, 1 - fv))
    return cid, edge.astype(np.float32)


def depth_fade() -> np.ndarray:
    """手前で 1、奥で 0 に落ちる重み。画面尺度の細部を遠くで薄める。"""
    _, _, dist = ground()
    f = (DIST_NEAR / dist) ** 0.85
    return ((f - f.min()) / max(1e-6, f.max() - f.min())).astype(np.float32)


def band_mask() -> np.ndarray:
    """中央の帯だけ 1 になる重み。目立つ地物をここに寄せる。"""
    y = np.linspace(0.0, 1.0, H, dtype=np.float32)[:, None]
    m = np.ones_like(y)
    m = np.where(y < TOP_BAND, y / TOP_BAND, m)
    m = np.where(y > 1.0 - BOTTOM_BAND, (1.0 - y) / BOTTOM_BAND, m)
    return np.clip(m, 0.0, 1.0) ** 1.4


def world_gradient(dx: np.ndarray, dy: np.ndarray,
                   dist: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """画面の微分を世界の尺度の傾きに直す。

    画素あたりの世界の伸びで割る。**縦の伸びは負になる**（行が下るほど
    距離が縮む）ので、下限で切ってはいけない。1e-6 で切っていたときは
    縦の傾きが1万倍に膨れて arctan が飽和し、陰影が「向いている方角」だけの
    二値になった。画素の43%が真っ黒に潰れ、地面が迷彩の斑に見えていた
    """
    sx = dist * SPREAD / W
    sy = np.gradient(dist[:, 0])[:, None]
    sy = np.where(np.abs(sy) < 1e-9, -1e-9, sy)
    return dx / np.maximum(sx, 1e-9), dy / sy


def hillshade(height: np.ndarray, scale: float, dist: np.ndarray,
              azimuth: float = 312.0, altitude: float = 44.0) -> np.ndarray:
    """左上からの平行光で陰影を付ける。

    **傾きは世界の尺度で測る。** 画面の微分をそのまま使うと、奥ほど
    1画素が広い地面を写しているぶん傾きが過大に出て、上端だけが
    黒く焼けた。画素あたりの世界の伸びで割って揃える
    """
    dy, dx = np.gradient(height * scale)
    gx, gy = world_gradient(dx, dy, dist)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az = np.radians(360.0 - azimuth + 90.0)
    alt = np.radians(altitude)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(shade, 0.0, 1.0)


def slope_of(height: np.ndarray, scale: float, dist: np.ndarray) -> np.ndarray:
    dy, dx = np.gradient(height * scale)
    gx, gy = world_gradient(dx, dy, dist)
    s = np.hypot(gx, gy)
    return np.clip(s / max(1e-6, float(np.percentile(s, 99))), 0.0, 1.0)


def cavity(height: np.ndarray, sigma: float = 26.0) -> np.ndarray:
    """窪みを暗く、盛り上がりを明るくする環境遮蔽もどき。

    平行光の陰影だけだと谷底まで一様に明るく、起伏が板に見える。
    均した面との差を取って窪みを沈めると、丘が丘らしく座る
    """
    d = height - _blur(height, sigma)
    return np.clip(d / max(1e-6, float(np.percentile(np.abs(d), 96))), -1.0, 1.0)


def ramp(t: np.ndarray, stops: list[tuple[float, Rgb]]) -> np.ndarray:
    """標高を色に写す。stops は (位置, RGB) を昇順に並べたもの。"""
    t = np.clip(t, 0.0, 1.0)
    out = np.zeros(t.shape + (3,), dtype=np.float32)
    for i in range(len(stops) - 1):
        p0, c0 = stops[i]
        p1, c1 = stops[i + 1]
        m = (t >= p0) & (t <= p1)
        if not m.any():
            continue
        f = ((t[m] - p0) / max(1e-6, p1 - p0))[:, None]
        out[m] = np.array(c0, np.float32) * (1 - f) + np.array(c1, np.float32) * f
    out[t < stops[0][0]] = stops[0][1]
    out[t > stops[-1][0]] = stops[-1][1]
    return out


def blend(rgb: np.ndarray, color: Rgb, mask: np.ndarray) -> None:
    """マスクの強さで色を混ぜる。地面の上に別の地肌を乗せるのに使う。"""
    f = np.clip(mask, 0.0, 1.0)[:, :, None]
    rgb *= 1.0 - f
    rgb += np.array(color, np.float32) * f


def grain(rgb: np.ndarray, rng: np.random.Generator, amount: float = 6.0,
          fade: np.ndarray | None = None) -> None:
    """細かなざらつき。のっぺりした面を地肌に寄せる。

    遠景まで同じ強さで振ると、霞むはずの奥が手前と同じ解像度に見える
    """
    n = rng.normal(0.0, amount, (H, W)).astype(np.float32)
    if fade is not None:
        n *= 0.3 + 0.7 * fade
    rgb += n[:, :, None]


def directional_texture(rng: np.random.Generator, sigma_y: float, sigma_x: float,
                        contrast: float = 2.2) -> np.ndarray:
    """向きのある細かい模様。麦の畝や砂の風紋に使う。

    1本ずつ線を引いていたときは 1px の縦線が数万本並んで網目が浮いた。
    **面として作って乗せる**ほうが地肌になる
    """
    n = rng.random((H, W)).astype(np.float32)
    img = Image.fromarray((n * 255).astype(np.uint8))
    img = img.resize((max(1, int(W / sigma_x)), max(1, int(H / sigma_y))), Image.BILINEAR)
    img = img.resize((W, H), Image.BICUBIC)
    img = img.filter(ImageFilter.GaussianBlur(max(0.8, min(sigma_x, sigma_y) * 0.55)))
    t = np.asarray(img, dtype=np.float32) / 255.0
    return np.clip((t - 0.5) * contrast + 0.5, 0.0, 1.0)


# ── 地物 ──────────────────────────────────────────────


def scatter_world(rgb: np.ndarray, rng: np.random.Generator, count: int,
                  size: tuple[float, float], lit: Rgb, shade: Rgb,
                  conifer: bool = False, near: float = 1.05, far: float = 3.2,
                  keep_centre: bool = True) -> None:
    """木や灌木を世界座標に置いて画面へ投影する。

    **大きさは距離で決まる。** 画面の y から手加減して縮めていたときは、
    奥の木も手前の木も似た大きさになり遠近が出なかった。
    足元には陽の向きに合わせた影を落とす（左上から当てているので右下へ）
    """
    placed = 0
    guard = 0
    while placed < count and guard < count * 40:
        guard += 1
        # 画面で均等にばらけるよう、奥行きは 1/D で引く
        u = rng.random()
        wy = 1.0 / ((1.0 / near) * (1 - u) + (1.0 / far) * u)
        wx = (rng.random() - 0.5) * wy * SPREAD * 0.98
        px, py = project(np.array([wx]), np.array([wy]))
        cx, cy = float(px[0]), float(py[0])
        if not (0 <= cx < W and 0 <= cy < H):
            continue
        # 中央の空き地は戦場そのものなので、地物で埋めない
        if keep_centre and abs(cx - W * 0.5) < W * 0.18 and abs(cy - H * 0.5) < H * 0.14:
            continue
        world_r = rng.uniform(size[0], size[1])
        r = int(world_r / wy * W / SPREAD)
        if r < 2 or r > W * 0.12:
            continue
        placed += 1
        top = int(r * 3.0) if conifer else int(r * 1.7)
        # 影。右下へ伸ばす
        sh_r = max(2, int(r * 1.25))
        y0, y1 = max(0, int(cy) - sh_r // 2), min(H, int(cy + sh_r * 0.5) + 1)
        x0, x1 = max(0, int(cx - sh_r * 0.3)), min(W, int(cx + sh_r * 2.0) + 1)
        if y1 - y0 >= 2 and x1 - x0 >= 2:
            yy, xx = np.mgrid[y0:y1, x0:x1]
            ell = ((xx - (cx + sh_r * 0.8)) / max(1.0, sh_r * 1.15)) ** 2 + \
                  ((yy - cy) / max(1.0, sh_r * 0.33)) ** 2 <= 1.0
            rgb[y0:y1, x0:x1][ell] *= 0.68

        y0, y1 = max(0, int(cy) - top), min(H, int(cy) + 2)
        x0, x1 = max(0, int(cx - r)), min(W, int(cx + r) + 1)
        if y1 - y0 < 3 or x1 - x0 < 3:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        if conifer:
            t = (yy - (cy - top)) / max(1, top)
            # 段になった枝。真っ直ぐな三角だと折り紙にしか見えない
            tiers = 0.84 + 0.16 * np.cos(t * np.pi * 5.0)
            body = np.abs(xx - cx) <= (r * t * tiers)
        else:
            body = ((xx - cx) / r) ** 2 + ((yy - (cy - r * 0.6)) / (r * 0.9)) ** 2 <= 1.0
        if not body.any():
            continue
        # 遠いほど霞に溶ける
        # 近景は不透明に、遠景ほど霞に溶ける。
        # 中景まで半透明にしていたときは、木が地面に透けて幽霊のようだった
        k = float(np.clip((DIST_FAR - wy) / (DIST_FAR - DIST_NEAR), 0.0, 1.0)) ** 0.55
        k = 0.42 + 0.58 * k
        patch = rgb[y0:y1, x0:x1]
        base = patch.copy()
        # 左上から光を当てた丸い塊として塗る。
        # 明暗を左右で切っていたときは、二色に割れた釦が並んで見えた
        nx = (xx - cx) / max(1.0, r)
        if conifer:
            # 円錐は左右で明暗が割れ、梢に向かって明るくなる
            ny = (yy - cy) / max(1.0, top)
            lam = np.clip(0.60 - nx * 0.72 + (1.0 - ny) * 0.30, 0.0, 1.0) ** 0.9
        else:
            ny = (yy - (cy - r * 0.6)) / max(1.0, r * 0.9)
            lam = np.clip(0.62 - (nx * 0.52 + ny * 0.46), 0.0, 1.0) ** 0.8
        col = (np.array(shade, np.float32)[None, None, :] * (1 - lam)[:, :, None]
               + np.array(lit, np.float32)[None, None, :] * lam[:, :, None])
        m = body[:, :, None].astype(np.float32) * k
        patch[:] = base * (1 - m) + col * m


def aerial(rgb: np.ndarray, haze: Rgb, strength: float = 0.42) -> np.ndarray:
    """遠くほど霞ませる。上が奥、下が手前。

    距離に対して指数で薄める（画面の y で線形に薄めるより空気に近い）
    """
    _, _, dist = ground()
    f = np.clip(1.0 - np.exp(-(dist - DIST_NEAR) * 0.62), 0.0, 1.0) * strength
    return rgb * (1 - f[:, :, None]) + np.array(haze, np.float32) * f[:, :, None]


def vignette(rgb: np.ndarray, amount: float = 0.12) -> np.ndarray:
    """四隅を落とす。板の縁が切れて見えるのを抑える。"""
    y = (np.linspace(-1, 1, H, dtype=np.float32) ** 2)[:, None]
    x = (np.linspace(-1, 1, W, dtype=np.float32) ** 2)[None, :]
    f = np.clip((x + y) * 0.5, 0.0, 1.0) ** 1.6 * amount
    return rgb * (1.0 - f[:, :, None])


def rolloff(rgb: np.ndarray, knee: float = 210.0) -> np.ndarray:
    """明るい側を圧縮する。

    陽の当たる斜面と霞が重なると 255 に張り付いて白い塊になり、
    そこだけ形が消える。膝から上を tanh で寝かせて階調を残す
    """
    x = np.clip(rgb, 0.0, 320.0) / 255.0
    k = knee / 255.0
    hi = x > k
    x[hi] = k + (1.0 - k) * np.tanh((x[hi] - k) / (1.0 - k))
    return x * 255.0


def finish(rgb: np.ndarray, name: str) -> None:
    img = Image.fromarray(np.clip(rolloff(rgb), 0, 255).astype(np.uint8))
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{name}.webp")
    img.save(path, "WEBP", quality=84, method=6)
    print(f"  {name}.webp  {os.path.getsize(path) // 1024} KB")


# 陽の当たる面は暖かく、陰は空の色を拾って冷たくなる。
# 明暗の比だけで起伏を出していたときは、同じ色の濃淡が渦を巻いて
# 迷彩の斑にしか見えなかった。**色温度の差が屋外の光を作る**
WARM = (1.07, 1.01, 0.89)
COOL = (0.84, 0.90, 1.05)


def shade_and_seat(rgb: np.ndarray, shade: np.ndarray, hollow: np.ndarray,
                   lo: float, hi: float) -> None:
    """陰影と環境遮蔽を地肌に掛ける。起伏を板ではなく塊に見せる。

    **明暗の幅を広げすぎない。** 0.5〜1.3 まで振っていたときは
    地面が液体のように見えた。幅を狭め、足りないぶんを色温度で補う
    """
    s = shade[:, :, None]
    tint = np.array(COOL, np.float32) * (1.0 - s) + np.array(WARM, np.float32) * s
    rgb *= (lo + hi * s) * tint
    rgb *= (1.0 + 0.14 * hollow[:, :, None])


def micro_relief(rgb: np.ndarray, rng: np.random.Generator, wx: np.ndarray,
                 wy: np.ndarray, dist: np.ndarray, fade: np.ndarray,
                 amount: float = 0.15, cells: float = 9.0) -> None:
    """地肌の細かい凹凸。

    大きな起伏だけだと表面がつるりとした樹脂に見える。世界座標で
    細かい標高をもう一枚重ね、その陰影を薄く掛けると土の面になる。
    遠景では潰れるので手前ほど強くする
    """
    micro = world_fbm(rng, wx, wy, cells=cells, octaves=3, gain=0.55)
    ms = hillshade(micro, 0.045, dist, altitude=40.0)
    rgb *= (1.0 - amount * 0.5 + amount * ms * fade)[:, :, None]


# ── 地形 ──────────────────────────────────────────────


def make_plain(rng: np.random.Generator) -> None:
    """平原。麦畑と牧草地の継ぎはぎを、奥へ向かって狭まる区画で敷く。"""
    wx, wy, dist = ground()
    fade = depth_fade()

    hgt = _blur(world_fbm(rng, wx, wy, cells=1.1, octaves=4, gain=0.45, aspect=1.7), 3.0)
    shade = hillshade(hgt, 0.26, dist)
    hollow = cavity(hgt)

    rgb = ramp(hgt, [
        (0.0, (108, 124, 70)), (0.35, (134, 144, 78)),
        (0.7, (164, 164, 94)), (1.0, (190, 184, 114)),
    ])

    # 耕地。世界座標を区画に切り、作物ごとに色を割り当てる
    cid, edge = parcels(rng, wx, wy, size=0.44, wobble=0.52)
    crop = ramp(cid, [
        (0.00, (150, 156, 88)),   # 牧草
        (0.28, (196, 180, 100)),  # 熟した麦
        (0.52, (128, 108, 70)),   # 鋤いた土
        (0.74, (168, 172, 96)),   # 若い麦
        (1.00, (206, 192, 118)),  # 刈り跡
    ])
    # 区画の中だけ塗り、畦のきわは地の色を残す
    inside = np.clip(edge * 26.0, 0.0, 1.0)
    rgb = rgb * (1 - (inside * 0.88)[:, :, None]) + crop * (inside * 0.88)[:, :, None]

    # 畝。区画ごとに向きが違うので縦横2枚を場所で切り替える
    rows_v = directional_texture(rng, sigma_y=9.0, sigma_x=1.6)
    rows_h = directional_texture(rng, sigma_y=1.6, sigma_x=9.0)
    which = (cid > 0.5).astype(np.float32)
    blend(rgb, (212, 200, 132), (rows_v * which + rows_h * (1 - which)) * 0.20 * fade * inside)

    # 畦道と生垣。畦は明るい土、その脇に濃い緑の生垣が付く
    baulk = np.clip(1.0 - edge * 34.0, 0.0, 1.0)
    blend(rgb, (176, 166, 128), baulk * 0.55)
    hedge = np.clip(1.0 - np.abs(edge * 34.0 - 1.5) / 0.9, 0.0, 1.0)
    blend(rgb, (76, 94, 50), hedge * 0.5)

    shade_and_seat(rgb, shade, hollow, 0.42, 0.86)
    micro_relief(rgb, rng, wx, wy, dist, fade, 0.13, 11.0)

    scatter_world(rgb, rng, 46, (0.020, 0.055), (112, 130, 66), (72, 90, 44))
    grain(rgb, rng, 6.0, fade)
    finish(vignette(aerial(rgb, (204, 202, 172))), "plain")


def make_hill(rng: np.random.Generator) -> None:
    """丘陵。横に走る尾根と露岩。手前の斜面が大きく、奥に稜線が重なる。"""
    wx, wy, dist = ground()
    fade = depth_fade()
    mid = band_mask()

    hgt = _blur(world_fbm(rng, wx, wy, cells=1.15, octaves=5, gain=0.52, aspect=1.35), 2.0)
    shade = hillshade(hgt, 0.62, dist)
    slope = slope_of(hgt, 0.62, dist)
    hollow = cavity(hgt, 20.0)

    rgb = ramp(hgt, [
        (0.0, (84, 106, 58)), (0.28, (112, 126, 66)),
        (0.5, (150, 146, 86)), (0.75, (182, 166, 106)), (1.0, (206, 190, 134)),
    ])
    # 窪みには草が残り、削られた斜面は乾いた土と礫が出る。
    # 一色の濃淡だけで起伏を描くと迷彩の斑に見えるので、
    # 地肌そのものを草・土・礫の3つに描き分ける
    hollow_grass = np.clip((0.46 - hgt) * 2.6, 0, 1) ** 0.8
    blend(rgb, (92, 116, 62), hollow_grass * 0.72 * mid)
    # 北向き（陰になる）斜面にも草が残る
    blend(rgb, (104, 124, 68), np.clip((0.46 - shade) * 3.0, 0, 1) * 0.35)
    scree = np.clip((slope - 0.22) * 3.0, 0, 1)
    blend(rgb, (168, 150, 112), scree * 0.7)

    shade_and_seat(rgb, shade, hollow, 0.52, 0.72)
    micro_relief(rgb, rng, wx, wy, dist, fade, 0.09, 9.0)

    # 露岩。急斜面にだけ粒で置き、下側に影を落とす
    rock = (slope > 0.42) & (rng.random((H, W)) < 0.09 * (0.4 + 0.6 * fade))
    rgb[rock] = rgb[rock] * 0.55 + np.array([162, 150, 122], np.float32) * 0.45
    rgb[np.roll(rock, 3, axis=0) & ~rock] *= 0.76

    scatter_world(rgb, rng, 70, (0.016, 0.048), (110, 126, 66), (66, 82, 42))
    grain(rgb, rng, 6.0, fade)
    finish(vignette(aerial(rgb, (208, 200, 174))), "hill")


def make_forest(rng: np.random.Generator) -> None:
    """森林。針葉樹の樹海と、中央の林間の空き地。手前の木は大きく写る。"""
    wx, wy, dist = ground()
    fade = depth_fade()

    hgt = _blur(world_fbm(rng, wx, wy, cells=1.2, octaves=4, gain=0.5), 3.0)
    shade = hillshade(hgt, 0.34, dist)
    hollow = cavity(hgt)

    # 手前を明るく取る。暗いままだと、上に重なる紺の隊が地面に沈んだ
    # 林床。木々の下は暗い。明るい草地のままだと、上に立つ木が
    # 地面から浮いて紙を切り抜いて貼ったように見えた
    rgb = ramp(hgt, [
        (0.0, (62, 76, 50)), (0.4, (80, 94, 60)),
        (0.7, (98, 112, 70)), (1.0, (118, 130, 84)),
    ])
    moss = world_fbm(rng, wx, wy, cells=3.0, octaves=3, gain=0.5)
    blend(rgb, (56, 74, 44), np.clip((moss - 0.5) * 3.2, 0, 1) * 0.5)
    # 林間の空き地だけ日が差す
    glade = np.exp(-(((wx / 0.30) ** 2) + ((wy - 1.62) / 0.30) ** 2)).astype(np.float32)
    blend(rgb, (150, 156, 100), glade * 0.62)
    shade_and_seat(rgb, shade, hollow, 0.46, 0.80)
    micro_relief(rgb, rng, wx, wy, dist, fade, 0.12, 10.0)

    # 樹海。奥から手前へ描いて重なりの前後を合わせる
    scatter_world(rgb, rng, 460, (0.030, 0.062), (66, 90, 52), (38, 56, 34),
                  conifer=True, near=1.02, far=DIST_FAR * 0.98)
    # 空き地のふちの下草
    scatter_world(rgb, rng, 70, (0.012, 0.030), (96, 120, 62), (60, 78, 40),
                  near=1.05, far=2.4)

    # 空き地の倒木。空白に見せないために置くが、目立たせない
    for _ in range(4):
        cy = int(rng.integers(int(H * 0.44), int(H * 0.58)))
        cx = int(rng.integers(int(W * 0.36), int(W * 0.60)))
        ln = int(rng.integers(30, 58))
        rgb[cy:cy + 3, cx:cx + ln] = np.array([74, 62, 44], np.float32)
        rgb[cy + 3:cy + 5, cx:cx + ln] = np.array([52, 44, 32], np.float32)

    grain(rgb, rng, 5.0, fade)
    finish(vignette(aerial(rgb, (170, 182, 158), 0.5)), "forest")


def make_desert(rng: np.random.Generator) -> None:
    """砂漠。横に伸びた砂丘と礫。手前の砂丘が画面を横切り、奥へ列をなす。"""
    wx, wy, dist = ground()
    fade = depth_fade()

    hgt = _blur(world_fbm(rng, wx, wy, cells=0.95, octaves=4, gain=0.42,
                          ridged=True, aspect=2.6), 3.0)
    shade = hillshade(hgt, 0.50, dist, altitude=30.0)
    slope = slope_of(hgt, 0.50, dist)
    hollow = cavity(hgt, 30.0)

    rgb = ramp(hgt, [
        (0.0, (176, 146, 96)), (0.32, (200, 174, 118)),
        (0.66, (218, 196, 142)), (1.0, (230, 212, 168)),
    ])
    # 砂丘のあいだの礫。低いところに硬い地面が覗く
    gravel = np.clip((0.32 - hgt) * 4.2, 0, 1)
    blend(rgb, (170, 150, 114), gravel * 0.58)
    rgb[(gravel > 0.4) & (rng.random((H, W)) < 0.09 * fade)] *= 0.82

    # 風紋。砂丘と同じ向き（横）に薄く乗せる
    ripple = directional_texture(rng, sigma_y=3.0, sigma_x=12.0, contrast=1.5)
    blend(rgb, (248, 234, 196), ripple * 0.14 * (1.0 - gravel) * fade)

    shade_and_seat(rgb, shade, hollow, 0.50, 0.66)
    micro_relief(rgb, rng, wx, wy, dist, fade, 0.10, 13.0)
    # 稜線に陽の縁を立てる
    crest = np.clip((slope - 0.28) * 3.2, 0, 1) * np.clip((hgt - 0.52) * 3.0, 0, 1)
    blend(rgb, (248, 234, 198), crest * 0.28)

    scatter_world(rgb, rng, 30, (0.014, 0.036), (152, 146, 96), (100, 94, 58))
    grain(rgb, rng, 5.0, fade)
    finish(vignette(aerial(rgb, (226, 210, 176), 0.30)), "desert")


def make_river(rng: np.random.Generator) -> None:
    """渡河点。川が横切り、手前ほど広く写る。石の河原と中央の浅瀬。"""
    wx, wy, dist = ground()
    fade = depth_fade()

    hgt = _blur(world_fbm(rng, wx, wy, cells=1.2, octaves=4, gain=0.46, aspect=1.6), 3.0)
    shade = hillshade(hgt, 0.28, dist)
    hollow = cavity(hgt)

    rgb = ramp(hgt, [
        (0.0, (104, 120, 70)), (0.4, (132, 142, 84)),
        (0.72, (158, 160, 100)), (1.0, (180, 178, 120)),
    ])
    shade_and_seat(rgb, shade, hollow, 0.42, 0.86)
    micro_relief(rgb, rng, wx, wy, dist, fade, 0.13, 11.0)

    # 川。世界の Y で位置と幅を決めるので、手前ほど太く写る
    centre = 1.62 + np.sin(wx * 2.1) * 0.10 + np.sin(wx * 5.3) * 0.03
    half = 0.145 + np.sin(wx * 3.4) * 0.02
    d = np.abs(wy - centre)

    # 河原。石の多い帯
    bank = np.clip(1.0 - (d - half) / 0.16, 0, 1) * (d > half)
    blend(rgb, (176, 168, 136), bank * 0.62)
    shingle = (bank > 0.25) & (rng.random((H, W)) < 0.07 * (0.3 + 0.7 * fade))
    rgb[shingle] = rgb[shingle] * 0.6 + np.array([208, 202, 180], np.float32) * 0.4

    # 水面。深いほど暗く、岸に寄るほど底が透ける
    depth = np.clip(1.0 - d / half, 0.0, 1.0)
    water = d <= half
    wcol = ramp(depth, [(0.0, (146, 166, 160)), (0.45, (92, 128, 146)), (1.0, (52, 92, 124))])
    rgb[water] = wcol[water]

    # さざなみと、空を映した明るい帯
    wave = directional_texture(rng, sigma_y=2.2, sigma_x=8.0, contrast=1.9)
    blend(rgb, (208, 228, 236), water * wave * (0.35 + 0.4 * depth) * 0.35)
    blend(rgb, (196, 216, 226), water * np.clip(1.0 - np.abs(depth - 0.72) / 0.2, 0, 1) * 0.22)

    # 浅瀬。中央だけ底が見え、踏み越えられる
    ford_w = 0.115
    fade_x = np.clip(1.0 - np.abs(wx) / ford_w, 0, 1)
    ford = water & (np.abs(wx) < ford_w)
    blend(rgb, (164, 180, 174), (ford * fade_x) * 0.64)
    rgb[ford & (rng.random((H, W)) < 0.035)] = np.array([198, 200, 188], np.float32)

    scatter_world(rgb, rng, 40, (0.016, 0.044), (104, 122, 64), (66, 82, 42))
    grain(rgb, rng, 6.0, fade)
    finish(vignette(aerial(rgb, (194, 202, 184))), "river")


if __name__ == "__main__":
    print("戦場の地を書き出す:")
    make_plain(np.random.default_rng(11))
    make_hill(np.random.default_rng(23))
    make_forest(np.random.default_rng(37))
    make_desert(np.random.default_rng(51))
    make_river(np.random.default_rng(67))
