# 📡 Antenna Radiation Pattern Simulator

An interactive web-based physics simulation of a **2-point source antenna array** and electromagnetic wave interference.

Explore how element magnitude, excitation phase, and spatial separation shape far-field beamforming, directivity, beam steering, and near-field wavefront propagation in real time.

🔗 **Live Demo:** [https://menginventor.github.io/Antenna-Radiation-Pattern-Simulator/](https://menginventor.github.io/Antenna-Radiation-Pattern-Simulator/)

---

## 🌟 Key Features

### 1. Multi-View Interactive Visualizations
- **2D Polar Radiation Pattern**: High-DPI canvas polar diagram with logarithmic ($\text{dB}$), linear field ($|E|$), and **absolute power ($|E|^2$)** modes. The absolute power mode allows direct visualization of constructive interference (surpassing the uncorrelated baseline $A_1^2 + A_2^2$) and destructive interference (cancellations and sharp nulls), complete with concentric scale rings, half-power beamwidth ($-3\text{ dB}$ HPBW) sector highlight, antenna array axis markers, and interactive hover inspection.
- **2D Wave Interference Heatmap**: 60 FPS animated electromagnetic wavefront propagation showing constructive interference (surging wavefronts) and destructive interference (dead nulls) with customizable color palettes (*Cyberpunk EM*, *Plasma Thermal*, *Emerald Radar*).
- **3D Far-Field Radiation Pattern**: WebGL Three.js interactive 3D radiation lobe with vertex false-color gain mapping, orbit rotation, zoom, and wireframe toggle.
- **Cartesian Plot**: Azimuth angle ($0^\circ \to 360^\circ$) vs Normalized Gain in $\text{dB}$ or linear scale, with $-3\text{ dB}$ threshold and peak indicators.

### 2. Comprehensive Controls
- **Point Source 1 ($E_1$)**: Magnitude ($A_1 \in [0.0, 2.0]$) and Phase ($\alpha_1 \in [-180^\circ, +180^\circ]$) with quick angle chips.
- **Point Source 2 ($E_2$)**: Magnitude ($A_2 \in [0.0, 2.0]$) and Phase ($\alpha_2 \in [-180^\circ, +180^\circ]$) with quick angle chips.
- **Separation Distance ($d$)**: Slider in fractions of wavelength ($d/\lambda \in [0.05, 4.0\lambda]$) with automatic physical conversion into millimeters based on the operating frequency.
- **Direct Phase Difference & Beam Steerer**: Progressive phase shift $\Delta\phi = \alpha_2 - \alpha_1$ and beam steering helper ($\theta_{\text{steer}}$).
- **Fixed Operating Frequency**: Pre-set to $2.40\text{ GHz}$ ISM band ($\lambda = 125.0\text{ mm}$, wavenumber $k = 50.3\text{ rad/m}$).

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
