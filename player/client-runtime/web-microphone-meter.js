(function installPixoWebMicrophone(globalObject, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (globalObject) globalObject.PixoWebMicrophone = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPixoWebMicrophone() {
  "use strict";

  const MIN_DBFS = -96;
  const DIGITAL_SILENCE_DBFS = -90;
  const DEFAULT_NOISE_FLOOR_DBFS = -86;
  const DEFAULT_PEAK_NOISE_FLOOR_DBFS = -80;
  const MIN_NOISE_FLOOR_DBFS = -86;
  const MAX_NOISE_FLOOR_DBFS = -20;
  const MAX_PEAK_NOISE_FLOOR_DBFS = -1;
  const MIN_CALIBRATION_FRAMES = 8;
  const MAX_CALIBRATION_FRAMES = 24;
  const MIN_LIVE_CALIBRATION_FRAMES = 4;
  const CALIBRATION_WINDOW_FRAMES = 12;
  const NOISE_TRACKING_HEADROOM_DB = 5;
  const MINIMUM_PITCH_HZ = 80;
  const MAXIMUM_PITCH_HZ = 400;
  const MINIMUM_PITCH_CORRELATION = 0.28;
  const FULL_PITCH_CORRELATION = 0.52;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalize(value, floor, ceiling) {
    return clamp(((value - floor) / (ceiling - floor)) * 100, 0, 100);
  }

  function amplitudeToDbfs(amplitude) {
    if (!(amplitude > 0)) return MIN_DBFS;
    return clamp(20 * Math.log10(amplitude), MIN_DBFS, 0);
  }

  function percentile(values, ratio, fallback) {
    if (!values.length) return fallback;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.floor((sorted.length - 1) * ratio)];
  }

  function estimatePitch(samples, count, sampleRate, sampleMean) {
    const safeSampleRate = Math.max(1, Number(sampleRate) || 16_000);
    if (count < 3) return { pitchHz: 0, pitchConfidence: 0 };
    const minimumLag = Math.max(2, Math.floor(safeSampleRate / MAXIMUM_PITCH_HZ));
    const minimumOverlap = Math.max(32, Math.floor(count / 3));
    const maximumLag = Math.min(
      count - minimumOverlap,
      Math.floor(safeSampleRate / MINIMUM_PITCH_HZ),
    );
    if (maximumLag <= minimumLag) return { pitchHz: 0, pitchConfidence: 0 };

    let bestLag = 0;
    let bestCorrelation = Number.NEGATIVE_INFINITY;
    for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
      const overlap = count - lag;
      let correlation = 0;
      let leadingEnergy = 0;
      let trailingEnergy = 0;
      for (let index = 0; index < overlap; index += 1) {
        const leading = (Number(samples[index]) || 0) - sampleMean;
        const trailing = (Number(samples[index + lag]) || 0) - sampleMean;
        correlation += leading * trailing;
        leadingEnergy += leading * leading;
        trailingEnergy += trailing * trailing;
      }
      const energyProduct = leadingEnergy * trailingEnergy;
      if (!(energyProduct > 0)) continue;
      const normalizedCorrelation = correlation / Math.sqrt(energyProduct);
      if (normalizedCorrelation > bestCorrelation + 0.001) {
        bestCorrelation = normalizedCorrelation;
        bestLag = lag;
      }
    }
    if (!bestLag || bestCorrelation < MINIMUM_PITCH_CORRELATION) {
      return { pitchHz: 0, pitchConfidence: 0 };
    }
    return {
      pitchHz: safeSampleRate / bestLag,
      pitchConfidence: clamp(
        ((bestCorrelation - MINIMUM_PITCH_CORRELATION)
          / (FULL_PITCH_CORRELATION - MINIMUM_PITCH_CORRELATION)) * 100,
        0,
        100,
      ),
    };
  }

  function analyzeFloatPcm(samples, sampleRate = 16_000) {
    const count = samples && Number.isInteger(samples.length) ? samples.length : 0;
    if (!count) {
      return {
        rms: 0,
        peak: 0,
        zeroCrossingRate: 0,
        pitchHz: 0,
        pitchConfidence: 0,
      };
    }
    let mean = 0;
    for (let index = 0; index < count; index += 1) mean += Number(samples[index]) || 0;
    mean /= count;
    let squareSum = 0;
    let peak = 0;
    let zeroCrossings = 0;
    let previousSign = 0;
    for (let index = 0; index < count; index += 1) {
      const centered = (Number(samples[index]) || 0) - mean;
      squareSum += centered * centered;
      peak = Math.max(peak, Math.abs(centered));
      const sign = centered > 0 ? 1 : (centered < 0 ? -1 : 0);
      if (sign) {
        if (previousSign && sign !== previousSign) zeroCrossings += 1;
        previousSign = sign;
      }
    }
    const crossingRate = count > 1
      ? (zeroCrossings / (count - 1)) * Math.max(1, Number(sampleRate) || 16_000) / 16_000
      : 0;
    const pitch = estimatePitch(samples, count, sampleRate, mean);
    return {
      rms: clamp(Math.sqrt(squareSum / count), 0, 1),
      peak: clamp(peak, 0, 1),
      zeroCrossingRate: clamp(crossingRate, 0, 1),
      pitchHz: pitch.pitchHz,
      pitchConfidence: pitch.pitchConfidence,
    };
  }

  class MicrophoneLevelMeter {
    constructor() {
      this.calibrationRmsDbfs = [];
      this.calibrationPeakDbfs = [];
      this.calibrationFrameCount = 0;
      this.normalizationReady = false;
      this.noiseFloorDbfs = DEFAULT_NOISE_FLOOR_DBFS;
      this.peakNoiseFloorDbfs = DEFAULT_PEAK_NOISE_FLOOR_DBFS;
      this.smoothedScore = 0;
      this.previousPeakDbfs = null;
    }

    update(rms, peak, zeroCrossingRate = 0) {
      const safeRms = clamp(Number.isFinite(rms) ? rms : 0, 0, 1);
      const safePeak = clamp(Number.isFinite(peak) ? peak : 0, 0, 1);
      const safeCrossingRate = clamp(
        Number.isFinite(zeroCrossingRate) ? zeroCrossingRate : 0,
        0,
        1,
      );
      const rmsDbfs = amplitudeToDbfs(safeRms);
      const peakDbfs = amplitudeToDbfs(safePeak);
      const becameReady = this.updateNoiseFloors(rmsDbfs, peakDbfs);
      const signalToNoiseDb = clamp(rmsDbfs - this.noiseFloorDbfs, -96, 96);
      const peakSignalToNoiseDb = clamp(peakDbfs - this.peakNoiseFloorDbfs, -96, 96);
      const instantScore = this.normalizationReady && rmsDbfs > DIGITAL_SILENCE_DBFS
        ? normalize(signalToNoiseDb, 6, 34)
        : 0;
      const peakScore = this.normalizationReady && peakDbfs > DIGITAL_SILENCE_DBFS
        ? normalize(peakSignalToNoiseDb, 4, 24)
        : 0;
      const noiseScore = normalize(safeCrossingRate, 0.04, 0.32);
      const peakRiseDb = this.previousPeakDbfs === null
        ? 0
        : Math.max(0, peakDbfs - this.previousPeakDbfs);
      const ambientCrestDb = Math.max(0, this.peakNoiseFloorDbfs - this.noiseFloorDbfs);
      const crestExcessDb = Math.max(0, Math.max(0, peakDbfs - rmsDbfs) - ambientCrestDb);
      const transientScore = this.normalizationReady && !becameReady
        ? clamp(
          normalize(peakRiseDb, 3, 18) * 0.75
            + normalize(crestExcessDb, 2, 18) * 0.25,
          0,
          100,
        )
        : 0;
      this.previousPeakDbfs = this.normalizationReady ? peakDbfs : null;
      if (this.normalizationReady) {
        const smoothing = instantScore >= this.smoothedScore ? 0.85 : 0.30;
        this.smoothedScore += (instantScore - this.smoothedScore) * smoothing;
        if (this.smoothedScore < 0.05) this.smoothedScore = 0;
      } else {
        this.smoothedScore = 0;
      }
      return {
        rms: safeRms,
        peak: safePeak,
        rmsDbfs,
        peakDbfs,
        instantScore,
        peakScore,
        transientScore,
        noiseScore,
        zeroCrossingRate: safeCrossingRate,
        score: clamp(this.smoothedScore, 0, 100),
        noiseFloorDbfs: this.noiseFloorDbfs,
        peakNoiseFloorDbfs: this.peakNoiseFloorDbfs,
        signalToNoiseDb,
        peakSignalToNoiseDb,
        peakRiseDb,
        normalizationReady: this.normalizationReady,
        calibrationProgress: this.normalizationReady
          ? 1
          : clamp(this.calibrationFrameCount / MIN_CALIBRATION_FRAMES, 0, 0.95),
      };
    }

    updateNoiseFloors(rmsDbfs, peakDbfs) {
      if (!this.normalizationReady) {
        this.calibrationFrameCount += 1;
        if (rmsDbfs > DIGITAL_SILENCE_DBFS) {
          this.calibrationRmsDbfs.push(rmsDbfs);
          this.calibrationPeakDbfs.push(peakDbfs);
        }
        const minimumFramesReached = this.calibrationFrameCount >= MIN_CALIBRATION_FRAMES;
        const enoughLiveInput = this.calibrationRmsDbfs.length >= MIN_LIVE_CALIBRATION_FRAMES;
        const timedOut = this.calibrationFrameCount >= MAX_CALIBRATION_FRAMES;
        if (!minimumFramesReached || (!enoughLiveInput && !timedOut)) return false;
        this.noiseFloorDbfs = clamp(
          percentile(
            this.calibrationRmsDbfs.slice(-CALIBRATION_WINDOW_FRAMES),
            0.25,
            DEFAULT_NOISE_FLOOR_DBFS,
          ),
          MIN_NOISE_FLOOR_DBFS,
          MAX_NOISE_FLOOR_DBFS,
        );
        this.peakNoiseFloorDbfs = clamp(
          percentile(
            this.calibrationPeakDbfs.slice(-CALIBRATION_WINDOW_FRAMES),
            0.75,
            DEFAULT_PEAK_NOISE_FLOOR_DBFS,
          ),
          this.noiseFloorDbfs,
          MAX_PEAK_NOISE_FLOOR_DBFS,
        );
        this.normalizationReady = true;
        return true;
      }
      if (rmsDbfs <= DIGITAL_SILENCE_DBFS) return false;
      const rmsDelta = rmsDbfs - this.noiseFloorDbfs;
      const rmsAlpha = rmsDelta < 0 ? 0.20 : (rmsDelta <= NOISE_TRACKING_HEADROOM_DB ? 0.03 : 0.0001);
      this.noiseFloorDbfs = clamp(
        this.noiseFloorDbfs + rmsDelta * rmsAlpha,
        MIN_NOISE_FLOOR_DBFS,
        MAX_NOISE_FLOOR_DBFS,
      );
      const peakDelta = peakDbfs - this.peakNoiseFloorDbfs;
      const peakAlpha = peakDelta < 0 ? 0.20 : (rmsDelta <= NOISE_TRACKING_HEADROOM_DB ? 0.01 : 0.0001);
      this.peakNoiseFloorDbfs = clamp(
        this.peakNoiseFloorDbfs + peakDelta * peakAlpha,
        this.noiseFloorDbfs,
        MAX_PEAK_NOISE_FLOOR_DBFS,
      );
      return false;
    }
  }

  return Object.freeze({
    MicrophoneLevelMeter,
    analyzeFloatPcm,
  });
});
