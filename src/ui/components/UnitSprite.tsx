/**
 * 地図上の軍団。
 * 平板なピンをやめ、盾・鷲章・軍旗を組み合わせた立体的な意匠にする。
 * 落ち影を付けて地図の上に立っているように見せる
 */

export function UnitSpriteDefs() {
  return (
    <>
      {/* 地面に落ちる影。接地感を出す */}
      <filter id="unitShadow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx={1.5} dy={3.5} stdDeviation={2} floodColor="#050810" floodOpacity={0.65} />
      </filter>
      {/* 戦闘の火花を光らせる */}
      <filter id="sparkGlow" x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur stdDeviation={1.4} result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* 磨かれた金属 */}
      <linearGradient id="steel" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stopColor="#f1f5f9" />
        <stop offset="45%" stopColor="#94a3b8" />
        <stop offset="100%" stopColor="#475569" />
      </linearGradient>
      {/* 金 */}
      <linearGradient id="unitGold" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stopColor="#fef3c7" />
        <stop offset="40%" stopColor="#eab308" />
        <stop offset="100%" stopColor="#92400e" />
      </linearGradient>
      {/* ローマの盾。中央が明るく縁が落ちる曲面に見せる */}
      <linearGradient id="scutumFace" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#7f1d1d" />
        <stop offset="35%" stopColor="#dc2626" />
        <stop offset="65%" stopColor="#b91c1c" />
        <stop offset="100%" stopColor="#601414" />
      </linearGradient>
      {/* 蛮族の盾。板を張った木の面 */}
      <linearGradient id="barbShieldFace" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#3f2d1c" />
        <stop offset="40%" stopColor="#78502c" />
        <stop offset="100%" stopColor="#2f2114" />
      </linearGradient>
    </>
  );
}

/**
 * 地図上での大きさ。属州ラベル（17）と並べて負けない寸法にする。
 * 意匠は等倍で描き、ここでまとめて拡大する
 */
const UNIT_SCALE = 1.0;

/**
 * キリストのモノグラム（ラバルム）。
 *
 * ギリシア語 ΧΡΙΣΤΟΣ の頭2文字 Χ（カイ）と Ρ（ロー）を重ねたもの。
 * コンスタンティヌス以降ローマ軍の標識になり、この時代の軍旗は
 * 鷲章ではなくこれを掲げている。
 *
 * 画像を貼らず線で描く。地図上では 15px 程度まで縮むので、
 * 装飾より輪郭の判別を優先し、縦棒にだけ碑文風の横棒（セリフ）を付ける。
 * 縦 -14〜14 の座標系で描くので、使う側で拡大縮小する
 */
export function ChiRho({ color, strokeWidth = 3 }: { color: string; strokeWidth?: number }) {
  return (
    <g stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="butt">
      {/* Χ（カイ）。左右に伸びる二本の斜線 */}
      <path d="M-11,-3 L11,9 M-11,9 L11,-3" />
      {/* Ρ（ロー）の縦棒 */}
      <path d="M0,-14 L0,14" />
      {/* Ρ の環。上半分を大きく取る */}
      <path d="M0,-13.5 C9,-13.5 9.5,-4.5 0,-4.5" />
      {/*
       * 端の広がり（セリフ）。碑文の彫りに倣って線の先を横に開く。
       * 斜線の分は線に直交させる。地図の縮尺では潰れるが、
       * 紋章として大きく出すときに効く
       */}
      <g strokeWidth={strokeWidth * 0.72}>
        <path d="M-3.2,-14 L3.2,-14 M-3.2,14 L3.2,14" />
        <path d="M-9.6,-5.6 L-12.4,-0.4 M12.4,6.4 L9.6,11.6" />
        <path d="M-9.6,11.6 L-12.4,6.4 M12.4,-0.4 L9.6,-5.6" />
      </g>
    </g>
  );
}

/**
 * 兵力を示す軍旗。勢力色を反映する。
 * 隊列のうち先頭にだけ掲げるので、strength を渡さない部隊は旗を持たない
 */
function Banner({ color, strength }: { color: string; strength: number }) {
  return (
    <g transform="translate(10,-26)">
      <rect x={-1.1} y={0} width={2.2} height={32} fill="url(#unitGold)" />
      <path d="M1.1,1 L23,5 L23,19 L1.1,15 Z" fill={color} stroke="#1c1917" strokeWidth={1} />
      {/* 布に染めたラバルム。兵力の数字と重ならないよう左寄せで小さく */}
      <g transform="translate(7,10) scale(0.28)" opacity={0.85}>
        <ChiRho color="#fff7ed" strokeWidth={5} />
      </g>
      <text
        x={15}
        y={14}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill="#fff7ed"
        stroke="#1c1917"
        strokeWidth={2.4}
        paintOrder="stroke"
      >
        {Math.round(strength)}
      </text>
    </g>
  );
}

/**
 * ローマ軍。長方形の盾（スクトゥム）に鷲章を重ねる。
 * 親征のときは軍旗を金にする
 */
export function LegionSprite({
  strength,
  imperial,
}: {
  strength?: number;
  imperial: boolean;
}) {
  return (
    <g filter="url(#unitShadow)" transform={`scale(${UNIT_SCALE})`}>
      {/* 盾 */}
      <path
        d="M-9,-13 Q-11,0 -9,13 L9,13 Q11,0 9,-13 Z"
        fill="url(#scutumFace)"
        stroke="#3f0d0d"
        strokeWidth={1.1}
      />
      {/* 盾の金具 */}
      <path d="M-9,-4 L9,-4 M-9,4 L9,4" stroke="#f6d68a" strokeWidth={0.9} opacity={0.85} />
      <ellipse cx={0} cy={0} rx={3.4} ry={3.8} fill="url(#unitGold)" stroke="#3f0d0d" strokeWidth={0.8} />
      {/*
       * ラバルム。竿の先に掲げる。
       * この時代の軍の標識は鷲章ではなくキリストのモノグラムだった
       */}
      <g transform="translate(-11,-15)">
        <rect x={-0.8} y={0} width={1.6} height={20} fill="url(#unitGold)" />
        <g transform="translate(0,-3) scale(0.32)">
          <ChiRho color="#f6d68a" strokeWidth={6} />
        </g>
      </g>
      {strength !== undefined && (
        <Banner color={imperial ? '#f59e0b' : '#b91c1c'} strength={strength} />
      )}
    </g>
  );
}

/** 蛮族。円形の木盾に斧を添える */
export function WarbandSprite({ strength }: { strength?: number }) {
  return (
    <g filter="url(#unitShadow)" transform={`scale(${UNIT_SCALE})`}>
      {/* 斧 */}
      <g transform="translate(-10,-14) rotate(-18)">
        <rect x={-0.8} y={0} width={1.6} height={24} fill="#4a3520" />
        <path d="M0.8,1 L7,0 Q9,5 7,10 L0.8,9 Z" fill="url(#steel)" stroke="#1f2937" strokeWidth={0.6} />
      </g>
      {/* 円盾 */}
      <circle cx={0} cy={0} r={12} fill="url(#barbShieldFace)" stroke="#1c1108" strokeWidth={1.2} />
      <g stroke="#c9a227" strokeWidth={0.8} opacity={0.7}>
        <path d="M-12,0 L12,0 M0,-12 L0,12" />
      </g>
      <circle cx={0} cy={0} r={3.4} fill="url(#steel)" stroke="#1c1108" strokeWidth={0.8} />
      {strength !== undefined && <Banner color="#7f1d1d" strength={strength} />}
    </g>
  );
}

/**
 * 蛮族の駒。地図に常時出すので、行軍の意匠より小さく作る。
 * 態度で色を変え、敵対・同盟・定住を色で見分けられるようにする
 */
export function FactionToken({
  strength,
  color,
  rim,
}: {
  strength: number;
  color: string;
  rim: string;
}) {
  return (
    <g>
      {/*
       * 影はぼかしフィルタではなく単純な楕円で描く。
       * この駒は毎ターン兵力が変わって描き直しになるので、
       * 8勢力ぶんのフィルタを毎回ラスタ化させたくない
       */}
      <ellipse cx={1} cy={3} rx={9} ry={8} fill="#050810" opacity={0.5} />
      <circle cx={0} cy={0} r={9} fill={color} stroke={rim} strokeWidth={1.4} />
      <circle cx={0} cy={0} r={9} fill="none" stroke="#0c0a09" strokeWidth={0.6} opacity={0.6} />
      <text
        y={3.4}
        textAnchor="middle"
        fontSize={9.5}
        fontWeight={700}
        fill="#fff7ed"
        stroke="#1c1917"
        strokeWidth={2}
        paintOrder="stroke"
      >
        {Math.round(strength)}
      </text>
    </g>
  );
}

/**
 * 交戦の印。交差した剣に火花と煙を添える。
 * 兵力は下にある蛮族の駒が示すので、ここでは数字を出さない
 */
export function BattleSprite() {
  return (
    <g transform={`scale(${UNIT_SCALE})`}>
      {/* 立ち上る煙 */}
      {[0, 1, 2].map((i) => (
        <circle
          key={`smoke${i}`}
          cx={-6 + i * 6}
          cy={-6}
          r={5 + i}
          fill="#94a3b8"
          className="battle-smoke"
          style={{ animationDelay: `${i * 0.5}s`, opacity: 0 }}
        />
      ))}

      {/* 赤い明滅 */}
      <circle r={15} fill="#7f1d1d" stroke="#fca5a5" strokeWidth={1.6} className="battle-core" />

      {/* 交差した剣 */}
      <g filter="url(#unitShadow)">
        {[35, -35].map((angle) => (
          <g key={angle} transform={`rotate(${angle})`}>
            <rect x={-1.5} y={-13} width={3} height={19} fill="url(#steel)" />
            <path d="M-1.5,-13 L0,-16 L1.5,-13 Z" fill="#e2e8f0" />
            <rect x={-5} y={6} width={10} height={1.8} fill="url(#unitGold)" />
            <rect x={-1.3} y={7.8} width={2.6} height={5} fill="#78350f" />
          </g>
        ))}
      </g>

      {/* 火花 */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle
          key={`spark${i}`}
          r={1.3}
          fill="#fde047"
          filter="url(#sparkGlow)"
          className="battle-spark"
          style={{
            ['--spark-x' as string]: `${Math.cos((i / 6) * Math.PI * 2) * 22}px`,
            ['--spark-y' as string]: `${Math.sin((i / 6) * Math.PI * 2) * 22 - 6}px`,
            animationDelay: `${i * 0.13}s`,
            opacity: 0,
          }}
        />
      ))}

    </g>
  );
}
