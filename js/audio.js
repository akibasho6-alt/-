// Web Audio API based Sound Synthesizer for Lathe Workshop
class SoundManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.motorOsc = null;
    this.motorGain = null;
    this.cutNoise = null;
    this.cutGain = null;
    this.cutFilter = null;
    this.sandGain = null;
    this.sandFilter = null;
    this.isCutting = false;
    this.isSanding = false;
    this.currentRPM = 0;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();

    this.setupMotor();
    this.setupCutNoise();
    this.setupSandNoise();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setupMotor() {
    if (!this.ctx) return;
    try {
      // Motor tone: dual oscillators for realistic mechanical hum
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(45, this.ctx.currentTime);
      osc2.frequency.setValueAtTime(90, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(280, this.ctx.currentTime);

      this.motorGain = this.ctx.createGain();
      this.motorGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(this.motorGain);
      this.motorGain.connect(this.ctx.destination);

      osc1.start();
      osc2.start();
      this.motorOsc = { osc1, osc2, filter };
    } catch (e) {
      console.warn('Audio motor setup error:', e);
    }
  }

  setupCutNoise() {
    if (!this.ctx) return;
    try {
      // White noise buffer for cutting
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      this.cutFilter = this.ctx.createBiquadFilter();
      this.cutFilter.type = 'bandpass';
      this.cutFilter.frequency.setValueAtTime(1400, this.ctx.currentTime);
      this.cutFilter.Q.setValueAtTime(2.5, this.ctx.currentTime);

      this.cutGain = this.ctx.createGain();
      this.cutGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

      noise.connect(this.cutFilter);
      this.cutFilter.connect(this.cutGain);
      this.cutGain.connect(this.ctx.destination);

      noise.start();
      this.cutNoise = noise;
    } catch (e) {
      console.warn('Audio cut noise setup error:', e);
    }
  }

  setupSandNoise() {
    if (!this.ctx) return;
    try {
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      this.sandFilter = this.ctx.createBiquadFilter();
      this.sandFilter.type = 'highpass';
      this.sandFilter.frequency.setValueAtTime(3500, this.ctx.currentTime);

      this.sandGain = this.ctx.createGain();
      this.sandGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

      noise.connect(this.sandFilter);
      this.sandFilter.connect(this.sandGain);
      this.sandGain.connect(this.ctx.destination);

      noise.start();
    } catch (e) {
      console.warn('Audio sand noise setup error:', e);
    }
  }

  updateMotor(rpm, isRunning) {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    this.currentRPM = rpm;

    const targetGain = isRunning ? 0.08 : 0.0001;
    const baseFreq = Math.max(30, (rpm / 1500) * 65);

    if (this.motorGain && this.motorOsc) {
      const t = this.ctx.currentTime;
      this.motorGain.gain.setTargetAtTime(targetGain, t, 0.1);
      this.motorOsc.osc1.frequency.setTargetAtTime(baseFreq, t, 0.1);
      this.motorOsc.osc2.frequency.setTargetAtTime(baseFreq * 2, t, 0.1);
    }
  }

  setCutting(cutting, depth = 1.0, hardness = 1.0) {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    if (this.cutGain && this.cutFilter) {
      const t = this.ctx.currentTime;
      const targetGain = cutting ? Math.min(0.28, 0.08 + depth * 0.15) : 0.0001;
      const targetFreq = 1200 + hardness * 800 + Math.random() * 300;
      this.cutGain.gain.setTargetAtTime(targetGain, t, 0.05);
      this.cutFilter.frequency.setTargetAtTime(targetFreq, t, 0.05);
    }
  }

  setSanding(sanding, pressure = 1.0) {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    if (this.sandGain) {
      const t = this.ctx.currentTime;
      const targetGain = sanding ? Math.min(0.18, 0.05 + pressure * 0.1) : 0.0001;
      this.sandGain.gain.setTargetAtTime(targetGain, t, 0.05);
    }
  }

  playSpark() {
    if (!this.ctx || this.isMuted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      const freq = 2000 + Math.random() * 3000;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch (e) {}
  }

  playSuccess() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        try {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
          gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start();
          osc.stop(this.ctx.currentTime + 0.45);
        } catch (e) {}
      }, idx * 100);
    });
  }

  playCoin() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(987.77, this.ctx.currentTime); // B5
      osc.frequency.setValueAtTime(1318.51, this.ctx.currentTime + 0.08); // E6
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.35);
    } catch (e) {}
  }

  playClick() {
    if (!this.ctx || this.isMuted) return;
    this.resume();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch (e) {}
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted && this.ctx) {
      if (this.motorGain) this.motorGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      if (this.cutGain) this.cutGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      if (this.sandGain) this.sandGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    }
    return this.isMuted;
  }
}

export const soundManager = new SoundManager();
