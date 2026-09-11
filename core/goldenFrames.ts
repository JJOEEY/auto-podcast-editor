export type GoldenFilterClass = 'deterministic' | 'stochastic';

export interface GoldenFrameOptions {
  width: number;
  height: number;
  filterClass: GoldenFilterClass;
  expectedSeed?: number;
  actualSeed?: number;
  minSsim?: number;
  maxMeanAbsoluteError?: number;
}

export interface GoldenFrameResult {
  passed: boolean;
  exact: boolean;
  seedMatched: boolean;
  ssim: number;
  meanAbsoluteError: number;
  pixelsCompared: number;
}

function luminance(data: Uint8Array, offset: number): number {
  return 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
}

/** Compare RGBA8 golden frames with global SSIM and an explicit stochastic seed check. */
export function compareGoldenFrames(expected: Uint8Array, actual: Uint8Array, options: GoldenFrameOptions): GoldenFrameResult {
  if (!Number.isInteger(options.width) || options.width <= 0 || !Number.isInteger(options.height) || options.height <= 0) {
    throw new RangeError('golden frame dimensions must be positive integers');
  }
  const pixelsCompared = options.width * options.height;
  const expectedBytes = pixelsCompared * 4;
  if (expected.byteLength !== expectedBytes || actual.byteLength !== expectedBytes) {
    throw new RangeError(`golden frame must contain exactly ${expectedBytes} RGBA bytes`);
  }
  const expectedLuma = new Float64Array(pixelsCompared);
  const actualLuma = new Float64Array(pixelsCompared);
  let sumExpected = 0;
  let sumActual = 0;
  let sumError = 0;
  let exact = true;
  for (let pixel = 0; pixel < pixelsCompared; pixel += 1) {
    const offset = pixel * 4;
    const expectedValue = luminance(expected, offset);
    const actualValue = luminance(actual, offset);
    expectedLuma[pixel] = expectedValue;
    actualLuma[pixel] = actualValue;
    sumExpected += expectedValue;
    sumActual += actualValue;
    sumError += Math.abs(expectedValue - actualValue) / 255;
    if (expected[offset] !== actual[offset] || expected[offset + 1] !== actual[offset + 1] || expected[offset + 2] !== actual[offset + 2] || expected[offset + 3] !== actual[offset + 3]) exact = false;
  }
  const meanExpected = sumExpected / pixelsCompared;
  const meanActual = sumActual / pixelsCompared;
  let varianceExpected = 0;
  let varianceActual = 0;
  let covariance = 0;
  for (let pixel = 0; pixel < pixelsCompared; pixel += 1) {
    const expectedDelta = expectedLuma[pixel] - meanExpected;
    const actualDelta = actualLuma[pixel] - meanActual;
    varianceExpected += expectedDelta * expectedDelta;
    varianceActual += actualDelta * actualDelta;
    covariance += expectedDelta * actualDelta;
  }
  const divisor = Math.max(1, pixelsCompared - 1);
  varianceExpected /= divisor;
  varianceActual /= divisor;
  covariance /= divisor;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  const ssim = ((2 * meanExpected * meanActual + c1) * (2 * covariance + c2))
    / ((meanExpected ** 2 + meanActual ** 2 + c1) * (varianceExpected + varianceActual + c2));
  const meanAbsoluteError = sumError / pixelsCompared;
  const minSsim = options.minSsim ?? 0.98;
  const maxMeanAbsoluteError = options.maxMeanAbsoluteError ?? 0.02;
  const seedMatched = options.filterClass === 'deterministic' || options.expectedSeed === options.actualSeed;
  return {
    passed: Number.isFinite(ssim) && ssim >= minSsim && meanAbsoluteError <= maxMeanAbsoluteError && seedMatched,
    exact,
    seedMatched,
    ssim,
    meanAbsoluteError,
    pixelsCompared,
  };
}
