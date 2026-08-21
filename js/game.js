// Main Game Controller for Lathe Craft Workshop
import { soundManager } from './audio.js';
import { MATERIALS } from './materials.js';
import { TOOL_TYPES, BLADE_GRADES, UPGRADE_ITEMS } from './tools.js';
import { MISSIONS, generateRandomMission } from './missions.js';
import { LatheSimulation } from './simulation.js';
import { renderTargetPreview, renderActualProductPreview } from './preview.js';

export class LatheGame {
  constructor() {
    // Player Progress State
    this.state = {
      money: 500,
      reputation: 0,
      currentMissionId: 'm1_wood_pin',
      completedMissions: {},
      purchasedUpgrades: {},
      bladeGradeId: 'hss',
      freeMode: false,
      autoAdvanceOrder: true,
      isRandomOrder: false,
      savedRandomMission: null
    };

    this.sim = null;
    this.lastTime = 0;
    this.lastRenderTime = 0;
    this.lastDRO = {};
    this.powerMode = 'balanced'; // 'eco' (30fps), 'balanced' (60fps), 'high' (120fps)
    this.currentMission = null;
    this.toastTimer = null;

    this.loadSaveData();
  }

  init() {
    const canvas = document.getElementById('latheCanvas');
    if (!canvas) return;

    // Initialize Simulation
    this.sim = new LatheSimulation(canvas, {
      onDROUpdate: (dro) => this.updateDROUI(dro)
    });

    // Apply saved upgrades to sim
    this.applyUpgradesToSim();

    // Load and apply power saving / performance mode
    try {
      this.powerMode = localStorage.getItem('lathe_power_mode') || 'balanced';
    } catch (e) {
      // Safari can deny storage for local/private contexts. Rendering must
      // still start even when the performance preference cannot be loaded.
      this.powerMode = 'balanced';
    }
    this.applyPowerMode(this.powerMode, false);

    // Bind UI elements
    this.bindUI();

    // Start with current mission
    this.loadMission(this.state.currentMissionId || MISSIONS[0].id);

    // Audio unlock on initial user touch/click for mobile browsers
    const unlockAudio = () => {
      soundManager.init();
      soundManager.resume();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('click', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('click', unlockAudio, { passive: true });

    // Handle background / inactive tab to pause CPU/GPU and audio completely
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        soundManager.setCutting(false);
        soundManager.setSanding(false);
      } else {
        this.lastTime = performance.now();
        this.lastRenderTime = performance.now();
      }
    });

    // Start main game loop
    this.lastTime = performance.now();
    this.lastRenderTime = performance.now();
    if (this.sim) {
      this.sim.render();
    }
    requestAnimationFrame((t) => this.loop(t));

    // Mobile browsers finalize viewport and CSS dimensions after the initial
    // synchronous layout. Resize and redraw once on the next frame so a late
    // canvas bitmap reset can never leave the machine area blank.
    requestAnimationFrame(() => {
      if (this.sim) {
        this.sim.resize();
      }
    });

    // Collapse HUD by default on small mobile screens to keep lathe canvas unobstructed
    if (window.innerWidth <= 600) {
      const hudBody = document.getElementById('hudBody');
      const btnToggleHud = document.getElementById('btnToggleHud');
      if (hudBody && btnToggleHud) {
        hudBody.classList.add('collapsed');
        btnToggleHud.textContent = '＋';
      }
    }

    // Handle Window Resize
    window.addEventListener('resize', () => {
      if (this.sim) this.sim.resize();
    });

    this.updateStatsUI();
  }

  loadSaveData() {
    try {
      const data = localStorage.getItem('lathe_craft_save');
      if (data) {
        const parsed = JSON.parse(data);
        this.state = { ...this.state, ...parsed };
      }
    } catch (e) {
      console.warn('Save load failed:', e);
    }
  }

  saveData() {
    try {
      localStorage.setItem('lathe_craft_save', JSON.stringify(this.state));
    } catch (e) {
      console.warn('Save failed:', e);
    }
  }

  applyUpgradesToSim() {
    if (!this.sim) return;
    this.sim.bladeGrade = BLADE_GRADES[this.state.bladeGradeId] || BLADE_GRADES.hss;

    // Reset upgrades on sim
    this.sim.upgrades = {
      hasDRO: !!this.state.purchasedUpgrades['dro_system'],
      hasAutoFeed: !!this.state.purchasedUpgrades['auto_feed'],
      hasCoolant: !!this.state.purchasedUpgrades['coolant_unit'],
      hasDustCollector: !!this.state.purchasedUpgrades['dust_collector'],
      maxRpmBoost: this.state.purchasedUpgrades['motor_v2'] ? 500 : 0,
      torqueBoost: this.state.purchasedUpgrades['motor_v2'] ? 0.3 : 0,
      qualityBoost: this.state.purchasedUpgrades['coolant_unit'] ? 1.3 : 1.0
    };

    // Update DRO visibility based on upgrade
    const droPanel = document.getElementById('droDisplayPanel');
    if (droPanel) {
      droPanel.style.opacity = this.sim.upgrades.hasDRO ? '1' : '0.4';
      const droLockedNotice = document.getElementById('droLockedNotice');
      if (droLockedNotice) {
        droLockedNotice.style.display = this.sim.upgrades.hasDRO ? 'none' : 'block';
      }
    }

    // Auto feed button state
    const autoFeedBtn = document.getElementById('btnAutoFeed');
    if (autoFeedBtn) {
      autoFeedBtn.disabled = !this.sim.upgrades.hasAutoFeed;
      autoFeedBtn.classList.toggle('disabled-btn', !this.sim.upgrades.hasAutoFeed);
    }
  }

  showToast(message) {
    const toast = document.getElementById('orderToastNotification');
    const toastMsg = document.getElementById('toastMessage');
    if (toast && toastMsg) {
      toastMsg.textContent = message;
      toast.style.display = 'flex';
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        toast.style.display = 'none';
      }, 3500);
    }
  }

  startRandomMission(showToast = true, missionOverride = null) {
    soundManager.playClick();
    const mission = missionOverride || generateRandomMission(this.state.reputation);
    this.currentMission = mission;
    this.state.currentMissionId = mission.id;
    this.state.isRandomOrder = true;
    this.state.freeMode = false;

    this.sim.setMission(mission);
    this.updateMissionInfoUI();
    this.saveData();

    if (showToast) {
      this.showToast(`✨ 新規受注: 「${mission.title}」`);
    }
  }

  loadMission(missionId) {
    if (missionId === 'random') {
      this.startRandomMission(false);
      return;
    }

    let mission = null;
    if (missionId && typeof missionId === 'string' && missionId.startsWith('random_')) {
      mission = generateRandomMission(this.state.reputation);
      mission.id = missionId;
      this.state.isRandomOrder = true;
    } else {
      mission = MISSIONS.find(m => m.id === missionId) || MISSIONS[0];
      this.state.isRandomOrder = false;
    }

    this.currentMission = mission;
    this.state.currentMissionId = mission.id;
    this.state.freeMode = false;

    this.sim.setMission(mission);
    this.updateMissionInfoUI();
    this.saveData();
  }

  startFreeMode(materialId = 'wood') {
    this.currentMission = null;
    this.state.freeMode = true;
    const mat = MATERIALS[materialId] || MATERIALS.wood;
    
    this.sim.hasTarget = false;
    this.sim.setMaterial(mat);
    this.setGhostOverlay(false);
    this.updateMissionInfoUI();
  }

  resetGameData() {
    if (confirm('ゲームデータを初期化してリセットしますか？\n（所持金、工房の評判、すべての納品実績、購入アップグレード、加工素材がすべて初期状態に戻ります）')) {
      soundManager.playClick();

      this.state = {
        money: 500,
        reputation: 0,
        currentMissionId: 'm1_wood_pin',
        completedMissions: {},
        purchasedUpgrades: {},
        bladeGradeId: 'hss',
        freeMode: false
      };

      try {
        localStorage.removeItem('lathe_craft_save');
      } catch (e) {
        console.warn('Storage clear failed:', e);
      }

      this.saveData();
      this.applyUpgradesToSim();
      this.loadMission('m1_wood_pin');
      this.updateStatsUI();

      if (this.sim) {
        this.sim.resetStock();
        this.sim.targetRpm = 1200;
        this.sim.currentRPM = 1200;
        this.setGhostOverlay(false);
      }

      const rpmSlider = document.getElementById('rpmSlider');
      if (rpmSlider) rpmSlider.value = '1200';
      const rpmValueLabel = document.getElementById('rpmValueLabel');
      if (rpmValueLabel) rpmValueLabel.textContent = '1200 RPM';

      // Reset tool selection to roughing
      if (this.sim) this.sim.currentTool = TOOL_TYPES.roughing;
      const toolButtons = document.querySelectorAll('.tool-btn');
      toolButtons.forEach(b => {
        b.classList.toggle('active', b.dataset.tool === 'roughing');
      });
      const toolSelect = document.getElementById('toolSelect');
      if (toolSelect) toolSelect.value = 'roughing';
      const toolDesc = document.getElementById('currentToolDesc');
      if (toolDesc && TOOL_TYPES.roughing) toolDesc.textContent = TOOL_TYPES.roughing.description;

      // Close all modals
      document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');

      this.renderMissionsList();
      this.renderShopList();
    }
  }

  resetDeliveries() {
    if (confirm('これまでの納品実績（各ミッションの合格ランク・達成履歴）をリセットしますか？')) {
      soundManager.playClick();
      this.state.completedMissions = {};
      this.saveData();
      this.renderMissionsList();
    }
  }

  setOverlayMode(mode) {
    if (!this.sim) return;
    const currentMode = this.sim.setOverlayMode(mode);
    this.updateOverlayUI(currentMode);
  }

  cycleOverlayMode() {
    if (!this.sim) return;
    const currentMode = this.sim.cycleOverlayMode();
    this.updateOverlayUI(currentMode);
  }

  setGhostOverlay(active) {
    if (typeof active === 'string') {
      this.setOverlayMode(active);
    } else {
      this.setOverlayMode(active ? 'target' : 'none');
    }
  }

  updateOverlayUI(mode) {
    if (!this.sim) return;
    const effectiveMode = this.sim.hasTarget ? (mode || this.sim.overlayMode) : 'none';

    // 1. Sidebar Target Preview panel class & hints
    const targetPreviewPanel = document.getElementById('targetPreviewPanel');
    if (targetPreviewPanel) {
      targetPreviewPanel.classList.toggle('ghost-active', effectiveMode === 'target');
      targetPreviewPanel.classList.toggle('cut-active', effectiveMode === 'cutArea');
    }

    const previewGhostHint = document.getElementById('previewGhostHint');
    if (previewGhostHint) {
      if (effectiveMode === 'target') {
        previewGhostHint.textContent = '🎯 完成品表示中 (クリック切替)';
      } else if (effectiveMode === 'cutArea') {
        previewGhostHint.textContent = '✂️ 削る範囲表示中 (クリック切替)';
      } else {
        previewGhostHint.textContent = '👆 クリックで表示切替';
      }
    }

    // 2. Sidebar Segmented Mode Buttons
    document.querySelectorAll('.btn-overlay-mode').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === effectiveMode);
    });

    // 3. Bottom Control Bar Mode Pills
    document.querySelectorAll('.btn-toggle-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === effectiveMode);
    });
  }

  loop(time) {
    requestAnimationFrame((t) => this.loop(t));

    // Pause heavy processing when page is in background or screen is off
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    // Determine target FPS based on power saving profile
    const targetFPS = this.powerMode === 'eco' ? 30 : (this.powerMode === 'high' ? 120 : 60);
    const minInterval = (1000 / targetFPS) - 1.5; // slight tolerance for smooth vsync cadence
    const elapsed = time - this.lastRenderTime;

    if (elapsed < minInterval) {
      return;
    }

    this.lastRenderTime = time;
    const dt = Math.min(0.08, (time - this.lastTime) / 1000);
    this.lastTime = time;

    if (this.sim) {
      this.sim.update(dt);
      this.sim.render();
    }
  }

  bindUI() {
    // 1. Tool Selection Buttons
    const toolButtons = document.querySelectorAll('.tool-btn');
    const toolSelect = document.getElementById('toolSelect');
    const selectTool = (toolId) => {
      if (!TOOL_TYPES[toolId]) return;
      this.sim.currentTool = TOOL_TYPES[toolId];
      toolButtons.forEach(b => b.classList.toggle('active', b.dataset.tool === toolId));
      if (toolSelect) toolSelect.value = toolId;
      const toolDesc = document.getElementById('currentToolDesc');
      if (toolDesc) toolDesc.textContent = TOOL_TYPES[toolId].description;
    };

    toolButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        soundManager.playClick();
        selectTool(btn.dataset.tool);
        if (btn.closest('.mobile-tool-drawer')) {
          closeMobileToolMenu();
        }
      });
    });

    if (toolSelect) {
      toolSelect.addEventListener('change', () => {
        soundManager.playClick();
        selectTool(toolSelect.value);
      });
    }

    const mobileToolDrawer = document.getElementById('mobileToolDrawer');
    const mobileToolMenuButton = document.getElementById('btnMobileToolMenu');
    const closeMobileToolMenu = () => {
      if (!mobileToolDrawer) return;
      mobileToolDrawer.classList.remove('open');
      mobileToolDrawer.setAttribute('aria-hidden', 'true');
      if (mobileToolMenuButton) mobileToolMenuButton.setAttribute('aria-expanded', 'false');
    };
    if (mobileToolMenuButton && mobileToolDrawer) {
      mobileToolMenuButton.addEventListener('click', () => {
        mobileToolDrawer.classList.add('open');
        mobileToolDrawer.setAttribute('aria-hidden', 'false');
        mobileToolMenuButton.setAttribute('aria-expanded', 'true');
      });
      document.getElementById('btnCloseMobileToolMenu')?.addEventListener('click', closeMobileToolMenu);
      mobileToolDrawer.addEventListener('click', (event) => {
        if (event.target === mobileToolDrawer) closeMobileToolMenu();
      });
    }

    // 2. Machine Controls
    const powerBtn = document.getElementById('btnPower');
    if (powerBtn) {
      powerBtn.addEventListener('click', () => {
        soundManager.playClick();
        const isRunning = this.sim.togglePower();
        powerBtn.classList.toggle('active', isRunning);
        powerBtn.textContent = isRunning ? '⚡ 主軸稼働中 [ON]' : '⭕ 主軸停止 [OFF]';
        powerBtn.style.backgroundColor = isRunning ? '#10b981' : '#ef4444';
      });
    }

    const resetBtn = document.getElementById('btnResetStock');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        soundManager.playClick();
        if (confirm('素材を初期状態にリセットしますか？')) {
          this.sim.resetStock();
        }
      });
    }

    const autoFeedBtn = document.getElementById('btnAutoFeed');
    if (autoFeedBtn) {
      autoFeedBtn.addEventListener('click', () => {
        soundManager.playClick();
        const active = this.sim.toggleAutoFeed();
        autoFeedBtn.classList.toggle('active', active);
        autoFeedBtn.textContent = active ? '⚙ 自動送り [ON]' : '⚙ 自動送り [OFF]';
      });
    }

    const rpmSlider = document.getElementById('rpmSlider');
    const rpmValueLabel = document.getElementById('rpmValueLabel');
    if (rpmSlider) {
      rpmSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.sim.setRPM(val);
        if (rpmValueLabel) rpmValueLabel.textContent = `${val} RPM`;
      });
    }

    // Toggle Blueprint guide
    const chkBlueprint = document.getElementById('chkBlueprint');
    if (chkBlueprint) {
      chkBlueprint.addEventListener('change', (e) => {
        this.sim.showBlueprint = e.target.checked;
      });
    }

    // Overlay Mode Segmented Buttons (Sidebar)
    document.querySelectorAll('.btn-overlay-mode').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        soundManager.playClick();
        const mode = btn.dataset.mode || 'none';
        this.setOverlayMode(mode);
      });
    });

    // Overlay Mode Pill Buttons (Bottom Control Bar)
    document.querySelectorAll('.btn-toggle-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        soundManager.playClick();
        const mode = btn.dataset.mode || 'none';
        this.setOverlayMode(mode);
      });
    });

    // Toggle Overlay mode by clicking on Left Target Preview canvas box
    const previewCanvasBox = document.getElementById('previewCanvasBox') || document.getElementById('targetPreviewPanel');
    if (previewCanvasBox) {
      previewCanvasBox.addEventListener('click', (e) => {
        if (e.target.closest('.overlay-mode-selector')) return;
        soundManager.playClick();
        this.cycleOverlayMode();
      });
    }

    // Toggle Dimensions
    const chkDimensions = document.getElementById('chkDimensions');
    if (chkDimensions) {
      chkDimensions.addEventListener('change', (e) => {
        this.sim.showDimensions = e.target.checked;
      });
    }

    // Toggle Bluing / Ink Marking (墨打ち)
    const chkBluing = document.getElementById('chkBluing');
    if (chkBluing) {
      chkBluing.addEventListener('change', (e) => {
        soundManager.playClick();
        this.sim.toggleBluing(e.target.checked);
      });
    }

    // Random Mission Quick Button
    const btnRandom = document.getElementById('btnRandomMission');
    if (btnRandom) {
      btnRandom.addEventListener('click', () => {
        this.startRandomMission(true);
      });
    }

    // Auto Advance on Delivery Toggle
    const chkAutoAdvance = document.getElementById('chkAutoAdvanceOrder');
    if (chkAutoAdvance) {
      chkAutoAdvance.checked = this.state.autoAdvanceOrder !== false;
      chkAutoAdvance.addEventListener('change', (e) => {
        soundManager.playClick();
        this.state.autoAdvanceOrder = e.target.checked;
        this.saveData();
      });
    }

    // Mute Audio Toggle
    const muteBtn = document.getElementById('btnMuteAudio');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        const isMuted = soundManager.toggleMute();
        muteBtn.textContent = isMuted ? '🔇 消音中' : '🔊 サウンド';
        muteBtn.classList.toggle('muted', isMuted);
      });
    }

    // Power Saving & Frame Rate Mode Toggle (発熱・バッテリー抑制)
    const btnPowerMode = document.getElementById('btnPowerMode');
    if (btnPowerMode) {
      btnPowerMode.addEventListener('click', () => {
        this.cyclePowerMode();
      });
    }

    // Reset All Game Data Button
    const btnResetGame = document.getElementById('btnResetGame');
    if (btnResetGame) {
      btnResetGame.addEventListener('click', () => {
        this.resetGameData();
      });
    }

    // Reset Missions / Deliveries Button
    const btnResetMissions = document.getElementById('btnResetMissions');
    if (btnResetMissions) {
      btnResetMissions.addEventListener('click', (e) => {
        e.stopPropagation();
        this.resetDeliveries();
      });
    }

    // 3. Modals & Navigation
    // Mission Order List Modal
    const btnMissions = document.getElementById('btnOpenMissions');
    const modalMissions = document.getElementById('modalMissions');
    if (btnMissions && modalMissions) {
      btnMissions.addEventListener('click', () => {
        soundManager.playClick();
        this.renderMissionsList();
        modalMissions.style.display = 'flex';
      });
    }

    // Shop / Upgrade Modal
    const btnShop = document.getElementById('btnOpenShop');
    const modalShop = document.getElementById('modalShop');
    if (btnShop && modalShop) {
      btnShop.addEventListener('click', () => {
        soundManager.playClick();
        this.renderShopList();
        modalShop.style.display = 'flex';
      });
    }

    // Free Mode Modal
    const btnFreeMode = document.getElementById('btnOpenFreeMode');
    const modalFreeMode = document.getElementById('modalFreeMode');
    if (btnFreeMode && modalFreeMode) {
      btnFreeMode.addEventListener('click', () => {
        soundManager.playClick();
        modalFreeMode.style.display = 'flex';
      });
    }

    // Help / How to play Modal
    const btnHelp = document.getElementById('btnOpenHelp');
    const modalHelp = document.getElementById('modalHelp');
    if (btnHelp && modalHelp) {
      btnHelp.addEventListener('click', () => {
        soundManager.playClick();
        modalHelp.style.display = 'flex';
      });
    }

    // Close buttons for modals
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        soundManager.playClick();
        document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
      });
    });

    // 4. Inspection & Delivery (納品・検査)
    const btnInspect = document.getElementById('btnInspect');
    if (btnInspect) {
      btnInspect.addEventListener('click', () => {
        soundManager.playClick();
        this.handleInspection();
      });
    }

    // Free Mode Material Selection
    document.querySelectorAll('.btn-select-free-mat').forEach(btn => {
      btn.addEventListener('click', () => {
        soundManager.playClick();
        const matId = btn.dataset.material;
        this.startFreeMode(matId);
        if (modalFreeMode) modalFreeMode.style.display = 'none';
      });
    });

    // 5. On-screen Target Product Preview HUD Toggle & Click-to-Ghost
    const btnToggleHud = document.getElementById('btnToggleHud');
    const hudBody = document.getElementById('hudBody');
    const targetProductHud = document.getElementById('targetProductHud');
    const btnMobileTarget = document.getElementById('btnMobileTarget');
    if (btnToggleHud && hudBody) {
      // Keep the workpiece unobstructed on narrow phones. The compact
      // "見本" header remains available and opens the preview on demand.
      if (window.matchMedia('(max-width: 600px)').matches) {
        hudBody.classList.add('collapsed');
        btnToggleHud.textContent = '＋';
      }
      btnToggleHud.addEventListener('click', (e) => {
        e.stopPropagation();
        soundManager.playClick();
        if (window.matchMedia('(max-width: 600px)').matches && targetProductHud && targetProductHud.classList.contains('mobile-open')) {
          targetProductHud.classList.remove('mobile-open');
          hudBody.classList.add('collapsed');
          btnToggleHud.textContent = '＋';
          return;
        }
        const isCollapsed = hudBody.classList.toggle('collapsed');
        btnToggleHud.textContent = isCollapsed ? '＋' : '−';
      });

      hudBody.style.cursor = 'pointer';
      hudBody.title = 'クリックでオーバーレイ表示（完成予定品 ⇄ 削る範囲 ⇄ OFF）を切替';
      hudBody.addEventListener('click', () => {
        soundManager.playClick();
        this.cycleOverlayMode();
      });

      if (btnMobileTarget && targetProductHud) {
        btnMobileTarget.addEventListener('click', () => {
          soundManager.playClick();
          hudBody.classList.remove('collapsed');
          targetProductHud.classList.add('mobile-open');
          btnToggleHud.textContent = '×';
        });
      }
    }

    // 6. Mobile Precision Jog Controller (オンスクリーン微調整ジョグパッド)
    let jogFast = false;
    const btnJogNormal = document.getElementById('btnJogSpeedNormal');
    const btnJogFast = document.getElementById('btnJogSpeedFast');
    if (btnJogNormal && btnJogFast) {
      btnJogNormal.addEventListener('click', () => {
        soundManager.playClick();
        jogFast = false;
        btnJogNormal.classList.add('active');
        btnJogFast.classList.remove('active');
      });
      btnJogFast.addEventListener('click', () => {
        soundManager.playClick();
        jogFast = true;
        btnJogFast.classList.add('active');
        btnJogNormal.classList.remove('active');
      });
    }

    const jogDirections = {
      btnJogLeft: { dx: -1, dy: 0 },
      btnJogRight: { dx: 1, dy: 0 },
      btnJogUp: { dx: 0, dy: -1 }, // towards center (deeper cut)
      btnJogDown: { dx: 0, dy: 1 }  // away from center (retract)
    };

    let activeJogTimer = null;
    const startJog = (dx, dy) => {
      if (this.sim) this.sim.jogTool(dx, dy, jogFast);
      if (activeJogTimer) clearInterval(activeJogTimer);
      activeJogTimer = setInterval(() => {
        if (this.sim) this.sim.jogTool(dx, dy, jogFast);
      }, 55);
    };
    const stopJog = () => {
      if (activeJogTimer) {
        clearInterval(activeJogTimer);
        activeJogTimer = null;
      }
    };

    Object.entries(jogDirections).forEach(([id, dir]) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          btn.classList.add('pressed');
          startJog(dir.dx, dir.dy);
        });
        const handleRelease = () => {
          btn.classList.remove('pressed');
          stopJog();
        };
        btn.addEventListener('pointerup', handleRelease);
        btn.addEventListener('pointerleave', handleRelease);
        btn.addEventListener('pointercancel', handleRelease);
        btn.addEventListener('contextmenu', (e) => e.preventDefault());
      }
    });
  }

  handleInspection() {
    if (this.state.freeMode || !this.currentMission) {
      alert('フリーモードでは自由加工を楽しめます。寸法採点を行うには「依頼オーダー」を受注してください。');
      return;
    }

    const evalResult = this.sim.evaluateMission();
    if (!evalResult) return;

    const modal = document.getElementById('modalInspection');
    if (!modal) return;

    // Render target vs actual workpiece comparison in modal
    const inspectTargetCanvas = document.getElementById('inspectTargetCanvas');
    const inspectActualCanvas = document.getElementById('inspectActualCanvas');
    if (inspectTargetCanvas && this.currentMission) {
      renderTargetPreview(inspectTargetCanvas, this.currentMission, { showDimensions: true, isMini: false });
    }
    if (inspectActualCanvas && this.sim) {
      renderActualProductPreview(inspectActualCanvas, this.sim);
    }

    // Fill inspection results in modal
    document.getElementById('inspectRank').textContent = evalResult.rank;
    document.getElementById('inspectRank').style.color = evalResult.rankColor;
    document.getElementById('inspectScore').textContent = `${evalResult.matchScore}%`;
    document.getElementById('inspectAvgError').textContent = `±${evalResult.avgError} mm`;
    document.getElementById('inspectPolish').textContent = `${evalResult.polishRate}%`;

    const statusEl = document.getElementById('inspectStatus');
    const rewardEl = document.getElementById('inspectReward');
    const collectBtn = document.getElementById('btnCollectReward');

    if (evalResult.isSuccess) {
      soundManager.playSuccess();
      statusEl.textContent = '🎉 検品合格！素晴らしい仕上がりです！';
      statusEl.style.color = '#10b981';

      // Rank bonus multiplier
      let bonusMult = 1.0;
      if (evalResult.rank === 'S') bonusMult = 1.5;
      else if (evalResult.rank === 'A') bonusMult = 1.2;
      else if (evalResult.rank === 'B') bonusMult = 1.0;
      else bonusMult = 0.8;

      const earnedReward = Math.round(this.currentMission.reward * bonusMult);
      const earnedRep = Math.round(50 * bonusMult);

      rewardEl.textContent = `+¥${earnedReward.toLocaleString()} (評判 +${earnedRep})`;
      collectBtn.style.display = 'inline-block';
      collectBtn.onclick = () => {
        soundManager.playCoin();
        this.state.money += earnedReward;
        this.state.reputation += earnedRep;
        this.state.completedMissions[this.currentMission.id] = {
          rank: evalResult.rank,
          score: evalResult.matchScore
        };
        this.saveData();
        this.updateStatsUI();
        modal.style.display = 'none';

        // 🎯 納品をしたら都度変更（ランダム製品・自動更新）
        if (this.state.autoAdvanceOrder !== false || this.currentMission.isRandom || this.state.isRandomOrder) {
          setTimeout(() => {
            this.startRandomMission(true);
          }, 350);
        }
      };
    } else {
      statusEl.textContent = '❌ 寸法誤差・公差オーバーのため再加工が必要です。';
      statusEl.style.color = '#ef4444';
      rewardEl.textContent = '¥0 (不合格)';
      collectBtn.style.display = 'none';
    }

    modal.style.display = 'flex';
  }

  setPowerMode(mode, showToast = true) {
    this.powerMode = mode;
    try {
      localStorage.setItem('lathe_power_mode', mode);
    } catch (e) {}
    this.applyPowerMode(mode, showToast);
  }

  cyclePowerMode() {
    soundManager.playClick();
    if (this.powerMode === 'balanced') {
      this.setPowerMode('eco', true);
    } else if (this.powerMode === 'eco') {
      this.setPowerMode('high', true);
    } else {
      this.setPowerMode('balanced', true);
    }
  }

  applyPowerMode(mode, showToast = false) {
    const btn = document.getElementById('btnPowerMode');
    let maxDpr = 2.0;
    let label = '⚡ 標準 60FPS';
    let toastMsg = '⚡ 標準モード (60FPS / 発熱抑制) に設定しました';

    if (btn) {
      btn.classList.remove('eco-active', 'balanced-active', 'high-active');
    }

    if (mode === 'eco') {
      maxDpr = 1.5;
      label = '🌿 省エネ 30FPS';
      toastMsg = '🌿 省エネ・発熱抑制モード (30FPS / 画質軽量化) に設定しました';
      if (btn) btn.classList.add('eco-active');
    } else if (mode === 'high') {
      maxDpr = 3.0;
      label = '🚀 高FPS 120';
      toastMsg = '🚀 高フレームレートモード (120FPS / 最高画質) に設定しました';
      if (btn) btn.classList.add('high-active');
    } else {
      // balanced default
      maxDpr = 2.0;
      label = '⚡ 標準 60FPS';
      toastMsg = '⚡ 標準モード (60FPS / 発熱抑制) に設定しました';
      if (btn) btn.classList.add('balanced-active');
    }

    if (btn) {
      btn.textContent = label;
      btn.title = `現在の設定: ${label} (クリックで切替: 🌿省エネ30FPS ⇄ ⚡標準60FPS ⇄ 🚀高FPS120)`;
    }

    if (this.sim) {
      this.sim.initCanvasSize(maxDpr);
    }

    if (showToast) {
      this.showToast(toastMsg);
    }
  }

  updateDROUI(dro) {
    if (!this.sim.upgrades.hasDRO) return;
    const last = this.lastDRO;

    if (last.zPos !== dro.zPos) {
      const elZ = document.getElementById('droZ');
      if (elZ) elZ.textContent = dro.zPos;
    }
    if (last.xPos !== dro.xPos) {
      const elX = document.getElementById('droX');
      if (elX) elX.textContent = dro.xPos;
    }
    if (last.currentDiameter !== dro.currentDiameter) {
      const elDia = document.getElementById('droDia');
      if (elDia) elDia.textContent = dro.currentDiameter;
    }
    if (last.targetDiameter !== dro.targetDiameter) {
      const elTarget = document.getElementById('droTarget');
      if (elTarget) elTarget.textContent = dro.targetDiameter;
    }
    if (last.delta !== dro.delta || last.isIdealSlice !== dro.isIdealSlice) {
      const elDelta = document.getElementById('droDelta');
      if (elDelta) {
        elDelta.textContent = dro.delta;
        const numDelta = parseFloat(dro.delta);
        if (!isNaN(numDelta)) {
          const tolDia = Math.max(2.5, this.sim.tolerance * 1.5);
          if (numDelta < -tolDia) {
            elDelta.style.color = '#ef4444'; // overcut
          } else if (dro.isIdealSlice || Math.abs(numDelta) <= tolDia) {
            elDelta.style.color = '#38bdf8'; // in tolerance / ideal bluing reached
          } else {
            elDelta.style.color = '#f59e0b';
          }
        }
      }
    }

    if (last.roughnessPercent !== dro.roughnessPercent) {
      const elRough = document.getElementById('droRough');
      if (elRough) elRough.textContent = `${dro.roughnessPercent}%`;

      const elGlossBar = document.getElementById('droGlossBar');
      if (elGlossBar) {
        elGlossBar.style.width = `${Math.min(100, Math.max(0, dro.roughnessPercent))}%`;
      }
    }

    if (last.glossLabel !== dro.glossLabel || last.roughnessPercent !== dro.roughnessPercent) {
      const elGlossBadge = document.getElementById('droGlossBadge');
      if (elGlossBadge && dro.glossLabel) {
        elGlossBadge.textContent = dro.glossLabel;
        if (dro.roughnessPercent >= 90) {
          elGlossBadge.style.color = '#fbbf24';
          elGlossBadge.style.background = 'rgba(251, 191, 36, 0.2)';
        } else if (dro.roughnessPercent >= 70) {
          elGlossBadge.style.color = '#38bdf8';
          elGlossBadge.style.background = 'rgba(56, 189, 248, 0.2)';
        } else {
          elGlossBadge.style.color = '#94a3b8';
          elGlossBadge.style.background = 'rgba(148, 163, 184, 0.15)';
        }
      }
    }

    this.lastDRO = dro;
  }

  updateStatsUI() {
    const elMoney = document.getElementById('playerMoney');
    const elRep = document.getElementById('playerReputation');
    if (elMoney) elMoney.textContent = `¥${this.state.money.toLocaleString()}`;
    if (elRep) elRep.textContent = `${this.state.reputation} Pt`;
  }

  updateMissionInfoUI() {
    const titleEl = document.getElementById('missionTitle');
    const productTypeEl = document.getElementById('missionProductType');
    const clientEl = document.getElementById('missionClient');
    const descEl = document.getElementById('missionDesc');
    const matEl = document.getElementById('missionMaterial');
    const tolEl = document.getElementById('missionTolerance');
    const rewardEl = document.getElementById('missionReward');
    const specBadgeEl = document.getElementById('previewSpecBadge');
    const targetTagEl = document.getElementById('previewTargetTag');
    const targetCanvas = document.getElementById('missionTargetCanvas');
    const hudCanvas = document.getElementById('hudTargetCanvas');
    const hudTargetName = document.getElementById('hudTargetName');
    const hudTargetSpec = document.getElementById('hudTargetSpec');

    // Material Highlight Card Elements
    const matHardnessEl = document.getElementById('missionMatHardness');
    const matChipEl = document.getElementById('missionMatColorChip');
    const matIconEl = document.getElementById('missionMatIcon');
    const matCategoryEl = document.getElementById('missionMatCategory');
    const matFeaturesEl = document.getElementById('missionMatFeatures');

    // On-screen Lathe Material HUD
    const hudMatSwatch = document.getElementById('hudMatSwatch');
    const hudMatName = document.getElementById('hudMatName');
    const hudMatHardness = document.getElementById('hudMatHardness');
    const mobileMatIcon = document.getElementById('mobileMatIcon');
    const mobileMatName = document.getElementById('mobileMatName');
    const mobileMatHardness = document.getElementById('mobileMatHardness');

    let activeMat = this.sim ? this.sim.material : MATERIALS.wood;

    if (this.state.freeMode) {
      if (productTypeEl) productTypeEl.textContent = '自由工作';
      if (titleEl) titleEl.textContent = 'フリー削り出し加工モード';
      if (clientEl) clientEl.textContent = '自由工作ワークショップ';
      if (descEl) descEl.textContent = '図面の制約なく、好きなツールで自由に素材を削ることができます。';
      if (matEl) matEl.textContent = activeMat.name;
      if (tolEl) tolEl.textContent = 'なし（自由工作）';
      if (rewardEl) rewardEl.textContent = 'なし';
      if (specBadgeEl) specBadgeEl.textContent = '自由工作';
      if (targetTagEl) targetTagEl.textContent = 'フリーモード';
      if (targetCanvas) renderTargetPreview(targetCanvas, null);
      if (hudCanvas) renderTargetPreview(hudCanvas, null, { isMini: true });
      if (hudTargetName) hudTargetName.textContent = '自由工作モード';
      if (hudTargetSpec) hudTargetSpec.textContent = activeMat.name;
    } else if (this.currentMission) {
      const m = this.currentMission;
      activeMat = MATERIALS[m.materialId] || MATERIALS.wood;
      if (titleEl) titleEl.textContent = m.title;
      if (productTypeEl) productTypeEl.textContent = m.productType || m.category || '標準発注';
      if (clientEl) clientEl.textContent = m.client;
      if (descEl) descEl.textContent = m.description;
      if (matEl) matEl.textContent = activeMat.name;
      if (tolEl) tolEl.textContent = `±${m.tolerance} mm`;
      if (rewardEl) rewardEl.textContent = `¥${m.reward.toLocaleString()}`;
      if (specBadgeEl) specBadgeEl.textContent = `L:${m.length}mm / φ${m.stockRadius * 2}mm素材`;
      if (targetTagEl) targetTagEl.textContent = `${m.title} (完成目標)`;
      if (targetCanvas) renderTargetPreview(targetCanvas, m, { showDimensions: true, isMini: false });
      if (hudCanvas) renderTargetPreview(hudCanvas, m, { showDimensions: false, isMini: true });
      if (hudTargetName) hudTargetName.textContent = m.title;
      if (hudTargetSpec) hudTargetSpec.textContent = `公差 ±${m.tolerance}mm`;
    }

    // High-visibility Material Card UI sync
    if (activeMat) {
      if (matHardnessEl) matHardnessEl.textContent = `硬度: ${activeMat.hardnessStars || '★★☆☆☆'} (${activeMat.hardnessLabel || ''})`;
      if (matChipEl) {
        matChipEl.style.background = `linear-gradient(135deg, ${activeMat.colorLight || activeMat.colorBase}, ${activeMat.colorDark || activeMat.colorBase})`;
      }
      if (matIconEl) matIconEl.textContent = activeMat.icon || '🪵';
      if (matCategoryEl) matCategoryEl.textContent = activeMat.category || '金属素材';
      if (matFeaturesEl && activeMat.features) {
        matFeaturesEl.innerHTML = activeMat.features.map(f => `<span class="mat-feat-pill">${f}</span>`).join('');
      }

      // Lathe Viewport HUD sync
      if (hudMatSwatch) {
        hudMatSwatch.style.background = `linear-gradient(135deg, ${activeMat.colorLight || activeMat.colorBase}, ${activeMat.colorDark || activeMat.colorBase})`;
        hudMatSwatch.textContent = activeMat.icon || '🪵';
      }
      if (hudMatName) hudMatName.textContent = activeMat.name;
      if (hudMatHardness) hudMatHardness.textContent = `硬度: ${activeMat.hardnessStars || '★★☆☆☆'} (${activeMat.hardnessLabel || ''})`;
      if (mobileMatIcon) mobileMatIcon.textContent = activeMat.icon || '🪵';
      if (mobileMatName) mobileMatName.textContent = activeMat.name;
      if (mobileMatHardness) mobileMatHardness.textContent = activeMat.hardnessStars || '★★☆☆☆';
    }

    if (this.sim) {
      this.updateOverlayUI(this.sim.overlayMode);
    }
  }

  renderMissionsList() {
    const container = document.getElementById('missionsListContainer');
    if (!container) return;
    container.innerHTML = '';

    // 1. Top Card: Random Product Generator (ランダム特注製品・無限生成)
    const randomCard = document.createElement('div');
    randomCard.className = `mission-card random-card ${this.state.isRandomOrder ? 'selected' : ''}`;
    randomCard.innerHTML = `
      <div class="mission-card-preview" style="display:flex;align-items:center;justify-content:center;font-size:28px;background:linear-gradient(135deg,#042f2e,#0c4a6e);">
        🎲
      </div>
      <div class="mission-card-content">
        <div class="mission-header">
          <span class="mission-category random">✨ ランダム特注</span>
          <h4 class="mission-name">ランダム製品（おまかせオーダー）</h4>
        </div>
        <p class="mission-client">依頼主: 全国の工房・メーカーからの特注品</p>
        <p class="mission-desc-short">納品するたびに毎回新しい形状・素材の製品が自動生成されます！無限に腕を磨けます。</p>
        <div class="mission-footer">
          <span class="mission-mat-tag">🎲 素材: 評判に応じた素材</span>
          <span>公差: ±5.5mm</span>
          <span class="mission-reward">報酬: ¥500〜</span>
        </div>
      </div>
    `;
    randomCard.addEventListener('click', () => {
      soundManager.playClick();
      this.startRandomMission(true);
      document.getElementById('modalMissions').style.display = 'none';
    });
    container.appendChild(randomCard);

    // 2. Fifty fresh made-to-order products. This list is regenerated every
    // time the order window is rendered, so shape, material and client vary.
    const randomOrders = Array.from(
      { length: 50 },
      () => generateRandomMission(this.state.reputation)
    );

    randomOrders.forEach((m, index) => {
      const mat = MATERIALS[m.materialId] || MATERIALS.wood;
      const card = document.createElement('div');
      card.className = 'mission-card random-order-card';
      card.innerHTML = `
        <div class="mission-card-preview">
          <canvas class="card-preview-canvas" width="130" height="64"></canvas>
        </div>
        <div class="mission-card-content">
          <div class="mission-header">
            <span class="mission-category random">発注 ${index + 1}/50 ・ ${m.productType}</span>
            <h4 class="mission-name">${m.title}</h4>
          </div>
          <p class="mission-client">依頼主: ${m.client}</p>
          <p class="mission-desc-short">${m.description}</p>
          <div class="mission-footer">
            <span class="mission-mat-tag" style="border-left: 3px solid ${mat.colorBase};">
              ${mat.icon} ${mat.name} <small style="color:#94a3b8;">(${mat.hardnessStars})</small>
            </span>
            <span>公差: ±${m.tolerance}mm</span>
            <span class="mission-reward">報酬: ¥${m.reward.toLocaleString()}</span>
          </div>
        </div>
      `;

      const previewCanvas = card.querySelector('.card-preview-canvas');
      if (previewCanvas) {
        renderTargetPreview(previewCanvas, m, { showDimensions: false, isMini: true });
      }

      card.addEventListener('click', () => {
        this.startRandomMission(true, m);
        document.getElementById('modalMissions').style.display = 'none';
      });
      container.appendChild(card);
    });

    // 3. Standard Defined Missions
    MISSIONS.forEach(m => {
      const isLocked = this.state.reputation < m.requiredRep;
      const completed = this.state.completedMissions[m.id];
      const isCurrent = this.currentMission && this.currentMission.id === m.id;
      const mat = MATERIALS[m.materialId] || MATERIALS.wood;

      const card = document.createElement('div');
      card.className = `mission-card ${isLocked ? 'locked' : ''} ${isCurrent ? 'selected' : ''}`;
      
      let badgeHtml = '';
      if (completed) {
        badgeHtml = `<span class="rank-badge rank-${completed.rank}">達成: Rank ${completed.rank} (${completed.score}%)</span>`;
      }

      card.innerHTML = `
        <div class="mission-card-preview">
          <canvas class="card-preview-canvas" width="130" height="64"></canvas>
        </div>
        <div class="mission-card-content">
          <div class="mission-header">
            <span class="mission-category">${m.category}</span>
            <h4 class="mission-name">${m.title}</h4>
            ${badgeHtml}
          </div>
          <p class="mission-client">依頼主: ${m.client}</p>
          <p class="mission-desc-short">${m.description}</p>
          <div class="mission-footer">
            <span class="mission-mat-tag" style="border-left: 3px solid ${mat.colorBase};">
              ${mat.icon} ${mat.name} <small style="color:#94a3b8;">(${mat.hardnessStars})</small>
            </span>
            <span>公差: ±${m.tolerance}mm</span>
            <span class="mission-reward">報酬: ¥${m.reward.toLocaleString()}</span>
          </div>
        </div>
        ${isLocked ? `<div class="lock-overlay">🔒 必要評判: ${m.requiredRep} Pt</div>` : ''}
      `;

      // Render mini finished product preview canvas
      const previewCanvas = card.querySelector('.card-preview-canvas');
      if (previewCanvas) {
        renderTargetPreview(previewCanvas, m, { showDimensions: false, isMini: true });
      }

      if (!isLocked) {
        card.addEventListener('click', () => {
          soundManager.playClick();
          this.loadMission(m.id);
          document.getElementById('modalMissions').style.display = 'none';
        });
      }

      container.appendChild(card);
    });
  }

  renderShopList() {
    const container = document.getElementById('shopListContainer');
    if (!container) return;
    container.innerHTML = '';

    // 1. Blade Grades Section
    const bladeSection = document.createElement('div');
    bladeSection.className = 'shop-section';
    bladeSection.innerHTML = '<h3>🗡️ 切削バイト刃先グレード</h3>';

    Object.values(BLADE_GRADES).forEach(grade => {
      const isOwned = this.state.money >= 0; // Blade grades can be upgraded
      const isCurrent = this.state.bladeGradeId === grade.id;
      const canAfford = this.state.money >= grade.cost;

      const itemEl = document.createElement('div');
      itemEl.className = `shop-item ${isCurrent ? 'equipped' : ''}`;
      itemEl.innerHTML = `
        <div class="shop-item-info">
          <div class="shop-item-title">${grade.name} ${isCurrent ? '<span class="equipped-tag">[装備中]</span>' : ''}</div>
          <div class="shop-item-desc">${grade.description} (切削速度 x${grade.speedMult})</div>
        </div>
        <div class="shop-item-action">
          ${isCurrent ? '<button class="btn-shop-buy" disabled>装備中</button>' :
            `<button class="btn-shop-buy ${!canAfford ? 'disabled' : ''}" data-blade="${grade.id}">
              ${grade.cost === 0 ? '無料' : `¥${grade.cost.toLocaleString()}`}
            </button>`
          }
        </div>
      `;

      if (!isCurrent) {
        const buyBtn = itemEl.querySelector('.btn-shop-buy');
        if (buyBtn && canAfford) {
          buyBtn.addEventListener('click', () => {
            soundManager.playCoin();
            this.state.money -= grade.cost;
            this.state.bladeGradeId = grade.id;
            this.applyUpgradesToSim();
            this.saveData();
            this.updateStatsUI();
            this.renderShopList();
          });
        }
      }

      bladeSection.appendChild(itemEl);
    });
    container.appendChild(bladeSection);

    // 2. Lathe Machine Upgrades Section
    const machineSection = document.createElement('div');
    machineSection.className = 'shop-section';
    machineSection.innerHTML = '<h3>⚙️ 旋盤本体・設備アップグレード</h3>';

    UPGRADE_ITEMS.forEach(upg => {
      const isPurchased = !!this.state.purchasedUpgrades[upg.id];
      const canAfford = this.state.money >= upg.price;

      const itemEl = document.createElement('div');
      itemEl.className = `shop-item ${isPurchased ? 'purchased' : ''}`;
      itemEl.innerHTML = `
        <div class="shop-item-info">
          <div class="shop-item-title">${upg.name} ${isPurchased ? '<span class="purchased-tag">[導入済み]</span>' : ''}</div>
          <div class="shop-item-desc">${upg.description}</div>
        </div>
        <div class="shop-item-action">
          ${isPurchased ? '<button class="btn-shop-buy" disabled>導入済み</button>' :
            `<button class="btn-shop-buy ${!canAfford ? 'disabled' : ''}" data-upg="${upg.id}">
              ¥${upg.price.toLocaleString()}
            </button>`
          }
        </div>
      `;

      if (!isPurchased) {
        const buyBtn = itemEl.querySelector('.btn-shop-buy');
        if (buyBtn && canAfford) {
          buyBtn.addEventListener('click', () => {
            soundManager.playCoin();
            this.state.money -= upg.price;
            this.state.purchasedUpgrades[upg.id] = true;
            this.applyUpgradesToSim();
            this.saveData();
            this.updateStatsUI();
            this.renderShopList();
          });
        }
      }

      machineSection.appendChild(itemEl);
    });
    container.appendChild(machineSection);
  }
}
