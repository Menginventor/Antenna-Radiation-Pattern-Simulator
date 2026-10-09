/**
 * 1D Two-Source Wave Interference Plot Renderer
 * Professional RF & Physics Oscilloscope-Grade Analyzer
 * 
 * Displays:
 * 1. Spatial 1D cut along the antenna array axis (y = 0, -X to +X)
 *    - CH1: Source 1 wave E₁(x, t) (Blue)
 *    - CH2: Source 2 wave E₂(x, t) (Orange)
 *    - Σ: Total Superposition E_total(x, t) (Emerald / Teal)
 *    - ±Envelope: Peak constructive / destructive interference boundary
 * 2. Time-domain excitation waveforms s₁(t), s₂(t), and s_sum(t)
 * 3. Physical source location pins (x = -d/2 and x = +d/2) with separation indicator
 * 4. Interactive cursor inspection with exact voltage/amplitude readout
 */

export class Wave1DPlotRenderer {
  constructor(canvas, simulator, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = simulator;

    // Channels visibility
    this.showCH1 = options.showCH1 ?? true;
    this.showCH2 = options.showCH2 ?? true;
    this.showSum = options.showSum ?? true;
    this.showEnvelope = options.showEnvelope ?? true;

    // Mode: 'spatial' (along X-axis) or 'time' (oscilloscope waveform at feeds)
    this.domainMode = options.domainMode ?? 'spatial';

    // Interactive hover
    this.hoverPoint = null;
    this.devicePixelRatio = window.devicePixelRatio || 1;

    // Margins for technical graticule
    this.padding = { top: 28, right: 36, bottom: 32, left: 54 };

    this.initEvents();
  }

  setSimulator(sim) {
    this.sim = sim;
  }

  setDomainMode(mode) {
    this.domainMode = mode;
    this.render(this.lastSimTime || 0);
  }

  toggleChannel(ch) {
    if (ch === 'ch1') this.showCH1 = !this.showCH1;
    if (ch === 'ch2') this.showCH2 = !this.showCH2;
    if (ch === 'sum') this.showSum = !this.showSum;
    if (ch === 'env') this.showEnvelope = !this.showEnvelope;
    this.render(this.lastSimTime || 0);
    return {
      showCH1: this.showCH1,
      showCH2: this.showCH2,
      showSum: this.showSum,
      showEnvelope: this.showEnvelope
    };
  }

  initEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
      this.hoverPoint = { x, y };
      this.render(this.lastSimTime || 0);
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverPoint = null;
      this.render(this.lastSimTime || 0);
    });
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const w = Math.max(100, rect.width);
    const h = Math.max(100, rect.height);
    const dpr = window.devicePixelRatio || 1;
    this.devicePixelRatio = dpr;

    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    this.render(this.lastSimTime || 0);
  }

  render(simTime = 0) {
    this.lastSimTime = simTime;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);

    const dpr = this.devicePixelRatio;
    const pad = {
      top: this.padding.top * dpr,
      right: this.padding.right * dpr,
      bottom: this.padding.bottom * dpr,
      left: this.padding.left * dpr
    };

    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;
    if (pw <= 10 || ph <= 10) return;

    if (this.domainMode === 'spatial') {
      this.renderSpatialCut(ctx, pad, pw, ph, simTime, dpr);
    } else {
      this.renderTimeDomain(ctx, pad, pw, ph, simTime, dpr);
    }
  }

  /**
   * Spatial 1D cut along the array axis (y = 0)
   * Passing through Source 1 (x = -d/2) and Source 2 (x = +d/2)
   */
  renderSpatialCut(ctx, pad, pw, ph, simTime, dpr) {
    const sim = this.sim;
    const lambda = sim.wavelength;
    const d = sim.distanceMeters;

    // View range along X-axis: span symmetric around center, covering at least ±2.5 lambda or 1.5*d
    const spanLambda = Math.max(2.5, (d / lambda) * 1.6 + 0.8);
    const xMin = -spanLambda * lambda;
    const xMax = spanLambda * lambda;
    const xSpan = xMax - xMin;

    const e1x = sim.elem1.x; // -d/2
    const e2x = sim.elem2.x; // +d/2

    const a1 = sim.elem1.amplitude;
    const a2 = sim.elem2.amplitude;
    const alpha1 = (sim.elem1.phaseDeg * Math.PI) / 180;
    const alpha2 = (sim.elem2.phaseDeg * Math.PI) / 180;

    const k = (2 * Math.PI) / lambda;
    const omega = 2 * Math.PI;
    const t = simTime;

    // Voltage scale on Y axis: symmetric from -yMax to +yMax
    const maxTheoretical = Math.max(1.8, Math.ceil((a1 + a2) * 1.25 * 2) / 2);
    const yMax = maxTheoretical;

    // Coordinate transforms
    const worldToCanvasX = (x) => pad.left + ((x - xMin) / xSpan) * pw;
    const canvasToWorldX = (cx) => xMin + ((cx - pad.left) / pw) * xSpan;
    const worldToCanvasY = (v) => pad.top + ph / 2 - (v / yMax) * (ph / 2);
    const canvasToWorldY = (cy) => ((pad.top + ph / 2 - cy) / (ph / 2)) * yMax;

    // 1. Draw Oscilloscope Engineering Graticule
    this.drawGraticule(ctx, pad, pw, ph, xMin, xMax, yMax, lambda, dpr, 'meters');

    // 2. Physical Source Markers & Distance Span
    this.drawSourceLocationPins(ctx, pad, pw, ph, e1x, e2x, worldToCanvasX, dpr);

    // Core smoothing to avoid infinite spike at source center
    const coreEps = 0.08 * lambda;

    // Precalculate samples across width
    const numSamples = Math.min(600, Math.floor(pw));
    const ptsX = new Float32Array(numSamples);
    const ptsE1 = new Float32Array(numSamples);
    const ptsE2 = new Float32Array(numSamples);
    const ptsSum = new Float32Array(numSamples);
    const ptsEnv = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const cx = pad.left + (i / (numSamples - 1)) * pw;
      const x = canvasToWorldX(cx);
      ptsX[i] = cx;

      // Distance to source 1 (-d/2) and source 2 (+d/2) along y = 0
      const r1 = Math.sqrt((x - e1x) * (x - e1x) + coreEps * coreEps);
      const r2 = Math.sqrt((x - e2x) * (x - e2x) + coreEps * coreEps);

      // Mild cylindrical decay factor normalized so feed amplitude is A1/A2
      const decay1 = Math.min(1.0, 1.0 / Math.sqrt(1 + (r1 / (0.6 * lambda))));
      const decay2 = Math.min(1.0, 1.0 / Math.sqrt(1 + (r2 / (0.6 * lambda))));

      // Field from Source 1
      const v1 = a1 * decay1 * Math.cos(omega * t - k * r1 + alpha1);
      // Field from Source 2
      const v2 = a2 * decay2 * Math.cos(omega * t - k * r2 + alpha2);

      // Local phase difference
      const phaseDiff = (alpha2 - k * r2) - (alpha1 - k * r1);

      // Envelope amplitude
      const amp1 = a1 * decay1;
      const amp2 = a2 * decay2;
      const env = Math.sqrt(Math.max(0, amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos(phaseDiff)));

      ptsE1[i] = v1;
      ptsE2[i] = v2;
      ptsSum[i] = v1 + v2;
      ptsEnv[i] = env;
    }

    // 3. Draw Envelope Bounds (dashed)
    if (this.showEnvelope) {
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1.25 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);

      // Upper envelope
      ctx.beginPath();
      for (let i = 0; i < numSamples; i++) {
        const cy = worldToCanvasY(ptsEnv[i]);
        if (i === 0) ctx.moveTo(ptsX[i], cy);
        else ctx.lineTo(ptsX[i], cy);
      }
      ctx.stroke();

      // Lower envelope
      ctx.beginPath();
      for (let i = 0; i < numSamples; i++) {
        const cy = worldToCanvasY(-ptsEnv[i]);
        if (i === 0) ctx.moveTo(ptsX[i], cy);
        else ctx.lineTo(ptsX[i], cy);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 4. Draw CH1 Trace (Source 1: Scientific Blue)
    if (this.showCH1) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6'; // IEEE / MATLAB Blue
      ctx.lineWidth = 1.75 * dpr;
      ctx.beginPath();
      for (let i = 0; i < numSamples; i++) {
        const cy = worldToCanvasY(ptsE1[i]);
        if (i === 0) ctx.moveTo(ptsX[i], cy);
        else ctx.lineTo(ptsX[i], cy);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 5. Draw CH2 Trace (Source 2: Scientific Orange)
    if (this.showCH2) {
      ctx.save();
      ctx.strokeStyle = '#f97316'; // IEEE / MATLAB Orange
      ctx.lineWidth = 1.75 * dpr;
      ctx.beginPath();
      for (let i = 0; i < numSamples; i++) {
        const cy = worldToCanvasY(ptsE2[i]);
        if (i === 0) ctx.moveTo(ptsX[i], cy);
        else ctx.lineTo(ptsX[i], cy);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 6. Draw Total Superposition Trace (Emerald / Mint)
    if (this.showSum) {
      ctx.save();
      ctx.strokeStyle = '#10b981'; // Precision Emerald
      ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath();
      for (let i = 0; i < numSamples; i++) {
        const cy = worldToCanvasY(ptsSum[i]);
        if (i === 0) ctx.moveTo(ptsX[i], cy);
        else ctx.lineTo(ptsX[i], cy);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 7. Interactive Hover Cursor & Real-time Inspection
    if (this.hoverPoint) {
      const { x: hx, y: hy } = this.hoverPoint;
      if (hx >= pad.left && hx <= pad.left + pw && hy >= pad.top && hy <= pad.top + ph) {
        const cursorWorldX = canvasToWorldX(hx);
        const r1 = Math.sqrt((cursorWorldX - e1x) * (cursorWorldX - e1x) + coreEps * coreEps);
        const r2 = Math.sqrt((cursorWorldX - e2x) * (cursorWorldX - e2x) + coreEps * coreEps);
        const decay1 = Math.min(1.0, 1.0 / Math.sqrt(1 + (r1 / (0.6 * lambda))));
        const decay2 = Math.min(1.0, 1.0 / Math.sqrt(1 + (r2 / (0.6 * lambda))));
        const curE1 = a1 * decay1 * Math.cos(omega * t - k * r1 + alpha1);
        const curE2 = a2 * decay2 * Math.cos(omega * t - k * r2 + alpha2);
        const curSum = curE1 + curE2;
        const curDiff = (alpha2 - k * r2) - (alpha1 - k * r1);
        const amp1 = a1 * decay1;
        const amp2 = a2 * decay2;
        const curEnv = Math.sqrt(Math.max(0, amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos(curDiff)));

        this.drawHoverCursor(ctx, pad, pw, ph, hx, cursorWorldX, curE1, curE2, curSum, curEnv, lambda, dpr, worldToCanvasY);
      }
    }
  }

  /**
   * Time-domain oscilloscope waveform of Source 1 and Source 2 excitations
   */
  renderTimeDomain(ctx, pad, pw, ph, simTime, dpr) {
    const sim = this.sim;
    const a1 = sim.elem1.amplitude;
    const a2 = sim.elem2.amplitude;
    const alpha1 = (sim.elem1.phaseDeg * Math.PI) / 180;
    const alpha2 = (sim.elem2.phaseDeg * Math.PI) / 180;
    const deltaPhi = sim.elem2.phaseDeg;

    const yMax = Math.max(1.8, Math.ceil((a1 + a2) * 1.25 * 2) / 2);
    const worldToCanvasY = (v) => pad.top + ph / 2 - (v / yMax) * (ph / 2);

    // Number of periods shown: 2 complete cycles (0 to 4*PI)
    const omega = 2 * Math.PI;
    const tSpan = 2.0; // 2 normalized RF periods

    // 1. Graticule
    this.drawGraticuleTime(ctx, pad, pw, ph, yMax, dpr);

    const numSamples = Math.min(600, Math.floor(pw));
    const ptsX = new Float32Array(numSamples);
    const ptsE1 = new Float32Array(numSamples);
    const ptsE2 = new Float32Array(numSamples);
    const ptsSum = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const cx = pad.left + (i / (numSamples - 1)) * pw;
      const tNorm = (i / (numSamples - 1)) * tSpan;
      ptsX[i] = cx;

      // Real excitation signals
      const s1 = a1 * Math.cos(omega * tNorm + alpha1);
      const s2 = a2 * Math.cos(omega * tNorm + alpha2);

      ptsE1[i] = s1;
      ptsE2[i] = s2;
      ptsSum[i] = s1 + s2;
    }

    // 2. Traces
    if (this.showCH1) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.75 * dpr;
      ctx.beginPath();
      for (let i = 0; i < numSamples; i++) {
        const cy = worldToCanvasY(ptsE1[i]);
        if (i === 0) ctx.moveTo(ptsX[i], cy);
        else ctx.lineTo(ptsX[i], cy);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (this.showCH2) {
      ctx.save();
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 1.75 * dpr;
      ctx.beginPath();
      for (let i = 0; i < numSamples; i++) {
        const cy = worldToCanvasY(ptsE2[i]);
        if (i === 0) ctx.moveTo(ptsX[i], cy);
        else ctx.lineTo(ptsX[i], cy);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (this.showSum) {
      ctx.save();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath();
      for (let i = 0; i < numSamples; i++) {
        const cy = worldToCanvasY(ptsSum[i]);
        if (i === 0) ctx.moveTo(ptsX[i], cy);
        else ctx.lineTo(ptsX[i], cy);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Annotation
    ctx.save();
    ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText(`Δφ = ${deltaPhi > 0 ? '+' : ''}${deltaPhi}°  |  A₂/A₁ = ${(a2 / (a1 || 1)).toFixed(2)}`, pad.left + pw - 6 * dpr, pad.top + 14 * dpr);
    ctx.restore();
  }

  drawGraticule(ctx, pad, pw, ph, xMin, xMax, yMax, lambda, dpr) {
    ctx.save();

    // Dark solid engineering plot background
    ctx.fillStyle = '#070c17';
    ctx.fillRect(pad.left, pad.top, pw, ph);

    // Graticule boundary border
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(pad.left, pad.top, pw, ph);

    // Center Zero line (E = 0)
    const centerY = pad.top + ph / 2;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.25 * dpr;
    ctx.beginPath();
    ctx.moveTo(pad.left, centerY);
    ctx.lineTo(pad.left + pw, centerY);
    ctx.stroke();

    // Horizontal Voltage grid lines (±0.5, ±1.0, etc.)
    const vStep = yMax <= 2 ? 0.5 : 1.0;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1 * dpr;
    ctx.font = `${9.5 * dpr}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let v = -yMax; v <= yMax; v += vStep) {
      if (Math.abs(v) < 1e-4) continue; // Skip zero line
      const cy = centerY - (v / yMax) * (ph / 2);
      ctx.beginPath();
      ctx.moveTo(pad.left, cy);
      ctx.lineTo(pad.left + pw, cy);
      ctx.stroke();

      ctx.fillText(`${v > 0 ? '+' : ''}${v.toFixed(1)}`, pad.left - 6 * dpr, cy);
    }
    // Zero label
    ctx.fillText('0.0', pad.left - 6 * dpr, centerY);

    // Vertical spatial grid lines every 0.5 lambda or 1.0 lambda
    const xSpan = xMax - xMin;
    const lStep = xSpan / lambda > 6 ? 1.0 : 0.5;
    const lMin = Math.ceil(xMin / (lStep * lambda)) * lStep;
    const lMax = Math.floor(xMax / (lStep * lambda)) * lStep;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let l = lMin; l <= lMax; l += lStep) {
      const xMeters = l * lambda;
      const cx = pad.left + ((xMeters - xMin) / xSpan) * pw;

      if (cx < pad.left + 5 || cx > pad.left + pw - 5) continue;

      ctx.strokeStyle = Math.abs(l) < 1e-4 ? '#24324a' : '#0e1626';
      ctx.beginPath();
      ctx.moveTo(cx, pad.top);
      ctx.lineTo(cx, pad.top + ph);
      ctx.stroke();

      const label = Math.abs(l) < 1e-4 ? '0' : `${l > 0 ? '+' : ''}${l.toFixed(1)}λ`;
      ctx.fillStyle = '#64748b';
      ctx.fillText(label, cx, pad.top + ph + 5 * dpr);
    }

    // Y-Axis Unit Header
    ctx.save();
    ctx.font = `${9 * dpr}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'left';
    ctx.fillText('E (V/m)', pad.left + 6 * dpr, pad.top + 12 * dpr);
    ctx.restore();

    ctx.restore();
  }

  drawGraticuleTime(ctx, pad, pw, ph, yMax, dpr) {
    ctx.save();
    ctx.fillStyle = '#070c17';
    ctx.fillRect(pad.left, pad.top, pw, ph);

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(pad.left, pad.top, pw, ph);

    const centerY = pad.top + ph / 2;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.25 * dpr;
    ctx.beginPath();
    ctx.moveTo(pad.left, centerY);
    ctx.lineTo(pad.left + pw, centerY);
    ctx.stroke();

    // Time cycle grid (0, T/2, T, 3T/2, 2T)
    const divisions = 8;
    ctx.strokeStyle = '#0e1626';
    ctx.lineWidth = 1 * dpr;
    ctx.font = `${9.5 * dpr}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let i = 0; i <= divisions; i++) {
      const cx = pad.left + (i / divisions) * pw;
      ctx.beginPath();
      ctx.moveTo(cx, pad.top);
      ctx.lineTo(cx, pad.top + ph);
      ctx.stroke();

      const periodFrac = i / 4;
      ctx.fillText(`${periodFrac}T`, cx, pad.top + ph + 5 * dpr);
    }

    ctx.restore();
  }

  drawSourceLocationPins(ctx, pad, pw, ph, e1x, e2x, worldToCanvasX, dpr) {
    ctx.save();
    const cx1 = worldToCanvasX(e1x);
    const cx2 = worldToCanvasX(e2x);
    const topY = pad.top;
    const botY = pad.top + ph;

    // Pin line 1 (Source 1 @ -d/2, Blue)
    if (cx1 >= pad.left && cx1 <= pad.left + pw) {
      ctx.beginPath();
      ctx.moveTo(cx1, topY);
      ctx.lineTo(cx1, botY);
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.45)';
      ctx.lineWidth = 1.25 * dpr;
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      ctx.stroke();

      // Pin badge at top
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(cx1, topY + 8 * dpr, 3.5 * dpr, 0, 2 * Math.PI);
      ctx.fill();

      ctx.font = `bold ${8.5 * dpr}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = '#60a5fa';
      ctx.textAlign = 'center';
      ctx.fillText('S1 (-d/2)', cx1, topY + 18 * dpr);
    }

    // Pin line 2 (Source 2 @ +d/2, Orange)
    if (cx2 >= pad.left && cx2 <= pad.left + pw) {
      ctx.beginPath();
      ctx.moveTo(cx2, topY);
      ctx.lineTo(cx2, botY);
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.45)';
      ctx.lineWidth = 1.25 * dpr;
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      ctx.stroke();

      // Pin badge at top
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(cx2, topY + 8 * dpr, 3.5 * dpr, 0, 2 * Math.PI);
      ctx.fill();

      ctx.font = `bold ${8.5 * dpr}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = '#fb923c';
      ctx.textAlign = 'center';
      ctx.fillText('S2 (+d/2)', cx2, topY + 18 * dpr);
    }

    // Distance separation indicator span between S1 and S2
    if (cx1 >= pad.left && cx2 <= pad.left + pw && Math.abs(cx2 - cx1) > 20 * dpr) {
      const spanY = pad.top + 32 * dpr;
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx1, spanY);
      ctx.lineTo(cx2, spanY);
      // Arrow ticks
      ctx.moveTo(cx1, spanY - 3 * dpr);
      ctx.lineTo(cx1, spanY + 3 * dpr);
      ctx.moveTo(cx2, spanY - 3 * dpr);
      ctx.lineTo(cx2, spanY + 3 * dpr);
      ctx.stroke();

      ctx.font = `${8.5 * dpr}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'center';
      ctx.fillText(`d = ${(this.sim.distanceMeters).toFixed(2)}m`, (cx1 + cx2) / 2, spanY - 3 * dpr);
    }

    ctx.restore();
  }

  drawHoverCursor(ctx, pad, pw, ph, hx, cursorWorldX, curE1, curE2, curSum, curEnv, lambda, dpr, worldToCanvasY) {
    ctx.save();

    // Vertical cursor line
    ctx.beginPath();
    ctx.moveTo(hx, pad.top);
    ctx.lineTo(hx, pad.top + ph);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([2 * dpr, 2 * dpr]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dots at intersection on active traces
    if (this.showCH1) {
      const cy1 = worldToCanvasY(curE1);
      ctx.beginPath();
      ctx.arc(hx, cy1, 3.5 * dpr, 0, 2 * Math.PI);
      ctx.fillStyle = '#3b82f6';
      ctx.fill();
    }
    if (this.showCH2) {
      const cy2 = worldToCanvasY(curE2);
      ctx.beginPath();
      ctx.arc(hx, cy2, 3.5 * dpr, 0, 2 * Math.PI);
      ctx.fillStyle = '#f97316';
      ctx.fill();
    }
    if (this.showSum) {
      const cys = worldToCanvasY(curSum);
      ctx.beginPath();
      ctx.arc(hx, cys, 4.5 * dpr, 0, 2 * Math.PI);
      ctx.fillStyle = '#10b981';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1 * dpr;
      ctx.stroke();
    }

    // Floating Tooltip Card
    const tipW = 160 * dpr;
    const tipH = 72 * dpr;
    let tipX = hx + 12 * dpr;
    if (tipX + tipW > pad.left + pw) tipX = hx - tipW - 12 * dpr;
    const tipY = Math.max(pad.top + 6 * dpr, Math.min(pad.top + ph - tipH - 6 * dpr, pad.top + 10 * dpr));

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.roundRect(tipX, tipY, tipW, tipH, 6 * dpr);
    ctx.fill();
    ctx.stroke();

    // Text rows
    const xLambda = (cursorWorldX / lambda).toFixed(2);
    ctx.font = `bold ${9 * dpr}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.fillText(`x = ${(cursorWorldX).toFixed(2)} m (${xLambda}λ)`, tipX + 8 * dpr, tipY + 14 * dpr);

    ctx.font = `${8.5 * dpr}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(`E₁: ${curE1 >= 0 ? '+' : ''}${curE1.toFixed(2)} V/m`, tipX + 8 * dpr, tipY + 28 * dpr);

    ctx.fillStyle = '#fb923c';
    ctx.fillText(`E₂: ${curE2 >= 0 ? '+' : ''}${curE2.toFixed(2)} V/m`, tipX + 8 * dpr, tipY + 42 * dpr);

    ctx.font = `bold ${9 * dpr}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#34d399';
    ctx.fillText(`Σ E: ${curSum >= 0 ? '+' : ''}${curSum.toFixed(2)} V/m`, tipX + 8 * dpr, tipY + 58 * dpr);

    ctx.restore();
  }
}
