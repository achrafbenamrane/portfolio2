/*
 * The Fang's voice, made live rather than played back, so it follows every rev. An inline four
 * fires twice a revolution, so the note sits at rpm / 30: a saw for the bark and a square an octave
 * down for the chest, through a filter that opens with the throttle and a shaper for the rasp. Over
 * that, the supercharger: a thin rising whine that belongs to no other kind of engine. Under it,
 * wind that grows with the square of the speed, and the tyres.
 */

const REDLINE = 14000;

export class Engine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private bark: OscillatorNode | null = null;
  private chest: OscillatorNode | null = null;
  private whine: OscillatorNode | null = null;
  private barkLevel: GainNode | null = null;
  private whineLevel: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private windLevel: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private scrapeLevel: GainNode | null = null;
  private rushLevel: GainNode | null = null;
  private rushFilter: BiquadFilterNode | null = null;
  private muted = false;

  /** Browsers only allow sound after a real press, so this is called from the Ride button. */
  unlock() {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const Context = window.AudioContext;
    if (!Context) return;
    const context = new Context();
    this.context = context;
    const master = context.createGain();
    master.gain.value = this.muted ? 0 : 0.5;
    const limiter = context.createDynamicsCompressor();
    master.connect(limiter).connect(context.destination);
    this.master = master;

    const rasp = context.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let index = 0; index < curve.length; index++) {
      const x = (index / 511.5 - 1) * 2.6;
      curve[index] = Math.tanh(x);
    }
    rasp.curve = curve;

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500;
    filter.Q.value = 2.2;
    this.filter = filter;

    const barkLevel = context.createGain();
    barkLevel.gain.value = 0.2;
    this.barkLevel = barkLevel;
    rasp.connect(filter).connect(barkLevel).connect(master);

    const bark = context.createOscillator();
    bark.type = "sawtooth";
    const barkGain = context.createGain();
    barkGain.gain.value = 0.55;
    bark.connect(barkGain).connect(rasp);
    bark.start();
    this.bark = bark;

    const chest = context.createOscillator();
    chest.type = "square";
    const chestGain = context.createGain();
    chestGain.gain.value = 0.42;
    chest.connect(chestGain).connect(rasp);
    chest.start();
    this.chest = chest;

    const whine = context.createOscillator();
    whine.type = "sine";
    const whineLevel = context.createGain();
    whineLevel.gain.value = 0;
    whine.connect(whineLevel).connect(master);
    whine.start();
    this.whine = whine;
    this.whineLevel = whineLevel;

    // One second of white noise, looped, for the wind and the tyres.
    const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
    const air = context.createBufferSource();
    air.buffer = noise;
    air.loop = true;
    const windFilter = context.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.5;
    const windLevel = context.createGain();
    windLevel.gain.value = 0;
    air.connect(windFilter).connect(windLevel).connect(master);
    air.start();
    this.windFilter = windFilter;
    this.windLevel = windLevel;

    const scrape = context.createBufferSource();
    scrape.buffer = noise;
    scrape.loop = true;
    const scrapeFilter = context.createBiquadFilter();
    scrapeFilter.type = "highpass";
    scrapeFilter.frequency.value = 2400;
    const scrapeLevel = context.createGain();
    scrapeLevel.gain.value = 0;
    scrape.connect(scrapeFilter).connect(scrapeLevel).connect(master);
    scrape.start();
    this.scrapeLevel = scrapeLevel;

    // The nitro: gas rushing through a jet, a hiss that climbs as it opens.
    const rush = context.createBufferSource();
    rush.buffer = noise;
    rush.loop = true;
    const rushFilter = context.createBiquadFilter();
    rushFilter.type = "bandpass";
    rushFilter.frequency.value = 900;
    rushFilter.Q.value = 0.8;
    const rushLevel = context.createGain();
    rushLevel.gain.value = 0;
    rush.connect(rushFilter).connect(rushLevel).connect(master);
    rush.start();
    this.rushFilter = rushFilter;
    this.rushLevel = rushLevel;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.context.currentTime, 0.05);
  }

  /** Called every frame with what the bike's doing. */
  update(rpm: number, throttle: number, speed: number, scraping: number, boost: number) {
    const context = this.context;
    if (!context || !this.bark || !this.chest || !this.whine || !this.filter || !this.barkLevel || !this.whineLevel || !this.windLevel || !this.windFilter || !this.scrapeLevel) return;
    const now = context.currentTime;
    const note = rpm / 30;
    this.bark.frequency.setTargetAtTime(note, now, 0.012);
    this.chest.frequency.setTargetAtTime(note / 2, now, 0.012);
    const share = rpm / REDLINE;
    this.filter.frequency.setTargetAtTime(380 + share * 2400 + throttle * 2300, now, 0.03);
    this.barkLevel.gain.setTargetAtTime(0.13 + throttle * 0.15 + share * 0.05, now, 0.04);
    this.whine.frequency.setTargetAtTime(rpm * 0.42, now, 0.02);
    this.whineLevel.gain.setTargetAtTime(share * share * (0.008 + throttle * 0.05) + boost * 0.05, now, 0.05);
    this.rushLevel?.gain.setTargetAtTime(boost * 0.34, now, 0.04);
    this.rushFilter?.frequency.setTargetAtTime(900 + boost * 2600, now, 0.08);
    const wind = Math.min(speed / 90, 1);
    this.windLevel.gain.setTargetAtTime(wind * wind * 0.4, now, 0.08);
    this.windFilter.frequency.setTargetAtTime(350 + wind * 1500, now, 0.1);
    this.scrapeLevel.gain.setTargetAtTime(scraping * 0.2, now, 0.03);
  }

  dispose() {
    void this.context?.close();
    this.context = null;
  }
}
