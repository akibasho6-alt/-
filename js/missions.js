// Missions and Blueprint Definitions

export const MISSIONS = [
  {
    id: 'm1_wood_pin',
    title: '木製ノックピンの製作',
    client: '家具工房「タナカ木工」',
    category: '初級',
    materialId: 'wood',
    stockRadius: 40, // Base stock radius (mm)
    length: 100,     // mm
    reward: 300,
    requiredRep: 0,
    tolerance: 6.0, // mm tolerance for pass (eased from 3.0)
    description: '家具のダボ継ぎに使うシンプルな段付きピンを作ってほしい。初めての旋盤加工にぴったりだ。',
    // profile function: maps normalized x (0 to 1) to target radius (mm)
    profile: (t) => {
      // 0.0 to 0.5: radius 22mm, 0.5 to 1.0: radius 32mm
      if (t < 0.5) return 22;
      return 32;
    },
    hints: '平バイトを使って左半分をφ44mmまで均一に削り落としましょう。'
  },
  {
    id: 'm2_wood_handle',
    title: '引き出し用木製丸ツマミ',
    client: 'アンティーク雑貨「アトリエ・フォレスト」',
    category: '初級',
    materialId: 'wood',
    stockRadius: 45,
    length: 100,
    reward: 500,
    requiredRep: 50,
    tolerance: 5.0,
    description: 'チェストの引き出しに付ける曲線的な木製取っ手だ。丸バイトで滑らかなカーブを削り出してくれ。',
    profile: (t) => {
      // Neck at 0.3 (r=18), Bulb at 0.7 (r=38), Base at 0 (r=28)
      if (t < 0.4) {
        const u = t / 0.4;
        return 28 - Math.sin(u * Math.PI) * 10; // dips down to 18
      } else {
        const u = (t - 0.4) / 0.6;
        return 20 + Math.sin(u * Math.PI) * 18; // bulges up to 38
      }
    },
    hints: '丸バイトでくびれを作った後、サンドペーパーで表面をツルツルに磨くと高評価です。'
  },
  {
    id: 'm3_alum_bolt',
    title: '軽量アルミ段付きカラー',
    client: 'カスタムバイク「スピードスター」',
    category: '中級',
    materialId: 'aluminum',
    stockRadius: 42,
    length: 100,
    reward: 800,
    requiredRep: 120,
    tolerance: 4.5,
    description: 'レーシングバイクのサスペンション用カラースペーサーだ。段差と溝入れの加工を楽しもう。',
    profile: (t) => {
      if (t < 0.25) return 20;
      if (t < 0.35) return 14; // groove
      if (t < 0.75) return 28;
      return 36; // flange
    },
    hints: '中央の溝（φ28mm部）は剣バイトを使うと綺麗なエッジが出ます。'
  },
  {
    id: 'm4_brass_pawn',
    title: '真鍮製チェスピース（ポーン）',
    client: '高級ボードゲーム「チェス倶楽部」',
    category: '中級',
    materialId: 'brass',
    stockRadius: 45,
    length: 100,
    reward: 1200,
    requiredRep: 250,
    tolerance: 4.0,
    description: '高級チェス盤に並べる真鍮削り出しのポーン駒。美しいシルエットと磨き上げられた黄金の光沢が必要だ。',
    profile: (t) => {
      // Base (0..0.3), Column (0.3..0.7), Head sphere (0.7..1.0)
      if (t < 0.2) return 38 - t * 40;
      if (t < 0.3) return 24;
      if (t < 0.65) {
        const u = (t - 0.3) / 0.35;
        return 16 + Math.cos(u * Math.PI * 0.5) * 6;
      }
      if (t < 0.72) return 22; // collar ring
      const u = (t - 0.72) / 0.28;
      return 15 + Math.sin(u * Math.PI) * 13; // head bulb
    },
    hints: '真鍮は少し硬めです。サンドペーパーでしっかり磨き上げてゴールドの艶を出してください。'
  },
  {
    id: 'm5_steel_spindle',
    title: '高剛性スチールギアシャフト',
    client: '重工業「帝国重工・精機事業部」',
    category: '上級',
    materialId: 'steel',
    stockRadius: 45,
    length: 100,
    reward: 2000,
    requiredRep: 450,
    tolerance: 3.5,
    description: '産業機械の駆動部に組み込む炭素鋼シャフト。多段ステップと溝を削り出そう。',
    profile: (t) => {
      if (t < 0.15) return 18;
      if (t < 0.20) return 14; // O-ring groove
      if (t < 0.45) return 24;
      if (t < 0.50) return 20; // step groove
      if (t < 0.80) return 32;
      return 40;
    },
    hints: '硬質スチールのため超硬またはダイヤモンドバイトを推奨します。火花が激しく散ります。'
  },
  {
    id: 'm6_titanium_nozzle',
    title: '極限環境用チタンロケットノズル',
    client: '宇宙航空開発機構「コスモ・ラボ」',
    category: '特級',
    materialId: 'titanium',
    stockRadius: 48,
    length: 100,
    reward: 3500,
    requiredRep: 750,
    tolerance: 3.0,
    description: '次世代推進ロケットの燃焼室ノズル。超硬度チタンを美しいラバール・ノズル形状へ精密成形するミッション。',
    profile: (t) => {
      // Smooth bell flare and throat
      const throat = 15;
      const u = (t - 0.35) / 0.65;
      if (t < 0.35) {
        return 36 - Math.sin((t / 0.35) * Math.PI * 0.5) * (36 - throat);
      } else {
        return throat + Math.pow(u, 1.8) * 30; // flares up to 45
      }
    },
    hints: 'クーラント装置と最高グレードバイトを揃えて挑みましょう。'
  }
];

// Procedural Random Product Generator (ランダム製品・特注依頼生成)
const RANDOM_CLIENTS = [
  '精密機械「ミツワ精機」',
  'カスタムバイク「RPMワークス」',
  '航空機部品「スターエアロスペース」',
  'クラフト家具「キコリ工房」',
  '理化学機器「サイエンス・メカニクス」',
  '高級オーディオ「サウンド・ラボ」',
  '時計工房「クロノス精工」',
  '光学機器「ルミナス・オプティクス」',
  'ロボット開発「ネクスト・ダイナミクス」',
  'レーシングチーム「GPファクトリー」',
  'アンティーク工芸「銀嶺堂」',
  '海洋開発「マリンテック」'
];

const RANDOM_MAT_POOL = [
  { id: 'wood', name: '木材', minRep: 0, stockR: 45 },
  { id: 'aluminum', name: 'アルミ', minRep: 40, stockR: 42 },
  { id: 'brass', name: '真鍮', minRep: 120, stockR: 44 },
  { id: 'steel', name: 'スチール', minRep: 250, stockR: 45 },
  { id: 'titanium', name: 'チタン', minRep: 450, stockR: 48 }
];

export function generateRandomMission(playerRep = 0) {
  // Filter materials based on player reputation
  const availableMats = RANDOM_MAT_POOL.filter(m => playerRep >= m.minRep);
  const chosenMat = availableMats.length > 0 
    ? availableMats[Math.floor(Math.random() * availableMats.length)]
    : RANDOM_MAT_POOL[0];

  const client = RANDOM_CLIENTS[Math.floor(Math.random() * RANDOM_CLIENTS.length)];
  const missionNumber = Math.floor(Math.random() * 900) + 100;
  
  // Random shape type (0: Multi-step, 1: Tapered Spindle, 2: Knob/Bulb, 3: Grooved Sleeve, 4: Bell Nozzle, 5: Hourglass Spool)
  const shapeType = Math.floor(Math.random() * 6);
  
  let title = '';
  let desc = '';
  let profileFunc = (t) => 25;
  let hints = 'ガイドラインと透過オーバーレイに合わせて丁寧に削り出しましょう。';
  const stockRadius = chosenMat.stockR;
  const length = 100;

  // Generate varied procedural profile
  if (shapeType === 0) {
    // Multi-step
    const r1 = Math.floor(Math.random() * 8) + 14;
    const r2 = Math.floor(Math.random() * 8) + 24;
    const r3 = Math.floor(Math.random() * 6) + 34;
    const split1 = 0.25 + Math.random() * 0.15;
    const split2 = split1 + 0.3 + Math.random() * 0.15;
    
    title = `特注 ${chosenMat.name} 多段ステップシャフト #${missionNumber}`;
    desc = `${client}からの特注品。異なる直径の3段ステップを持つ高精度軸パーツです。`;
    profileFunc = (t) => {
      if (t < split1) return r1;
      if (t < split2) return r2;
      return r3;
    };
    hints = '平バイトを使って各段差を均一に削り落とすのがコツです。';
  } else if (shapeType === 1) {
    // Tapered Spindle
    const tipR = Math.floor(Math.random() * 6) + 12;
    const baseR = Math.floor(Math.random() * 8) + 30;
    const flangeR = Math.floor(Math.random() * 6) + 38;
    
    title = `特注 ${chosenMat.name} テーパースピンドル #${missionNumber}`;
    desc = `${client}からの依頼。なだらかに径が変化するテーパーコーン軸を製作してください。`;
    profileFunc = (t) => {
      if (t < 0.75) {
        return tipR + (t / 0.75) * (baseR - tipR);
      }
      return flangeR;
    };
    hints = '丸バイトまたは平バイトを斜めに送ると綺麗なテーパー面が作れます。';
  } else if (shapeType === 2) {
    // Knob / Handle
    const neckR = Math.floor(Math.random() * 5) + 14;
    const bulbR = Math.floor(Math.random() * 8) + 32;
    const baseR = Math.floor(Math.random() * 6) + 22;
    
    title = `特注 ${chosenMat.name} デザインツマミ #${missionNumber}`;
    desc = `${client}のデザイナーからの注文。美しいくびれと丸みを持つ操作ツマミです。`;
    profileFunc = (t) => {
      if (t < 0.35) {
        const u = t / 0.35;
        return baseR - Math.sin(u * Math.PI) * (baseR - neckR);
      } else {
        const u = (t - 0.35) / 0.65;
        return neckR + Math.sin(u * Math.PI) * (bulbR - neckR);
      }
    };
    hints = '丸バイトでくびれと丸みを削り、サンドペーパーでしっかり磨きましょう。';
  } else if (shapeType === 3) {
    // Grooved Sleeve / Bushing
    const bodyR = Math.floor(Math.random() * 6) + 22;
    const grooveR = Math.floor(Math.random() * 5) + 13;
    const flangeR = Math.floor(Math.random() * 6) + 36;
    
    title = `特注 ${chosenMat.name} 溝付きカラーブッシュ #${missionNumber}`;
    desc = `${client}の機構部品。オイル溝とフランジを備えたスリーブカラーです。`;
    profileFunc = (t) => {
      if (t < 0.2) return bodyR;
      if (t < 0.4) return grooveR;
      if (t < 0.8) return bodyR;
      return flangeR;
    };
    hints = '中央の細い溝入れには先端の尖った剣バイトが最適です。';
  } else if (shapeType === 4) {
    // Bell Nozzle
    const throatR = Math.floor(Math.random() * 5) + 13;
    const bellR = Math.floor(Math.random() * 6) + 38;
    const inletR = Math.floor(Math.random() * 6) + 28;
    
    title = `特注 ${chosenMat.name} 絞りノズルコーン #${missionNumber}`;
    desc = `${client}の流体実験用ノズル。滑らかな流線型の絞り形状を削り出してください。`;
    profileFunc = (t) => {
      if (t < 0.4) {
        const u = t / 0.4;
        return inletR - Math.sin(u * Math.PI * 0.5) * (inletR - throatR);
      } else {
        const u = (t - 0.4) / 0.6;
        return throatR + Math.pow(u, 1.6) * (bellR - throatR);
      }
    };
    hints = '丸バイトで滑らかな曲線を描き、耐水ペーパーで光沢仕上げを行いましょう。';
  } else {
    // Hourglass Spool
    const centerR = Math.floor(Math.random() * 5) + 14;
    const edgeR = Math.floor(Math.random() * 6) + 34;
    
    title = `特注 ${chosenMat.name} シンメトリックスプール #${missionNumber}`;
    desc = `${client}のワイヤー巻き取り軸。中央が滑らかにくびれた対称スプールです。`;
    profileFunc = (t) => {
      const u = (t - 0.5) * 2; // -1 to 1
      return centerR + (u * u) * (edgeR - centerR);
    };
    hints = '左右対称のくびれになるように丸バイトを当てましょう。';
  }

  // Generous reward and tolerance
  const reward = Math.round(500 + playerRep * 1.5 + Math.random() * 400);
  const tolerance = 5.5; // Generous ±5.5mm tolerance for enjoyable cutting

  return {
    id: `random_${Date.now()}_${missionNumber}`,
    title,
    client,
    category: 'ランダム特注',
    materialId: chosenMat.id,
    stockRadius,
    length,
    reward,
    requiredRep: 0,
    tolerance,
    description: desc,
    profile: profileFunc,
    hints,
    isRandom: true
  };
}
