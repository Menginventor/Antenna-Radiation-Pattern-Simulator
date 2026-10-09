/**
 * Engineering-Grade Cartesian Radiation Pattern Plot Renderer
 * Designed for RF & Antenna Engineering standards (similar to Keysight VNA / HFSS / CST Studio).
 * Features precise graticule, major/minor grid, HPBW delta markers, technical cursor readout, and clean vector trace.
 */

export class CartesianPlotRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scaleMode = options.scaleMode ?? 'db'; // 'db' or 'linear'
    this.dynamicRangeDb = options.dynamicRangeDb ?? 40;
    this.angleDomain = options.angleDomain ?? 'symmetric'; // 'symmetric' (-180° to +180°) or 'positive' (0° to 360°)
    this.cachedPattern = null;
    this.hoverPoint = null;
    this.devicePixelRatio = window.devicePixelRatio || 1;

    this.padding = { top: 35, right: 35, bottom: 45, left: 60 };

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

  setAngleDomain(domain) {
    this.angleDomain = domain;
    this.render();
  }

  setPattern(patternData) {
    this.cachedPattern = patternData;
    this.render();
  }

  initEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
      this.hoverPoint = { x, y };
      this.render();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverPoint = null;
      this.render();
    });
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const w = rect.width > 50 ? rect.width : (parent.clientWidth > 50 ? parent.clientWidth : 800);
    const h = rect.height > 50 ? rect.height : (parent.clientHeight > 50 ? parent.clientHeight : 500);
    const dpr = window.devicePixelRatio || 1;
    this.devicePixelRatio = dpr;

    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    this.render();
  }

  /**
   * Maps angle in degrees to X coordinate on plot
   */
  angleToX(deg, pad, pw) {
    let normX = 0;
    if (this.angleDomain === 'symmetric') {
      // deg in [-180, 180]
      normX = (deg + 180) / 360;
    } else {
      // deg in [0, 360]
      let d = deg % 360;
      if (d < 0) d += 360;
      normX = d / 360;
    }
    return pad.left + Math.max(0, Math.min(1, normX)) * pw;
  }

  /**
   * Maps X coordinate on plot to angle in degrees
   */
  xToAngle(x, pad, pw) {
    const normX = Math.max(0, Math.min(1, (x - pad.left) / pw));
    if (this.angleDomain === 'symmetric') {
      return normX * 360 - 180;
    } else {
      return normX * 360;
    }
  }

  /**
   * Maps gain value (dB or linear) to Y coordinate
   */
  valToY(val, pad, ph) {
    let normY = 0;
    if (this.scaleMode === 'db') {
      const clamped = Math.max(-this.dynamicRangeDb, Math.min(0, val));
      normY = -clamped / this.dynamicRangeDb; // 0 at top, 1 at bottom
    } else if (this.scaleMode === 'absPower') {
      const pMax = Math.max(0.1, this.cachedPattern?.maxTheoreticalPower || 4.0);
      const clamped = Math.max(0, Math.min(pMax, val));
      normY = 1.0 - (clamped / pMax);
    } else {
      const clamped = Math.max(0, Math.min(1, val));
      normY = 1.0 - clamped;
    }
    return pad.top + normY * ph;
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    ctx.clearRect(0, 0, w, h);

    const pad = {
      top: this.padding.top * this.devicePixelRatio,
      right: this.padding.right * this.devicePixelRatio,
      bottom: this.padding.bottom * this.devicePixelRatio,
      left: this.padding.left * this.devicePixelRatio
    };

    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;

    if (pw <= 0 || ph <= 0) return;

    // 1. Engineering graticule background & grid
    this.drawGraticule(ctx, pad, pw, ph);

    // 2. Data trace
    if (this.cachedPattern) {
      this.drawEngineeringTrace(ctx, pad, pw, ph);
      this.drawMarkersAndHPBW(ctx, pad, pw, ph);
      this.drawInstrumentHeader(ctx, pad, pw, ph);
    }

    // 3. Precision cursor & coordinate readout
    if (this.hoverPoint && this.cachedPattern) {
      const { x, y } = this.hoverPoint;
      if (x >= pad.left && x <= pad.left + pw && y >= pad.top && y <= pad.top + ph) {
        this.drawEngineeringCursor(ctx, pad, pw, ph, x, y);
      }
    }
  }

  drawGraticule(ctx, pad, pw, ph) {
    ctx.save();
    const dpr = this.devicePixelRatio;

    // Solid dark technical plot background
    ctx.fillStyle = '#060a12';
    ctx.fillRect(pad.left, pad.top, pw, ph);

    // Minor grid divisions
    ctx.lineWidth = 1 * dpr;

    // Vertical grid (Angle)
    const angleStep = 30; // major every 30 deg
    const minorAngleStep = 10; // minor every 10 deg

    const startAngle = this.angleDomain === 'symmetric' ? -180 : 0;
    const endAngle = this.angleDomain === 'symmetric' ? 180 : 360;

    // Minor vertical grid lines
    ctx.strokeStyle = '#0e1726';
    ctx.beginPath();
    for (let deg = startAngle; deg <= endAngle; deg += minorAngleStep) {
      if (deg % angleStep !== 0) {
        const x = this.angleToX(deg, pad, pw);
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + ph);
      }
    }
    ctx.stroke();

    // Major vertical grid lines
    ctx.strokeStyle = '#1a263d';
    ctx.beginPath();
    for (let deg = startAngle; deg <= endAngle; deg += angleStep) {
      const x = this.angleToX(deg, pad, pw);
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + ph);
    }
    ctx.stroke();

    // Horizontal grid (Gain: dB or linear)
    if (this.scaleMode === 'db') {
      const dbMajorStep = 5; // major every 5 dB
      const dbMinorStep = 1; // minor every 1 dB

      // Minor horizontal grid lines
      ctx.strokeStyle = '#0e1726';
      ctx.beginPath();
      for (let db = 0; db >= -this.dynamicRangeDb; db -= dbMinorStep) {
        if (db % dbMajorStep !== 0) {
          const y = this.valToY(db, pad, ph);
          ctx.moveTo(pad.left, y);
          ctx.lineTo(pad.left + pw, y);
        }
      }
      ctx.stroke();

      // Major horizontal grid lines
      ctx.strokeStyle = '#1a263d';
      ctx.beginPath();
      for (let db = 0; db >= -this.dynamicRangeDb; db -= dbMajorStep) {
        const y = this.valToY(db, pad, ph);
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + pw, y);
      }
      ctx.stroke();
    } else if (this.scaleMode === 'absPower') {
      const pMax = Math.max(0.1, this.cachedPattern?.maxTheoreticalPower || 4.0);
      const pBase = this.cachedPattern?.baselinePower || 2.0;

      // Minor grid
      ctx.strokeStyle = '#0e1726';
      ctx.beginPath();
      for (let p = 0; p <= pMax; p += 0.5) {
        if (p % 1.0 !== 0) {
          const y = this.valToY(p, pad, ph);
          ctx.moveTo(pad.left, y);
          ctx.lineTo(pad.left + pw, y);
        }
      }
      ctx.stroke();

      // Major grid
      ctx.strokeStyle = '#1a263d';
      ctx.beginPath();
      for (let p = 0; p <= pMax; p += 1.0) {
        const y = this.valToY(p, pad, ph);
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + pw, y);
      }
      ctx.stroke();

      // Baseline line for Destructive Interference Threshold
      const yBase = this.valToY(pBase, pad, ph);
      ctx.save();
      ctx.strokeStyle = '#ff7f0e'; // Matplotlib tab:orange
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      ctx.moveTo(pad.left, yBase);
      ctx.lineTo(pad.left + pw, yBase);
      ctx.stroke();

      // Right label for baseline
      ctx.fillStyle = '#ff7f0e';
      ctx.font = `${9 * dpr}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`P₀ Baseline: ${pBase.toFixed(1)} W (Destructive Threshold)`, pad.left + pw - 6 * dpr, yBase - 3 * dpr);
      ctx.restore();
    } else {
      // Linear scale
      const linMajor = 0.2;
      ctx.strokeStyle = '#1a263d';
      ctx.beginPath();
      for (let v = 0; v <= 1.0; v += linMajor) {
        const y = this.valToY(v, pad, ph);
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + pw, y);
      }
      ctx.stroke();
    }

    // Outer frame boundary (crisp technical border)
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(pad.left, pad.top, pw, ph);

    // Inward tick marks on axes
    const tickLen = 4 * dpr;
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();

    // X-axis ticks (top and bottom)
    for (let deg = startAngle; deg <= endAngle; deg += angleStep) {
      const x = this.angleToX(deg, pad, pw);
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + tickLen);
      ctx.moveTo(x, pad.top + ph);
      ctx.lineTo(x, pad.top + ph - tickLen);
    }

    // Y-axis ticks (left and right)
    if (this.scaleMode === 'db') {
      for (let db = 0; db >= -this.dynamicRangeDb; db -= 5) {
        const y = this.valToY(db, pad, ph);
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + tickLen, y);
        ctx.moveTo(pad.left + pw, y);
        ctx.lineTo(pad.left + pw - tickLen, y);
      }
    } else if (this.scaleMode === 'absPower') {
      const pMax = Math.max(0.1, this.cachedPattern?.maxTheoreticalPower || 4.0);
      for (let p = 0; p <= pMax; p += 1.0) {
        const y = this.valToY(p, pad, ph);
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + tickLen, y);
        ctx.moveTo(pad.left + pw, y);
        ctx.lineTo(pad.left + pw - tickLen, y);
      }
    } else {
      for (let v = 0; v <= 1.0; v += 0.2) {
        const y = this.valToY(v, pad, ph);
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + tickLen, y);
        ctx.moveTo(pad.left + pw, y);
        ctx.lineTo(pad.left + pw - tickLen, y);
      }
    }
    ctx.stroke();

    // Axis Labels & Typography
    ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#94a3b8';

    // X-Axis angle numbers
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let deg = startAngle; deg <= endAngle; deg += angleStep) {
      const x = this.angleToX(deg, pad, pw);
      const label = `${deg > 0 ? '+' : ''}${deg}°`;
      ctx.fillText(label, x, pad.top + ph + 6 * dpr);
    }

    // Y-Axis numbers
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    if (this.scaleMode === 'db') {
      for (let db = 0; db >= -this.dynamicRangeDb; db -= 5) {
        const y = this.valToY(db, pad, ph);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`${db}`, pad.left - 6 * dpr, y);
      }
    } else if (this.scaleMode === 'absPower') {
      const pMax = Math.max(0.1, this.cachedPattern?.maxTheoreticalPower || 4.0);
      for (let p = 0; p <= pMax; p += 1.0) {
        const y = this.valToY(p, pad, ph);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(p.toFixed(1), pad.left - 6 * dpr, y);
      }
    } else {
      for (let v = 0; v <= 1.0; v += 0.2) {
        const y = this.valToY(v, pad, ph);
        ctx.fillText(v.toFixed(1), pad.left - 6 * dpr, y);
      }
    }

    // Title labels
    ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('AZIMUTH ANGLE φ (deg)', pad.left + pw / 2, pad.top + ph + 28 * dpr);

    ctx.save();
    ctx.translate(14 * dpr, pad.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    let yTitle = 'NORMALIZED GAIN (dB)';
    if (this.scaleMode === 'absPower') {
      yTitle = 'ABSOLUTE POWER |E|² (W/m²)';
    } else if (this.scaleMode === 'linear') {
      yTitle = 'FIELD MAGNITUDE |E|';
    }
    ctx.fillText(yTitle, 0, 0);
    ctx.restore();

    ctx.restore();
  }

  drawEngineeringTrace(ctx, pad, pw, ph) {
    const { angles, normField, clampedDb, absolutePower, fieldMagnitudes, numPoints } = this.cachedPattern;
    ctx.save();
    const dpr = this.devicePixelRatio;

    // Crisp engineering line trace - NO blurry glow
    ctx.beginPath();
    let first = true;

    if (this.angleDomain === 'symmetric') {
      // Re-map angles from [-PI, +PI] (-180° to +180°)
      // simulator samples from 0 to 2*PI:
      // index for 0 is 0 deg; index for PI is 180 deg; index > PI is angle - 360 deg
      for (let i = 0; i <= numPoints; i++) {
        // Step deg from -180 to +180
        const deg = -180 + (i / numPoints) * 360;
        let samplePhi = (deg * Math.PI) / 180;
        if (samplePhi < 0) samplePhi += 2 * Math.PI;

        const idx = Math.min(numPoints - 1, Math.max(0, Math.round((samplePhi / (2 * Math.PI)) * numPoints))) % numPoints;
        let val;
        if (this.scaleMode === 'absPower') {
          val = absolutePower ? absolutePower[idx] : (fieldMagnitudes ? fieldMagnitudes[idx] * fieldMagnitudes[idx] : normField[idx] * normField[idx]);
        } else if (this.scaleMode === 'linear') {
          val = normField[idx];
        } else {
          val = clampedDb[idx];
        }

        const x = this.angleToX(deg, pad, pw);
        const y = this.valToY(val, pad, ph);

        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
    } else {
      // 0 to 360 deg
      for (let i = 0; i < numPoints; i++) {
        const phi = angles[i];
        const deg = (phi * 180) / Math.PI;
        let val;
        if (this.scaleMode === 'absPower') {
          val = absolutePower ? absolutePower[i] : (fieldMagnitudes ? fieldMagnitudes[i] * fieldMagnitudes[i] : normField[i] * normField[i]);
        } else if (this.scaleMode === 'linear') {
          val = normField[i];
        } else {
          val = clampedDb[i];
        }

        const x = this.angleToX(deg, pad, pw);
        const y = this.valToY(val, pad, ph);

        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      }
    }

    // Precise trace style: Crisp Matplotlib tab:blue #1f77b4 line
    ctx.strokeStyle = '#1f77b4';
    ctx.lineWidth = 1.85 * dpr;
    ctx.stroke();

    ctx.restore();
  }

  drawMarkersAndHPBW(ctx, pad, pw, ph) {
    const { metrics } = this.cachedPattern;
    if (!metrics) return;
    const dpr = this.devicePixelRatio;
    ctx.save();

    // 1. Peak Marker (M1) - Matplotlib tab:green
    const peakDeg = metrics.mainBeamAngleDeg;
    // convert to current domain
    let displayPeakDeg = peakDeg;
    if (this.angleDomain === 'symmetric') {
      if (displayPeakDeg > 180) displayPeakDeg -= 360;
    }

    const peakX = this.angleToX(displayPeakDeg, pad, pw);
    const peakY = this.valToY(0, pad, ph);

    // Draw inverted triangle marker
    const triSize = 6 * dpr;
    ctx.beginPath();
    ctx.moveTo(peakX, peakY);
    ctx.lineTo(peakX - triSize, peakY - triSize * 1.5);
    ctx.lineTo(peakX + triSize, peakY - triSize * 1.5);
    ctx.closePath();
    ctx.fillStyle = '#2ca02c'; // Matplotlib tab:green
    ctx.fill();

    // Marker text callout
    ctx.font = `bold ${9 * dpr}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#2ca02c';
    ctx.textAlign = 'center';
    ctx.fillText(`M1: 0.0dB @ ${displayPeakDeg.toFixed(1)}°`, peakX, peakY - triSize * 1.8);

    // Peak marker is drawn above
    ctx.restore();
  }

  drawInstrumentHeader(ctx, pad, pw, ph) {
    const { metrics } = this.cachedPattern;
    const dpr = this.devicePixelRatio;
    ctx.save();

    // Technical information block in upper right corner of plot
    const boxW = 190 * dpr;
    const boxH = 46 * dpr;
    const boxX = pad.left + pw - boxW - 8 * dpr;
    const boxY = pad.top + 8 * dpr;

    // Dark semi-transparent background box with hairline border
    ctx.fillStyle = 'rgba(6, 10, 18, 0.9)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.font = `${9 * dpr}px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const lineH = 12 * dpr;
    let textY = boxY + 5 * dpr;
    const textX = boxX + 8 * dpr;

    ctx.fillStyle = '#1f77b4'; // Matplotlib tab:blue
    ctx.fillText(`PORT 1 (ARRAY PATTERN): |AF(φ)|²`, textX, textY);

    textY += lineH;
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`FREQ: 145.000 MHz (VHF)`, textX, textY);

    textY += lineH;
    ctx.fillStyle = '#2ca02c'; // Matplotlib tab:green
    const dirStr = metrics.directivityDbi ?? (this.cachedPattern?.directivity3DdBi !== undefined ? this.cachedPattern.directivity3DdBi.toFixed(2) : '0.00');
    ctx.fillText(`DIR: ${dirStr} dBi | F/B: ${metrics.frontToBackDb} dB`, textX, textY);

    ctx.restore();
  }

  drawEngineeringCursor(ctx, pad, pw, ph, curX, curY) {
    const { angles, normField, clampedDb, numPoints } = this.cachedPattern;
    const dpr = this.devicePixelRatio;
    ctx.save();

    // Angle at cursor X
    const deg = this.xToAngle(curX, pad, pw);
    let samplePhi = (deg * Math.PI) / 180;
    while (samplePhi < 0) samplePhi += 2 * Math.PI;
    while (samplePhi >= 2 * Math.PI) samplePhi -= 2 * Math.PI;

    const idx = Math.min(numPoints - 1, Math.max(0, Math.round((samplePhi / (2 * Math.PI)) * numPoints))) % numPoints;
    const mag = normField[idx];
    const db = clampedDb[idx];
    const pBase = this.cachedPattern.baselinePower || 2.0;
    const absP = this.cachedPattern.absolutePower ? this.cachedPattern.absolutePower[idx] : mag * mag;

    let traceVal;
    let valText;
    if (this.scaleMode === 'absPower') {
      traceVal = absP;
      const interf = absP < pBase * 0.98 ? ' [Destructive]' : (absP > pBase * 1.02 ? ' [Constructive]' : '');
      valText = `${absP.toFixed(2)} W${interf}`;
    } else if (this.scaleMode === 'db') {
      traceVal = db;
      valText = `${db.toFixed(2)} dB`;
    } else {
      traceVal = mag;
      valText = `${mag.toFixed(4)}`;
    }

    const traceY = this.valToY(traceVal, pad, ph);

    // Crosshair line: full vertical and horizontal dotted lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);

    ctx.beginPath();
    ctx.moveTo(curX, pad.top);
    ctx.lineTo(curX, pad.top + ph);
    ctx.moveTo(pad.left, traceY);
    ctx.lineTo(pad.left + pw, traceY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Data intersection point (Matplotlib tab:blue)
    ctx.beginPath();
    ctx.arc(curX, traceY, 3.5 * dpr, 0, 2 * Math.PI);
    ctx.fillStyle = '#1f77b4';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 * dpr;
    ctx.stroke();

    // Floating technical coordinate readout
    const coordText = `X: ${deg.toFixed(1)}° | Y: ${valText}`;

    ctx.font = `${9.5 * dpr}px 'JetBrains Mono', monospace`;
    const tw = ctx.measureText(coordText).width + 12 * dpr;
    const th = 18 * dpr;

    let bx = curX + 10 * dpr;
    if (bx + tw > pad.left + pw) bx = curX - tw - 10 * dpr;
    let by = traceY - th - 6 * dpr;
    if (by < pad.top) by = traceY + 8 * dpr;

    ctx.fillStyle = 'rgba(10, 15, 29, 0.95)';
    ctx.strokeStyle = '#1f77b4';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(bx, by, tw, th);
    ctx.fillRect(bx, by, tw, th);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(coordText, bx + tw / 2, by + th / 2);

    ctx.restore();
  }
}
