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
            'musicxml': build_musicxml([], 120.0),
            'algorithm': 'librosa.pyin',
        }

    y = librosa.util.normalize(y.astype(np.float32)) if np.any(y) else y.astype(np.float32)
    hop_length = 512
    fmin = librosa.note_to_hz('C2')
    fmax = librosa.note_to_hz('C7')

    try:
        f0, voiced_flag, voiced_prob = librosa.pyin(
            y,
            fmin=fmin,
            fmax=fmax,
            sr=sample_rate,
            hop_length=hop_length,
        )
    except Exception:
        f0 = librosa.yin(y, fmin=fmin, fmax=fmax, sr=sample_rate, hop_length=hop_length)
        voiced_flag = np.isfinite(f0)
        voiced_prob = None

    frame_times = librosa.times_like(f0, sr=sample_rate, hop_length=hop_length)
    pitch_contour = []
    for time_value, frequency in zip(frame_times, f0):
        if np.isfinite(frequency):
            pitch_contour.append({
                'time': float(time_value),
                'frequency': float(frequency),
            })

    onset_times = [0.0]
    try:
        detected = librosa.onset.onset_detect(
            y=y,
            sr=sample_rate,
            units='time',
            backtrack=True,
            hop_length=hop_length,
        )
        onset_times.extend(float(value) for value in detected if value is not None)
    except Exception:
        pass

    onset_times.append(duration)
    boundaries = unique_sorted(onset_times)
    if not boundaries or boundaries[0] > 0.0:
        boundaries = [0.0] + boundaries
    if boundaries[-1] < duration:
        boundaries.append(duration)

    notes = []
    for start_time, end_time in zip(boundaries[:-1], boundaries[1:]):
        segment_duration = max(0.02, float(end_time - start_time))
        if segment_duration <= 0.0:
            continue

        segment_mask = (frame_times >= start_time) & (frame_times < end_time)
        segment_values = f0[segment_mask]
        voiced_values = segment_values[np.isfinite(segment_values)] if segment_values is not None else np.array([])

        if voiced_values.size > 0:
            frequency = float(np.median(voiced_values))
            note_name = frequency_to_note_name(frequency)
        else:
            frequency = None
            note_name = '—'

        notes.append({
            'time': float(start_time),
            'duration': segment_duration,
            'frequency': frequency,
            'note': note_name,
        })

    if not notes:
        voiced_values = f0[np.isfinite(f0)]
        if voiced_values.size > 0:
            frequency = float(np.median(voiced_values))
            notes.append({
                'time': 0.0,
                'duration': duration,
                'frequency': frequency,
                'note': frequency_to_note_name(frequency),
            })
        else:
            notes.append({
                'time': 0.0,
                'duration': duration,
                'frequency': None,
                'note': '—',
            })

    xml = build_musicxml(notes, float(tempo))

    return {
        'duration': duration,
        'notes': notes,
        'pitchContour': pitch_contour,
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