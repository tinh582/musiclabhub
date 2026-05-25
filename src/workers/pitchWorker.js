import { YIN } from 'pitchfinder';

let detector = null;

onmessage = function (e) {
  const { cmd, audioBuffer, sampleRate } = e.data;
  if (cmd === 'init') {
    detector = YIN({ sampleRate });
    postMessage({ status: 'ok' });
    return;
  }

  if (cmd === 'detect') {
    try {
      const data = new Float32Array(audioBuffer);
      const frameSize = 2048;
      const hop = 512;
      const detectorLocal = detector || YIN({ sampleRate });
      const frames = [];
      for (let i = 0; i + frameSize < data.length; i += hop) {
        const frame = data.subarray(i, i + frameSize);
        const freq = detectorLocal(frame) || -1;
        frames.push({ index: i, freq });
      }

      // group consecutive frequency detections into events
      const events = [];
      let cur = null;
      for (let i = 0; i < frames.length; i += 1) {
        const f = frames[i].freq;
        if (f > 0) {
          if (!cur) {
            cur = { startIndex: frames[i].index, freqs: [f], frames: 1 };
          } else {
            cur.freqs.push(f);
            cur.frames += 1;
          }
        } else if (cur) {
          // finalize
          const avg = cur.freqs.reduce((a, b) => a + b, 0) / cur.freqs.length;
          const time = cur.startIndex / sampleRate;
          events.push({ time, frequency: avg });
          cur = null;
        }
      }
      if (cur) {
        const avg = cur.freqs.reduce((a, b) => a + b, 0) / cur.freqs.length;
        const time = cur.startIndex / sampleRate;
        events.push({ time, frequency: avg });
      }

      postMessage({ status: 'done', events, duration: data.length / sampleRate });
    } catch (err) {
      postMessage({ status: 'error', message: err.message });
    }
  }
};
