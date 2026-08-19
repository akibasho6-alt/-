// Lathe Physical Simulation & 2D Canvas Engine
import { soundManager } from './audio.js';
import { MATERIALS } from './materials.js';
import { TOOL_TYPES, BLADE_GRADES } from './tools.js';

export class LatheSimulation {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    // Physical dimensions & grid setup
    this.numSlices = 200; // Resolution of workpiece slices (optimized for smooth 120Hz mobile & desktop)
    this.radii = new Float32Array(this.numSlices);
    this.initialRadii = new Float32Array(this.numSlices);
    this.roughness = new Float32Array(this.numSlices);
    this.targetRadii = new Float32Array(this.numSlices);
    this.hasTarget = false;
    this.tolerance = 2.0;

    // Workpiece layout on canvas
    this.stockRadius = 40; // in mm
    this.stockLength = 100; // in mm
    this.scale = 4.0; // pixels per mm (dynamically adjusted on resize)
    
    // Machine state
    this.isRunning = true;
    this.rpm = 1200;
    this.targetRpm = 1200;
    this.maxRpm = 2000;
    this.angle = 0; // Spindle rotation angle in radians
    
    // Material & Tooling
    this.material = MATERIALS.wood;
    this.currentTool = TOOL_TYPES.roughing;
    this.bladeGrade = BLADE_GRADES.hss;
    
    // Tool position in mm (origin at left center of workpiece)
    // toolX: 0 to stockLength (Z-axis)
    // toolY: distance from centerline (X-axis, radius)
    this.toolX = 50;
    this.toolY = 45; // Start just above stock
    this.targetToolX = 50;
    this.targetToolY = 45;
    this.isDraggingTool = false;
    this.isToolHovered = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 48; // Default grab offset to toolpost handle (px below tip)
    this.autoFeedActive = false;
    this.autoFeedSpeed = 12; // mm/s
    this.autoFeedDir = 1;

    // Upgrades & Perks
    this.upgrades = {
      hasDRO: false,
      hasAutoFeed: false,
      hasCoolant: false,
      hasDustCollector: false,
      maxRpmBoost: 0,
      torqueBoost: 0,
      qualityBoost: 1.0
    };

    // Particles (chips, sparks, dust, coolant)
    this.particles = [];
    
    // Visual settings
    this.showBlueprint = true;
    this.overlayMode = 'none'; // 'none' | 'target' (完成予定品) | 'cutArea' (削る範囲)
    this.showGhostOverlay = false; // Backward compatibility
    this.showBluing = true; // 墨打ち（ケガキ青ニス・理想到達青色マーキング）
    this.showGrid = true;
    this.showDimensions = true;

    // Glint particles for polished surfaces
    this.glintSparkles = [];

    // Callbacks
    this.onDROUpdate = options.onDROUpdate || (() => {});
    this.maxDpr = options.maxDpr || 2.0;
    this.lastDROTime = 0;
    
    this.initCanvasSize();
    this.resetStock();
    this.setupEventListeners();

    // Auto-resize observer for responsive mobile & desktop container changes
    if (typeof ResizeObserver !== 'undefined' && this.canvas) {
      this.resizeObserver = new ResizeObserver(() => {
        this.checkCanvasSize();
      });
      this.resizeObserver.observe(this.canvas);
    }
  }

  initCanvasSize(maxDpr) {
    if (!this.canvas) return;
    if (typeof maxDpr === 'number') {
      this.maxDpr = maxDpr;
    }
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr || 2.0);
    this.dpr = dpr;

    let w = rect.width > 0 ? rect.width : (this.canvas.clientWidth || (this.canvas.parentElement && this.canvas.parentElement.clientWidth) || (typeof window !== 'undefined' ? window.innerWidth - 32 : 360) || 360);
    let h = rect.height > 0 ? rect.height : (this.canvas.clientHeight || 330);
    if (w < 100) w = 360;
    if (h < 100) h = 330;

    const targetW = Math.round(w);
    const targetH = Math.round(h);
    this.width = targetW;
    this.height = targetH;

    const pixelW = Math.round(targetW * dpr);
    const pixelH = Math.round(targetH * dpr);

    if (this.canvas.width !== pixelW || this.canvas.height !== pixelH) {
      this.canvas.width = pixelW;
      this.canvas.height = pixelH;
    }

    // Reset first, then apply DPR exactly once. Assigning canvas.width/height
    // clears both pixels and transform state, including during mobile resize.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const isMobile = this.width < 600;

    // Vertical centerline of lathe spindle
    this.centerY = Math.round(this.height * (isMobile ? 0.46 : 0.40));

    // Responsive clearances for chuck and tailstock on mobile and desktop
    const chuckReserve = isMobile ? Math.max(38, Math.min(60, this.width * 0.12)) : 120;
    const tailstockReserve = isMobile ? Math.max(34, Math.min(50, this.width * 0.10)) : 100;
    
    // Compute scale so that the workpiece has comfortable margins (empty space) above and below
    const targetMaxRadiusPx = Math.min(this.height * 0.22, isMobile ? 65 : 96);
    const radiusScale = targetMaxRadiusPx / Math.max(20, this.stockRadius || 40);

    // Ensure horizontal fit between chuck and tailstock
    const availableWidthPx = Math.max(120, this.width - chuckReserve - tailstockReserve);
    const lengthScale = availableWidthPx / Math.max(50, this.stockLength || 100);

    // Uniform isotropic scale (1mm X = 1mm Y)
    this.scale = Math.max(0.5, Math.min(radiusScale, lengthScale, 3.2));
    this.workWidthPx = (this.stockLength || 100) * this.scale;

    // Horizontally center workpiece with chuck on left and tailstock on right
    this.workStartX = Math.round(chuckReserve + Math.max(0, availableWidthPx - this.workWidthPx) / 2);
    this.workEndX = this.workStartX + this.workWidthPx;
  }

  checkCanvasSize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : (this.canvas.clientWidth || 0);
    const h = rect.height > 0 ? rect.height : (this.canvas.clientHeight || 0);
    if (w > 0 && h > 0) {
      const rw = Math.round(w);
      const rh = Math.round(h);
      if (Math.abs(rw - this.width) > 3 || Math.abs(rh - this.height) > 3) {
        this.initCanvasSize();
        this.render();
      }
    }
  }

  resize() {
    this.initCanvasSize();
    this.render();
  }

  setMaterial(material) {
    this.material = material || MATERIALS.wood;
    this.resetStock();
  }

  setMission(mission) {
    if (!mission) {
      this.hasTarget = false;
      return;
    }
    this.hasTarget = true;
    this.material = MATERIALS[mission.materialId] || MATERIALS.wood;
    this.stockRadius = mission.stockRadius || 40;
    this.stockLength = mission.length || 100;
    this.tolerance = mission.tolerance || 2.0;
    
    this.initCanvasSize();
    this.resetStock();

    // Populate target radii array
    for (let i = 0; i < this.numSlices; i++) {
      const t = i / (this.numSlices - 1);
      this.targetRadii[i] = mission.profile(t);
    }
  }

  resetStock() {
    for (let i = 0; i < this.numSlices; i++) {
      this.radii[i] = this.stockRadius;
      this.initialRadii[i] = this.stockRadius;
      this.roughness[i] = this.material.roughnessInit;
    }
    this.toolX = this.stockLength * 0.5;
    this.toolY = this.stockRadius + 6;
    this.targetToolX = this.toolX;
    this.targetToolY = this.toolY;
    this.particles = [];
  }

  setupEventListeners() {
    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.clientX != null ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : undefined);
      const clientY = e.clientY != null ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : undefined);
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      return { px, py };
    };

    const handlePointerDown = (e) => {
      soundManager.resume();
      const { px, py } = getPos(e);
      if (isNaN(px) || isNaN(py)) return;

      this.isDraggingTool = true;
      this.canvas.style.cursor = 'grabbing';

      const isTouch = e.pointerType === 'touch' || (e.touches && e.touches.length > 0);
      const currentTipPxX = this.workStartX + this.targetToolX * this.scale;
      const currentTipPxY = this.centerY + this.targetToolY * this.scale;
      const defaultHandleOffset = isTouch ? 56 : 48;
      const handleCenterY = currentTipPxY + defaultHandleOffset;

      const distFromHandle = Math.hypot(px - currentTipPxX, py - handleCenterY);

      if (distFromHandle < (isTouch ? 110 : 90)) {
        // Grab directly on or near the toolpost handle
        this.dragOffsetX = px - currentTipPxX;
        this.dragOffsetY = py - currentTipPxY;
      } else {
        // Holding the tool carriage handle with comfortable finger clearance
        this.dragOffsetX = 0;
        this.dragOffsetY = defaultHandleOffset;

        const tipPxX = px - this.dragOffsetX;
        const tipPxY = py - this.dragOffsetY;
        const mmX = (tipPxX - this.workStartX) / this.scale;
        const mmY = Math.abs(tipPxY - this.centerY) / this.scale;

        this.targetToolX = Math.max(0, Math.min(this.stockLength, mmX));
        this.targetToolY = Math.max(2, Math.min(this.stockRadius + 20, mmY));
      }

      if (e.pointerId && this.canvas.setPointerCapture) {
        try {
          this.canvas.setPointerCapture(e.pointerId);
        } catch (err) {
          // ignore if not supported
        }
      }
    };

    const handlePointerMove = (e) => {
      const { px, py } = getPos(e);
      if (isNaN(px) || isNaN(py)) return;

      if (!this.isDraggingTool) {
        const currentTipPxX = this.workStartX + this.toolX * this.scale;
        const currentTipPxY = this.centerY + this.toolY * this.scale;
        const handleCenterY = currentTipPxY + 48;
        const distFromHandle = Math.hypot(px - currentTipPxX, py - handleCenterY);
        this.isToolHovered = distFromHandle < 90;
        this.canvas.style.cursor = this.isToolHovered ? 'grab' : 'grab';
        return;
      }

      const tipPxX = px - (this.dragOffsetX != null ? this.dragOffsetX : 0);
      const tipPxY = py - (this.dragOffsetY != null ? this.dragOffsetY : 48);

      const mmX = (tipPxX - this.workStartX) / this.scale;
      const mmY = Math.abs(tipPxY - this.centerY) / this.scale;

      this.targetToolX = Math.max(0, Math.min(this.stockLength, mmX));
      this.targetToolY = Math.max(2, Math.min(this.stockRadius + 20, mmY));
    };

    const handlePointerUp = (e) => {
      this.isDraggingTool = false;
      this.canvas.style.cursor = 'grab';
      if (e && e.pointerId && this.canvas.releasePointerCapture) {
        try {
          this.canvas.releasePointerCapture(e.pointerId);
        } catch (err) {
          // ignore
        }
      }
    };

    // Pointer Events for unified touch & mouse
    this.canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    // Touch fallback for older mobile browsers
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        handlePointerDown(e);
      }
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (this.isDraggingTool && e.touches.length === 1) {
        handlePointerMove(e);
      }
    }, { passive: true });
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('touchcancel', handlePointerUp);

    // Keyboard support for micro-adjustments
    window.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 2.0 : 0.4;
      if (e.key === 'ArrowLeft' || e.key === 'a') {
        this.targetToolX = Math.max(0, this.targetToolX - step);
      } else if (e.key === 'ArrowRight' || e.key === 'd') {
        this.targetToolX = Math.min(this.stockLength, this.targetToolX + step);
      } else if (e.key === 'ArrowUp' || e.key === 'w') {
        this.targetToolY = Math.max(2, this.targetToolY - step); // moving deeper into workpiece
      } else if (e.key === 'ArrowDown' || e.key === 's') {
        this.targetToolY = Math.min(this.stockRadius + 20, this.targetToolY + step); // retracting
      } else if (e.key === ' ') {
        this.toggleAutoFeed();
      }
    });
  }

  jogTool(dirX, dirY, isFast = false) {
    soundManager.resume();
    const step = isFast ? 1.6 : 0.4;
    if (dirX !== 0) {
      this.targetToolX = Math.max(0, Math.min(this.stockLength, this.targetToolX + dirX * step));
    }
    if (dirY !== 0) {
      // Y is distance from center line: dirY < 0 moves closer to center (deeper cut), dirY > 0 retracts
      this.targetToolY = Math.max(2, Math.min(this.stockRadius + 20, this.targetToolY + dirY * step));
    }
  }

  togglePower() {
    this.isRunning = !this.isRunning;
    soundManager.updateMotor(this.rpm, this.isRunning);
    return this.isRunning;
  }

  setRPM(rpm) {
    this.targetRpm = Math.max(200, Math.min(this.maxRpm + this.upgrades.maxRpmBoost, rpm));
  }

  toggleAutoFeed() {
    if (!this.upgrades.hasAutoFeed) return false;
    this.autoFeedActive = !this.autoFeedActive;
    return this.autoFeedActive;
  }

  update(dt) {
    // Smooth RPM transition
    if (this.isRunning) {
      this.rpm += (this.targetRpm - this.rpm) * Math.min(1, dt * 4);
      this.angle += (this.rpm / 60) * Math.PI * 2 * dt;
    } else {
      this.rpm += (0 - this.rpm) * Math.min(1, dt * 3);
    }
    soundManager.updateMotor(this.rpm, this.isRunning && this.rpm > 50);

    // Auto feed movement
    if (this.autoFeedActive && this.isRunning) {
      this.targetToolX += this.autoFeedSpeed * this.autoFeedDir * dt;
      if (this.targetToolX >= this.stockLength) {
        this.targetToolX = this.stockLength;
        this.autoFeedDir = -1;
      } else if (this.targetToolX <= 0) {
        this.targetToolX = 0;
        this.autoFeedDir = 1;
      }
    }

    // Smooth tool position interpolation
    this.toolX += (this.targetToolX - this.toolX) * Math.min(1, dt * 25);
    this.toolY += (this.targetToolY - this.toolY) * Math.min(1, dt * 25);

    // Cutting Physics
    let isCutting = false;
    let isSanding = false;
    let maxDepth = 0;

    if (this.isRunning && this.rpm > 100) {
      const toolSliceIdx = Math.round((this.toolX / this.stockLength) * (this.numSlices - 1));
      const toolSliceHalfWidth = Math.max(1, Math.round((this.currentTool.width / 2) * (this.scale / (this.workWidthPx / this.numSlices))));
      const toolMmHalfWidth = (this.currentTool.width / 2);

      // Tool properties
      const isFinisher = this.currentTool.isFinisher;
      const isMeasuring = this.currentTool.isMeasuring;

      if (!isMeasuring) {
        const cutPower = (this.rpm / 1200) * (this.bladeGrade.speedMult / this.material.hardness) * (1 + this.upgrades.torqueBoost);
        const maxCutPerSec = 14.0 * cutPower * this.currentTool.depthRate;
        const maxCutThisFrame = maxCutPerSec * dt;

        for (let offset = -toolSliceHalfWidth; offset <= toolSliceHalfWidth; offset++) {
          const sliceIdx = toolSliceIdx + offset;
          if (sliceIdx < 0 || sliceIdx >= this.numSlices) continue;

          const sliceMmX = (sliceIdx / (this.numSlices - 1)) * this.stockLength;
          const distFromToolCenterMm = Math.abs(sliceMmX - this.toolX);

          // Calculate tool contour target height at this slice
          let shapeOffsetY = 0;
          if (this.currentTool.shape === 'pointed') {
            shapeOffsetY = distFromToolCenterMm * 0.9;
          } else if (this.currentTool.shape === 'round') {
            const r = toolMmHalfWidth;
            if (distFromToolCenterMm <= r) {
              shapeOffsetY = r - Math.sqrt(Math.max(0, r * r - distFromToolCenterMm * distFromToolCenterMm));
            } else {
              shapeOffsetY = 100;
            }
          }

          const targetYAtSlice = this.toolY + shapeOffsetY;
          const currentR = this.radii[sliceIdx];

          if (currentR > targetYAtSlice) {
            // Material collision!
            const depth = currentR - targetYAtSlice;
            if (depth > maxDepth) maxDepth = depth;

            if (isFinisher) {
              // Sandpaper polishing: smooths roughness quickly
              isSanding = true;
              this.roughness[sliceIdx] = Math.max(0.02, this.roughness[sliceIdx] - 2.8 * dt * this.upgrades.qualityBoost);
              // Slight micro-shaving
              this.radii[sliceIdx] = Math.max(targetYAtSlice, currentR - 0.2 * dt);
            } else {
              // Metal / wood cutting - 完全自由切削 (見本より深く自由に削れる)
              isCutting = true;
              let cutAmount = Math.min(depth, maxCutThisFrame);

              // 芯の最小残厚1.0mm以外は制限なく刃先位置(targetYAtSlice)まで自由に削り込み可能
              this.radii[sliceIdx] = Math.max(1.0, targetYAtSlice, currentR - cutAmount);
              this.roughness[sliceIdx] = Math.min(1.0, 0.35 + (1.0 / this.upgrades.qualityBoost) * 0.25);
            }
          }
        }
      }
    }

    // Frame-level particle spawning (suppressed & unobtrusive, prevents obscuring workpiece & guidelines)
    if (isCutting && Math.random() < 0.35 && this.particles.length < 20) {
      this.spawnChip(this.toolX, this.toolY);
    } else if (isSanding && Math.random() < 0.25 && this.particles.length < 20) {
      this.spawnPolishDust(this.toolX, this.toolY);
    }

    // Audio update
    soundManager.setCutting(isCutting, Math.min(1.0, maxDepth * 0.2), this.material.hardness);
    soundManager.setSanding(isSanding, 1.0);

    // Update Particles
    this.updateParticles(dt);

    // DRO (Digital Readout) Update - Throttled to ~20Hz max to prevent DOM layout thrashing & heating
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (this.onDROUpdate && (now - this.lastDROTime >= 50)) {
      this.lastDROTime = now;
      const toolSliceIdx = Math.max(0, Math.min(this.numSlices - 1, Math.round((this.toolX / this.stockLength) * (this.numSlices - 1))));
      const currentDiameter = (this.radii[toolSliceIdx] * 2).toFixed(2);
      const targetDiameter = this.hasTarget ? (this.targetRadii[toolSliceIdx] * 2).toFixed(2) : '--';
      const delta = this.hasTarget ? ((this.radii[toolSliceIdx] - this.targetRadii[toolSliceIdx]) * 2).toFixed(2) : '--';
      const roughnessPercent = Math.round((1.0 - this.roughness[toolSliceIdx]) * 100);

      let glossLabel = '粗削り';
      if (roughnessPercent >= 90) glossLabel = '✨ 鏡面';
      else if (roughnessPercent >= 70) glossLabel = '高光沢';
      else if (roughnessPercent >= 45) glossLabel = '中仕上げ';

      const isIdealSlice = this.hasTarget && (Math.abs(this.radii[toolSliceIdx] - this.targetRadii[toolSliceIdx]) <= this.tolerance);

      this.onDROUpdate({
        zPos: this.toolX.toFixed(2),
        xPos: (this.toolY * 2).toFixed(2),
        currentDiameter,
        targetDiameter,
        delta,
        rpm: Math.round(this.rpm),
        roughnessPercent,
        glossLabel,
        isIdealSlice
      });
    }

    // Sparkle generation on high-polish rotated sections
    if (this.isRunning && this.rpm > 100 && Math.random() < 0.22) {
      const randIdx = Math.floor(Math.random() * this.numSlices);
      const rough = this.roughness[randIdx];
      if (rough < 0.3) {
        const px = this.workStartX + (randIdx / (this.numSlices - 1)) * this.workWidthPx;
        const r = this.radii[randIdx] * this.scale;
        const py = this.centerY - r * (0.42 + Math.random() * 0.25);
        this.glintSparkles.push({
          x: px,
          y: py,
          size: Math.random() * 7 + 5,
          rot: Math.random() * Math.PI,
          life: 1.0,
          decay: Math.random() * 2.5 + 2.0,
          color: Math.random() < 0.4 ? '#ffffff' : (Math.random() < 0.7 ? '#93c5fd' : '#fef08a')
        });
      }
    }
  }

  spawnChip(mmX, mmY) {
    const px = this.workStartX + mmX * this.scale;
    const py = this.centerY + mmY * this.scale;

    const isSpark = Math.random() < this.material.sparkChance;
    if (isSpark && Math.random() < 0.3) {
      soundManager.playSpark();
    }

    // Spawn 1 subtle, compact particle that drops down cleanly without obscuring the workpiece
    this.particles.push({
      x: px + (Math.random() - 0.5) * 3,
      y: py + (Math.random() - 0.5) * 2,
      vx: (Math.random() - 0.55) * 30 - 5,
      vy: -(Math.random() * 20 + 8),
      size: isSpark ? (Math.random() * 0.8 + 1.0) : (Math.random() * 1.2 + 1.0),
      color: isSpark ? (Math.random() < 0.5 ? '#fde047' : '#fb923c') : this.material.chipColor,
      life: 0.5,
      decay: isSpark ? (Math.random() * 3.5 + 3.0) : (Math.random() * 3.0 + 2.5),
      isSpark,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 6
    });

    if (this.upgrades.hasCoolant && Math.random() < 0.2) {
      // Coolant droplet (subtle)
      this.particles.push({
        x: px + (Math.random() - 0.5) * 4,
        y: py + 2,
        vx: (Math.random() - 0.5) * 15,
        vy: Math.random() * 25 + 10,
        size: Math.random() * 1.2 + 0.8,
        color: 'rgba(140, 220, 255, 0.4)',
        life: 0.4,
        decay: 3.0,
        isSpark: false,
        rotation: 0,
        vRot: 0
      });
    }
  }

  spawnPolishDust(mmX, mmY) {
    const px = this.workStartX + mmX * this.scale;
    const py = this.centerY + mmY * this.scale;

    this.particles.push({
      x: px + (Math.random() - 0.5) * 4,
      y: py + (Math.random() - 0.5) * 2,
      vx: (Math.random() - 0.5) * 20,
      vy: -(Math.random() * 15 + 5),
      size: Math.random() * 1.0 + 0.8,
      color: Math.random() < 0.5 ? 'rgba(255, 255, 255, 0.45)' : (Math.random() < 0.8 ? 'rgba(251, 191, 36, 0.45)' : 'rgba(56, 189, 248, 0.45)'),
      life: 0.4,
      decay: Math.random() * 3.0 + 2.5,
      isSpark: false,
      rotation: Math.random() * Math.PI,
      vRot: (Math.random() - 0.5) * 4
    });
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 380 * dt; // Gravity
      p.rotation += p.vRot * dt;
    }

    if (this.particles.length > 20) {
      this.particles.splice(0, this.particles.length - 20);
    }

    // Update glint sparkles
    for (let i = this.glintSparkles.length - 1; i >= 0; i--) {
      const g = this.glintSparkles[i];
      g.life -= g.decay * dt;
      g.rot += 2.5 * dt;
      if (g.life <= 0) {
        this.glintSparkles.splice(i, 1);
      }
    }
  }

  render() {
    const ctx = this.ctx;
    if (!ctx) return;

    // Always ensure transform is set to DPR before clearing and rendering
    const dpr = this.dpr || Math.min(window.devicePixelRatio || 1, 3);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Workshop & Lathe Bed Background
    this.renderLatheBed(ctx);

    // 2. Headstock, Chuck & Tailstock
    this.renderMachineMechanics(ctx);

      // 3. Blueprint Guideline (if enabled & present)
      if (this.hasTarget && this.showBlueprint) {
        this.renderBlueprint(ctx);
      }

      // 4. Workpiece (Rotated 3D Cylindrical Lighting & Texture)
    this.renderWorkpiece(ctx);

      // 5. Overlay Guides (Mutually Exclusive: Target Product vs Cut Area)
      if (this.hasTarget) {
        if (this.overlayMode === 'target' || (this.showGhostOverlay && this.overlayMode !== 'cutArea')) {
          this.renderGhostOverlay(ctx);
        } else if (this.overlayMode === 'cutArea') {
          this.renderCutAreaOverlay(ctx);
        }
      }

      // 6. Particles & Sparks
      this.renderParticles(ctx);

      // 7. Cutting Tool Holder & Blade
    this.renderTool(ctx);

      // 8. Tool Measuring Caliper Overlay
    if (this.currentTool && this.currentTool.isMeasuring) {
      this.renderCaliperOverlay(ctx);
    }

      // 9. Dimension Annotations
    if (this.showDimensions) {
      this.renderDimensionRulers(ctx);
    }
  }

  renderLatheBed(ctx) {
    // Dark steel metallic machine chamber
    const bgGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    bgGrad.addColorStop(0, '#14171d');
    bgGrad.addColorStop(0.5, '#1e232b');
    bgGrad.addColorStop(1, '#0e1014');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Machine guide rails (Bed way)
    ctx.fillStyle = '#262b35';
    ctx.fillRect(0, this.height - 65, this.width, 36);
    
    // Shiny steel prismatic guide rails
    const railGrad = ctx.createLinearGradient(0, this.height - 65, 0, this.height - 30);
    railGrad.addColorStop(0, '#626b7c');
    railGrad.addColorStop(0.2, '#9aa5b8');
    railGrad.addColorStop(0.5, '#454c59');
    railGrad.addColorStop(1, '#2a2f38');
    ctx.fillStyle = railGrad;
    ctx.fillRect(0, this.height - 60, this.width, 14);
    ctx.fillRect(0, this.height - 42, this.width, 10);

    // Centerline laser/dash guide
    ctx.strokeStyle = 'rgba(0, 220, 255, 0.15)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, this.centerY);
    ctx.lineTo(this.width, this.centerY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  renderMachineMechanics(ctx) {
    // 1. Headstock Casing on the far left (extends from x=0 to chuckX)
    const chuckW = Math.min(90, Math.max(45, this.workStartX - 10));
    const chuckH = Math.max(140, Math.round(this.stockRadius * this.scale * 2 + 36));
    const chuckX = Math.max(0, this.workStartX - chuckW);
    const chuckY = this.centerY - chuckH / 2;

    if (chuckX > 0) {
      // Main headstock casting block
      const cabinetGrad = ctx.createLinearGradient(0, 0, chuckX, 0);
      cabinetGrad.addColorStop(0, '#12161f');
      cabinetGrad.addColorStop(0.6, '#1c222c');
      cabinetGrad.addColorStop(0.95, '#28303e');
      cabinetGrad.addColorStop(1, '#1e242f');
      ctx.fillStyle = cabinetGrad;
      ctx.fillRect(0, this.centerY - (chuckH + 40) / 2, chuckX, chuckH + 40);

      // Metallic border / bevel
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0, this.centerY - (chuckH + 40) / 2, chuckX, chuckH + 40);

      // Spindle nose collar ring
      const collarW = Math.min(20, chuckX);
      const collarGrad = ctx.createLinearGradient(chuckX - collarW, 0, chuckX, 0);
      collarGrad.addColorStop(0, '#2b3341');
      collarGrad.addColorStop(0.5, '#4b5568');
      collarGrad.addColorStop(1, '#1e242f');
      ctx.fillStyle = collarGrad;
      ctx.fillRect(chuckX - collarW, this.centerY - (chuckH - 20) / 2, collarW, chuckH - 20);
    }

    // 2. Headstock Chuck body
    const chuckGrad = ctx.createLinearGradient(chuckX, 0, chuckX + chuckW, 0);
    chuckGrad.addColorStop(0, '#1c1f26');
    chuckGrad.addColorStop(0.3, '#3a404d');
    chuckGrad.addColorStop(0.8, '#5b6477');
    chuckGrad.addColorStop(1, '#2f343f');
    ctx.fillStyle = chuckGrad;
    ctx.fillRect(chuckX, chuckY, chuckW, chuckH);

    // Chuck bevel bevels
    ctx.fillStyle = '#14161b';
    ctx.fillRect(chuckX + chuckW - 8, chuckY, 8, chuckH);

    // Chuck 3-Jaws with spinning perspective
    const jawCount = 3;
    const jawRadius = Math.max(30, this.stockRadius * this.scale * 0.72);
    for (let j = 0; j < jawCount; j++) {
      const jawAngle = this.angle + (j * Math.PI * 2) / jawCount;
      const sinA = Math.sin(jawAngle);
      const cosA = Math.cos(jawAngle);
      if (cosA > -0.2) {
        const jawY = this.centerY + sinA * jawRadius;
        const jawGrad = ctx.createLinearGradient(0, jawY - 14, 0, jawY + 14);
        jawGrad.addColorStop(0, '#a2adb8');
        jawGrad.addColorStop(0.5, '#e4ecf5');
        jawGrad.addColorStop(1, '#65707c');
        ctx.fillStyle = jawGrad;
        ctx.fillRect(this.workStartX - Math.min(28, chuckW - 10), jawY - 12, Math.min(32, chuckW), 24);

        // Jaw step teeth
        ctx.fillStyle = '#222';
        ctx.fillRect(this.workStartX - 10, jawY - 10, 4, 20);
      }
    }

    // 3. Right Tailstock Live Center & Casting
    const tailX = this.workEndX;
    const tailH = Math.max(110, Math.round(this.stockRadius * this.scale * 2 + 16));
    const tailY = this.centerY - tailH / 2;
    const tailCastingW = Math.max(30, this.width - tailX - 24);

    // Tailstock Quill & Base casting extending to right edge
    const tailGrad = ctx.createLinearGradient(tailX + 24, 0, tailX + 24 + tailCastingW, 0);
    tailGrad.addColorStop(0, '#4b5563');
    tailGrad.addColorStop(0.3, '#374151');
    tailGrad.addColorStop(0.7, '#1f2937');
    tailGrad.addColorStop(1, '#111827');
    ctx.fillStyle = tailGrad;
    ctx.fillRect(tailX + 24, tailY, tailCastingW, tailH);

    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tailX + 24, tailY, tailCastingW, tailH);

    // Tailstock Quill barrel (steel cylinder)
    const quillGrad = ctx.createLinearGradient(0, this.centerY - 22, 0, this.centerY + 22);
    quillGrad.addColorStop(0, '#64748b');
    quillGrad.addColorStop(0.4, '#e2e8f0');
    quillGrad.addColorStop(1, '#334155');
    ctx.fillStyle = quillGrad;
    ctx.fillRect(tailX + 16, this.centerY - 18, 20, 36);

    // 60-degree conical live center tip
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(tailX, this.centerY);
    ctx.lineTo(tailX + 24, this.centerY - 20);
    ctx.lineTo(tailX + 24, this.centerY + 20);
    ctx.closePath();
    ctx.fill();

    // Center rotating cone shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(tailX, this.centerY);
    ctx.lineTo(tailX + 24, this.centerY);
    ctx.lineTo(tailX + 24, this.centerY + 20);
    ctx.closePath();
    ctx.fill();
  }

  renderBlueprint(ctx) {
    const sliceWidthPx = this.workWidthPx / (this.numSlices - 1);

    // Semi-transparent blueprint ghost target shape
    ctx.save();
    ctx.beginPath();

    // Top profile
    for (let i = 0; i < this.numSlices; i++) {
      const px = this.workStartX + i * sliceWidthPx;
      const targetR = this.targetRadii[i] * this.scale;
      const py = this.centerY - targetR;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    // Right edge
    const lastR = this.targetRadii[this.numSlices - 1] * this.scale;
    ctx.lineTo(this.workEndX, this.centerY + lastR);

    // Bottom profile (reverse)
    for (let i = this.numSlices - 1; i >= 0; i--) {
      const px = this.workStartX + i * sliceWidthPx;
      const targetR = this.targetRadii[i] * this.scale;
      const py = this.centerY + targetR;
      ctx.lineTo(px, py);
    }
    ctx.closePath();

    // Blueprint fill & glowing cyber neon outline
    ctx.fillStyle = 'rgba(0, 200, 255, 0.08)';
    ctx.fill();

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();

    // Tolerance boundary (acceptable error envelope)
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 120, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.0;
    
    // Top tolerance
    ctx.beginPath();
    for (let i = 0; i < this.numSlices; i++) {
      const px = this.workStartX + i * sliceWidthPx;
      const py = this.centerY - (this.targetRadii[i] + this.tolerance) * this.scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Bottom tolerance
    ctx.beginPath();
    for (let i = 0; i < this.numSlices; i++) {
      const px = this.workStartX + i * sliceWidthPx;
      const py = this.centerY + (this.targetRadii[i] + this.tolerance) * this.scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  setOverlayMode(mode) {
    this.overlayMode = mode; // 'none' | 'target' | 'cutArea'
    this.showGhostOverlay = (mode === 'target');
    return this.overlayMode;
  }

  cycleOverlayMode() {
    if (this.overlayMode === 'none') {
      this.overlayMode = 'target';
    } else if (this.overlayMode === 'target') {
      this.overlayMode = 'cutArea';
    } else {
      this.overlayMode = 'none';
    }
    this.showGhostOverlay = (this.overlayMode === 'target');
    return this.overlayMode;
  }

  toggleGhostOverlay(forceState) {
    if (typeof forceState === 'boolean') {
      this.overlayMode = forceState ? 'target' : 'none';
    } else {
      this.overlayMode = (this.overlayMode === 'target') ? 'none' : 'target';
    }
    this.showGhostOverlay = (this.overlayMode === 'target');
    return this.showGhostOverlay;
  }

  toggleBluing(forceState) {
    if (typeof forceState === 'boolean') {
      this.showBluing = forceState;
    } else {
      this.showBluing = !this.showBluing;
    }
    return this.showBluing;
  }

  renderGhostOverlay(ctx) {
    if (!this.hasTarget) return;

    const sliceWidthPx = this.workWidthPx / (this.numSlices - 1);
    const pulse = 0.88 + 0.12 * Math.sin(Date.now() * 0.005);
    const maxTargetR = (this.stockRadius || 40) * this.scale;

    ctx.save();

    // Reusable master gradient for ghost overlay body
    const ghostGrad = ctx.createLinearGradient(0, this.centerY - maxTargetR, 0, this.centerY + maxTargetR);
    ghostGrad.addColorStop(0.0, `rgba(6, 182, 212, ${(0.22 * pulse).toFixed(3)})`);
    ghostGrad.addColorStop(0.2, `rgba(56, 189, 248, ${(0.42 * pulse).toFixed(3)})`);
    ghostGrad.addColorStop(0.4, `rgba(14, 165, 233, ${(0.25 * pulse).toFixed(3)})`);
    ghostGrad.addColorStop(0.7, `rgba(14, 165, 233, ${(0.25 * pulse).toFixed(3)})`);
    ghostGrad.addColorStop(0.85, `rgba(56, 189, 248, ${(0.42 * pulse).toFixed(3)})`);
    ghostGrad.addColorStop(1.0, `rgba(6, 182, 212, ${(0.22 * pulse).toFixed(3)})`);

    ctx.fillStyle = ghostGrad;

    // 1. Semi-transparent 3D shaded holographic cylinder (ideal target body)
    for (let i = 0; i < this.numSlices; i++) {
      const px = this.workStartX + i * sliceWidthPx;
      const targetR = this.targetRadii[i] * this.scale;
      const topY = this.centerY - targetR;
      const height = targetR * 2;
      const w = sliceWidthPx + 0.6;

      ctx.fillRect(px, topY, w, height);

      // Specular holographic sheen band
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.35 * pulse).toFixed(3)})`;
      ctx.fillRect(px, this.centerY - targetR * 0.55, w, targetR * 0.35);
      ctx.fillStyle = ghostGrad;
    }

    // 2. Right End Face (Translucent 3D Elliptical Cap)
    const lastR = this.targetRadii[this.numSlices - 1] * this.scale;
    ctx.fillStyle = `rgba(56, 189, 248, ${(0.45 * pulse).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(this.workEndX, this.centerY, 6, lastR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(0, 240, 255, ${(0.85 * pulse).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 3. Left End Face outline
    const firstR = this.targetRadii[0] * this.scale;
    ctx.beginPath();
    ctx.ellipse(this.workStartX, this.centerY, 6, firstR, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 240, 255, ${(0.75 * pulse).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 4. Glowing Blueprint Silhouette Outer Contour
    ctx.beginPath();
    for (let i = 0; i < this.numSlices; i++) {
      const px = this.workStartX + i * sliceWidthPx;
      const py = this.centerY - this.targetRadii[i] * this.scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(this.workEndX, this.centerY + lastR);
    for (let i = this.numSlices - 1; i >= 0; i--) {
      const px = this.workStartX + i * sliceWidthPx;
      const py = this.centerY + this.targetRadii[i] * this.scale;
      ctx.lineTo(px, py);
    }
    ctx.closePath();

    ctx.strokeStyle = `rgba(0, 240, 255, ${(0.9 * pulse).toFixed(3)})`;
    ctx.lineWidth = 2.0;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10 * pulse;
    ctx.stroke();

    // 5. Subtle Holographic Centerline
    ctx.setLineDash([8, 4, 2, 4]);
    ctx.strokeStyle = `rgba(6, 182, 212, ${(0.6 * pulse).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.workStartX, this.centerY);
    ctx.lineTo(this.workEndX, this.centerY);
    ctx.stroke();

    ctx.restore();

    // 6. On-canvas overlay active indicator badge
    ctx.save();
    ctx.font = 'bold 11px "JetBrains Mono", sans-serif';
    const tagText = '🎯 完成予定品（目標形状）透過表示中';
    const textWidth = ctx.measureText(tagText).width;
    const tagX = 14;
    const tagY = 14;
    const tagPad = 6;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = `rgba(6, 182, 212, ${(0.8 * pulse).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(tagX, tagY, textWidth + tagPad * 2 + 10, 24, 5);
    } else {
      ctx.rect(tagX, tagY, textWidth + tagPad * 2 + 10, 24);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.fillText(tagText, tagX + tagPad + 4, tagY + 16);
    ctx.restore();
  }

  renderCutAreaOverlay(ctx) {
    if (!this.hasTarget) return;

    const sliceWidthPx = this.workWidthPx / (this.numSlices - 1);
    const pulse = 0.85 + 0.15 * Math.sin(Date.now() * 0.006);

    ctx.save();

    let hasAnyCutArea = false;

    // 1. Highlight excess stock (currentR > targetR) with bright amber/orange cut zone
    for (let i = 0; i < this.numSlices; i++) {
      const px = this.workStartX + i * sliceWidthPx;
      const currentR = this.radii[i];
      const targetR = this.targetRadii[i];
      const excess = currentR - targetR;

      if (excess > 0.2) {
        hasAnyCutArea = true;
        const w = sliceWidthPx + 0.6;
        const targetR_px = targetR * this.scale;
        const currentR_px = currentR * this.scale;
        const excess_px = excess * this.scale;

        // Top excess cut zone
        const topCutY = this.centerY - currentR_px;
        ctx.fillStyle = `rgba(245, 158, 11, ${(0.38 * pulse).toFixed(3)})`;
        ctx.fillRect(px, topCutY, w, excess_px);

        // Bottom excess cut zone
        const bottomCutY = this.centerY + targetR_px;
        ctx.fillRect(px, bottomCutY, w, excess_px);

        // Subtle diagonal hazard zebra pattern for instant visual recognition
        if (Math.floor((px + Date.now() * 0.02) / 10) % 2 === 0) {
          ctx.fillStyle = `rgba(239, 68, 68, ${(0.22 * pulse).toFixed(3)})`;
          ctx.fillRect(px, topCutY, w, excess_px);
          ctx.fillRect(px, bottomCutY, w, excess_px);
        }
      }
    }

    // 2. Goal outline line at target depth (amber/green contour showing cut finish line)
    ctx.beginPath();
    for (let i = 0; i < this.numSlices; i++) {
      const px = this.workStartX + i * sliceWidthPx;
      const py = this.centerY - this.targetRadii[i] * this.scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    for (let i = this.numSlices - 1; i >= 0; i--) {
      const px = this.workStartX + i * sliceWidthPx;
      const py = this.centerY + this.targetRadii[i] * this.scale;
      ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(245, 158, 11, ${(0.9 * pulse).toFixed(3)})`;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    // 3. On-canvas overlay active indicator badge
    ctx.save();
    ctx.font = 'bold 11px "JetBrains Mono", sans-serif';
    const tagText = hasAnyCutArea ? '✂️ 削る範囲（余肉ゾーン）表示中' : '✨ 削り完了！余肉はありません';
    const textWidth = ctx.measureText(tagText).width;
    const tagX = 14;
    const tagY = 14;
    const tagPad = 6;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = hasAnyCutArea ? `rgba(245, 158, 11, ${(0.85 * pulse).toFixed(3)})` : `rgba(34, 197, 94, 0.8)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(tagX, tagY, textWidth + tagPad * 2 + 10, 24, 5);
    } else {
      ctx.rect(tagX, tagY, textWidth + tagPad * 2 + 10, 24);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = hasAnyCutArea ? '#fbbf24' : '#4ade80';
    ctx.fillText(tagText, tagX + tagPad + 4, tagY + 16);
    ctx.restore();
  }

  renderWorkpiece(ctx) {
    if (!this.radii || this.radii.length === 0 || this.radii[0] <= 0) {
      this.resetStock();
    }

    const sliceWidthPx = this.workWidthPx / (this.numSlices - 1);
    const mat = this.material || MATERIALS.wood;
    const undercutThreshold = Math.max(2.5, this.tolerance * 0.8);
    const maxR = Math.max(20, this.stockRadius || 40) * this.scale;

    let totalIdealCount = 0;

    // Base master cylinder gradient (created ONCE per frame)
    const baseGrad = ctx.createLinearGradient(0, this.centerY - maxR, 0, this.centerY + maxR);
    baseGrad.addColorStop(0.0, mat.colorDark || '#8b5a2b');
    baseGrad.addColorStop(0.18, mat.colorLight || '#dfbe99');
    baseGrad.addColorStop(0.32, mat.colorBase || '#c49a6c');
    baseGrad.addColorStop(0.70, mat.colorBase || '#c49a6c');
    baseGrad.addColorStop(1.0, mat.colorDark || '#8b5a2b');

    // Ideal (bluing / 墨打ち青ニス) master gradient
    const idealGrad = ctx.createLinearGradient(0, this.centerY - maxR, 0, this.centerY + maxR);
    idealGrad.addColorStop(0.0, '#0f2757');
    idealGrad.addColorStop(0.18, '#93c5fd');
    idealGrad.addColorStop(0.32, '#2563eb');
    idealGrad.addColorStop(0.70, '#2563eb');
    idealGrad.addColorStop(1.0, '#0f2757');

    // Render 3D cylindrical lighting using vertical slice segments
    for (let i = 0; i < this.numSlices; i++) {
      const px = this.workStartX + i * sliceWidthPx;
      const currentR = Math.max(1.0, this.radii[i] || this.stockRadius || 40);
      const r = currentR * this.scale;
      const rough = typeof this.roughness[i] === 'number' ? this.roughness[i] : (mat.roughnessInit || 0.6);
      const w = sliceWidthPx + 0.6; // Slight overlap to prevent subpixel gaps

      const topY = this.centerY - r;
      const height = Math.max(2.0, r * 2);

      // Status check for target design
      let isIdeal = false;
      let isOvercut = false;

      if (this.hasTarget && this.targetRadii) {
        const targetR = this.targetRadii[i] || 20;
        const diff = currentR - targetR;
        if (diff < -undercutThreshold) {
          isOvercut = true;
        } else if (Math.abs(diff) <= Math.max(2.2, this.tolerance * 0.65)) {
          isIdeal = true;
          totalIdealCount++;
        }
      }

      ctx.fillStyle = isIdeal ? idealGrad : baseGrad;
      ctx.fillRect(px, topY, w, height);

      // 🌟 圧倒的な光沢感 (Multi-layer Specular Glare & Mirror Reflections)
      const shininess = Math.pow(Math.max(0, 1.0 - rough), 1.6); // 0.0 to 1.0
      if (shininess > 0.15) {
        // 1. Primary Upper Specular Glare Band
        const specAlpha = Math.min(0.85, shininess * 0.75);
        ctx.fillStyle = isIdeal ? `rgba(224, 242, 254, ${specAlpha.toFixed(3)})` : `rgba(255, 255, 255, ${specAlpha.toFixed(3)})`;
        ctx.fillRect(px, this.centerY - r * 0.62, w, Math.max(1.0, r * 0.32));

        // 2. Ultra-Gloss Hotspot Core Line (Intense white mirror line)
        if (shininess > 0.45) {
          const coreAlpha = Math.min(0.95, (shininess - 0.3) * 1.4);
          ctx.fillStyle = `rgba(255, 255, 255, ${coreAlpha.toFixed(3)})`;
          ctx.fillRect(px, this.centerY - r * 0.54, w, Math.max(1.2, r * 0.09));
        }

        // 3. Secondary Lower Ambient Reflection (Ground reflection / metallic sheen)
        if (shininess > 0.3) {
          const lowerAlpha = (shininess * 0.28).toFixed(3);
          ctx.fillStyle = isIdeal ? `rgba(147, 197, 253, ${lowerAlpha})` : `rgba(255, 255, 255, ${lowerAlpha})`;
          ctx.fillRect(px, this.centerY + r * 0.36, w, Math.max(1.0, r * 0.22));
        }

        // 4. Anisotropic metallic luster streaks when rotating
        if (this.isRunning && this.rpm > 100 && shininess > 0.5) {
          const shimmer = Math.sin(this.angle * 3 + px * 0.08);
          if (shimmer > 0.6) {
            ctx.fillStyle = `rgba(255, 255, 255, ${((shimmer - 0.6) * 0.5 * shininess).toFixed(3)})`;
            ctx.fillRect(px, topY, w, height);
          }
        }
      }

      // 🎯 理想到達時の青色グロー輪郭ハイライト
      if (isIdeal) {
        ctx.fillStyle = 'rgba(0, 240, 255, 0.85)';
        ctx.fillRect(px, topY, w, 2);
        ctx.fillRect(px, topY + height - 2, w, 2);
      }

      // ⚠️ 削りすぎ（アンダーカット）の赤色警告表示
      if (isOvercut) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.48)';
        ctx.fillRect(px, topY, w, height);
      }
    }

    // Workpiece Right End Face (3D elliptical cap)
    const lastR = Math.max(2, (this.radii[this.numSlices - 1] || this.stockRadius || 40) * this.scale);
    const lastIsIdeal = this.hasTarget && this.targetRadii && (Math.abs(this.radii[this.numSlices - 1] - this.targetRadii[this.numSlices - 1]) <= this.tolerance);

    ctx.fillStyle = lastIsIdeal ? '#172554' : (mat.colorDark || '#8b5a2b');
    ctx.beginPath();
    ctx.ellipse(this.workEndX, this.centerY, Math.min(6, lastR * 0.3), lastR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = lastIsIdeal ? '#60a5fa' : (mat.colorLight || '#dfbe99');
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 🌟 Render Star Sparkle Glints on highly polished areas
    this.renderGlints(ctx);

    // 🖋️ 墨打ちインジケータバッジ (Canvas UI)
    if (this.showBluing && this.hasTarget) {
      this.renderBluingStatusBadge(ctx, totalIdealCount);
    }
  }

  renderGlints(ctx) {
    if (!this.glintSparkles.length) return;
    ctx.save();
    for (const g of this.glintSparkles) {
      const alpha = Math.max(0, Math.min(1, g.life));
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.rot);

      ctx.fillStyle = g.color;
      ctx.globalAlpha = alpha;

      // 4-point diamond sparkle star
      const s = g.size;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.quadraticCurveTo(0, 0, s, 0);
      ctx.quadraticCurveTo(0, 0, 0, s);
      ctx.quadraticCurveTo(0, 0, -s, 0);
      ctx.quadraticCurveTo(0, 0, 0, -s);
      ctx.closePath();
      ctx.fill();

      // Bright white center dot
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
    ctx.restore();
  }

  renderBluingStatusBadge(ctx, totalIdealCount) {
    const idealPercent = Math.round((totalIdealCount / this.numSlices) * 100);
    ctx.save();
    ctx.font = 'bold 11px "JetBrains Mono", sans-serif';
    const tagText = `🖋️ 墨打ちガイド: 理想形状 ${idealPercent}% 達成 (青色箇所)`;
    const textWidth = ctx.measureText(tagText).width;
    const tagX = 14;
    const tagY = this.showGhostOverlay ? 44 : 14;
    const tagPad = 6;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = idealPercent >= 80 ? 'rgba(34, 197, 94, 0.8)' : 'rgba(59, 130, 246, 0.8)';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(tagX, tagY, textWidth + tagPad * 2 + 10, 24, 6);
    } else {
      ctx.rect(tagX, tagY, textWidth + tagPad * 2 + 10, 24);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = idealPercent >= 80 ? '#4ade80' : '#60a5fa';
    ctx.fillText(tagText, tagX + tagPad + 4, tagY + 16);
    ctx.restore();
  }

  renderTool(ctx) {
    const tipPxX = this.workStartX + this.toolX * this.scale;
    const tipPxY = this.centerY + this.toolY * this.scale;
    const tool = this.currentTool;

    ctx.save();

    // 1. Tool Post Saddle / Lower Carriage Slide (Moves along lathe bed)
    const saddleW = 84;
    const saddleH = 140;
    const saddleX = tipPxX - saddleW / 2;
    const saddleY = tipPxY + 56;

    const saddleGrad = ctx.createLinearGradient(saddleX, 0, saddleX + saddleW, 0);
    saddleGrad.addColorStop(0, '#11141a');
    saddleGrad.addColorStop(0.2, '#1e2430');
    saddleGrad.addColorStop(0.5, '#2e3746');
    saddleGrad.addColorStop(0.8, '#1e2430');
    saddleGrad.addColorStop(1, '#0e1117');
    ctx.fillStyle = saddleGrad;
    ctx.fillRect(saddleX, saddleY, saddleW, saddleH);

    // Saddle bevel / guide rail lines
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(saddleX, saddleY, saddleW, saddleH);

    // 2. Upper Tool Post Block (Heavy cast iron square toolpost)
    const holderW = 60;
    const holderH = 46;
    const holderX = tipPxX - holderW / 2;
    const holderY = tipPxY + 20;

    const holderGrad = ctx.createLinearGradient(holderX, 0, holderX + holderW, 0);
    holderGrad.addColorStop(0, '#1a1e26');
    holderGrad.addColorStop(0.4, '#384252');
    holderGrad.addColorStop(0.8, '#262d3a');
    holderGrad.addColorStop(1, '#161920');
    ctx.fillStyle = holderGrad;
    ctx.fillRect(holderX, holderY, holderW, holderH);

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(holderX, holderY, holderW, holderH);

    // Tool clamping screws (socket head cap screws)
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(holderX + 16, holderY + 14, 5, 0, Math.PI * 2);
    ctx.arc(holderX + 44, holderY + 14, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(holderX + 16, holderY + 14, 2.5, 0, Math.PI * 2);
    ctx.arc(holderX + 44, holderY + 14, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 3. Ergonomic Grip Handle / Feed Wheel (バイト操作グリップ・掴み部)
    const gripW = 58;
    const gripH = 26;
    const gripX = tipPxX - gripW / 2;
    const gripY = tipPxY + 36;
    const isHeld = this.isDraggingTool;
    const isHover = this.isToolHovered;

    // Active Grip Aura / Glow
    if (isHeld) {
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 12;
    } else if (isHover) {
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 8;
    }

    const gripGrad = ctx.createLinearGradient(0, gripY, 0, gripY + gripH);
    if (isHeld) {
      gripGrad.addColorStop(0, '#0369a1');
      gripGrad.addColorStop(0.5, '#0284c7');
      gripGrad.addColorStop(1, '#075985');
    } else if (isHover) {
      gripGrad.addColorStop(0, '#334155');
      gripGrad.addColorStop(0.5, '#475569');
      gripGrad.addColorStop(1, '#1e293b');
    } else {
      gripGrad.addColorStop(0, '#242e3f');
      gripGrad.addColorStop(0.5, '#3b485d');
      gripGrad.addColorStop(1, '#1a2230');
    }

    ctx.fillStyle = gripGrad;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(gripX, gripY, gripW, gripH, 6);
    } else {
      ctx.rect(gripX, gripY, gripW, gripH);
    }
    ctx.fill();

    ctx.strokeStyle = isHeld ? '#00f0ff' : (isHover ? '#38bdf8' : '#64748b');
    ctx.lineWidth = isHeld ? 2 : 1.2;
    ctx.stroke();
    ctx.shadowBlur = 0; // Reset shadow

    // Grip Knurling Ribs (滑り止めローレットライン)
    ctx.strokeStyle = isHeld ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    for (let gx = gripX + 8; gx < gripX + gripW - 8; gx += 5) {
      ctx.beginPath();
      ctx.moveTo(gx, gripY + 4);
      ctx.lineTo(gx, gripY + gripH - 4);
      ctx.stroke();
    }

    // Grip Label / Icon
    ctx.font = 'bold 9px "JetBrains Mono", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isHeld ? '#ffffff' : (isHover ? '#38bdf8' : '#cbd5e1');
    const gripLabel = isHeld ? '✊ 保持中' : (isHover ? '✋ 掴んで移動' : '🖐️ GRIP');
    ctx.fillText(gripLabel, tipPxX, gripY + gripH / 2);

    // 4. Tool Shank (Steel bar holding the blade insert)
    const shankW = 26;
    const shankH = 22;
    const shankX = tipPxX - shankW / 2;
    const shankY = tipPxY + 10;

    const shankGrad = ctx.createLinearGradient(shankX, 0, shankX + shankW, 0);
    shankGrad.addColorStop(0, '#596578');
    shankGrad.addColorStop(0.5, '#94a3b8');
    shankGrad.addColorStop(1, '#475569');
    ctx.fillStyle = shankGrad;
    ctx.fillRect(shankX, shankY, shankW, shankH);

    // 5. Cutting Tip / Insert
    if (tool.isFinisher) {
      // Sandpaper pad (flexible abrasive sheet)
      const padW = tool.width * this.scale * 0.45;
      const padGrad = ctx.createLinearGradient(tipPxX - padW, 0, tipPxX + padW, 0);
      padGrad.addColorStop(0, '#8c7b64');
      padGrad.addColorStop(0.5, '#f3e5ab');
      padGrad.addColorStop(1, '#8c7b64');
      ctx.fillStyle = padGrad;
      ctx.fillRect(tipPxX - padW, tipPxY - 2, padW * 2, 16);
      ctx.strokeStyle = '#5a4933';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tipPxX - padW, tipPxY - 2, padW * 2, 16);

      // 🌟 Sandpaper Floating Gloss HUD & Buffing Aura
      const toolSliceIdx = Math.max(0, Math.min(this.numSlices - 1, Math.round((this.toolX / this.stockLength) * (this.numSlices - 1))));
      const currentRough = this.roughness[toolSliceIdx];
      const glossVal = Math.round((1.0 - currentRough) * 100);

      // Render Floating Polish Meter directly above the sandpaper
      this.renderSandpaperHUD(ctx, tipPxX, tipPxY, glossVal);

      // Contact buffing aura on the workpiece
      if (this.isRunning && this.rpm > 100 && this.toolY <= this.radii[toolSliceIdx] + 0.8) {
        ctx.save();
        const contactY = this.centerY + this.radii[toolSliceIdx] * this.scale;
        const glowGrad = ctx.createRadialGradient(tipPxX, contactY, 2, tipPxX, contactY, 26);
        glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        glowGrad.addColorStop(0.35, 'rgba(251, 191, 36, 0.65)');
        glowGrad.addColorStop(0.7, 'rgba(56, 189, 248, 0.35)');
        glowGrad.addColorStop(1, 'rgba(6, 182, 212, 0)');
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(tipPxX, contactY, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else if (tool.shape === 'pointed') {
      // Diamond / V-tip insert (Gold / Silver carbide)
      const insertColor = this.bladeGrade.id === 'diamond' ? '#38bdf8' : (this.bladeGrade.id === 'carbide' ? '#fbbf24' : '#e2e8f0');
      ctx.fillStyle = insertColor;
      ctx.beginPath();
      ctx.moveTo(tipPxX, tipPxY); // Sharp tip
      ctx.lineTo(tipPxX - 12, tipPxY + 16);
      ctx.lineTo(tipPxX + 12, tipPxY + 16);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (tool.shape === 'round') {
      // Round nose insert
      const insertColor = this.bladeGrade.id === 'diamond' ? '#38bdf8' : (this.bladeGrade.id === 'carbide' ? '#fbbf24' : '#e2e8f0');
      ctx.fillStyle = insertColor;
      ctx.beginPath();
      ctx.arc(tipPxX, tipPxY + 8, 10, Math.PI, 0, false);
      ctx.lineTo(tipPxX + 10, tipPxY + 16);
      ctx.lineTo(tipPxX - 10, tipPxY + 16);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // Flat / Parting insert
      const insertColor = this.bladeGrade.id === 'diamond' ? '#38bdf8' : (this.bladeGrade.id === 'carbide' ? '#fbbf24' : '#e2e8f0');
      const w = Math.max(8, tool.width * this.scale * 0.4);
      ctx.fillStyle = insertColor;
      ctx.fillRect(tipPxX - w / 2, tipPxY, w, 15);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tipPxX - w / 2, tipPxY, w, 15);
    }

    // Coolant spray stream if active
    if (this.upgrades.hasCoolant && this.isRunning && this.rpm > 100) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(tipPxX + 35, tipPxY - 25);
      ctx.quadraticCurveTo(tipPxX + 15, tipPxY - 15, tipPxX, tipPxY);
      ctx.stroke();
    }

    ctx.restore();
  }

  renderSandpaperHUD(ctx, x, y, glossVal) {
    ctx.save();
    let glossLabel = '粗削り';
    let glossColor = '#f97316';
    if (glossVal >= 90) {
      glossLabel = '✨ 極上鏡面仕上げ';
      glossColor = '#fbbf24';
    } else if (glossVal >= 70) {
      glossLabel = '高光沢仕上げ';
      glossColor = '#38bdf8';
    } else if (glossVal >= 45) {
      glossLabel = '中研磨仕上げ';
      glossColor = '#34d399';
    }

    const boxW = 165;
    const boxH = 50;
    const boxX = Math.max(10, Math.min(this.width - boxW - 10, x - boxW / 2));
    const boxY = Math.min(this.height - boxH - 12, y + 42);

    // Background Card
    ctx.fillStyle = 'rgba(11, 19, 36, 0.94)';
    ctx.strokeStyle = glossColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    } else {
      ctx.rect(boxX, boxY, boxW, boxH);
    }
    ctx.fill();
    ctx.stroke();

    // Title Row
    ctx.font = 'bold 10px "Noto Sans JP", sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('✨ 表面研磨光沢度', boxX + 8, boxY + 15);

    // Percentage
    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.fillStyle = glossColor;
    ctx.fillText(`${glossVal}%`, boxX + boxW - 40, boxY + 16);

    // Progress bar track
    const barX = boxX + 8;
    const barY = boxY + 22;
    const barW = boxW - 16;
    const barH = 6;

    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(barX, barY, barW, barH, 3);
    } else {
      ctx.rect(barX, barY, barW, barH);
    }
    ctx.fill();

    // Progress bar fill with dynamic shine
    const fillW = Math.max(2, (barW * glossVal) / 100);
    const fillGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    fillGrad.addColorStop(0, '#f97316');
    fillGrad.addColorStop(0.5, '#38bdf8');
    fillGrad.addColorStop(1, '#fbbf24');
    ctx.fillStyle = fillGrad;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(barX, barY, fillW, barH, 3);
    } else {
      ctx.rect(barX, barY, fillW, barH);
    }
    ctx.fill();

    // Stage Badge
    ctx.font = 'bold 10px "Noto Sans JP", sans-serif';
    ctx.fillStyle = glossColor;
    ctx.fillText(glossLabel, boxX + 8, boxY + 41);

    ctx.restore();
  }

  renderCaliperOverlay(ctx) {
    const tipPxX = this.workStartX + this.toolX * this.scale;
    const sliceIdx = Math.max(0, Math.min(this.numSlices - 1, Math.round((this.toolX / this.stockLength) * (this.numSlices - 1))));
    const currentR = this.radii[sliceIdx] * this.scale;
    const topY = this.centerY - currentR;
    const bottomY = this.centerY + currentR;

    ctx.save();
    // Caliper measurement beam & jaws
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 2]);

    // Vertical measurement line connecting top and bottom of workpiece
    ctx.beginPath();
    ctx.moveTo(tipPxX, topY - 15);
    ctx.lineTo(tipPxX, bottomY + 15);
    ctx.stroke();

    // Top and bottom measurement crosshairs
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(tipPxX - 12, topY);
    ctx.lineTo(tipPxX + 12, topY);
    ctx.moveTo(tipPxX - 12, bottomY);
    ctx.lineTo(tipPxX + 12, bottomY);
    ctx.stroke();

    // Caliper HUD Bubble with precise diameter
    const diaMm = (this.radii[sliceIdx] * 2).toFixed(2);
    const targetMm = this.hasTarget ? (this.targetRadii[sliceIdx] * 2).toFixed(2) : null;
    const label = targetMm ? `φ ${diaMm} mm (目標: φ ${targetMm} mm)` : `φ ${diaMm} mm`;

    ctx.font = 'bold 13px "JetBrains Mono", monospace, sans-serif';
    const textW = ctx.measureText(label).width;
    
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(tipPxX - textW / 2 - 8, topY - 42, textW + 16, 24);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tipPxX - textW / 2 - 8, topY - 42, textW + 16, 24);

    ctx.fillStyle = '#fef08a';
    ctx.fillText(label, tipPxX - textW / 2, topY - 26);
    ctx.restore();
  }

  renderParticles(ctx) {
    if (!this.particles.length) return;
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(0.55, p.life * 0.7));
      ctx.fillStyle = p.color;

      if (p.isSpark) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.3);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  renderDimensionRulers(ctx) {
    // Top Z-axis mm ruler
    ctx.save();
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';

    const mmStep = 10; // mark every 10mm
    for (let mm = 0; mm <= this.stockLength; mm += mmStep) {
      const px = this.workStartX + mm * this.scale;
      const isMajor = mm % 20 === 0;
      const tickH = isMajor ? 12 : 6;

      ctx.strokeStyle = isMajor ? '#94a3b8' : '#475569';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, 12);
      ctx.lineTo(px, 12 + tickH);
      ctx.stroke();

      if (isMajor) {
        ctx.fillText(`${mm}`, px, 34);
      }
    }
    ctx.fillText('Z軸 (mm)', this.workStartX + (this.stockLength * this.scale) / 2, 46);
    ctx.restore();
  }

  // Calculate mission inspection score
  evaluateMission() {
    if (!this.hasTarget) return null;

    let totalError = 0;
    let maxError = 0;
    let withinToleranceCount = 0;
    let totalRoughness = 0;
    let undercutCount = 0;

    // Generous undercut threshold: only counts if cut significantly deeper than allowed tolerance
    const undercutThreshold = Math.max(3.0, this.tolerance * 0.85);

    // Evaluate interior slices (ignoring the extreme 2 edge endpoints to avoid subpixel boundary artifacts)
    const startIdx = 2;
    const endIdx = this.numSlices - 2;
    const count = endIdx - startIdx + 1;

    for (let i = startIdx; i <= endIdx; i++) {
      const currentR = this.radii[i];
      const targetR = this.targetRadii[i];
      const rawError = Math.abs(currentR - targetR);
      // Give micro-leeway of 0.5mm
      const error = Math.max(0, rawError - 0.5);
      
      totalError += error;
      if (rawError > maxError) maxError = rawError;
      // Generous tolerance matching envelope
      if (rawError <= Math.max(this.tolerance * 1.3, 4.0)) withinToleranceCount++;
      if (currentR < targetR - undercutThreshold) undercutCount++;

      totalRoughness += this.roughness[i];
    }

    const avgError = totalError / count;
    const tolerancePassRate = withinToleranceCount / count;
    const avgPolish = 1.0 - (totalRoughness / count);
    const undercutRatio = undercutCount / count;
    const undercutPenalty = Math.min(0.15, undercutRatio * 0.25);

    // Accuracy percentage - generous, satisfying, and rewarding
    let matchScore = 100 - (avgError / Math.max(1.0, this.tolerance)) * 18 - undercutPenalty * 25;
    if (tolerancePassRate >= 0.5) {
      matchScore = Math.max(matchScore, 65 + tolerancePassRate * 30 - undercutPenalty * 15);
    }
    matchScore = Math.max(0, Math.min(100, Math.round(matchScore * 10) / 10));

    // Rank evaluation (easy, rewarding, and encouraging)
    let rank = 'C';
    let rankColor = '#ef4444';
    if (matchScore >= 80 && avgPolish >= 0.35) {
      rank = 'S';
      rankColor = '#fbbf24';
    } else if (matchScore >= 65) {
      rank = 'A';
      rankColor = '#38bdf8';
    } else if (matchScore >= 45) {
      rank = 'B';
      rankColor = '#22c55e';
    }

    return {
      matchScore,
      avgError: avgError.toFixed(2),
      maxError: maxError.toFixed(2),
      tolerancePassRate: Math.round(tolerancePassRate * 100),
      polishRate: Math.round(avgPolish * 100),
      undercutCount,
      rank,
      rankColor,
      isSuccess: matchScore >= 40 || tolerancePassRate >= 0.35
    };
  }
}
