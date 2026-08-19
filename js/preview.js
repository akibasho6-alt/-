// Target Finished Product Preview & Workpiece Inspection Renderer
import { MATERIALS } from './materials.js';

/**
 * Renders a finished target product preview on a given canvas.
 * @param {HTMLCanvasElement} canvas 
 * @param {Object} mission Target mission definition
 * @param {Object} options Configuration options
 */
export function renderTargetPreview(canvas, mission, options = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const isMini = width < 220;

  // Clear background
  ctx.clearRect(0, 0, width, height);

  // Background style: Technical dark CAD / Blueprint canvas
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#09101d');
  bgGrad.addColorStop(1, '#0e1726');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Blueprint grid
  if (options.showGrid !== false) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    const gridSize = isMini ? 12 : 16;
    ctx.beginPath();
    for (let x = gridSize; x < width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = gridSize; y < height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }

  if (!mission || !mission.profile) {
    // Free mode or no target
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px "JetBrains Mono", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('自由工作モード（指定図面なし）', width / 2, height / 2);
    return;
  }

  const mat = MATERIALS[mission.materialId] || MATERIALS.wood;
  const numSlices = 120;
  const paddingX = isMini ? 16 : 32;
  const paddingY = isMini ? 12 : 18;
  const drawW = width - paddingX * 2;
  const centerY = height * 0.46;

  // Calculate max target radius across profile to determine vertical scale
  let maxTargetR = 0;
  let minTargetR = 999;
  const targetRadii = new Float32Array(numSlices);
  for (let i = 0; i < numSlices; i++) {
    const t = i / (numSlices - 1);
    const r = mission.profile(t);
    targetRadii[i] = r;
    if (r > maxTargetR) maxTargetR = r;
    if (r < minTargetR) minTargetR = r;
  }
  if (maxTargetR <= 0) maxTargetR = mission.stockRadius || 40;

  // Scale to fit canvas height with room for dimension text
  const maxAvailableH = (height - paddingY * 2) * 0.72;
  const scale = (maxAvailableH / 2) / maxTargetR;

  // Centerline (dash-dot style: ― · ― · ―)
  ctx.save();
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 3, 2, 3]);
  ctx.beginPath();
  ctx.moveTo(paddingX - 10, centerY);
  ctx.lineTo(width - paddingX + 10, centerY);
  ctx.stroke();
  ctx.restore();

  // Draw 3D Cylindrical Finished Product
  const sliceW = drawW / (numSlices - 1);

  // 1. Shaded Body Slices
  for (let i = 0; i < numSlices; i++) {
    const px = paddingX + i * sliceW;
    const r = targetRadii[i] * scale;
    const topY = centerY - r;
    const h = r * 2;
    const w = sliceW + 0.6;

    const grad = ctx.createLinearGradient(0, topY, 0, topY + h);
    grad.addColorStop(0.0, mat.colorDark);
    grad.addColorStop(0.18, mat.colorLight);
    grad.addColorStop(0.35, mat.colorBase);
    grad.addColorStop(0.70, mat.colorBase);
    grad.addColorStop(1.0, mat.colorDark);

    ctx.fillStyle = grad;
    ctx.fillRect(px, topY, w, h);

    // Specular finished shine highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(px, centerY - r * 0.55, w, r * 0.35);
  }

  // 2. Left and Right End Faces (Elliptical caps)
  const firstR = targetRadii[0] * scale;
  const lastR = targetRadii[numSlices - 1] * scale;
  const capW = isMini ? 3 : 5;

  // Left cap edge outline
  ctx.fillStyle = mat.colorDark;
  ctx.beginPath();
  ctx.ellipse(paddingX, centerY, capW, firstR, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Right cap face
  ctx.fillStyle = mat.colorBase;
  ctx.beginPath();
  ctx.ellipse(paddingX + drawW, centerY, capW, lastR, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = mat.colorLight;
  ctx.lineWidth = 1;
  ctx.stroke();

  // 3. Technical CAD Silhouette Outline
  ctx.save();
  ctx.beginPath();
  // Top profile
  for (let i = 0; i < numSlices; i++) {
    const px = paddingX + i * sliceW;
    const py = centerY - targetRadii[i] * scale;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  // Right side
  ctx.lineTo(paddingX + drawW, centerY + lastR);
  // Bottom profile (reverse)
  for (let i = numSlices - 1; i >= 0; i--) {
    const px = paddingX + i * sliceW;
    const py = centerY + targetRadii[i] * scale;
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
  ctx.lineWidth = isMini ? 1.2 : 1.6;
  ctx.stroke();
  ctx.restore();

  // 4. Dimension Annotations (全長 & 主要径φ)
  if (options.showDimensions !== false) {
    ctx.save();
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 1;
    ctx.font = isMini ? '9px "JetBrains Mono", monospace' : '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    // Length Dimension Line (Bottom)
    const dimY = height - (isMini ? 5 : 7);
    const startX = paddingX;
    const endX = paddingX + drawW;

    // Leader extension lines
    ctx.beginPath();
    ctx.moveTo(startX, centerY + firstR + 4);
    ctx.lineTo(startX, dimY + 3);
    ctx.moveTo(endX, centerY + lastR + 4);
    ctx.lineTo(endX, dimY + 3);

    // Dimension arrow line
    ctx.moveTo(startX, dimY);
    ctx.lineTo(endX, dimY);
    ctx.stroke();

    // Arrows
    drawArrow(ctx, startX, dimY, 1, 3);
    drawArrow(ctx, endX, dimY, -1, 3);

    // Length text
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`L: ${mission.length || 100}mm`, (startX + endX) / 2, dimY - 3);

    // Key Diameter Annotations
    if (!isMini) {
      const samplePoints = [
        { t: 0.15 },
        { t: 0.50 },
        { t: 0.85 }
      ];

      samplePoints.forEach(sp => {
        const idx = Math.floor(sp.t * (numSlices - 1));
        const rVal = targetRadii[idx];
        const diaVal = (rVal * 2).toFixed(0);
        const px = paddingX + sp.t * drawW;
        const pyTop = centerY - rVal * scale;

        // Small diameter marker line
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.beginPath();
        ctx.moveTo(px, pyTop);
        ctx.lineTo(px, pyTop - 5);
        ctx.stroke();

        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(`φ${diaVal}`, px, pyTop - 7);
      });
    }

    ctx.restore();
  }
}

/**
 * Renders the actual turned workpiece state for inspection comparison.
 * @param {HTMLCanvasElement} canvas 
 * @param {Object} sim LatheSimulation instance
 */
export function renderActualProductPreview(canvas, sim) {
  if (!canvas || !sim) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#09101d');
  bgGrad.addColorStop(1, '#0e1726');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const mat = sim.material || MATERIALS.wood;
  const numSlices = sim.numSlices;
  const paddingX = 28;
  const paddingY = 16;
  const drawW = width - paddingX * 2;
  const centerY = height * 0.46;

  let maxR = sim.stockRadius || 40;
  for (let i = 0; i < numSlices; i++) {
    if (sim.radii[i] > maxR) maxR = sim.radii[i];
  }

  const maxAvailableH = (height - paddingY * 2) * 0.72;
  const scale = (maxAvailableH / 2) / maxR;
  const sliceW = drawW / (numSlices - 1);

  // Centerline
  ctx.save();
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 3, 2, 3]);
  ctx.beginPath();
  ctx.moveTo(paddingX - 10, centerY);
  ctx.lineTo(width - paddingX + 10, centerY);
  ctx.stroke();
  ctx.restore();

  // Draw Actual Body Slices
  for (let i = 0; i < numSlices; i++) {
    const px = paddingX + i * sliceW;
    const r = sim.radii[i] * scale;
    const rough = sim.roughness[i];
    const topY = centerY - r;
    const h = r * 2;
    const w = sliceW + 0.6;

    const grad = ctx.createLinearGradient(0, topY, 0, topY + h);
    grad.addColorStop(0.0, mat.colorDark);
    grad.addColorStop(0.18, mat.colorLight);
    grad.addColorStop(0.35, mat.colorBase);
    grad.addColorStop(0.70, mat.colorBase);
    grad.addColorStop(1.0, mat.colorDark);

    ctx.fillStyle = grad;
    ctx.fillRect(px, topY, w, h);

    const shininess = 1.0 - rough;
    if (shininess > 0.3) {
      ctx.fillStyle = `rgba(255, 255, 255, ${(shininess * 0.4).toFixed(2)})`;
      ctx.fillRect(px, centerY - r * 0.55, w, r * 0.35);
    }
  }

  // Right cap
  const lastR = sim.radii[numSlices - 1] * scale;
  ctx.fillStyle = mat.colorBase;
  ctx.beginPath();
  ctx.ellipse(paddingX + drawW, centerY, 4, lastR, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = mat.colorLight;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Outer border outline
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < numSlices; i++) {
    const px = paddingX + i * sliceW;
    const py = centerY - sim.radii[i] * scale;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.lineTo(paddingX + drawW, centerY + lastR);
  for (let i = numSlices - 1; i >= 0; i--) {
    const px = paddingX + i * sliceW;
    const py = centerY + sim.radii[i] * scale;
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Bottom text
  ctx.fillStyle = '#10b981';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('実加工品（あなたの切削結果）', width / 2, height - 6);
}

/**
 * Helper to draw a small dimension arrow head
 */
function drawArrow(ctx, x, y, dir, size) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dir * size * 2, y - size);
  ctx.lineTo(x + dir * size * 2, y + size);
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
}
