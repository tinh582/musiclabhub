export const PROCESSING_QUALITY = {
  economy: {
    label: 'Economy',
    impulseDensity: 0.35,
    impulseChannels: 1,
    oversample: 'none',
    smoothingSeconds: 0.035,
  },
  balanced: {
    label: 'Balanced',
    impulseDensity: 0.68,
    impulseChannels: 2,
    oversample: '2x',
    smoothingSeconds: 0.025,
  },
  studio: {
    label: 'Studio',
    impulseDensity: 1,
    impulseChannels: 2,
    oversample: '4x',
    smoothingSeconds: 0.018,
  },
};

export function equalPowerMix(wet) {
  const amount = Math.min(1, Math.max(0, Number(wet) || 0));
  return {
    dry: Math.cos(amount * Math.PI * 0.5),
    wet: Math.sin(amount * Math.PI * 0.5),
  };
}

export function processingHeadroom(distortion, feedback) {
  const stress = Math.min(1, Math.max(0, distortion) * 0.65 + Math.max(0, feedback - 0.45));
  return Math.max(0.58, 0.92 - stress * 0.3);
}

export function qualityConfig(name) {
  return PROCESSING_QUALITY[name] || PROCESSING_QUALITY.balanced;
}
