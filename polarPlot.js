/**
 * Polar Radiation Pattern Canvas Renderer
 * High-DPI interactive polar plot with dB/linear scales, HPBW markers, and hover inspection.
 */

export class PolarPlotRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scaleMode = options.scaleMode ?? 'db'; // 'db' or 'linear'
    this.dynamicRangeDb = options.dynamicRangeDb ?? 40; // 0 to -40 dB
    this.hoverAngleRad = null;
    this.hoverData = null;
    this.showHPBW = true;
    this.cachedPattern = null;
    this.devicePixelRatio = window.devicePixelRatio || 1;

    this.initEvents();
  }

  setScaleMode(mode) {
    this.scaleMode = mode;
    this.render();
  }

  setDynamicRange(range) {
    this.dynamicRangeDb = range;
    this.render();
  }

  setShowHPBW(val) {
    this.showHPBW = val;
    this.render();
  }

  initEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
      const centerX = this.canvas.width / 2;
      const centerY = this.canvas.height / 2;

      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // In polar canvas coordinates:
      // standard canvas: +X is right (0 rad), +Y is down (pi/2 rad)
      // we map counterclockwise: phi = atan2(-dy, dx), normalized to [0, 2*PI]
      let angle = Math.atan2(-dy, dx);
      if (angle < 0) angle += 2 * Math.PI;

      this.hoverAngleRad = angle;
      this.hoverDist = dist;

      if (this.onHoverCallback) {
        this.onHoverCallback(this.getHoverInfo(angle));
      }
      this.render();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverAngleRad = null;
      if (this.onHoverCallback) {
        this.onHoverCallback(null);
      }
      this.render();
    });
  }

  onHover(callback) {
    this.onHoverCallback = callback;
  }

  getHoverInfo(angleRad) {
    if (!this.cachedPattern) return null;
    const { angles, normField, clampedDb, fieldMagnitudes, absolutePower, baselinePower, maxTheoreticalPower } = this.cachedPattern;
    const n = angles.length;
    // Map angle to index
    const norm = (angleRad / (2 * Math.PI)) * n;
    const idx = Math.round(norm) % n;

    const angleDeg = ((angleRad * 180) / Math.PI).toFixed(1);
    const mag = normField[idx];
    const absMag = fieldMagnitudes ? fieldMagnitudes[idx] : mag;
    const db = clampedDb[idx];
    const absPower = absolutePower ? absolutePower[idx] : (absMag * absMag);
    const pBase = baselinePower ?? 2.0;

    let interferenceType = 'Neutral';
    let interferencePct = 0;
    if (absPower < pBase * 0.98) {
      interferenceType = 'Destructive';
      interferencePct = Math.round(((pBase - absPower) / pBase) * 100);
    } else if (absPower > pBase * 1.02) {
      interferenceType = 'Constructive';
      interferencePct = Math.round(((absPower - pBase) / pBase) * 100);
    }

    return {
      angleDeg: Number(angleDeg),
      angleRad,
      mag: Number(absMag.toFixed(3)),
      normMag: Number(mag.toFixed(3)),
      powerLinear: Number((mag * mag).toFixed(4)),
      absPower: Number(absPower.toFixed(3)),
      db: Number(db.toFixed(1)),
      interferenceType,
      interferencePct,
      isDestructive: interferenceType === 'Destructive'
    };
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height || rect.width);
    const dpr = window.devicePixelRatio || 1;
    this.devicePixelRatio = dpr;

    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;

    this.render();
  }

  setPattern(patternData) {
    this.cachedPattern = patternData;
    this.render();
  }

  /**
   * Maps value to radial distance in pixels
   */
  valueToRadius(val, maxRadius) {
    if (this.scaleMode === 'absPower') {
      const pMax = Math.max(0.1, this.cachedPattern?.maxTheoreticalPower || 4.0);
      const clamped = Math.max(0, Math.min(pMax, val));
      return (clamped / pMax) * maxRadius;
    } else if (this.scaleMode === 'linear') {
      return Math.max(0, Math.min(1, val)) * maxRadius;
    } else {
      // dB mode: val is in dB, between -dynamicRangeDb and 0
      const db = Math.max(-this.dynamicRangeDb, Math.min(0, val));
      const norm = (db + this.dynamicRangeDb) / this.dynamicRangeDb;
      return norm * maxRadius;
    }
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    ctx.clearRect(0, 0, w, h);

    const centerX = w / 2;
    const centerY = h / 2;
    const maxRadius = Math.min(centerX, centerY) * 0.78;

    this.drawGrid(ctx, centerX, centerY, maxRadius);

    if (this.cachedPattern) {
      this.drawPatternCurve(ctx, centerX, centerY, maxRadius);
    }

    this.drawArrayAxisVisualizer(ctx, centerX, centerY, maxRadius);

    if (this.scaleMode === 'absPower' && this.cachedPattern) {
      this.drawDestructiveNullMarkers(ctx, centerX, centerY, maxRadius);
    }

    if (this.hoverAngleRad !== null) {
      this.drawHoverCrosshair(ctx, centerX, centerY, maxRadius);
    }
  }

  drawGrid(ctx, cx, cy, maxR) {
    ctx.save();
    ctx.lineWidth = 1 * this.devicePixelRatio;

    // Rings
    let rings = [];
    if (this.scaleMode === 'db') {
      const dbSteps = [0, -10, -20, -30, -40].filter(db => db >= -this.dynamicRangeDb);
      rings = dbSteps.map(db => ({
        radius: this.valueToRadius(db, maxR),
        label: `${db} dB`,
        isHalfPower: false,
        isBaseline: false
      }));
    } else if (this.scaleMode === 'absPower') {
      const pMax = Math.max(0.1, this.cachedPattern?.maxTheoreticalPower || 4.0);
      const pBase = this.cachedPattern?.baselinePower || 2.0;
      const rBase = this.valueToRadius(pBase, maxR);

      // Background circle fill
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(11, 19, 38, 0.75)';
      ctx.fill();

      // Subtle cyan wash for destructive interference zone (< P0)
      ctx.beginPath();
      ctx.arc(cx, cy, rBase, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(6, 182, 212, 0.08)';
      ctx.fill();

      // Step rings: 100%, 75%, 50%, 25% of pMax
      const fractions = [1.0, 0.75, 0.5, 0.25];
      rings = fractions.map(f => {
        const pVal = f * pMax;
        const rad = this.valueToRadius(pVal, maxR);
        const isNearBase = Math.abs(rad - rBase) < 8 * this.devicePixelRatio;
        return {
          radius: rad,
          label: isNearBase ? `${pBase.toFixed(1)} P₀ (Threshold)` : `${pVal.toFixed(1)} (|E|²)`,
          isHalfPower: false,
          isBaseline: isNearBase
        };
      });

      // Ensure explicit baseline ring exists
      const hasBase = rings.some(r => r.isBaseline);
      if (!hasBase) {
        rings.push({
          radius: rBase,
          label: `${pBase.toFixed(1)} P₀ (Baseline)`,
          isHalfPower: false,
          isBaseline: true
        });
      }
    } else {
      const steps = [1.0, 0.75, 0.5, 0.25];
      rings = steps.map(val => ({
        radius: this.valueToRadius(val, maxR),
        label: val.toFixed(2),
        isHalfPower: Math.abs(val - 0.707) < 0.05,
        isBaseline: false
      }));
    }

    if (this.scaleMode !== 'absPower') {
      // Background circle fill for db and linear
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(11, 19, 38, 0.65)';
      ctx.fill();
    }

    // Draw concentric circles
    rings.forEach(({ radius, label, isHalfPower, isBaseline }) => {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);

      if (isBaseline) {
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.85)'; // bright cyan dashed for destructive baseline
        ctx.lineWidth = 1.5 * this.devicePixelRatio;
        ctx.setLineDash([5 * this.devicePixelRatio, 3 * this.devicePixelRatio]);
      } else if (isHalfPower) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)'; // amber dashed for -3dB HPBW
        ctx.lineWidth = 1 * this.devicePixelRatio;
        ctx.setLineDash([4 * this.devicePixelRatio, 4 * this.devicePixelRatio]);
      } else {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        ctx.lineWidth = 1 * this.devicePixelRatio;
        ctx.setLineDash([]);
      }
      ctx.stroke();

      // Ring text label along 45 degree diagonal
      const lblAngle = -Math.PI / 4;
      const lx = cx + radius * Math.cos(lblAngle);
      const ly = cy + radius * Math.sin(lblAngle);

      ctx.fillStyle = isBaseline ? '#38bdf8' : (isHalfPower ? '#fbbf24' : 'rgba(148, 163, 184, 0.7)');
      ctx.font = `${(isBaseline ? 10.5 : 10) * this.devicePixelRatio}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, lx + 4 * this.devicePixelRatio, ly - 2 * this.devicePixelRatio);
    });

    ctx.setLineDash([]);

    // Radial spokes every 30 degrees
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg * Math.PI) / 180;
      // In cartesian on canvas, phi measured from +X ccw: x = cx + r*cos(rad), y = cy - r*sin(rad)
      const x = cx + maxR * Math.cos(rad);
      const y = cy - maxR * Math.sin(rad);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);

      const isCardinal = deg % 90 === 0;
      ctx.strokeStyle = isCardinal ? 'rgba(148, 163, 184, 0.4)' : 'rgba(148, 163, 184, 0.15)';
      ctx.stroke();

      // Degree labels around perimeter
      const labelDist = maxR + 20 * this.devicePixelRatio;
      const lx = cx + labelDist * Math.cos(rad);
      const ly = cy - labelDist * Math.sin(rad);

      ctx.fillStyle = isCardinal ? '#38bdf8' : 'rgba(203, 213, 225, 0.75)';
      ctx.font = `${isCardinal ? 12 : 10 * this.devicePixelRatio}px 'Outfit', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      let text = `${deg}°`;
      if (deg === 0) text = `0° (Front +X)`;
      else if (deg === 90) text = `90° (Broadside +Y)`;
      else if (deg === 180) text = `180° (Back -X)`;
      else if (deg === 270) text = `270° (Broadside -Y)`;

      ctx.fillText(text, lx, ly);
    }

    ctx.restore();
  }

  drawPatternCurve(ctx, cx, cy, maxR) {
    const { angles, normField, clampedDb, absolutePower, fieldMagnitudes, numPoints, baselinePower, maxTheoreticalPower } = this.cachedPattern;
    ctx.save();

    // Create Path
    ctx.beginPath();
    for (let i = 0; i <= numPoints; i++) {
      const idx = i % numPoints;
      const phi = angles[idx];
      let val;
      if (this.scaleMode === 'absPower') {
        val = absolutePower ? absolutePower[idx] : (fieldMagnitudes ? fieldMagnitudes[idx] * fieldMagnitudes[idx] : normField[idx] * normField[idx]);
      } else if (this.scaleMode === 'linear') {
        val = normField[idx];
      } else {
        val = clampedDb[idx];
      }
      const r = this.valueToRadius(val, maxR);

      // CCW from +X
      const x = cx + r * Math.cos(phi);
      const y = cy - r * Math.sin(phi);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();

    // Gradient fill
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    if (this.scaleMode === 'absPower') {
      const pMax = Math.max(0.1, maxTheoreticalPower || 4.0);
      const pBase = baselinePower || 2.0;
      const baseRatio = Math.min(0.9, Math.max(0.1, pBase / pMax));

      // Destructive interference inner core (deep cyan / indigo / null)
      grad.addColorStop(0, 'rgba(6, 182, 212, 0.15)');
      grad.addColorStop(baseRatio * 0.7, 'rgba(14, 165, 233, 0.25)');
      grad.addColorStop(baseRatio, 'rgba(56, 189, 248, 0.35)'); // baseline threshold
      // Constructive interference outer lobe (amber / purple / magenta)
      grad.addColorStop(Math.min(1, baseRatio + (1 - baseRatio) * 0.5), 'rgba(168, 85, 247, 0.45)');
      grad.addColorStop(1, 'rgba(236, 72, 153, 0.55)');
    } else {
      grad.addColorStop(0, 'rgba(0, 242, 254, 0.1)');
      grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.25)');
      grad.addColorStop(0.85, 'rgba(168, 85, 247, 0.35)');
      grad.addColorStop(1, 'rgba(236, 72, 153, 0.45)');
    }

    ctx.fillStyle = grad;
    ctx.fill();

    // Crisp engineering stroke - clean, professional
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.0 * this.devicePixelRatio;
    ctx.stroke();

    ctx.restore();
  }

  drawDestructiveNullMarkers(ctx, cx, cy, maxR) {
    const metrics = this.cachedPattern?.metrics;
    if (!metrics || !metrics.nulls || metrics.nulls.length === 0) return;

    ctx.save();
    metrics.nulls.forEach(nullItem => {
      const rad = nullItem.angleRad;
      const deg = nullItem.angleDeg.toFixed(0);
      const absP = (nullItem.absPower ?? 0).toFixed(2);

      const pR = this.valueToRadius(nullItem.absPower ?? 0, maxR);
      const innerX = cx + pR * Math.cos(rad);
      const innerY = cy - pR * Math.sin(rad);

      const outerR = maxR + 14 * this.devicePixelRatio;
      const outerX = cx + outerR * Math.cos(rad);
      const outerY = cy - outerR * Math.sin(rad);

      // Dashed null pointer
      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(outerX, outerY);
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.65)'; // red/coral null pointer
      ctx.lineWidth = 1.2 * this.devicePixelRatio;
      ctx.setLineDash([2 * this.devicePixelRatio, 2 * this.devicePixelRatio]);
      ctx.stroke();

      // Dot at null point
      ctx.beginPath();
      ctx.arc(innerX, innerY, 3.5 * this.devicePixelRatio, 0, 2 * Math.PI);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1 * this.devicePixelRatio;
      ctx.stroke();

      // Null label badge at perimeter
      ctx.font = `${9 * this.devicePixelRatio}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = '#f87171';
      ctx.textAlign = Math.cos(rad) > 0.3 ? 'left' : (Math.cos(rad) < -0.3 ? 'right' : 'center');
      ctx.textBaseline = Math.sin(rad) > 0.3 ? 'bottom' : (Math.sin(rad) < -0.3 ? 'top' : 'middle');
      ctx.fillText(`Null ${deg}° (${absP})`, outerX, outerY);
    });
    ctx.restore();
  }

  drawHPBWArc(ctx, cx, cy, maxR) {
    const { metrics } = this.cachedPattern;
    if (!metrics || metrics.hpbwDeg === 'N/A') return;

    ctx.save();
    const mainAngleDeg = metrics.mainBeamAngleDeg;
    const hpbw = metrics.hpbwDeg;
    const startDeg = mainAngleDeg - hpbw / 2;
    const endDeg = mainAngleDeg + hpbw / 2;

    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;

    let targetVal;
    if (this.scaleMode === 'absPower') {
      targetVal = 0.5 * (this.cachedPattern?.maxActualPower || 1.0);
    } else if (this.scaleMode === 'db') {
      targetVal = -3;
    } else {
      targetVal = 0.7071;
    }
    const hpbwR = this.valueToRadius(targetVal, maxR);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    // Canvas arc is clockwise by default; for CCW polar, we flip signs of angles
    ctx.arc(cx, cy, hpbwR, -endRad, -startRad, false);
    ctx.closePath();

    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.7)';
    ctx.lineWidth = 1.5 * this.devicePixelRatio;
    ctx.stroke();

    ctx.restore();
  }

  drawArrayAxisVisualizer(ctx, cx, cy, maxR) {
    // Subtle physical antenna element markers at center along X-axis
    ctx.save();
    const axisLen = maxR * 0.18;
    ctx.beginPath();
    ctx.moveTo(cx - axisLen, cy);
    ctx.lineTo(cx + axisLen, cy);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5 * this.devicePixelRatio;
    ctx.setLineDash([2 * this.devicePixelRatio, 2 * this.devicePixelRatio]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Element 1 marker (-X)
    const e1X = cx - axisLen * 0.75;
    ctx.beginPath();
    ctx.arc(e1X, cy, 4 * this.devicePixelRatio, 0, 2 * Math.PI);
    ctx.fillStyle = '#06b6d4'; // Cyan
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 * this.devicePixelRatio;
    ctx.stroke();

    // Element 2 marker (+X)
    const e2X = cx + axisLen * 0.75;
    ctx.beginPath();
    ctx.arc(e2X, cy, 4 * this.devicePixelRatio, 0, 2 * Math.PI);
    ctx.fillStyle = '#ec4899'; // Magenta / Pink
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 * this.devicePixelRatio;
    ctx.stroke();

    // Tiny labels
    ctx.font = `${8 * this.devicePixelRatio}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'center';
    ctx.fillText('E1', e1X, cy + 12 * this.devicePixelRatio);
    ctx.fillText('E2', e2X, cy + 12 * this.devicePixelRatio);

    ctx.restore();
  }

  drawHoverCrosshair(ctx, cx, cy, maxR) {
    ctx.save();
    const angle = this.hoverAngleRad;
    const x = cx + maxR * Math.cos(angle);
    const y = cy - maxR * Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1.5 * this.devicePixelRatio;
    ctx.setLineDash([3 * this.devicePixelRatio, 3 * this.devicePixelRatio]);
    ctx.stroke();

    // Dot at pattern intercept
    if (this.cachedPattern) {
      const info = this.getHoverInfo(angle);
      let val;
      if (this.scaleMode === 'absPower') {
        val = info.absPower;
      } else if (this.scaleMode === 'db') {
        val = info.db;
      } else {
        val = info.mag;
      }
      const r = this.valueToRadius(val, maxR);
      const px = cx + r * Math.cos(angle);
      const py = cy - r * Math.sin(angle);

      ctx.beginPath();
      ctx.arc(px, py, 4.5 * this.devicePixelRatio, 0, 2 * Math.PI);
      ctx.fillStyle = info.isDestructive ? '#38bdf8' : '#ec4899';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 * this.devicePixelRatio;
      ctx.stroke();
    }

    ctx.restore();
  }

  exportImage() {
    return this.canvas.toDataURL('image/png');
  }
}
