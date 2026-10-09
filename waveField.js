/**
 * 2D Electromagnetic Field & RF Power Density Simulator
 * Visualizes Near-Field, Fresnel Radiating Zone, and Fraunhofer Far-Field.
 * Supports interactive zoom (in/out), panning, RF power density, and zone boundaries.
 */

export class WaveFieldRenderer {
  constructor(canvas, simulator, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sim = simulator;

    // View & Display Modes
    this.displayMode = options.displayMode ?? 'density'; // 'density' (RF Power Density |E|^2) or 'wave' (Instantaneous E-field)
    this.colorTheme = options.colorTheme ?? (this.displayMode === 'wave' ? 'cyberpunk' : 'turbo');
    this.showBoundaries = options.showBoundaries ?? true;
    this.showElements = true;
    this.isPlaying = true;

    // Simulation timing: fixed to 0.5x speed for smooth realistic wave ripples
    this.simTime = 0;
    this.timeSpeed = 0.5; // Fixed 0.5x speed
    this.lastTimestamp = performance.now();
    this.animationFrameId = null;

    // Zoom & Pan state
    this.zoomLevel = 0.5; // 0.5 = Far-field view (~8 lambda), 1.0 = Mid view (~4 lambda), 2.5 = Near-field (~1.5 lambda)
    this.panX = 0; // offset in meters
    this.panY = 0; // offset in meters
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.hoverPos = null; // { xMeters, yMeters, rMeters, zone, valDb }

    // Simulation grid dimensions for silky 60fps performance
    this.simWidth = 200;
    this.simHeight = 200;

    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.simWidth;
    this.offscreenCanvas.height = this.simHeight;
    this.offCtx = this.offscreenCanvas.getContext('2d');
    this.imgData = this.offCtx.createImageData(this.simWidth, this.simHeight);
    this.cachedPattern = null;

    this.initEvents();
    this.initLoop();
  }

  setPattern(pattern) {
    this.cachedPattern = pattern;
  }

  setSimulator(sim) {
    this.sim = sim;
  }

  setDisplayMode(mode) {
    this.displayMode = mode;
  }

  setColorTheme(theme) {
    this.colorTheme = theme;
  }

  setShowBoundaries(val) {
    this.showBoundaries = val;
  }

  setShowElements(val) {
    this.showElements = val;
  }

  setSpeed(speed) {
    this.timeSpeed = Math.max(0, speed);
  }

  togglePlay() {
    this.isPlaying = !this.isPlaying;
    return this.isPlaying;
  }

  // Zoom controls
  zoomIn() {
    this.zoomLevel = Math.min(4.0, this.zoomLevel * 1.35);
  }

  zoomOut() {
    this.zoomLevel = Math.max(0.12, this.zoomLevel / 1.35);
  }

  setPresetView(view) {
    if (view === 'near') {
      this.zoomLevel = 2.0; // zoom into antenna reactive near-field
      this.panX = 0;
      this.panY = 0;
    } else if (view === 'mid') {
      this.zoomLevel = 1.0; // Fresnel zone
      this.panX = 0;
      this.panY = 0;
    } else if (view === 'far') {
      this.zoomLevel = 0.35; // Fraunhofer far-field lobes
      this.panX = 0;
      this.panY = 0;
    } else {
      this.zoomLevel = 0.5;
      this.panX = 0;
      this.panY = 0;
    }
  }

  initEvents() {
    // Mouse wheel zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.max(0.1, Math.min(5.0, this.zoomLevel * zoomFactor));
      this.zoomLevel = newZoom;
    }, { passive: false });

    // Drag to pan
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const baseSpanY = 4.0 * this.sim.wavelength;
      const fieldSpanY = baseSpanY / this.zoomLevel;
      const metersPerPx = fieldSpanY / rect.height;

      if (this.isDragging) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.dragStart = { x: e.clientX, y: e.clientY };

        this.panX += dx * metersPerPx;
        this.panY -= dy * metersPerPx;
      }

      // Track hover point in physical meters
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const xMeters = (mouseX - centerX) * metersPerPx - this.panX;
      const yMeters = (centerY - mouseY) * metersPerPx - this.panY;
      const rMeters = Math.sqrt(xMeters * xMeters + yMeters * yMeters);

      const zones = this.getZoneBoundaries();
      let zoneName = 'Fraunhofer Far-Field';
      if (rMeters < zones.rReactive) zoneName = 'Reactive Near-Field';
      else if (rMeters < zones.rFar) zoneName = 'Radiating Near-Field (Fresnel)';

      this.hoverPos = {
        mouseX,
        mouseY,
        xMeters,
        yMeters,
        rMeters,
        zoneName
      };
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
      this.hoverPos = null;
    });

    // Double click to reset zoom & pan
    this.canvas.addEventListener('dblclick', () => {
      this.setPresetView('default');
    });
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const w = rect.width > 50 ? rect.width : 800;
    const h = rect.height > 50 ? rect.height : 570;
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    // Maintain 1:1 isometric square pixels in offscreen buffer matching canvas aspect ratio
    const simH = 180;
    const aspect = w / h;
    const simW = Math.max(120, Math.round(simH * aspect));

    if (this.simWidth !== simW || this.simHeight !== simH) {
      this.simWidth = simW;
      this.simHeight = simH;
      this.offscreenCanvas.width = simW;
      this.offscreenCanvas.height = simH;
      this.imgData = this.offCtx.createImageData(simW, simH);
    }
  }

  getZoneBoundaries() {
    const lambda = this.sim.wavelength;
    const D = Math.max(0.1, this.sim.distanceMeters); // array aperture size

    // Reactive near-field boundary: r < lambda / (2*pi)
    const rReactive = lambda / (2 * Math.PI);

    // Fresnel / Radiating near-field to Fraunhofer far-field boundary:
    // r_far = 2*D^2 / lambda (standard IEEE antenna definition).
    // For small arrays (D < lambda), minimum far-field is ~ 2 * lambda
    const rFar = Math.max(2.0 * lambda, (2 * D * D) / lambda);

    return { rReactive, rFar, D, lambda };
  }

  initLoop() {
    const loop = (now) => {
      const dt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;

      if (this.isPlaying && this.displayMode === 'wave') {
        const visualFreq = 1.8 * this.timeSpeed;
        this.simTime += dt * visualFreq;
      }

      this.renderFrame();
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  renderFrame() {
    const sim = this.sim;
    const w = this.simWidth;
    const h = this.simHeight;
    const data = this.imgData.data;

    // Base spatial span: 4 wavelengths vertically at zoom 1.0
    const baseSpanY = 4.0 * sim.wavelength;
    const fieldSpanY = baseSpanY / this.zoomLevel;
    const scale = fieldSpanY / h; // meters per offscreen simulation pixel

    const e1x = sim.elem1.x;
    const e1y = sim.elem1.y;
    const e2x = sim.elem2.x;
    const e2y = sim.elem2.y;

    const a1 = sim.elem1.amplitude;
    const a2 = sim.elem2.amplitude;

    const alpha1 = (sim.elem1.phaseDeg * Math.PI) / 180;
    const alpha2 = (sim.elem2.phaseDeg * Math.PI) / 180;

    const k = (2 * Math.PI) / sim.wavelength;
    const halfW = w / 2;
    const halfH = h / 2;

    const isDensityMode = this.displayMode === 'density';
    const omega = 2 * Math.PI;
    const t = this.simTime;
    const coreEps = 0.08 * sim.wavelength; // smoothing core radius

    let ptr = 0;
    const maxA = Math.max(0.1, a1 + a2);

    for (let py = 0; py < h; py++) {
      // World coordinates in meters: +Y is UP, matching Polar Plot!
      const y = (halfH - py) * scale - this.panY;

      for (let px = 0; px < w; px++) {
        // +X is RIGHT, matching Polar Plot!
        const x = (px - halfW) * scale - this.panX;

        // Distance to Element 1 (-d/2, 0)
        const dx1 = x - e1x;
        const dy1 = y - e1y;
        const r1 = Math.sqrt(dx1 * dx1 + dy1 * dy1 + coreEps * coreEps);

        // Distance to Element 2 (+d/2, 0)
        const dx2 = x - e2x;
        const dy2 = y - e2y;
        const r2 = Math.sqrt(dx2 * dx2 + dy2 * dy2 + coreEps * coreEps);

        const rDist = Math.max(0.4 * sim.wavelength, Math.sqrt(x * x + y * y));
        const decay1 = 1 / Math.sqrt(r1);
        const decay2 = 1 / Math.sqrt(r2);
        const phaseDiff = (alpha2 - k * r2) - (alpha1 - k * r1);

        let intensity = 0;

        if (isDensityMode) {
          // Time-averaged RF Power Density: |E_total|^2
          const e1_mag = a1 * decay1;
          const e2_mag = a2 * decay2;
          const pwr = (e1_mag * e1_mag) + (e2_mag * e2_mag) + (2 * e1_mag * e2_mag * Math.cos(phaseDiff));

          // Range-compensated so beam lobes remain distinct into the far field
          const rangeCompensated = pwr * rDist;
          intensity = Math.min(1.0, Math.max(0, rangeCompensated / (maxA * maxA * 1.8)));
        } else {
          // Instantaneous wave propagation field: E(x, y, t)
          const w1 = a1 * decay1 * Math.cos(omega * t - k * r1 + alpha1);
          const w2 = a2 * decay2 * Math.cos(omega * t - k * r2 + alpha2);

          // Range compensation: multiply by sqrt(rDist) so wavefront amplitude
          // remains steady as waves propagate into the far field
          const rangeComp = Math.sqrt(rDist);
          const totalWave = ((w1 + w2) * rangeComp) / maxA;

          // Local envelope amplitude |E_total_phasor|
          // In null directions, envSq -> 0. In peak lobe directions, envSq -> 1.
          const envSq = Math.max(0, (a1 * a1 + a2 * a2 + 2 * a1 * a2 * Math.cos(phaseDiff))) / (maxA * maxA);
          const env = Math.sqrt(envSq);

          // Modulate instantaneous wave by envelope contrast so null directions are calm/dark,
          // and lobes have crisp, surging ripples matching the 2D polar plot!
          const envWeight = Math.min(1.2, Math.pow(env, 0.65));
          intensity = Math.max(-1, Math.min(1, totalWave * envWeight));
        }

        // Color LUT mapping
        const { r, g, b } = this.mapColor(intensity, isDensityMode);

        data[ptr++] = r;
        data[ptr++] = g;
        data[ptr++] = b;
        data[ptr++] = 255;
      }
    }

    this.offCtx.putImageData(this.imgData, 0, 0);

    // Blit smoothly to main canvas
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    if (cw === 0 || ch === 0) return;

    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.offscreenCanvas, 0, 0, cw, ch);

    // Draw Vector Overlays (Boundaries, Antennas, Distance scale bar, Beam guides)
    this.drawOverlays(ctx, cw, ch, fieldSpanY);
  }

  mapColor(val, isDensity) {
    if (isDensity) {
      // Thermal / Turbo colormap for RF Power Density
      const t = Math.max(0, Math.min(1, val));
      if (this.colorTheme === 'turbo') {
        // Dark Navy -> Electric Blue -> Green -> Orange/Yellow -> Red/White
        let r = 0, g = 0, b = 0;
        if (t < 0.25) {
          const f = t / 0.25;
          r = Math.floor(6 + 10 * f);
          g = Math.floor(14 + 100 * f);
          b = Math.floor(35 + 200 * f);
        } else if (t < 0.5) {
          const f = (t - 0.25) / 0.25;
          r = Math.floor(16 + 10 * f);
          g = Math.floor(114 + 120 * f);
          b = Math.floor(235 - 120 * f);
        } else if (t < 0.75) {
          const f = (t - 0.5) / 0.25;
          r = Math.floor(26 + 210 * f);
          g = Math.floor(234 + 10 * f);
          b = Math.floor(115 - 100 * f);
        } else {
          const f = (t - 0.75) / 0.25;
          r = Math.floor(236 + 19 * f);
          g = Math.floor(244 - 150 * f);
          b = Math.floor(15 + 160 * f);
        }
        return { r, g, b };
      } else {
        // Cyberpunk Density: Dark Blue -> Cyan -> Purple -> Hot Pink
        let r = 0, g = 0, b = 0;
        if (t < 0.5) {
          const f = t / 0.5;
          r = Math.floor(10 + 20 * f);
          g = Math.floor(25 + 210 * f);
          b = Math.floor(50 + 205 * f);
        } else {
          const f = (t - 0.5) / 0.5;
          r = Math.floor(30 + 215 * f);
          g = Math.floor(235 - 180 * f);
          b = Math.floor(255 - 80 * f);
        }
        return { r, g, b };
      }
    } else {
      // Wave mode: positive field cyan, negative field magenta
      const v = Math.max(-1, Math.min(1, val));
      if (v >= 0) {
        return {
          r: Math.floor(10 + 20 * v),
          g: Math.floor(20 + 225 * v),
          b: Math.floor(40 + 215 * v)
        };
      } else {
        const nv = -v;
        return {
          r: Math.floor(10 + 235 * nv),
          g: Math.floor(20 + 40 * nv),
          b: Math.floor(40 + 170 * nv)
        };
      }
    }
  }

  drawOverlays(ctx, cw, ch, fieldSpanY) {
    const dpr = window.devicePixelRatio || 1;
    const pxPerMeter = ch / fieldSpanY;
    const centerX = cw / 2 + this.panX * pxPerMeter;
    const centerY = ch / 2 - this.panY * pxPerMeter;

    ctx.save();

    // 1. Draw Near-Field vs Far-Field Boundary Circles
    if (this.showBoundaries) {
      const zones = this.getZoneBoundaries();

      // Reactive Near-Field Boundary (rReactive)
      const rReactPx = zones.rReactive * pxPerMeter;
      if (rReactPx > 4 && rReactPx < cw * 1.5) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, rReactPx, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)'; // Cyan dashed
        ctx.lineWidth = 1.5 * dpr;
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.stroke();

        ctx.font = `${9.5 * dpr}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = '#06b6d4';
        ctx.textAlign = 'left';
        ctx.fillText(`Reactive Near-Field (r = ${(zones.rReactive).toFixed(2)} m)`, centerX + rReactPx + 6 * dpr, centerY - 6 * dpr);
      }

      // Fraunhofer Far-Field Boundary (rFar)
      const rFarPx = zones.rFar * pxPerMeter;
      if (rFarPx > 8 && rFarPx < cw * 2.5) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, rFarPx, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)'; // Amber dashed
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([6 * dpr, 5 * dpr]);
        ctx.stroke();

        ctx.font = `bold ${10 * dpr}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = '#f59e0b';
        ctx.textAlign = 'left';
        ctx.fillText(`Fraunhofer Far-Field Boundary (r = ${(zones.rFar).toFixed(2)} m)`, centerX + rFarPx + 8 * dpr, centerY - 8 * dpr);
      }

      ctx.setLineDash([]);
    }

    // 2. Draw Main Beam Direction Ray & Far-Field Polar Silhouette
    if (this.cachedPattern && this.cachedPattern.metrics) {
      this.drawBeamGuidance(ctx, centerX, centerY, pxPerMeter, dpr);
    }

    // 3. Draw Antenna Elements & Separation Vector
    if (this.showElements) {
      const e1X = centerX + this.sim.elem1.x * pxPerMeter;
      const e1Y = centerY - this.sim.elem1.y * pxPerMeter;
      const e2X = centerX + this.sim.elem2.x * pxPerMeter;
      const e2Y = centerY - this.sim.elem2.y * pxPerMeter;

      // Connecting dashed line
      ctx.beginPath();
      ctx.moveTo(e1X, e1Y);
      ctx.lineTo(e2X, e2Y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Element 1 (Cyan circle, -X side)
      this.drawAntennaDot(ctx, e1X, e1Y, '#06b6d4', 'E₁', dpr);

      // Element 2 (Pink circle, +X side)
      this.drawAntennaDot(ctx, e2X, e2Y, '#ec4899', 'E₂', dpr);

      // Distance tag
      ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`d = ${(this.sim.distanceMeters).toFixed(3)} m`, (e1X + e2X) / 2, centerY - 14 * dpr);

      // Axis direction indicators along array line (positioned comfortably outward)
      const offsetDist = Math.max(Math.abs(e2X - centerX), 22 * dpr) + 16 * dpr;
      ctx.font = `${9.5 * dpr}px 'Outfit', sans-serif`;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
      ctx.textAlign = 'left';
      ctx.fillText('+X Front →', centerX + offsetDist, centerY + 3.5 * dpr);
      ctx.textAlign = 'right';
      ctx.fillText('← -X Back', centerX - offsetDist, centerY + 3.5 * dpr);
    }

    // 4. Physical Distance Scale Bar in lower-left corner
    this.drawScaleBar(ctx, cw, ch, pxPerMeter, dpr);

    // 5. Hover Inspector Overlay
    if (this.hoverPos) {
      this.drawHoverBadge(ctx, this.hoverPos, dpr);
    }

    ctx.restore();
  }

  drawBeamGuidance(ctx, cx, cy, pxPerMeter, dpr) {
    const m = this.cachedPattern.metrics;
    if (!m || m.mainBeamAngleDeg === undefined) return;

    ctx.save();

    // 1. Sleek Main Beam Direction Ray
    const beamAngleDeg = m.mainBeamAngleDeg;
    const beamAngleRad = (beamAngleDeg * Math.PI) / 180;
    const rayLen = Math.max(90 * dpr, 4.5 * this.sim.wavelength * pxPerMeter);

    const endX = cx + rayLen * Math.cos(beamAngleRad);
    const endY = cy - rayLen * Math.sin(beamAngleRad);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)'; // Amber gold dashed ray
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead
    const arrowLen = 9 * dpr;
    const a1Angle = beamAngleRad + Math.PI - 0.38;
    const a2Angle = beamAngleRad + Math.PI + 0.38;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX + arrowLen * Math.cos(a1Angle), endY - arrowLen * Math.sin(a1Angle));
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX + arrowLen * Math.cos(a2Angle), endY - arrowLen * Math.sin(a2Angle));
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();

    // Beam label badge
    ctx.font = `bold ${10 * dpr}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#f59e0b';
    const isRight = Math.cos(beamAngleRad) >= 0;
    ctx.textAlign = isRight ? 'left' : 'right';
    const tagOffset = 10 * dpr;
    ctx.fillText(
      `Main Beam: ${beamAngleDeg}°`,
      endX + (isRight ? tagOffset : -tagOffset),
      endY - 4 * dpr
    );

    // 2. Translucent Far-Field Polar Pattern Silhouette (physical scale 2.2 * lambda)
    const silR = Math.max(35 * dpr, 2.2 * this.sim.wavelength * pxPerMeter);
    const { angles, normField, numPoints } = this.cachedPattern;
    if (angles && normField && numPoints) {
      ctx.beginPath();
      for (let i = 0; i <= numPoints; i++) {
        const idx = i % numPoints;
        const phi = angles[idx];
        const nf = normField[idx];
        const r = silR * nf;
        const px = cx + r * Math.cos(phi);
        const py = cy - r * Math.sin(phi);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.06)'; // Subtle cyan glow
      ctx.fill();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1.2 * dpr;
      ctx.setLineDash([3 * dpr, 3 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  drawAntennaDot(ctx, x, y, color, label, dpr) {
    ctx.beginPath();
    ctx.arc(x, y, 6 * dpr, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 * dpr;
    ctx.stroke();

    ctx.font = `bold ${10 * dpr}px 'Outfit', sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + 16 * dpr);
  }

  drawScaleBar(ctx, cw, ch, pxPerMeter, dpr) {
    // Choose nice round metric distance: 1m, 2m, 5m, 10m, 20m
    const targetPx = 100 * dpr;
    const approxMeters = targetPx / pxPerMeter;
    const niceMeters = [0.5, 1, 2, 5, 10, 20, 50].find(m => m >= approxMeters * 0.7) || 10;
    const barWidthPx = niceMeters * pxPerMeter;

    const bx = 20 * dpr;
    const by = ch - 22 * dpr;

    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + barWidthPx, by);
    ctx.moveTo(bx, by - 4 * dpr);
    ctx.lineTo(bx, by + 4 * dpr);
    ctx.moveTo(bx + barWidthPx, by - 4 * dpr);
    ctx.lineTo(bx + barWidthPx, by + 4 * dpr);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();

    ctx.font = `${10 * dpr}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${niceMeters} m`, bx + barWidthPx / 2, by - 6 * dpr);
  }

  drawHoverBadge(ctx, hover, dpr) {
    const { mouseX, mouseY, xMeters, yMeters, rMeters, zoneName } = hover;
    const px = mouseX * dpr;
    const py = mouseY * dpr;

    const line1 = `Pos: (${xMeters.toFixed(2)}m, ${yMeters.toFixed(2)}m) | r = ${rMeters.toFixed(2)}m (${(rMeters / this.sim.wavelength).toFixed(2)}λ)`;
    const line2 = `Zone: ${zoneName}`;

    ctx.font = `${9.5 * dpr}px 'JetBrains Mono', monospace`;
    const w1 = ctx.measureText(line1).width;
    const w2 = ctx.measureText(line2).width;
    const boxW = Math.max(w1, w2) + 16 * dpr;
    const boxH = 36 * dpr;

    let bx = px + 12 * dpr;
    let by = py - boxH - 10 * dpr;
    if (bx + boxW > this.canvas.width - 10 * dpr) bx = px - boxW - 12 * dpr;
    if (by < 10 * dpr) by = py + 14 * dpr;

    ctx.fillStyle = 'rgba(6, 11, 22, 0.92)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1 * dpr;
    ctx.strokeRect(bx, by, boxW, boxH);
    ctx.fillRect(bx, by, boxW, boxH);

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(line1, bx + 8 * dpr, by + 6 * dpr);

    ctx.fillStyle = zoneName.includes('Far') ? '#f59e0b' : '#10b981';
    ctx.fillText(line2, bx + 8 * dpr, by + 20 * dpr);
  }
}
