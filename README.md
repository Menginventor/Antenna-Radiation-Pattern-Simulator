# 📡 Antenna Radiation Pattern Simulator

An interactive web-based physics simulation of a **2-point source antenna array** and electromagnetic wave interference.

Explore how element magnitude, excitation phase, and spatial separation shape far-field beamforming, directivity, beam steering, and near-field wavefront propagation in real time.

🔗 **Live Demo:** [https://menginventor.github.io/Antenna-Radiation-Pattern-Simulator/](https://menginventor.github.io/Antenna-Radiation-Pattern-Simulator/)

---

## 🌟 Key Features

### 1. Multi-View Interactive Visualizations
- **2D Polar Radiation Pattern**: High-DPI canvas polar diagram with logarithmic ($\text{dB}$), linear field ($|E|$), and **absolute power ($|E|^2$)** modes using IEEE/MATLAB standard scientific styling. Visualizes constructive interference (surpassing baseline $A_1^2 + A_2^2$) and destructive interference (cancellations and sharp nulls), complete with concentric scale rings, half-power beamwidth ($-3\text{ dB}$ HPBW) sector highlight, antenna array axis markers, and interactive hover inspection.
- **Unified 2D Wave Propagation & RF Power Density Field**: 60 FPS electromagnetic wavefield with instant mode toggle between **Instantaneous Traveling Wave $E(x,y,t)$** (bipolar wave crests/troughs) and **Time-Averaged RF Power Density $|E|^2$** (Poynting intensity heatmap). Features scientific colormaps (*BWR / CoolWarm*, *Viridis*, *Plasma*, *Inferno*, *Thermal Turbo*), interactive pan & zoom with Far-Field, Mid, and Near-Field presets, distance grid in wavelengths ($\lambda$), and toggleable Reactive Near-Field, Fresnel, and Fraunhofer Far-Field zone boundary rings.
- **Dedicated 1D Two-Source Wave Interference Analyzer**: Real-time oscilloscope-grade view plotting $E_1(x, t)$ (CH1 Blue), $E_2(x, t)$ (CH2 Orange), their total superposition $E_{\text{total}}(x, t)$ (Emerald), and constructive/destructive envelope bounds $\pm E_{\text{env}}(x)$ along the array axis ($y = 0$) or feed time-domain waveforms, with live cursor readout and source location pins ($x = \pm d/2$).
- **Engineering Cartesian Plot**: Azimuth angle ($-180^\circ \to +180^\circ$ or $0^\circ \to 360^\circ$) vs Normalized Gain in $\text{dB}$, linear field, or absolute power, with Keysight/VNA-grade graticule and HPBW markers.

### 2. Comprehensive Controls
- **Point Source 1 ($E_1$)**: Fixed Reference Source ($A_1 = 1.00\text{ V/m}$, $\alpha_1 = 0^\circ$).
- **Point Source 2 ($E_2$)**: Magnitude ($A_2 \in [0.0, 3.0\text{ V/m}]$) and Phase Shift ($\alpha_2 \in [-180^\circ, +180^\circ]$) with quick angle chips.
- **Separation Distance ($d$)**: Slider in fractions of wavelength ($d/\lambda \in [0.05, 3.5\lambda]$) with automatic physical conversion into meters based on the operating frequency.
- **Direct Phase Difference & Beam Steerer**: Progressive phase shift $\Delta\phi = \alpha_2 - \alpha_1$ and beam steering helper ($\theta_{\text{steer}}$).
- **Operating Frequency**: Standardized to $145.000\text{ MHz}$ VHF 2-Meter Amateur / Satellite band ($\lambda = 2.068\text{ m}$, wavenumber $k = 3.039\text{ rad/m}$).

### 3. Real-Time Antenna Analytics Dashboard
- **Peak Directivity ($D_0$)**: Numerical integration in $\text{dBi}$ and isotropic multiplier.
- **Half-Power Beamwidth (HPBW)**: $-3\text{ dB}$ angular beamwidth.
- **Main Beam Direction**: Primary angle(s) and classification (*Broadside*, *Endfire*, or *Steered*).
- **Front-to-Back Ratio (F/B)**: Ratio of forward power ($0^\circ$) to backward power ($180^\circ$) in $\text{dB}$.
- **Side Lobe Level (SLL)**: Relative level of highest secondary lobe in $\text{dB}$.

### 4. Educational Preset Scenarios
- **Broadside Array**: $d = 0.5\lambda$, $\Delta\phi = 0^\circ$ (Max radiation perpendicular to array line).
- **Steered 45° Beam**: Phased array steering condition $\Delta\phi = -k d \cos(45^\circ)$.
- **Grating Lobes**: $d = 1.5\lambda$, $\Delta\phi = 0^\circ$ (Demonstrates grating lobes when $d \ge \lambda$).
- **Cardioid Pattern**: $d = 0.25\lambda$, $\Delta\phi = 90^\circ$ (Unidirectional pattern).
- **Out-of-Phase Dipole Pair**: $d = 0.5\lambda$, $\Delta\phi = 180^\circ$ (Sharp broadside null).

---

## 🧮 Physics & Mathematics

### Array Factor ($AF$)
For two isotropic point sources separated by distance $d$ along the X-axis:
$$AF(\phi) = A_1 e^{j(\alpha_1 + \psi)} + A_2 e^{j(\alpha_2 - \psi)}$$
where:
$$\psi = \frac{k d}{2} \cos\phi, \quad k = \frac{2\pi}{\lambda} = \frac{2\pi f}{c}$$

### Far-Field Power Pattern
$$|AF(\phi)|^2 = A_1^2 + A_2^2 + 2 A_1 A_2 \cos(k d \cos\phi - \Delta\phi)$$
where $\Delta\phi = \alpha_2 - \alpha_1$.

### Electronic Beam Steering Condition
To steer the main lobe to target angle $\theta_0$:
$$\Delta\phi = -k d \cos\theta_0$$

---

## 🚀 Getting Started

### Online Demo
Try it instantly in your browser: [https://menginventor.github.io/Antenna-Radiation-Pattern-Simulator/](https://menginventor.github.io/Antenna-Radiation-Pattern-Simulator/)

### Prerequisites
Node.js (v18+)

### Running Locally
```bash
npm start
# or
npm run dev
```

Open your browser to:
```
http://localhost:3000/
```

Or simply open `index.html` directly in any modern web browser.
