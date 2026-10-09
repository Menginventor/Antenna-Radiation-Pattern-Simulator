/**
 * Main Application Orchestrator
 * Connects UI inputs, presets, reactive state updates and renders across:
 * 1. 2D Polar Plot
 * 2. Engineering Cartesian Plot
 * 3. RF Power Density Field (Near-to-Far zone heatmap with zoom)
 * 4. Instantaneous Wave Field (0.5x fixed propagation speed with interference ripples)
 *
 * Frequency: 145.000 MHz (VHF 2-Meter Band)
 * Source 1: Fixed Reference (A1 = 1.0, alpha1 = 0 deg)
 * Source 2: Variable (A2, alpha2 = Delta phi)
 */

import { AntennaSimulator } from './simulator.js?v=10';
import { PolarPlotRenderer } from './polarPlot.js';
import { WaveFieldRenderer } from './waveField.js?v=10';
import { CartesianPlotRenderer } from './cartesianPlot.js';
import { Wave1DPlotRenderer } from './wave1DPlot.js';

class AntennaApp {
  constructor() {
    this.sim = new AntennaSimulator({
      frequency: 145.0e6, // 145 MHz (VHF)
      dLambda: 0.5
    });

    this.activeTab = 'polar';
    this.scaleMode = 'db';
    this.dynamicRangeDb = 40;
    this.showHPBW = true;

    this.initDOMReferences();
    this.initRenderers();
    this.bindEvents();
    this.updateAll();
  }

  initDOMReferences() {
    // Frequency display
    this.textFreq = document.getElementById('textFreq');
    this.textWavelength = document.getElementById('textWavelength');
    this.textWavenumber = document.getElementById('textWavenumber');

    // Reference Source 1 position display
    this.refSource1Pos = document.getElementById('refSource1Pos');

    // Source 2 (Variable) Inputs & Sliders
    this.inputA2 = document.getElementById('inputA2');
    this.sliderA2 = document.getElementById('sliderA2');
    this.inputPhase2 = document.getElementById('inputPhase2');
    this.sliderPhase2 = document.getElementById('sliderPhase2');

    // Separation Distance
    this.inputDistRatio = document.getElementById('inputDistRatio');
    this.sliderDistRatio = document.getElementById('sliderDistRatio');
    this.distPhysicalLabel = document.getElementById('distPhysicalLabel');

    // Phase difference & beam steering helper
    this.sliderDeltaPhase = document.getElementById('sliderDeltaPhase');
    this.labelDeltaPhase = document.getElementById('labelDeltaPhase');
    this.inputSteerAngle = document.getElementById('inputSteerAngle');
    this.sliderSteerAngle = document.getElementById('sliderSteerAngle');

    // View Options
    this.selectScaleMode = document.getElementById('selectScaleMode');
    this.selectDynamicRange = document.getElementById('selectDynamicRange');
    this.selectCartesianDomain = document.getElementById('selectCartesianDomain');

    // Metrics elements
    this.metricDirectivity = document.getElementById('metricDirectivity');
    this.metricDirectivityLin = document.getElementById('metricDirectivityLin');
    this.metricMainBeam = document.getElementById('metricMainBeam');
    this.metricMainBeamType = document.getElementById('metricMainBeamType');
    this.metricFB = document.getElementById('metricFB');
    this.metricFBSub = document.getElementById('metricFBSub');
    this.metricSLL = document.getElementById('metricSLL');
    this.metricSLLSub = document.getElementById('metricSLLSub');

    // Inspector
    this.inspAngle = document.getElementById('inspAngle');
    this.inspDb = document.getElementById('inspDb');
    this.inspMag = document.getElementById('inspMag');
    this.inspPower = document.getElementById('inspPower');
    this.inspInterf = document.getElementById('inspInterf');
    this.btnToggleAbsPower = document.getElementById('btnToggleAbsPower');
    this.polarDestructiveLegend = document.getElementById('polarDestructiveLegend');

    // Modal
    this.theoryModal = document.getElementById('theoryModal');
    this.btnTheoryModal = document.getElementById('btnTheoryModal');
    this.btnCloseModal = document.getElementById('btnCloseModal');
    this.btnExportImage = document.getElementById('btnExportImage');
  }

  initRenderers() {
    // 1. Polar Plot
    const polarCanvas = document.getElementById('canvasPolar');
    this.polarPlot = new PolarPlotRenderer(polarCanvas, {
      scaleMode: this.scaleMode,
      dynamicRangeDb: this.dynamicRangeDb
    });
    this.polarPlot.onHover((hoverData) => {
      if (hoverData) {
        if (this.inspAngle) this.inspAngle.textContent = `${hoverData.angleDeg}°`;
        if (this.inspDb) this.inspDb.textContent = `${hoverData.db} dB`;
        if (this.inspMag) this.inspMag.textContent = `${hoverData.mag} V/m`;
        if (this.inspPower) this.inspPower.textContent = `${hoverData.absPower} W/m²`;
        if (this.inspInterf) {
          if (hoverData.interferenceType === 'Destructive') {
            this.inspInterf.innerHTML = `<span style="color: #d62728; font-weight: 700;">Destructive (-${hoverData.interferencePct}%)</span>`;
          } else if (hoverData.interferenceType === 'Constructive') {
            this.inspInterf.innerHTML = `<span style="color: #2ca02c; font-weight: 700;">Constructive (+${hoverData.interferencePct}%)</span>`;
          } else {
            this.inspInterf.innerHTML = `<span style="color: #ff7f0e; font-weight: 600;">Baseline P₀</span>`;
          }
        }
      } else {
        if (this.inspAngle) this.inspAngle.textContent = '--°';
        if (this.inspDb) this.inspDb.textContent = '-- dB';
        if (this.inspMag) this.inspMag.textContent = '--';
        if (this.inspPower) this.inspPower.textContent = '-- W/m²';
        if (this.inspInterf) this.inspInterf.textContent = '--';
      }
    });

    // 2. Engineering Cartesian Plot
    const cartCanvas = document.getElementById('canvasCartesian');
    this.cartesianPlot = new CartesianPlotRenderer(cartCanvas, {
      scaleMode: this.scaleMode,
      dynamicRangeDb: this.dynamicRangeDb,
      angleDomain: 'symmetric'
    });

    // 3. Unified 2D Electromagnetic Field & RF Power Density Simulator
    const waveCanvas = document.getElementById('canvasWave');
    this.waveField = new WaveFieldRenderer(waveCanvas, this.sim, {
      displayMode: 'wave',
      colorTheme: 'coolwarm',
      showBoundaries: true,
      timeSpeed: 0.5
    });

    // 4. Dedicated 1D Wave Interference Analyzer (Dual Sources)
    const wave1DCanvas = document.getElementById('canvasWave1D');
    if (wave1DCanvas) {
      this.wave1DPlot = new Wave1DPlotRenderer(wave1DCanvas, this.sim, {
        showCH1: true,
        showCH2: true,
        showSum: true,
        showEnvelope: true,
        domainMode: 'spatial'
      });

      // Synchronize 1D plot animation with 2D wave simulation loop
      this.waveField.onFrame((simTime) => {
        if (this.activeTab === 'wave1d' && this.wave1DPlot) {
          this.wave1DPlot.render(simTime);
        }
      });
    }

    // Initial resize
    setTimeout(() => {
      this.resizeCurrentView();
    }, 50);
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.resizeCurrentView();
    });

    // Source 2 Amplitude
    if (this.sliderA2) {
      this.sliderA2.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.inputA2) this.inputA2.value = val.toFixed(2);
        this.sim.setElement2(val, this.sim.elem2.phaseDeg);
        this.updateAll();
      });
    }
    if (this.inputA2) {
      this.inputA2.addEventListener('change', (e) => {
        const val = Math.max(0, parseFloat(e.target.value) || 0);
        if (this.sliderA2) this.sliderA2.value = val;
        this.sim.setElement2(val, this.sim.elem2.phaseDeg);
        this.updateAll();
      });
    }

    // Source 2 Phase
    if (this.sliderPhase2) {
      this.sliderPhase2.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (this.inputPhase2) this.inputPhase2.value = val;
        this.sim.setElement2(this.sim.elem2.amplitude, val);
        this.syncDeltaPhaseUI();
        this.updateAll();
      });
    }
    if (this.inputPhase2) {
      this.inputPhase2.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10) || 0;
        if (this.sliderPhase2) this.sliderPhase2.value = val;
        this.sim.setElement2(this.sim.elem2.amplitude, val);
        this.syncDeltaPhaseUI();
        this.updateAll();
      });
    }

    // Source 2 Phase Chips
    document.querySelectorAll('[data-e2-phase]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.getAttribute('data-e2-phase'), 10);
        if (this.inputPhase2) this.inputPhase2.value = p;
        if (this.sliderPhase2) this.sliderPhase2.value = p;
        this.sim.setElement2(this.sim.elem2.amplitude, p);
        this.syncDeltaPhaseUI();
        this.updateAll();
      });
    });

    // Separation Distance Ratio
    if (this.sliderDistRatio) {
      this.sliderDistRatio.addEventListener('input', (e) => {
        const ratio = parseFloat(e.target.value);
        if (this.inputDistRatio) this.inputDistRatio.value = ratio.toFixed(2);
        this.sim.setDistanceRatio(ratio);
        this.updateAll();
      });
    }
    if (this.inputDistRatio) {
      this.inputDistRatio.addEventListener('change', (e) => {
        const ratio = Math.max(0.01, parseFloat(e.target.value) || 0.5);
        if (this.sliderDistRatio) this.sliderDistRatio.value = ratio;
        this.sim.setDistanceRatio(ratio);
        this.updateAll();
      });
    }

    // Distance Chips
    document.querySelectorAll('[data-dist]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = parseFloat(btn.getAttribute('data-dist'));
        if (this.inputDistRatio) this.inputDistRatio.value = d.toFixed(2);
        if (this.sliderDistRatio) this.sliderDistRatio.value = d;
        this.sim.setDistanceRatio(d);
        this.updateAll();
      });
    });

    // Direct Delta Phase slider (since Source 1 is fixed at 0 deg, Delta phi = alpha2)
    if (this.sliderDeltaPhase) {
      this.sliderDeltaPhase.addEventListener('input', (e) => {
        const dPhase = parseInt(e.target.value, 10);
        if (this.inputPhase2) this.inputPhase2.value = dPhase;
        if (this.sliderPhase2) this.sliderPhase2.value = dPhase;
        this.sim.setElement2(this.sim.elem2.amplitude, dPhase);
        if (this.labelDeltaPhase) this.labelDeltaPhase.textContent = `${dPhase > 0 ? '+' : ''}${dPhase}°`;
        this.updateAll();
      });
    }

    // Beam Steering Angle helper: Delta phi = -k * d * cos(theta0)
    const updateSteerAngle = (thetaDeg) => {
      thetaDeg = Math.max(0, Math.min(180, Math.round(thetaDeg)));
      if (this.inputSteerAngle) this.inputSteerAngle.value = thetaDeg;
      if (this.sliderSteerAngle) this.sliderSteerAngle.value = thetaDeg;

      const thetaRad = (thetaDeg * Math.PI) / 180;
      // Phase shift: Delta phi = -k * d * cos(theta)
      const kd = (2 * Math.PI) * this.sim.dLambda;
      let dPhaseRad = -kd * Math.cos(thetaRad);
      let dPhaseDeg = Math.round((dPhaseRad * 180) / Math.PI);

      while (dPhaseDeg > 180) dPhaseDeg -= 360;
      while (dPhaseDeg < -180) dPhaseDeg += 360;

      if (this.sliderDeltaPhase) this.sliderDeltaPhase.value = dPhaseDeg;
      if (this.labelDeltaPhase) this.labelDeltaPhase.textContent = `${dPhaseDeg > 0 ? '+' : ''}${dPhaseDeg}°`;

      if (this.inputPhase2) this.inputPhase2.value = dPhaseDeg;
      if (this.sliderPhase2) this.sliderPhase2.value = dPhaseDeg;
      this.sim.setElement2(this.sim.elem2.amplitude, dPhaseDeg);

      this.updateAll();
    };

    if (this.inputSteerAngle) {
      this.inputSteerAngle.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) updateSteerAngle(val);
      });
    }

    if (this.sliderSteerAngle) {
      this.sliderSteerAngle.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) updateSteerAngle(val);
      });
    }

    // Cartesian Domain Selection (-180..+180 or 0..360)
    if (this.selectCartesianDomain) {
      this.selectCartesianDomain.addEventListener('change', (e) => {
        this.cartesianPlot.setAngleDomain(e.target.value);
      });
    }

    // Scale Mode
    if (this.selectScaleMode) {
      this.selectScaleMode.addEventListener('change', (e) => {
        this.setScaleMode(e.target.value);
      });
    }

    // Toggle Absolute Power button
    if (this.btnToggleAbsPower) {
      this.btnToggleAbsPower.addEventListener('click', () => {
        const nextMode = this.scaleMode === 'absPower' ? 'db' : 'absPower';
        this.setScaleMode(nextMode);
      });
    }

    // Dynamic Range
    if (this.selectDynamicRange) {
      this.selectDynamicRange.addEventListener('change', (e) => {
        this.dynamicRangeDb = parseInt(e.target.value, 10);
        this.polarPlot.setDynamicRange(this.dynamicRangeDb);
        this.cartesianPlot.setDynamicRange(this.dynamicRangeDb);
        this.updateAll();
      });
    }

    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Scenario Presets
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const preset = btn.getAttribute('data-preset');
        this.applyPreset(preset);
      });
    });

    // Unified 2D Field Controls (Wave & Density)
    const btnModeWave = document.getElementById('btnModeWave');
    const btnModeDensity = document.getElementById('btnModeDensity');
    const wavePlayBtn = document.getElementById('btnWavePlayPause');
    const waveSpeedBadge = document.getElementById('waveSpeedBadge');

    if (btnModeWave && btnModeDensity) {
      btnModeWave.addEventListener('click', () => {
        btnModeWave.classList.add('active');
        btnModeDensity.classList.remove('active');
        this.waveField.setDisplayMode('wave');
        if (wavePlayBtn) wavePlayBtn.style.display = '';
        if (waveSpeedBadge) waveSpeedBadge.style.display = '';
      });

      btnModeDensity.addEventListener('click', () => {
        btnModeDensity.classList.add('active');
        btnModeWave.classList.remove('active');
        this.waveField.setDisplayMode('density');
        if (wavePlayBtn) wavePlayBtn.style.display = 'none';
        if (waveSpeedBadge) waveSpeedBadge.style.display = 'none';
      });
    }

    const btnWavePlay = document.getElementById('btnWavePlayPause');
    if (btnWavePlay) {
      btnWavePlay.addEventListener('click', () => {
        const playing = this.waveField.togglePlay();
        btnWavePlay.textContent = playing ? 'Pause' : 'Play';
      });
    }

    const btnWaveZoomOut = document.getElementById('btnWaveZoomOut');
    if (btnWaveZoomOut) {
      btnWaveZoomOut.addEventListener('click', () => this.waveField.zoomOut());
    }

    const btnWaveZoomIn = document.getElementById('btnWaveZoomIn');
    if (btnWaveZoomIn) {
      btnWaveZoomIn.addEventListener('click', () => this.waveField.zoomIn());
    }

    const btnWavePresetFar = document.getElementById('btnWavePresetFar');
    if (btnWavePresetFar) {
      btnWavePresetFar.addEventListener('click', () => this.waveField.setPresetView('far'));
    }

    const btnWavePresetMid = document.getElementById('btnWavePresetMid');
    if (btnWavePresetMid) {
      btnWavePresetMid.addEventListener('click', () => this.waveField.setPresetView('mid'));
    }

    const btnWavePresetNear = document.getElementById('btnWavePresetNear');
    if (btnWavePresetNear) {
      btnWavePresetNear.addEventListener('click', () => this.waveField.setPresetView('near'));
    }

    const btnWaveResetView = document.getElementById('btnWaveResetView');
    if (btnWaveResetView) {
      btnWaveResetView.addEventListener('click', () => this.waveField.setPresetView('default'));
    }

    const selectWaveTheme = document.getElementById('selectWaveTheme');
    if (selectWaveTheme) {
      selectWaveTheme.addEventListener('change', (e) => {
        this.waveField.setColorTheme(e.target.value);
      });
    }

    const btnToggleBoundaries = document.getElementById('btnToggleBoundaries');
    if (btnToggleBoundaries) {
      btnToggleBoundaries.addEventListener('click', () => {
        const cur = this.waveField.showBoundaries;
        this.waveField.setShowBoundaries(!cur);
        btnToggleBoundaries.textContent = `Boundaries: ${!cur ? 'ON' : 'OFF'}`;
      });
    }

    // 1D Wave Plot Channel Toggles
    const btnToggleCH1 = document.getElementById('btnToggleCH1');
    if (btnToggleCH1) {
      btnToggleCH1.addEventListener('click', () => {
        const state = this.wave1DPlot?.toggleChannel('ch1');
        btnToggleCH1.classList.toggle('active', state?.showCH1);
      });
    }

    const btnToggleCH2 = document.getElementById('btnToggleCH2');
    if (btnToggleCH2) {
      btnToggleCH2.addEventListener('click', () => {
        const state = this.wave1DPlot?.toggleChannel('ch2');
        btnToggleCH2.classList.toggle('active', state?.showCH2);
      });
    }

    const btnToggleSum = document.getElementById('btnToggleSum');
    if (btnToggleSum) {
      btnToggleSum.addEventListener('click', () => {
        const state = this.wave1DPlot?.toggleChannel('sum');
        btnToggleSum.classList.toggle('active', state?.showSum);
      });
    }

    const btnToggleEnv = document.getElementById('btnToggleEnv');
    if (btnToggleEnv) {
      btnToggleEnv.addEventListener('click', () => {
        const state = this.wave1DPlot?.toggleChannel('env');
        btnToggleEnv.classList.toggle('active', state?.showEnvelope);
      });
    }

    // 1D Domain Selector (Spatial Cut vs Time Waveforms)
    const select1DDomain = document.getElementById('select1DDomain');
    const wave1DSubtitle = document.getElementById('wave1DSubtitle');
    if (select1DDomain) {
      select1DDomain.addEventListener('change', (e) => {
        const mode = e.target.value;
        if (this.wave1DPlot) this.wave1DPlot.setDomainMode(mode);
        if (wave1DSubtitle) {
          wave1DSubtitle.textContent = mode === 'spatial'
            ? 'Spatial Cut along Array Axis (y = 0)'
            : 'Excitation Signals at Feeds: E(t)';
        }
      });
    }

    // Wave Workspace Layout Mode Buttons (Dual 2D+1D, 2D Only, 1D Only)
    const waveWorkspace = document.getElementById('waveWorkspace');
    document.querySelectorAll('.layout-btn[data-layout]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const layout = btn.getAttribute('data-layout');
        document.querySelectorAll('.layout-btn[data-layout]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        if (waveWorkspace) {
          waveWorkspace.classList.remove('layout-2d-only', 'layout-1d-only');
          if (layout === '2d-only') waveWorkspace.classList.add('layout-2d-only');
          else if (layout === '1d-only') waveWorkspace.classList.add('layout-1d-only');
        }

        setTimeout(() => {
          if (this.waveField) this.waveField.resize();
          if (this.wave1DPlot) this.wave1DPlot.resize();
        }, 30);
      });
    });

    // Theory Modal
    if (this.btnTheoryModal && this.theoryModal) {
      this.btnTheoryModal.addEventListener('click', () => {
        this.theoryModal.classList.add('open');
      });
    }
    if (this.btnCloseModal && this.theoryModal) {
      this.btnCloseModal.addEventListener('click', () => {
        this.theoryModal.classList.remove('open');
      });
    }
    if (this.theoryModal) {
      this.theoryModal.addEventListener('click', (e) => {
        if (e.target === this.theoryModal) {
          this.theoryModal.classList.remove('open');
        }
      });
    }

    // Export PNG
    if (this.btnExportImage) {
      this.btnExportImage.addEventListener('click', () => {
        this.exportVisualizationPNG();
      });
    }
  }

  setScaleMode(mode) {
    this.scaleMode = mode;
    if (this.selectScaleMode) this.selectScaleMode.value = mode;
    this.polarPlot.setScaleMode(this.scaleMode);
    this.cartesianPlot.setScaleMode(this.scaleMode);
    this.updateAbsPowerUIState();
  }

  updateAbsPowerUIState() {
    const isAbs = this.scaleMode === 'absPower';
    if (this.btnToggleAbsPower) {
      this.btnToggleAbsPower.classList.toggle('active-power', isAbs);
      this.btnToggleAbsPower.textContent = isAbs ? '✓ Absolute Power (|E|²)' : '⚡ Absolute Power (|E|²)';
    }
    if (this.polarDestructiveLegend) {
      this.polarDestructiveLegend.classList.toggle('hidden', !isAbs);
    }
  }

  syncDeltaPhaseUI() {
    let diff = this.sim.elem2.phaseDeg;
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    if (this.sliderDeltaPhase) this.sliderDeltaPhase.value = Math.round(diff);
    if (this.labelDeltaPhase) this.labelDeltaPhase.textContent = `${diff > 0 ? '+' : ''}${Math.round(diff)}°`;
  }

  applyPreset(preset) {
    if (preset === 'broadside') {
      // In-phase, lambda/2 separation: main beam at 90 deg and 270 deg
      this.setParameters({ a2: 1.0, p2: 0, dRatio: 0.5 });
      if (this.inputSteerAngle) this.inputSteerAngle.value = 90;
      if (this.sliderSteerAngle) this.sliderSteerAngle.value = 90;
    } else if (preset === 'endfire') {
      // Ordinary endfire towards +X (0 deg): Delta phi = -kd = -180 deg (for 0.5 lambda) or -90 deg (for 0.25 lambda)
      this.setParameters({ a2: 1.0, p2: -90, dRatio: 0.25 });
      if (this.inputSteerAngle) this.inputSteerAngle.value = 0;
      if (this.sliderSteerAngle) this.sliderSteerAngle.value = 0;
    } else if (preset === 'steered45') {
      // Main beam pointed at 45 deg:
      // Delta phi = -kd * cos(45 deg) = -180 deg * 0.7071 = -127 deg for d = 0.5 lambda
      this.setParameters({ a2: 1.0, p2: -127, dRatio: 0.5 });
      if (this.inputSteerAngle) this.inputSteerAngle.value = 45;
      if (this.sliderSteerAngle) this.sliderSteerAngle.value = 45;
    } else if (preset === 'grating') {
      // d = 1.5 lambda, grating lobes emerge
      this.setParameters({ a2: 1.0, p2: 0, dRatio: 1.5 });
      if (this.inputSteerAngle) this.inputSteerAngle.value = 90;
      if (this.sliderSteerAngle) this.sliderSteerAngle.value = 90;
    } else if (preset === 'cardioid') {
      // d = 0.25 lambda, deltaPhase = -90 deg -> cardioid pointing Front (+X, 0 deg)
      this.setParameters({ a2: 1.0, p2: -90, dRatio: 0.25 });
      if (this.inputSteerAngle) this.inputSteerAngle.value = 0;
      if (this.sliderSteerAngle) this.sliderSteerAngle.value = 0;
    } else if (preset === 'antiPhase') {
      // Opposite phase dipole: d = 0.5 lambda, deltaPhase = 180 deg
      this.setParameters({ a2: 1.0, p2: 180, dRatio: 0.5 });
    }
  }

  setParameters({ a2, p2, dRatio }) {
    if (this.inputA2) this.inputA2.value = a2.toFixed(2);
    if (this.sliderA2) this.sliderA2.value = a2;
    if (this.inputPhase2) this.inputPhase2.value = p2;
    if (this.sliderPhase2) this.sliderPhase2.value = p2;

    if (this.inputDistRatio) this.inputDistRatio.value = dRatio.toFixed(2);
    if (this.sliderDistRatio) this.sliderDistRatio.value = dRatio;

    // Source 1 is fixed at A1=1.0, alpha1=0
    this.sim.setElement1(1.0, 0);
    this.sim.setElement2(a2, p2);
    this.sim.setDistanceRatio(dRatio);

    this.syncDeltaPhaseUI();
    this.updateAll();
  }

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.vis-view-container').forEach((el) => el.classList.remove('active'));

    if (tab === 'polar') {
      document.getElementById('viewPolar').classList.add('active');
      this.polarPlot.resize();
    } else if (tab === 'cartesian') {
      document.getElementById('viewCartesian').classList.add('active');
      this.cartesianPlot.resize();
    } else if (tab === 'wave') {
      document.getElementById('viewWave').classList.add('active');
      this.waveField.resize();
    } else if (tab === 'wave1d') {
      document.getElementById('viewWave1D').classList.add('active');
      if (this.wave1DPlot) this.wave1DPlot.resize();
    }
  }

  resizeCurrentView() {
    if (this.activeTab === 'polar') this.polarPlot.resize();
    else if (this.activeTab === 'cartesian') this.cartesianPlot.resize();
    else if (this.activeTab === 'wave') {
      this.waveField.resize();
    } else if (this.activeTab === 'wave1d') {
      if (this.wave1DPlot) this.wave1DPlot.resize();
    }
  }

  updateAll() {
    // 1. Calculate Pattern
    const pattern = this.sim.computePattern(720, this.dynamicRangeDb);

    // 2. Update Header Badges & Info (145 MHz VHF)
    const lambdaM = this.sim.wavelength;
    const distM = this.sim.distanceMeters;

    if (this.distPhysicalLabel) this.distPhysicalLabel.textContent = `${distM.toFixed(3)} m`;

    if (this.refSource1Pos) this.refSource1Pos.textContent = `x = -d/2 (-${(distM / 2).toFixed(3)} m)`;

    if (this.textFreq) this.textFreq.textContent = `${(this.sim.frequency / 1e6).toFixed(3)} MHz`;
    if (this.textWavelength) this.textWavelength.textContent = `${lambdaM.toFixed(3)} m`;
    if (this.textWavenumber) this.textWavenumber.textContent = `${this.sim.k.toFixed(3)} rad/m`;

    // 3. Update Metrics Dashboard
    const m = pattern.metrics;
    if (this.metricDirectivity) this.metricDirectivity.textContent = `${m.directivityDbi} dBi`;
    if (this.metricDirectivityLin) this.metricDirectivityLin.textContent = `${pattern.directivity3D.toFixed(2)}× isotropic`;
    if (this.metricMainBeam) this.metricMainBeam.textContent = `${m.mainBeamAngleDeg}°`;

    if (this.metricMainBeamType) {
      if (Math.abs(m.mainBeamAngleDeg - 90) < 5 || Math.abs(m.mainBeamAngleDeg - 270) < 5) {
        this.metricMainBeamType.textContent = 'Broadside (+Y / -Y)';
      } else if (Math.abs(m.mainBeamAngleDeg - 0) < 5) {
        this.metricMainBeamType.textContent = 'Endfire (Front +X)';
      } else if (Math.abs(m.mainBeamAngleDeg - 180) < 5) {
        this.metricMainBeamType.textContent = 'Endfire (Back -X)';
      } else {
        this.metricMainBeamType.textContent = 'Steered lobe';
      }
    }

    if (this.metricFB) this.metricFB.textContent = `${m.frontToBackDb > 0 ? '+' : ''}${m.frontToBackDb} dB`;
    if (this.metricFBSub) {
      this.metricFBSub.textContent = '0° (Front +X) vs 180° (Back -X)';
    }

    if (this.metricSLL) this.metricSLL.textContent = m.sideLobeLevelDb !== 'None' ? `${m.sideLobeLevelDb} dB` : 'None';
    if (this.metricSLLSub) {
      this.metricSLLSub.textContent = m.sideLobeLevelDb !== 'None'
        ? (m.sideLobeAngleDeg !== null ? `Peak at ${m.sideLobeAngleDeg}°` : 'Peak secondary lobe')
        : 'No secondary lobes';
    }

    // 4. Update Renderers
    this.polarPlot.setPattern(pattern);
    this.cartesianPlot.setPattern(pattern);
    if (this.waveField) this.waveField.setPattern(pattern);
    if (this.wave1DPlot) {
      this.wave1DPlot.setSimulator(this.sim);
      this.wave1DPlot.render(this.waveField?.simTime || 0);
    }
  }

  exportVisualizationPNG() {
    let dataUrl = null;
    let filename = `antenna_pattern_145MHz_${Date.now()}.png`;

    if (this.activeTab === 'polar') {
      dataUrl = this.polarPlot.exportImage();
    } else if (this.activeTab === 'cartesian') {
      dataUrl = document.getElementById('canvasCartesian').toDataURL('image/png');
    } else if (this.activeTab === 'wave') {
      dataUrl = document.getElementById('canvasWave').toDataURL('image/png');
    } else if (this.activeTab === 'wave1d') {
      dataUrl = document.getElementById('canvasWave1D').toDataURL('image/png');
    }

    if (dataUrl) {
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
    }
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AntennaApp();
});
