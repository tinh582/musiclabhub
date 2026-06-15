import { YIN } from 'pitchfinder';

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function frequencyToMidi(frequency) {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

function midiToFrequency(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
}

onmessage = function (e) {
  const { cmd, audioBuffer, sampleRate } = e.data;
  if (cmd === 'init') {
    postMessage({ status: 'ok' });
    return;
  }

  if (cmd === 'detect') {
    try {
      const data = new Float32Array(audioBuffer);
      const frameSize = 2048;
      const hop = 512;
      // AudioContext decoding commonly returns 44.1 or 48 kHz. The detector
      // must be created from the actual buffer rate or every pitch is shifted.
      const detectorLocal = YIN({ sampleRate, threshold: 0.15 });
      const frames = [];
      for (let i = 0; i + frameSize < data.length; i += hop) {
        const frame = data.subarray(i, i + frameSize);
        let energy = 0;
        for (let j = 0; j < frame.length; j += 1) energy += frame[j] * frame[j];
        const rms = Math.sqrt(energy / frame.length);
        const frequency = rms >= 0.006 ? detectorLocal(frame) || -1 : -1;
        const valid = frequency >= 55 && frequency <= 2400;
        frames.push({
          index: i,
          midi: valid ? frequencyToMidi(frequency) : null,
          frequency: valid ? frequency : null,
          rms,
        });
        if (frames.length % 180 === 0) {
          postMessage({ status: 'progress', progress: i / data.length });
        }
      }

      // Remove isolated pitch jumps with a local median before event grouping.
      const smoothed = frames.map((frame, index) => {
        const neighborhood = frames
          .slice(Math.max(0, index - 2), Math.min(frames.length, index + 3))
          .map((item) => item.midi)
          .filter((value) => value != null);
        if (frame.midi == null) {
          // Bridge a single weak frame only when both sides support one pitch.
          const previous = frames[index - 1]?.midi;
          const next = frames[index + 1]?.midi;
          if (previous != null && next != null && Math.abs(previous - next) <= 1) {
            return { ...frame, midi: Math.round((previous + next) / 2) };
          }
          return frame;
        }
        return { ...frame, midi: median(neighborhood) };
      });

      const events = [];
      let cur = null;

      function finalize() {
        if (!cur) return;
        const duration = (cur.endIndex + hop - cur.startIndex) / sampleRate;
        if (duration >= 0.1 && cur.midis.length >= 3) {
          const stableMidi = Math.round(median(cur.midis));
          const agreement = cur.midis.filter((value) => Math.abs(value - stableMidi) <= 1).length / cur.midis.length;
          if (agreement >= 0.5) {
            events.push({
              time: cur.startIndex / sampleRate,
              duration,
              frequency: midiToFrequency(stableMidi),
              confidence: agreement,
            });
          }
        }
        cur = null;
      }

      for (const frame of smoothed) {
        if (frame.midi == null) {
          finalize();
          continue;
        }
        if (!cur) {
          cur = { startIndex: frame.index, endIndex: frame.index, midis: [frame.midi] };
          continue;
        }
        const center = median(cur.midis);
        if (Math.abs(frame.midi - center) <= 1) {
          cur.endIndex = frame.index;
          cur.midis.push(frame.midi);
        } else {
          finalize();
          cur = { startIndex: frame.index, endIndex: frame.index, midis: [frame.midi] };
        }
      }
      finalize();

      const voicedDuration = events.reduce((sum, event) => sum + event.duration, 0);
      postMessage({
        status: 'done',
        events,
        duration: data.length / sampleRate,
        summary: {
          voicedRatio: voicedDuration / Math.max(0.001, data.length / sampleRate),
          averageConfidence: events.length
            ? events.reduce((sum, event) => sum + event.confidence, 0) / events.length
            : 0,
          noteCount: events.length,
          quality: events.length ? 'fallback' : 'low',
          warning: events.length
            ? 'Using local pitch estimation. Mixed or polyphonic audio may contain approximate melody notes.'
            : 'No stable melody was found. Try a louder vocal, piano, or single-instrument section.',
        },
      });
    } catch (err) {
      postMessage({ status: 'error', message: err.message });
    }
  }
};
