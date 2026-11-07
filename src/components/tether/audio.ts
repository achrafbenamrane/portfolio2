import { robotise } from "@/lib/voice/robot-dsp";
import { ROBOT_AMOUNT } from "@/lib/voice/speaker";

/*
 * What the game sounds like. There's no sound on the Moon, so this is what an operator would
 * really hear: what comes up the link from the machine's own microphones, bolted to its frame.
 * Footfalls arrive as a thud through the structure, not a noise through the air. All of it but
 * the voice is made here, from oscillators and noise, so it costs no downloads.
 *
 * Mission control speaks with the site's assistant's voice, at its settled robot amount.
 */

export class Audio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private servo: GainNode | null = null;
  private servoFilter: BiquadFilterNode | null = null;
  private engine: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private speaking: AudioBufferSourceNode | null = null;
  private muted = false;
  private readonly clips = new Map<string, Promise<AudioBuffer | null>>();

  /** Must run inside a click or a key press: browsers allow nothing before one. */
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
    master.gain.value = 0.85;
    const limiter = context.createDynamicsCompressor();
    master.connect(limiter).connect(context.destination);
    this.master = master;

    const length = context.sampleRate * 2;
    const noise = context.createBuffer(1, length, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let index = 0; index < length; index++) samples[index] = Math.random() * 2 - 1;
    this.noise = noise;

    // The hum of the machine's own systems, always there, and a servo whine that follows it.
    const hum = context.createOscillator();
    hum.type = "sawtooth";
    hum.frequency.value = 55;
    const humFilter = context.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 130;
    const humGain = context.createGain();
    humGain.gain.value = 0.05;
    hum.connect(humFilter).connect(humGain).connect(master);
    hum.start();

    const servo = context.createGain();
    servo.gain.value = 0;
    const servoFilter = context.createBiquadFilter();
    servoFilter.type = "bandpass";
    servoFilter.Q.value = 7;
    servoFilter.frequency.value = 500;
    const servoSource = this.loop();
    servoSource?.connect(servoFilter).connect(servo).connect(master);
    this.servo = servo;
    this.servoFilter = servoFilter;

    const engine = context.createGain();
    engine.gain.value = 0;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 240;
    const engineSource = this.loop();
    engineSource?.connect(engineFilter).connect(engine).connect(master);
    this.engine = engine;
    this.engineFilter = engineFilter;

    void context.resume();
  }

  private loop() {
    const { context, noise } = this;
    if (!context || !noise) return null;
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    source.start();
    return source;
  }

  get audible() {
    return this.context?.state === "running" && !this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.85, this.context.currentTime, 0.05);
  }

  /** How hard the machine is working, 0 to 1: the servos rise with it. */
  servos(effort: number) {
    const { context, servo, servoFilter } = this;
    if (!context || !servo || !servoFilter) return;
    const now = context.currentTime;
    servo.gain.setTargetAtTime(effort * 0.06, now, 0.08);
    servoFilter.frequency.setTargetAtTime(380 + effort * 900, now, 0.08);
  }

  /** The rumble of whatever's burning, 0 to 1. */
  burn(power: number) {
    const { context, engine, engineFilter } = this;
    if (!context || !engine || !engineFilter) return;
    const now = context.currentTime;
    engine.gain.setTargetAtTime(power * 0.5, now, 0.2);
    engineFilter.frequency.setTargetAtTime(170 + power * 560, now, 0.2);
  }

  private thump(frequency: number, end: number, gain: number, seconds: number) {
    const { context, master } = this;
    if (!context || !master) return;
    const now = context.currentTime;
    const note = context.createOscillator();
    const level = context.createGain();
    note.type = "sine";
    note.frequency.setValueAtTime(frequency, now);
    note.frequency.exponentialRampToValueAtTime(end, now + seconds * 0.6);
    level.gain.setValueAtTime(gain, now);
    level.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    note.connect(level).connect(master);
    note.start(now);
    note.stop(now + seconds + 0.02);
  }

  private burst(frequency: number, q: number, gain: number, seconds: number) {
    const { context, master, noise } = this;
    if (!context || !master || !noise) return;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = 0.7 + Math.random() * 0.6;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const level = context.createGain();
    level.gain.setValueAtTime(gain, now);
    level.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    source.connect(filter).connect(level).connect(master);
    source.start(now, Math.random());
    source.stop(now + seconds + 0.02);
  }

  footfall(strength: number) {
    this.thump(95, 42, 0.22 * Math.min(strength, 1.4), 0.2);
    this.burst(420, 1, 0.03 * strength, 0.1);
  }

  landed(strength: number) {
    this.thump(130, 30, 0.34 + strength * 0.08, 0.5);
    this.burst(260, 0.7, 0.18, 0.35);
  }

  launched() {
    this.burst(900, 0.6, 0.28, 0.5);
    this.thump(160, 60, 0.3, 0.3);
  }

  /** Metal on metal, up through the arm. */
  struck(blocked: boolean) {
    this.thump(blocked ? 240 : 170, 60, blocked ? 0.22 : 0.46, 0.26);
    this.burst(blocked ? 2600 : 1500, 5, blocked ? 0.2 : 0.42, 0.3);
    this.burst(3900, 9, 0.12, 0.5);
  }

  gun() {
    this.burst(1800, 1.4, 0.07, 0.05);
    this.thump(190, 80, 0.07, 0.06);
  }

  blast() {
    this.thump(110, 24, 0.7, 1.1);
    this.burst(300, 0.5, 0.5, 1.2);
  }

  shipHit() {
    this.burst(1100, 2, 0.3, 0.2);
    this.thump(120, 50, 0.3, 0.2);
  }

  private prepare(id: string) {
    const { context } = this;
    if (!context) return Promise.resolve(null);
    const known = this.clips.get(id);
    if (known) return known;
    const clip = fetch(`/2090/voice/${id}.mp3`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((decoded) => {
        const treated = robotise(decoded.getChannelData(0), decoded.sampleRate, ROBOT_AMOUNT);
        const buffer = context.createBuffer(1, treated.length, decoded.sampleRate);
        buffer.copyToChannel(new Float32Array(treated), 0);
        return buffer;
      })
      .catch(() => null);
    this.clips.set(id, clip);
    return clip;
  }

  /** A line from mission control, over a thin radio band. */
  async say(id: string) {
    const buffer = await this.prepare(id);
    const { context, master } = this;
    if (!buffer || !context || !master) return;
    try {
      this.speaking?.stop();
    } catch {
      // It had already finished.
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const low = context.createBiquadFilter();
    low.type = "highpass";
    low.frequency.value = 280;
    const high = context.createBiquadFilter();
    high.type = "lowpass";
    high.frequency.value = 3600;
    const level = context.createGain();
    level.gain.value = 1.5;
    source.connect(low).connect(high).connect(level).connect(master);
    source.start();
    this.speaking = source;
  }

  dispose() {
    void this.context?.close();
    this.context = null;
  }
}
