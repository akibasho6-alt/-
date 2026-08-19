// Cutting Tools & Blade Grades definition

export const TOOL_TYPES = {
  roughing: {
    id: 'roughing',
    name: '荒削り平バイト',
    shortName: '平バイト',
    width: 28, // Cut width in slices/pixels
    shape: 'flat',
    depthRate: 1.6,
    description: '幅広で一気に削れる荒加工用。平面を素早く成形するのに最適。'
  },
  pointed: {
    id: 'pointed',
    name: '尖り・溝入れ剣バイト',
    shortName: '剣バイト',
    width: 12,
    shape: 'pointed',
    depthRate: 1.3,
    description: '先端が鋭利なV字形状。細かな段差や鋭角な溝入れ加工に必須。'
  },
  round: {
    id: 'round',
    name: 'R曲面丸バイト',
    shortName: '丸バイト',
    width: 20,
    shape: 'round',
    depthRate: 1.4,
    description: '丸みのある先端。滑らかな曲面やフィレット、くぼみ加工に最適。'
  },
  parting: {
    id: 'parting',
    name: '突っ切りバイト',
    shortName: '突っ切り',
    width: 8,
    shape: 'flat',
    depthRate: 2.0,
    description: '極薄の刃。ワークの端を落としたり深い溝を切断する。'
  },
  sandpaper: {
    id: 'sandpaper',
    name: '研磨耐水ペーパー',
    shortName: 'サンドペーパー',
    width: 40,
    shape: 'flat',
    depthRate: 0.05, // barely removes material, mostly polishes
    isFinisher: true,
    description: '表面の粗さを削り取り、光沢と美しい艶を出す仕上げ用ツール。'
  },
  caliper: {
    id: 'caliper',
    name: '測定ノギス・ゲージ',
    shortName: 'ノギス',
    width: 0,
    shape: 'measurement',
    isMeasuring: true,
    description: '加工物を削らずに、直径と目標差分を正確に測る測定ツール。'
  }
};

export const BLADE_GRADES = {
  hss: {
    id: 'hss',
    name: 'ハイス鋼 (HSS)',
    speedMult: 1.2,
    durability: 100,
    cost: 0,
    description: '標準的な高速度鋼バイト。木材や軽金属向き。'
  },
  carbide: {
    id: 'carbide',
    name: '超硬チップ (Carbide)',
    speedMult: 2.0,
    durability: 250,
    cost: 200,
    description: '硬度と耐熱性に優れる超硬合金。真鍮やスチールもサクサク切削。'
  },
  diamond: {
    id: 'diamond',
    name: 'ダイヤモンド (PCD)',
    speedMult: 3.2,
    durability: 600,
    cost: 500,
    description: '最高硬度の焼結ダイヤモンド。チタンや硬質鋼も圧倒的スピードで加工。'
  }
};

export const UPGRADE_ITEMS = [
  {
    id: 'motor_v2',
    name: '高トルクインバーターモーター',
    category: 'machine',
    price: 180,
    description: '主軸最高回転数+500 RPM向上。切削時の回転落ちが低減。',
    effect: { maxRpmBoost: 500, torqueBoost: 0.4 }
  },
  {
    id: 'dro_system',
    name: 'デジタルリードアウト (DRO)',
    category: 'machine',
    price: 120,
    description: '現在位置(X/Z)と目標との誤差(mm)をリアルタイムデジタル表示。',
    effect: { hasDRO: true }
  },
  {
    id: 'auto_feed',
    name: '自動送り制御装置',
    category: 'machine',
    price: 250,
    description: 'ボタン1つでZ軸方向に一定速度で自動切削する機能を追加。',
    effect: { hasAutoFeed: true }
  },
  {
    id: 'coolant_unit',
    name: '切削液クーラントノズル',
    category: 'machine',
    price: 220,
    description: '加工点に切削油を噴射し、摩擦抵抗と熱を大幅カットして表面粗さを改善。',
    effect: { hasCoolant: true, qualityBoost: 1.4 }
  },
  {
    id: 'dust_collector',
    name: '工業用ハイパワー集塵機',
    category: 'machine',
    price: 150,
    description: '切削粉・チップを瞬時に吸引し、作業視界をクリアに保つ。',
    effect: { hasDustCollector: true }
  }
];
