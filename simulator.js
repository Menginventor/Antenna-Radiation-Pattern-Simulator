/**
 * Antenna Radiation Pattern Physics & Math Engine
 * Calculates Array Factor, Far-Field Radiation, Directivity, HPBW, and Near-field Interference.
 */

export const SPEED_OF_LIGHT = 299792458; // m/s

export class AntennaSimulator {
  constructor(config = {}) {
    this.frequency = config.frequency ?? 145.0e6; // 145 MHz default (2-meter VHF band)
    this.wavelength = SPEED_OF_LIGHT / this.frequency; // ~ 2.0675 m
    this.k = (2 * Math.PI) / this.wavelength; // Wavenumber rad/m

    // Element 1: Fixed reference source (A1 = 1.0, alpha1 = 0 deg)
    this.elem1 = {
      amplitude: 1.0,
      phaseDeg: 0.0,
      x: 0,
      y: 0
    };

    // Element 2: Variable source
    this.elem2 = {
      amplitude: config.a2 ?? 1.0,
      phaseDeg: config.p2 ?? 0.0,
      x: 0,
      y: 0
    };

    // Separation distance in terms of wavelength
    this.dLambda = config.dLambda ?? 0.5; // default lambda / 2
    this.updatePositions();
  }

  setFrequency(fHz) {
    this.frequency = Math.max(1e6, fHz);
    this.wavelength = SPEED_OF_LIGHT / this.frequency;
    this.k = (2 * Math.PI) / this.wavelength;
    this.updatePositions();
  }

  setDistanceRatio(ratio) {
    this.dLambda = Math.max(0.01, ratio);
    this.updatePositions();
  }

  setDistanceMeters(dMeters) {
    this.dLambda = Math.max(0.01, dMeters / this.wavelength);
    this.updatePositions();
  }

  get distanceMeters() {
    return this.dLambda * this.wavelength;
  }

  updatePositions() {
    const d = this.distanceMeters;
    // Elements placed symmetrically along the X-axis
    this.elem1.x = -d / 2;
    this.elem1.y = 0;
    this.elem2.x = d / 2;
    this.elem2.y = 0;
  }

  setElement1(amplitude, phaseDeg) {
    this.elem1.amplitude = Math.max(0, amplitude);
    this.elem1.phaseDeg = phaseDeg;
  }

  setElement2(amplitude, phaseDeg) {
    this.elem2.amplitude = Math.max(0, amplitude);
    this.elem2.phaseDeg = phaseDeg;
  }

  /**
   * Complex field phasor at far-field azimuth angle phi (measured from +X axis)
   * Array axis is along X-axis:
   * Path difference: r1 - r0 = -(-d/2 * cos(phi)) = +(d/2)*cos(phi)
   * E(phi) = A1 * exp(j*(alpha1 + psi)) + A2 * exp(j*(alpha2 - psi))
   * where psi = (k * d / 2) * cos(phi)
   */
  evaluateFarField(phiRad) {
    const psi = 0.5 * this.k * this.distanceMeters * Math.cos(phiRad);
    const alpha1 = (this.elem1.phaseDeg * Math.PI) / 180;
    const alpha2 = (this.elem2.phaseDeg * Math.PI) / 180;

    const phase1 = alpha1 - psi;
    const phase2 = alpha2 + psi;

    const real =
      this.elem1.amplitude * Math.cos(phase1) +
      this.elem2.amplitude * Math.cos(phase2);
    const imag =
      this.elem1.amplitude * Math.sin(phase1) +
      this.elem2.amplitude * Math.sin(phase2);

    const mag = Math.sqrt(real * real + imag * imag);
    const phase = Math.atan2(imag, real);

    return { real, imag, mag, phase };
  }

  /**
   * Sample radiation pattern at N discrete angles from 0 to 2*PI
   */
  computePattern(numPoints = 720, dynamicRangeDb = 40) {
    const angles = new Float64Array(numPoints);
    const fieldMagnitudes = new Float64Array(numPoints);
    let maxMag = 1e-9;

    const step = (2 * Math.PI) / numPoints;
    for (let i = 0; i < numPoints; i++) {
      const phi = i * step;
      angles[i] = phi;
      const res = this.evaluateFarField(phi);
      fieldMagnitudes[i] = res.mag;
      if (res.mag > maxMag) {
        maxMag = res.mag;
      }
    }

    const normField = new Float64Array(numPoints);
    const powerLinear = new Float64Array(numPoints);
    const powerDb = new Float64Array(numPoints);
    const clampedDb = new Float64Array(numPoints);

    let powerIntegral = 0;
    let powerIntegral3D = 0;

    for (let i = 0; i < numPoints; i++) {
      const nf = fieldMagnitudes[i] / maxMag;
      normField[i] = nf;
      const pLin = nf * nf;
      powerLinear[i] = pLin;

      // dB relative to peak
      const db = 20 * Math.log10(Math.max(1e-6, nf));
      powerDb[i] = db;
      clampedDb[i] = Math.max(-dynamicRangeDb, db);

      powerIntegral += pLin * step;

      // 3D integral assuming rotational symmetry around X-axis
      // theta from X-axis is angle phi, solid angle element dOmega = 2*pi*sin(theta)*dtheta
      // from 0 to pi:
      if (angles[i] <= Math.PI) {
        const sinTheta = Math.sin(angles[i]);
        powerIntegral3D += pLin * sinTheta * step;
      }
    }

    // Absolute power calculations (|E|²)
    const a1 = this.elem1.amplitude;
    const a2 = this.elem2.amplitude;
    const baselinePower = a1 * a1 + a2 * a2; // Incoherent baseline (no interference)
    const maxTheoreticalPower = Math.pow(a1 + a2, 2); // 100% Constructive interference limit
    const minTheoreticalPower = Math.pow(Math.abs(a1 - a2), 2); // 100% Destructive interference limit
    const maxActualPower = maxMag * maxMag;
    const absolutePower = new Float64Array(numPoints);
    for (let i = 0; i < numPoints; i++) {
      absolutePower[i] = fieldMagnitudes[i] * fieldMagnitudes[i];
    }

    // Directivity calculation
    // 2D Azimuth Directivity: D2D = 2 * pi * max(P) / Integral(P dPhi)
    const directivity2D = (2 * Math.PI) / (powerIntegral || 1e-6);
    const directivity2DdBi = 10 * Math.log10(Math.max(1, directivity2D));

    // 3D Directivity: D3D = 2 / Integral_0^pi (P(theta)*sin(theta) dtheta)
    const directivity3D = 2 / Math.max(1e-6, powerIntegral3D);
    const directivity3DdBi = 10 * Math.log10(Math.max(1, directivity3D));

    // Analyze lobes: Find peaks, nulls, HPBW, SLL
    const metrics = this.analyzePatternFeatures(
      angles,
      normField,
      clampedDb,
      dynamicRangeDb,
      directivity3DdBi,
      fieldMagnitudes,
      absolutePower,
      baselinePower
    );

    return {
      numPoints,
      angles,
      fieldMagnitudes,
      normField,
      powerLinear,
      powerDb,
      clampedDb,
      absolutePower,
      a1,
      a2,
      baselinePower,
      maxTheoreticalPower,
      minTheoreticalPower,
      maxActualPower,
      maxMag,
      dynamicRangeDb,
      directivity2D,
      directivity2DdBi,
      directivity3D,
      directivity3DdBi,
      metrics
    };
  }

  /**
   * Find main lobes, -3dB HPBW, nulls, Front-to-Back ratio, Side Lobe Level
   */
  analyzePatternFeatures(angles, normField, clampedDb, dynamicRangeDb, directivity3DdBi, fieldMagnitudes, absolutePower, baselinePower) {
    const n = angles.length;
    const peaks = [];
    const nulls = [];

    // Find local maxima and minima with circular wraparound
    for (let i = 0; i < n; i++) {
      const prev = normField[(i - 1 + n) % n];
      const curr = normField[i];
      const next = normField[(i + 1) % n];

      if (curr >= prev && curr >= next && curr > 0.05) {
        if (curr > prev || curr > next) {
          peaks.push({
            index: i,
            angleRad: angles[i],
            angleDeg: Number(((angles[i] * 180) / Math.PI).toFixed(1)),
            val: curr,
            db: clampedDb[i],
            absMag: fieldMagnitudes ? fieldMagnitudes[i] : curr,
            absPower: absolutePower ? absolutePower[i] : curr * curr
          });
        }
      }

      if (curr <= prev && curr <= next && curr < 0.25) {
        if (curr < prev || curr < next) {
          const p = absolutePower ? absolutePower[i] : curr * curr;
          nulls.push({
            index: i,
            angleRad: angles[i],
            angleDeg: Number(((angles[i] * 180) / Math.PI).toFixed(1)),
            val: curr,
            db: clampedDb[i],
            absMag: fieldMagnitudes ? fieldMagnitudes[i] : curr,
            absPower: p,
            isDestructiveNull: true,
            cancellationPct: baselinePower ? Math.max(0, Math.min(100, Math.round(((baselinePower - p) / baselinePower) * 100))) : 100
          });
        }
      }
    }

    // Sort peaks descending by field amplitude
    peaks.sort((a, b) => b.val - a.val);

    const mainLobe = peaks.length > 0 ? peaks[0] : { angleDeg: 90, val: 1, db: 0, index: Math.floor(n / 4) };

    // Side Lobe Level (SLL):
    // Highest secondary peak that is an actual side lobe (at least 0.2 dB below the main beam peak)
    let sideLobeLevelDb = null;
    let sideLobeAngleDeg = null;
    for (let i = 0; i < peaks.length; i++) {
      if (peaks[i].db < -0.2) {
        sideLobeLevelDb = peaks[i].db;
        sideLobeAngleDeg = peaks[i].angleDeg;
        break; // peaks is sorted descending, so the first one with db < -0.2 is the peak side lobe!
      }
    }

    // Half-Power Beamwidth (HPBW) around main lobe (-3dB = 0.7071 in normField)
    let hpbwDeg = null;
    if (mainLobe) {
      const targetVal = 0.70710678;
      const mIdx = mainLobe.index;

      // search counter-clockwise
      let leftIdx = mIdx;
      for (let step = 0; step < n / 2; step++) {
        const idx = (mIdx - step + n) % n;
        if (normField[idx] <= targetVal) {
          leftIdx = idx;
          break;
        }
      }

      // search clockwise
      let rightIdx = mIdx;
      for (let step = 0; step < n / 2; step++) {
        const idx = (mIdx + step) % n;
        if (normField[idx] <= targetVal) {
          rightIdx = idx;
          break;
        }
      }

      let dAngleRad = (rightIdx - leftIdx) * ((2 * Math.PI) / n);
      if (dAngleRad < 0) dAngleRad += 2 * Math.PI;
      hpbwDeg = (dAngleRad * 180) / Math.PI;
      if (hpbwDeg > 360) hpbwDeg = 360;
    }

    // Front-to-Back (F/B) Ratio:
    // With +X defined as the Front direction (0°) and -X as the Back direction (180°)
    const frontIdx = 0; // 0° (+X Front)
    const backIdx = Math.round(n / 2) % n; // 180° (-X Back)
    const pFront = normField[frontIdx];
    const pBack = normField[backIdx];

    let frontToBackDb = 0;
    if (pFront < 1e-4 && pBack < 1e-4) {
      frontToBackDb = 0; // Symmetrical nulls along the array axis (e.g. broadside array)
    } else if (pBack < 1e-4) {
      frontToBackDb = dynamicRangeDb; // Complete rear null suppression (e.g. +40 dB)
    } else if (pFront < 1e-4) {
      frontToBackDb = -dynamicRangeDb; // Null forward, power directed rearward
    } else {
      const dbDiff = 20 * Math.log10(pFront / pBack);
      frontToBackDb = Math.min(dynamicRangeDb, Math.max(-dynamicRangeDb, dbDiff));
    }

    return {
      directivityDbi: Number(directivity3DdBi.toFixed(2)),
      mainBeamAngleDeg: Number(mainLobe.angleDeg.toFixed(1)),
      mainBeamDb: mainLobe.db,
      hpbwDeg: hpbwDeg ? Number(hpbwDeg.toFixed(1)) : 'N/A',
      sideLobeLevelDb: sideLobeLevelDb !== null ? Number(sideLobeLevelDb.toFixed(1)) : 'None',
      sideLobeAngleDeg: sideLobeAngleDeg !== null ? Number(sideLobeAngleDeg.toFixed(1)) : null,
      frontToBackDb: Number(frontToBackDb.toFixed(1)),
      peaks: peaks.map(p => ({
        angleDeg: Number(p.angleDeg.toFixed(1)),
        angleRad: p.angleRad,
        db: Number(p.db.toFixed(1)),
        absMag: Number((p.absMag ?? 0).toFixed(3)),
        absPower: Number((p.absPower ?? 0).toFixed(3))
      })),
      nulls: nulls.map(p => ({
        angleDeg: Number(p.angleDeg.toFixed(1)),
        angleRad: p.angleRad,
        db: Number(p.db.toFixed(1)),
        absMag: Number((p.absMag ?? 0).toFixed(3)),
        absPower: Number((p.absPower ?? 0).toFixed(3)),
        isDestructiveNull: true,
        cancellationPct: p.cancellationPct ?? 100
      }))
    };
  }

  /**
   * Calculate 2D instantaneous wave field E(x, y, t) in near/mid field.
   * Superposition of spherical/cylindrical waves:
   * E_i(r, t) = (A_i / sqrt(r_i)) * cos(omega * t - k * r_i + alpha_i)
   * where r_i = distance from element i to point (x, y)
   */
  evaluateNearFieldPoint(x, y, tSec, omega) {
    const dx1 = x - this.elem1.x;
    const dy1 = y - this.elem1.y;
    const r1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) + 1e-4;

    const dx2 = x - this.elem2.x;
    const dy2 = y - this.elem2.y;
    const r2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) + 1e-4;

    const alpha1 = (this.elem1.phaseDeg * Math.PI) / 180;
    const alpha2 = (this.elem2.phaseDeg * Math.PI) / 180;

    // Decay factor (cylindrical wave decay sqrt(r) to avoid extreme near-field blowup, smoothed with core)
    const decay1 = 1 / Math.sqrt(Math.max(r1, this.wavelength * 0.15));
    const decay2 = 1 / Math.sqrt(Math.max(r2, this.wavelength * 0.15));

    const e1 = this.elem1.amplitude * decay1 * Math.cos(omega * tSec - this.k * r1 + alpha1);
    const e2 = this.elem2.amplitude * decay2 * Math.cos(omega * tSec - this.k * r2 + alpha2);

    return e1 + e2;
  }
}
