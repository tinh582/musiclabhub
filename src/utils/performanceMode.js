export function isLowPowerDevice() {
  if (typeof navigator === 'undefined') return false;

  const memory = Number(navigator.deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);
  const saveData = Boolean(navigator.connection?.saveData);
  const ua = navigator.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  return saveData || memory > 0 && memory <= 2 || cores > 0 && cores <= 4 || mobile;
}
