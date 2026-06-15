from __future__ import annotations

import math
import os
from typing import Any

import librosa
import numpy as np
from flask import Flask, jsonify, request
from flask_cors import CORS
from lxml import etree


app = Flask(__name__)
CORS(app)


NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def frequency_to_note_parts(frequency: float) -> tuple[str, int, int]:
    note_number = 12 * (math.log(frequency / 440.0) / math.log(2)) + 69
    rounded_number = int(round(note_number))
    octave = rounded_number // 12 - 1
    note_name = NOTE_NAMES[(rounded_number % 12) % 12]
    step = note_name.replace('#', '')
    alter = 1 if '#' in note_name else 0
    return step, alter, octave


def frequency_to_note_name(frequency: float) -> str:
    step, alter, octave = frequency_to_note_parts(frequency)
    accidental = '#' if alter else ''
    return f'{step}{accidental}{octave}'


def unique_sorted(values: list[float], minimum_gap: float = 0.01) -> list[float]:
    if not values:
        return []

    ordered = sorted(float(value) for value in values if value is not None)
    filtered: list[float] = []
    for value in ordered:
        if not filtered or abs(value - filtered[-1]) >= minimum_gap:
            filtered.append(value)
    return filtered


def smooth_series(values: np.ndarray, window_size: int = 5) -> np.ndarray:
    if values.size == 0 or window_size <= 1:
        return values

    result = values.copy()
    half_window = window_size // 2
    for index in range(values.size):
        start = max(0, index - half_window)
        end = min(values.size, index + half_window + 1)
        window = values[start:end]
        finite = window[np.isfinite(window)]
        if finite.size > 0:
            result[index] = float(np.median(finite))
    return result


def smooth_frequency_series(frequencies: np.ndarray, window_size: int = 5) -> np.ndarray:
    if frequencies.size == 0:
        return frequencies

    smoothed = frequencies.astype(np.float32).copy()
    half_window = max(1, window_size // 2)

    for index in range(frequencies.size):
        start = max(0, index - half_window)
        end = min(frequencies.size, index + half_window + 1)
        slice_values = frequencies[start:end]
        finite_values = slice_values[np.isfinite(slice_values)]
        if finite_values.size > 0:
            smoothed[index] = float(np.median(finite_values))

    return smoothed


def merge_similar_runs(runs: list[dict[str, Any]], max_gap: float = 0.08) -> list[dict[str, Any]]:
    if not runs:
        return []

    merged: list[dict[str, Any]] = [runs[0]]
    for run in runs[1:]:
        previous = merged[-1]
        if run['label'] == previous['label'] and run['start'] - previous['end'] <= max_gap:
            previous['end'] = run['end']
            previous['frequencies'].extend(run['frequencies'])
            previous['confidences'].extend(run['confidences'])
        else:
            merged.append(run)
    return merged


def build_musicxml(notes: list[dict[str, Any]], tempo: float) -> str:
    root = etree.Element('score-partwise', version='3.1')

    part_list = etree.SubElement(root, 'part-list')
    score_part = etree.SubElement(part_list, 'score-part', id='P1')
    etree.SubElement(score_part, 'part-name').text = 'Transcription'

    part = etree.SubElement(root, 'part', id='P1')
    measure = etree.SubElement(part, 'measure', number='1')
    attributes = etree.SubElement(measure, 'attributes')
    etree.SubElement(attributes, 'divisions').text = '480'
    key = etree.SubElement(attributes, 'key')
    etree.SubElement(key, 'fifths').text = '0'
    time = etree.SubElement(attributes, 'time')
    etree.SubElement(time, 'beats').text = '4'
    etree.SubElement(time, 'beat-type').text = '4'
    clef = etree.SubElement(attributes, 'clef')
    etree.SubElement(clef, 'sign').text = 'G'
    etree.SubElement(clef, 'line').text = '2'

    direction = etree.SubElement(measure, 'direction', placement='above')
    direction_type = etree.SubElement(direction, 'direction-type')
    metronome = etree.SubElement(direction_type, 'metronome')
    etree.SubElement(metronome, 'beat-unit').text = 'quarter'
    etree.SubElement(metronome, 'per-minute').text = str(int(round(tempo)))

    for note in notes:
        note_el = etree.SubElement(measure, 'note')
        duration_divs = max(1, int(round(float(note['duration']) * tempo / 60.0 * 480)))

        if note.get('frequency') is None:
            etree.SubElement(note_el, 'rest')
        else:
            pitch = etree.SubElement(note_el, 'pitch')
            step, alter, octave = frequency_to_note_parts(float(note['frequency']))
            etree.SubElement(pitch, 'step').text = step
            if alter:
                etree.SubElement(pitch, 'alter').text = '1'
            etree.SubElement(pitch, 'octave').text = str(octave)

        etree.SubElement(note_el, 'duration').text = str(duration_divs)

    return etree.tostring(
        root,
        encoding='UTF-8',
        xml_declaration=True,
        pretty_print=True,
    ).decode('utf-8')


def analyze_audio(y: np.ndarray, sample_rate: int, tempo: float = 120.0) -> dict[str, Any]:
    duration = float(len(y) / sample_rate) if sample_rate else 0.0
    if duration <= 0.0:
        return {
            'duration': 0.0,
            'notes': [],
            'pitchContour': [],
            'summary': {
                'voicedRatio': 0.0,
                'averageConfidence': 0.0,
                'noteCount': 0,
                'quality': 'empty',
                'warning': None,
            },
            'musicxml': build_musicxml([], 120.0),
            'algorithm': 'librosa.pyin',
        }

    y = librosa.util.normalize(y.astype(np.float32)) if np.any(y) else y.astype(np.float32)
    harmonic = librosa.effects.harmonic(y) if np.any(y) else y
    hop_length = 256
    fmin = librosa.note_to_hz('C2')
    fmax = librosa.note_to_hz('C7')

    try:
        f0, voiced_flag, voiced_prob = librosa.pyin(
            harmonic,
            fmin=fmin,
            fmax=fmax,
            sr=sample_rate,
            hop_length=hop_length,
        )
    except Exception:
        f0 = librosa.yin(harmonic, fmin=fmin, fmax=fmax, sr=sample_rate, hop_length=hop_length)
        voiced_flag = np.isfinite(f0)
        voiced_prob = None

    frame_times = librosa.times_like(f0, sr=sample_rate, hop_length=hop_length)
    frame_step = float(hop_length / sample_rate)
    f0 = smooth_frequency_series(np.asarray(f0, dtype=np.float32), window_size=5)

    if voiced_prob is not None:
        confidences = np.nan_to_num(voiced_prob.astype(np.float32), nan=0.0)
    else:
        confidences = np.where(np.isfinite(f0), 0.7, 0.0).astype(np.float32)

    pitch_contour = []
    for time_value, frequency, confidence in zip(frame_times, f0, confidences):
        if np.isfinite(frequency):
            pitch_contour.append({
                'time': float(time_value),
                'frequency': float(frequency),
                'confidence': float(confidence),
            })

    labels: list[str | None] = []
    min_confidence = 0.68
    for frequency, confidence in zip(f0, confidences):
        if np.isfinite(frequency) and confidence >= min_confidence:
            midi_value = 12 * (math.log(float(frequency) / 440.0) / math.log(2)) + 69
            rounded_midi = int(round(midi_value))
            quantized_frequency = 440.0 * (2 ** ((rounded_midi - 69) / 12))
            labels.append(frequency_to_note_name(quantized_frequency))
        else:
            labels.append(None)

    notes = []
    current_label = labels[0] if labels else None
    segment_start = 0
    min_note_duration = 0.18
    min_rest_duration = 0.22

    def finalize_segment(start_index: int, end_index: int, label: str | None) -> None:
        segment_start_time = float(frame_times[start_index]) if start_index < frame_times.size else 0.0
        segment_end_time = float(frame_times[min(max(end_index - 1, 0), frame_times.size - 1)] + frame_step) if frame_times.size else duration
        segment_end_time = min(duration, segment_end_time)
        segment_duration = max(0.0, segment_end_time - segment_start_time)
        threshold = min_rest_duration if label is None else min_note_duration
        if segment_duration < threshold:
            return

        segment_frequencies = f0[start_index:end_index]
        voiced_values = segment_frequencies[np.isfinite(segment_frequencies)]
        segment_confidences = confidences[start_index:end_index]

        if label is None or voiced_values.size == 0:
            notes.append({
                'time': segment_start_time,
                'startTime': segment_start_time,
                'endTime': segment_end_time,
                'duration': segment_duration,
                'frequency': None,
                'note': 'Rest',
                'kind': 'rest',
                'confidence': float(np.mean(segment_confidences)) if segment_confidences.size > 0 else 0.0,
            })
            return

        frequency = float(np.median(voiced_values))
        notes.append({
            'time': segment_start_time,
            'startTime': segment_start_time,
            'endTime': segment_end_time,
            'duration': segment_duration,
            'frequency': frequency,
            'note': frequency_to_note_name(frequency),
            'kind': 'note',
            'confidence': float(np.mean(segment_confidences)) if segment_confidences.size > 0 else 0.0,
        })

    for index in range(1, len(labels)):
        if labels[index] != current_label:
            finalize_segment(segment_start, index, current_label)
            segment_start = index
            current_label = labels[index]

    finalize_segment(segment_start, len(labels), current_label)

    merged_notes = []
    for note in notes:
        if merged_notes:
            previous = merged_notes[-1]
            same_kind = previous.get('kind') == note.get('kind')
            same_note = previous.get('note') == note.get('note')
            close_enough = float(note['startTime']) - float(previous['endTime']) <= 0.1
            if same_kind and same_note and close_enough:
                previous['endTime'] = float(note['endTime'])
                previous['duration'] = float(previous['endTime']) - float(previous['startTime'])
                previous['confidence'] = float((previous.get('confidence', 0.0) + note.get('confidence', 0.0)) / 2)
                if previous.get('frequency') and note.get('frequency'):
                    previous['frequency'] = float((previous['frequency'] + note['frequency']) / 2)
                    previous['note'] = frequency_to_note_name(previous['frequency'])
                continue
        merged_notes.append(note)

    notes = merged_notes or [{
        'time': 0.0,
        'startTime': 0.0,
        'endTime': duration,
        'duration': duration,
        'frequency': None,
        'note': 'Rest',
        'kind': 'rest',
        'confidence': 0.0,
    }]

    voiced_ratio = float(np.isfinite(f0).sum() / max(1, f0.size))
    average_confidence = float(np.mean(confidences[np.isfinite(confidences)])) if confidences.size > 0 else 0.0
    quality = 'good'
    warning = None
    if voiced_ratio < 0.15 or average_confidence < 0.45:
        quality = 'low'
        warning = 'This clip looks polyphonic or noisy. The transcription is only reliable for clean monophonic audio.'
    elif len(notes) > 60:
        quality = 'busy'
        warning = 'This clip produced many short note events. A cleaner monophonic recording will give better results.'

    xml = build_musicxml(notes, float(tempo))

    return {
        'duration': duration,
        'notes': notes,
        'pitchContour': pitch_contour,
        'summary': {
            'voicedRatio': voiced_ratio,
            'averageConfidence': average_confidence,
            'noteCount': len(notes),
            'quality': quality,
            'warning': warning,
        },
        'musicxml': xml,
        'algorithm': 'librosa.pyin',
    }


@app.get('/api/health')
def health() -> Any:
    return jsonify({
        'ok': True,
        'service': 'transcription',
        'algorithm': 'librosa.pyin',
    })


@app.post('/api/transcription/analyze')
def analyze() -> Any:
    raw = request.get_data()
    if not raw:
        return jsonify({'error': 'Missing audio buffer.'}), 400

    sample_rate = int(request.headers.get('X-Sample-Rate', '22050') or 22050)
    if sample_rate <= 0:
        return jsonify({'error': 'Invalid sample rate.'}), 400

    y = np.frombuffer(raw, dtype=np.float32)
    if y.size == 0:
        return jsonify({'error': 'Empty audio buffer.'}), 400

    tempo = float(request.headers.get('X-Tempo', '120') or 120)
    result = analyze_audio(y, sample_rate, tempo=tempo)
    return jsonify(result)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', '8000'))
    host = os.environ.get('HOST', '127.0.0.1')
    app.run(host=host, port=port, debug=False)
