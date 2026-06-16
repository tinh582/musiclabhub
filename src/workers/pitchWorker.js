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

function pushEvent(events, startIndex, endIndex, midis, sampleRate, hop, confidenceBase = 0.3) {
  if (!midis.length) return;
  const duration = (endIndex + hop - startIndex) / sampleRate;
  if (duration < 0.045) return;
  const stableMidi = Math.round(median(midis));
  const agreement = midis.filter((value) => Math.abs(value - stableMidi) <= 2).length / midis.length;
  events.push({
    time: startIndex / sampleRate,
    duration,
    frequency: midiToFrequency(stableMidi),
    confidence: Math.min(0.88, confidenceBase + agreement * 0.34 + Math.min(0.12, duration * 0.08)),
  });
}

function buildOnsetEvents(frames, sampleRate, hop, durationSeconds) {
  if (frames.length < 8) return [];
  const rmsValues = frames.map((frame) => frame.rms);
  const sortedRms = [...rmsValues].sort((a, b) => a - b);
  const medianRms = sortedRms[Math.floor(sortedRms.length * 0.5)] || 0;
  const activeRms = sortedRms[Math.floor(sortedRms.length * 0.75)] || 0;
  const flux = frames.map((frame, index) => Math.max(0, frame.rms - (frames[index - 1]?.rms || frame.rms)));
  const sortedFlux = [...flux].sort((a, b) => a - b);
  const fluxFloor = Math.max(0.0008, sortedFlux[Math.floor(sortedFlux.length * 0.78)] || 0);
  const minGapFrames = Math.max(4, Math.round((0.11 * sampleRate) / hop));
  const onsets = [0];

  for (let index = 2; index < frames.length - 2; index += 1) {
    const locallyStrong = flux[index] >= flux[index - 1] && flux[index] >= flux[index + 1];
    const activeEnough = frames[index].rms > Math.max(0.0015, medianRms * 1.25, activeRms * 0.18);
    const spaced = index - onsets[onsets.length - 1] >= minGapFrames;
    if (locallyStrong && activeEnough && flux[index] >= fluxFloor && spaced) {
      onsets.push(index);
    }
  }

  const events = [];
  for (let onsetIndex = 0; onsetIndex < onsets.length; onsetIndex += 1) {
    const startFrame = onsets[onsetIndex];
    const nextFrame = onsets[onsetIndex + 1] ?? frames.length - 1;
    const segmentFrames = frames.slice(startFrame, nextFrame);
    const localMidis = segmentFrames
      .filter((frame) => frame.midi != null && frame.rms > Math.max(0.001, medianRms * 0.85))
      .map((frame) => frame.midi);
    if (localMidis.length < 2) continue;
    const stableMidi = Math.round(median(localMidis));
    const agreement = localMidis.filter((midi) => Math.abs(midi - stableMidi) <= 3).length / localMidis.length;
    if (agreement < 0.24) continue;
    const startTime = frames[startFrame].index / sampleRate;
    const nextTime = Math.min(durationSeconds, ((frames[nextFrame]?.index ?? frames[frames.length - 1].index) + hop) / sampleRate);
    const segmentDuration = Math.max(0.07, nextTime - startTime);
    if (segmentDuration < 0.07) continue;
    events.push({
      time: startTime,
      duration: Math.min(segmentDuration, 1.2),
      frequency: midiToFrequency(stableMidi),
      confidence: Math.min(0.78, 0.28 + agreement * 0.32 + Math.min(0.12, segmentDuration * 0.08)),
    });
  }

  return events;
}

function fillTraceGaps(traceEvents, onsetEvents, durationSeconds) {
  if (!traceEvents.length || !onsetEvents.length) return traceEvents;
  const output = [];
  const usableOnsets = onsetEvents.filter((event) => event.confidence >= 0.46 && event.duration >= 0.09);

  for (let index = 0; index < traceEvents.length; index += 1) {
    const current = traceEvents[index];
    output.push(current);
    const next = traceEvents[index + 1];
    const gapStart = current.time + current.duration;
    const gapEnd = next ? next.time : durationSeconds;
    const gap = gapEnd - gapStart;
    if (gap < 0.45) continue;

    const candidates = usableOnsets.filter((event) => {
      const startsInsideGap = event.time >= gapStart + 0.04 && event.time < gapEnd - 0.04;
      const notTooLong = event.duration <= Math.min(1.1, gap * 0.9);
      return startsInsideGap && notTooLong;
    });
    const maxFillers = Math.min(10, Math.max(1, Math.floor(gap / 0.22)));
    output.push(...candidates.slice(0, maxFillers));
  }

  return output.sort((a, b) => a.time - b.time);
}

function mergeCoverageEvents(eventGroups) {
  const candidates = eventGroups
    .flat()
    .filter((event) => event && Number.isFinite(event.time) && Number.isFinite(event.duration) && event.duration > 0)
    .sort((a, b) => a.time - b.time || b.confidence - a.confidence);
  const output = [];

  for (const event of candidates) {
    const eventMidi = frequencyToMidi(event.frequency);
    const duplicate = output.find((existing) => {
      const overlapStart = Math.max(existing.time, event.time);
      const overlapEnd = Math.min(existing.time + existing.duration, event.time + event.duration);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const shorter = Math.max(0.001, Math.min(existing.duration, event.duration));
      const closePitch = Math.abs(frequencyToMidi(existing.frequency) - eventMidi) <= 1;
      return closePitch && overlap / shorter >= 0.45;
    });

    if (duplicate) {
      if ((event.confidence || 0) > (duplicate.confidence || 0)) {
        duplicate.time = event.time;
        duplicate.duration = event.duration;
        duplicate.frequency = event.frequency;
        duplicate.confidence = event.confidence;
      }
      continue;
    }

    output.push({ ...event, confidence: Math.min(0.72, (event.confidence || 0.45) + 0.04) });
  }

  return output.sort((a, b) => a.time - b.time || frequencyToMidi(a.frequency) - frequencyToMidi(b.frequency));
}

function buildCoverageEvents(frames, sampleRate, hop, durationSeconds) {
  if (!frames.length) return [];
  const rmsValues = frames.map((frame) => frame.rms).sort((a, b) => a - b);
  const medianRms = rmsValues[Math.floor(rmsValues.length * 0.5)] || 0;
  const activeRms = rmsValues[Math.floor(rmsValues.length * 0.68)] || 0;
  const floor = Math.max(0.0012, medianRms * 0.8, activeRms * 0.16);
  const events = [];
  let segment = null;

  function finalizeSegment(endFrame) {
    if (!segment) return;
    const segmentFrames = frames.slice(segment.startFrame, endFrame);
    const midis = segmentFrames.map((frame) => frame.midi).filter((value) => value != null);
    if (midis.length >= 2) {
      const midi = Math.round(median(midis));
      const agreement = midis.filter((value) => Math.abs(value - midi) <= 4).length / midis.length;
      const startTime = frames[segment.startFrame].index / sampleRate;
      const endTime = Math.min(durationSeconds, ((frames[Math.max(endFrame - 1, segment.startFrame)]?.index || frames[segment.startFrame].index) + hop) / sampleRate);
      const duration = Math.max(0.05, endTime - startTime);
      if (duration >= 0.05 && agreement >= 0.18) {
        events.push({
          time: startTime,
          duration: Math.min(duration, 1.6),
          frequency: midiToFrequency(midi),
          confidence: Math.min(0.68, 0.22 + agreement * 0.28 + Math.min(0.12, duration * 0.08)),
        });
      }
    }
    segment = null;
  }

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const active = frame.rms >= floor;
    if (active && !segment) {
      segment = { startFrame: index };
    } else if (!active && segment) {
      finalizeSegment(index);
    }
  }
  finalizeSegment(frames.length);

  return events;
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
      const frameSize = 4096;
      const hop = 256;
      // AudioContext decoding commonly returns 44.1 or 48 kHz. The detector
      // must be created from the actual buffer rate or every pitch is shifted.
      const detectorLocal = YIN({ sampleRate, threshold: 0.15 });
      const rawFrames = [];
      for (let i = 0; i + frameSize < data.length; i += hop) {
        const frame = data.subarray(i, i + frameSize);
        let energy = 0;
        for (let j = 0; j < frame.length; j += 1) energy += frame[j] * frame[j];
        const rms = Math.sqrt(energy / frame.length);
        rawFrames.push({ index: i, frame, rms });
        if (rawFrames.length % 260 === 0) {
          postMessage({ status: 'progress', progress: 0.22 + (i / data.length) * 0.18, label: 'Measuring loudness' });
        }
      }

      postMessage({ status: 'progress', progress: 0.42, label: 'Preparing pitch scan' });
      const sortedRms = rawFrames.map((item) => item.rms).sort((a, b) => a - b);
      const quietRms = sortedRms[Math.floor(sortedRms.length * 0.2)] || 0;
      const activeRms = sortedRms[Math.floor(sortedRms.length * 0.75)] || 0;
      const rmsFloor = Math.max(0.0015, Math.min(0.008, quietRms * 2.5, activeRms * 0.22));
      const frames = [];
      for (let frameIndex = 0; frameIndex < rawFrames.length; frameIndex += 1) {
        const { index, frame, rms } = rawFrames[frameIndex];
        const frequency = rms >= rmsFloor ? detectorLocal(frame) || -1 : -1;
        const valid = frequency >= 55 && frequency <= 2400;
        frames.push({
          index,
          midi: valid ? frequencyToMidi(frequency) : null,
          frequency: valid ? frequency : null,
          rms,
        });
        if (frames.length % 180 === 0) {
          postMessage({ status: 'progress', progress: 0.42 + (index / data.length) * 0.43, label: 'Tracking pitch frame by frame' });
        }
      }

      postMessage({ status: 'progress', progress: 0.86, label: 'Stabilizing note events' });
      const onsetEvents = buildOnsetEvents(frames, sampleRate, hop, data.length / sampleRate);
      const coverageEvents = buildCoverageEvents(frames, sampleRate, hop, data.length / sampleRate);
      const contourEvents = [];
      let contour = null;
      for (const frame of frames) {
        if (frame.midi == null) {
          if (contour) {
            pushEvent(contourEvents, contour.startIndex, contour.endIndex, contour.midis, sampleRate, hop, 0.22);
            contour = null;
          }
          continue;
        }
        if (!contour) {
          contour = { startIndex: frame.index, endIndex: frame.index, midis: [frame.midi] };
          continue;
        }
        const center = median(contour.midis.slice(-8));
        if (Math.abs(frame.midi - center) <= 4) {
          contour.endIndex = frame.index;
          contour.midis.push(frame.midi);
        } else {
          pushEvent(contourEvents, contour.startIndex, contour.endIndex, contour.midis, sampleRate, hop, 0.22);
          contour = { startIndex: frame.index, endIndex: frame.index, midis: [frame.midi] };
        }
      }
      if (contour) {
        pushEvent(contourEvents, contour.startIndex, contour.endIndex, contour.midis, sampleRate, hop, 0.22);
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
        if (duration >= 0.055 && cur.midis.length >= 2) {
          const stableMidi = Math.round(median(cur.midis));
          const agreement = cur.midis.filter((value) => Math.abs(value - stableMidi) <= 1).length / cur.midis.length;
          if (agreement >= 0.4) {
            events.push({
              time: cur.startIndex / sampleRate,
              duration,
              frequency: midiToFrequency(stableMidi),
              confidence: Math.min(0.92, 0.35 + agreement * 0.42 + Math.min(0.15, duration * 0.12)),
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

      postMessage({ status: 'progress', progress: 0.94, label: 'Merging detected notes' });
      const mergedEvents = [];
      for (const event of events) {
        const previous = mergedEvents[mergedEvents.length - 1];
        const previousMidi = previous ? frequencyToMidi(previous.frequency) : null;
        const eventMidi = frequencyToMidi(event.frequency);
        const gap = previous ? event.time - (previous.time + previous.duration) : Infinity;
        if (previous && previousMidi === eventMidi && gap >= 0 && gap <= 0.14) {
          const end = event.time + event.duration;
          previous.duration = end - previous.time;
          previous.confidence = Math.min(0.94, (previous.confidence + event.confidence) / 2 + 0.03);
        } else {
          mergedEvents.push({ ...event });
        }
      }

      const stableVoicedDuration = mergedEvents.reduce((sum, event) => sum + event.duration, 0);
      const contourVoicedDuration = contourEvents.reduce((sum, event) => sum + event.duration, 0);
      const onsetVoicedDuration = onsetEvents.reduce((sum, event) => sum + event.duration, 0);
      const stableRatio = stableVoicedDuration / Math.max(0.001, data.length / sampleRate);
      const onsetAverageConfidence = onsetEvents.length
        ? onsetEvents.reduce((sum, event) => sum + event.confidence, 0) / onsetEvents.length
        : 0;
      const onsetDensity = onsetEvents.length / Math.max(1, data.length / sampleRate);
      const useOnsetFallback = stableRatio < 0.08
        && onsetAverageConfidence >= 0.62
        && onsetDensity <= 2.2
        && onsetVoicedDuration > Math.max(stableVoicedDuration * 2.4, contourVoicedDuration * 1.15);
      const useContourFallback = !useOnsetFallback && stableRatio < 0.04 && contourEvents.length > mergedEvents.length;
      const hybridEvents = useContourFallback ? fillTraceGaps(contourEvents, onsetEvents, data.length / sampleRate) : [];
      const coverageHybridEvents = mergeCoverageEvents([
        mergedEvents,
        contourEvents,
        onsetEvents.filter((event) => event.confidence >= 0.44),
        coverageEvents,
      ]);
      const coverageVoicedDuration = coverageHybridEvents.reduce((sum, event) => sum + event.duration, 0);
      const useCoverageFallback = !useOnsetFallback
        && coverageHybridEvents.length > Math.max(mergedEvents.length * 1.6, contourEvents.length * 1.15, 24)
        && coverageVoicedDuration > Math.max(stableVoicedDuration * 2.2, contourVoicedDuration * 1.15);
      const outputEvents = useOnsetFallback
        ? onsetEvents
        : useCoverageFallback
        ? coverageHybridEvents
        : useContourFallback
        ? hybridEvents
        : mergedEvents;
      const voicedDuration = useOnsetFallback
        ? onsetVoicedDuration
        : useCoverageFallback
        ? coverageVoicedDuration
        : useContourFallback
        ? contourVoicedDuration
        : stableVoicedDuration;
      postMessage({
        status: 'done',
        events: outputEvents,
        duration: data.length / sampleRate,
        summary: {
          voicedRatio: voicedDuration / Math.max(0.001, data.length / sampleRate),
          averageConfidence: outputEvents.length
            ? outputEvents.reduce((sum, event) => sum + event.confidence, 0) / outputEvents.length
            : 0,
          noteCount: outputEvents.length,
          stableNoteCount: mergedEvents.length,
          traceNoteCount: contourEvents.length,
          onsetNoteCount: onsetEvents.length,
          hybridNoteCount: (useCoverageFallback ? coverageHybridEvents.length : hybridEvents.length) || undefined,
          coverageNoteCount: coverageEvents.length,
          quality: outputEvents.length ? 'fallback' : 'low',
          warning: outputEvents.length
            ? useOnsetFallback
              ? 'Showing piano-style attack segments because stable pitch tracking left large gaps. Treat exported notes as an editable draft.'
              : useCoverageFallback
              ? 'Showing a high-coverage local draft because the regular detector left too much empty space. Expect extra notes and cleanup.'
              : useContourFallback
              ? 'Showing a local melody trace with cautious gap filling. Treat exported notes as an editable draft.'
              : 'Using local pitch estimation. Mixed or polyphonic audio may contain approximate melody notes.'
            : 'No stable melody was found. Try a louder vocal, piano, or single-instrument section.',
        },
      });
    } catch (err) {
      postMessage({ status: 'error', message: err.message });
    }
  }
};
