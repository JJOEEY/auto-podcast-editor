export interface PcmEquivalenceOptions {
  minSnrDb?: number;
  maxAbsoluteError?: number;
  nearSilenceRms?: number;
}

export interface PcmEquivalenceResult {
  passed: boolean;
  samplesCompared: number;
  maxAbsoluteError: number;
  rmsError: number;
  rmsSignal: number;
  snrDb: number;
}

/** Compares decoded PCM16 before lossy encoding; silence uses an absolute-error gate. */
export function comparePcm16(expected: Uint8Array, actual: Uint8Array, options: PcmEquivalenceOptions = {}): PcmEquivalenceResult {
  const minSnrDb = options.minSnrDb ?? 60;
  const maxAbsoluteError = options.maxAbsoluteError ?? 2 / 32768;
  const nearSilenceRms = options.nearSilenceRms ?? 1 / 32768;
  const samples = Math.min(expected.byteLength, actual.byteLength) - (Math.min(expected.byteLength, actual.byteLength) % 2);
  let sumSignal = 0;
  let sumError = 0;
  let maxError = 0;
  const expectedView = new DataView(expected.buffer, expected.byteOffset, expected.byteLength);
  const actualView = new DataView(actual.buffer, actual.byteOffset, actual.byteLength);
  for (let offset = 0; offset < samples; offset += 2) {
    const signal = expectedView.getInt16(offset, true) / 32768;
    const error = signal - actualView.getInt16(offset, true) / 32768;
    sumSignal += signal * signal;
    sumError += error * error;
    maxError = Math.max(maxError, Math.abs(error));
  }
  const samplesCompared = samples / 2;
  const rmsSignal = samplesCompared > 0 ? Math.sqrt(sumSignal / samplesCompared) : 0;
  const rmsError = samplesCompared > 0 ? Math.sqrt(sumError / samplesCompared) : Number.POSITIVE_INFINITY;
  const snrDb = rmsError === 0 ? Number.POSITIVE_INFINITY : 20 * Math.log10(Math.max(rmsSignal, Number.EPSILON) / rmsError);
  const sameLength = expected.byteLength === actual.byteLength;
  const passed = sameLength && (rmsSignal <= nearSilenceRms ? maxError <= maxAbsoluteError : snrDb >= minSnrDb);
  return { passed, samplesCompared, maxAbsoluteError: maxError, rmsError, rmsSignal, snrDb };
}
