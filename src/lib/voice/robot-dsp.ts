/**
 * The assistant's robot treatment, as a pure function over samples.
 *
 * This exists in the browser rather than in the build so that BOTH kinds of
 * audio go through the same code: the stored answer clips and speech generated
 * on demand for a question that has no clip. Processing the stored ones offline
 * and the generated ones live would leave two chains to keep in step, and they
 * would drift — which is precisely the mismatch this whole feature is about.
 *
 * The chain, in order:
 *
 * 1. **Phase zeroing.** The signal is rebuilt from its magnitude spectrum with
 *    the phase discarded, which locks the output pitch to the analysis window
 *    (sampleRate / FFT_SIZE, a flat ~43 Hz). A constant pitch across a whole
 *    sentence is the thing a throat cannot do, and it is what stops the result
 *    sounding like a person reading.
 * 2. **Ring modulation** by a 42 Hz carrier — a true carrier multiply, not an
 *    amplitude wobble, which is what separates a machine from a gargle.
 * 3. **Comb resonance** at 11 ms and 23 ms, colouring it as though it were
 *    speaking from inside a metal shell.
 * 4. **Band limiting** to 110–7000 Hz, then a limiter.
 */

const FFT_SIZE = 1024;
const HOP = FFT_SIZE / 4; // 75% overlap
const CARRIER_HZ = 42;
const CARRIER_DEPTH = 0.45;
const ECHO_MS = [11, 23];
const ECHO_DECAY = [0.28, 0.16];
const ECHO_IN_GAIN = 0.88;
const HIGHPASS_HZ = 110;
const LOWPASS_HZ = 7000;

/** In-place radix-2 FFT. Real and imaginary parts in separate arrays. */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;

  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
}

const HANN = (() => {
  const w = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) {
    w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE);
  }
  return w;
})();

function phaseZero(input: Float32Array): Float32Array {
  const out = new Float32Array(input.length);
  const norm = new Float32Array(input.length);
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);

  for (let start = 0; start + FFT_SIZE <= input.length; start += HOP) {
    for (let i = 0; i < FFT_SIZE; i += 1) {
      re[i] = input[start + i] * HANN[i];
      im[i] = 0;
    }
    fft(re, im);

    // Keep magnitude, discard phase. Rebuilding a real signal from a purely
    // real spectrum is what flattens the pitch.
    for (let i = 0; i < FFT_SIZE; i += 1) {
      re[i] = Math.hypot(re[i], im[i]) / FFT_SIZE;
      im[i] = 0;
    }
    fft(re, im);

    // Rotate by half a frame before windowing. Discarding the phase makes the
    // result symmetric about t = 0, so its energy sits at BOTH edges of the
    // frame — precisely where the Hann window is zero. Without this shift the
    // window erases most of the signal and the words come out slurred; it was
    // the difference between "tell me what to open" and "tell me what to
    // offer me" when this was checked against the reference implementation.
    for (let i = 0; i < FFT_SIZE; i += 1) {
      const shifted = re[(i + FFT_SIZE / 2) % FFT_SIZE];
      out[start + i] += shifted * HANN[i];
      norm[start + i] += HANN[i] * HANN[i];
    }
  }

  for (let i = 0; i < out.length; i += 1) {
    if (norm[i] > 1e-6) out[i] /= norm[i];
  }
  return out;
}

/** One-pole filters — enough for a band limit, and cheap. */
function highpass(data: Float32Array, sampleRate: number, hz: number) {
  const rc = 1 / (2 * Math.PI * hz);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  let prevIn = data[0];
  let prevOut = data[0];
  for (let i = 1; i < data.length; i += 1) {
    const current = data[i];
    prevOut = alpha * (prevOut + current - prevIn);
    prevIn = current;
    data[i] = prevOut;
  }
}

function lowpass(data: Float32Array, sampleRate: number, hz: number) {
  const rc = 1 / (2 * Math.PI * hz);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  let prev = data[0];
  for (let i = 1; i < data.length; i += 1) {
    prev += alpha * (data[i] - prev);
    data[i] = prev;
  }
}

/** Applies the full chain. Returns a new buffer; the input is untouched. */
export function robotise(input: Float32Array, sampleRate: number): Float32Array {
  const out = phaseZero(input);

  const step = (2 * Math.PI * CARRIER_HZ) / sampleRate;
  for (let i = 0; i < out.length; i += 1) {
    out[i] *= 1 - CARRIER_DEPTH + CARRIER_DEPTH * Math.sin(step * i);
  }

  const dry = Float32Array.from(out);
  const delays = ECHO_MS.map((ms) => Math.round((ms / 1000) * sampleRate));
  for (let i = 0; i < out.length; i += 1) {
    let sum = dry[i] * ECHO_IN_GAIN;
    for (let d = 0; d < delays.length; d += 1) {
      const j = i - delays[d];
      if (j >= 0) sum += dry[j] * ECHO_DECAY[d];
    }
    out[i] = sum;
  }

  highpass(out, sampleRate, HIGHPASS_HZ);
  lowpass(out, sampleRate, LOWPASS_HZ);

  // Normalise to a consistent peak so no reply is louder than another, then
  // hard-limit whatever the comb pushed over.
  let peak = 0;
  for (let i = 0; i < out.length; i += 1) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 1e-6 ? 0.92 / peak : 1;
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Math.max(-1, Math.min(1, out[i] * gain));
  }

  return out;
}
