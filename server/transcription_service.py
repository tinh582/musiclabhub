from __future__ import annotations

import math
import os
import tempfile
import base64
import shutil
from typing import Any

import librosa
import numpy as np
import soundfile as sf
from flask import Flask, jsonify, request
from flask_cors import CORS
from lxml import etree


app = Flask(__name__)
CORS(app)


NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
PIANO_TRANSCRIPTOR = None


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


def midi_to_frequency(midi_note: int | float) -> float:
    return float(440.0 * (2 ** ((float(midi_note) - 69.0) / 12.0)))


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


def midi_file_to_notes(midi_path: str, fallback_duration: float) -> tuple[list[dict[str, Any]], float]:
    from mido import MidiFile

    midi_file = MidiFile(midi_path)
    ticks_per_beat = midi_file.ticks_per_beat or 480
    active_notes: dict[tuple[int, int], list[tuple[float, int]]] = {}
    notes: list[dict[str, Any]] = []
    max_time = 0.0

    for track in midi_file.tracks:
        tempo_us = 500000
        absolute_seconds = 0.0
        for message in track:
            absolute_seconds += float(message.time) * (tempo_us / 1000000.0) / ticks_per_beat
            max_time = max(max_time, absolute_seconds)
            if message.type == 'set_tempo':
                tempo_us = int(message.tempo)
                continue

            channel = int(getattr(message, 'channel', 0))
            note_number = int(getattr(message, 'note', 0))
            velocity = int(getattr(message, 'velocity', 0))
            key = (channel, note_number)

            if message.type == 'note_on' and velocity > 0:
                active_notes.setdefault(key, []).append((absolute_seconds, velocity))
            elif message.type in {'note_off', 'note_on'}:
                starts = active_notes.get(key)
                if not starts:
                    continue
                start_time, start_velocity = starts.pop(0)
                end_time = max(start_time + 0.02, absolute_seconds)
                frequency = midi_to_frequency(note_number)
                confidence = float(max(0.0, min(1.0, start_velocity / 127.0)))
                notes.append({
                    'time': start_time,
                    'startTime': start_time,
                    'endTime': end_time,
                    'duration': end_time - start_time,
                    'frequency': frequency,
                    'note': frequency_to_note_name(frequency),
                    'kind': 'note',
                    'confidence': confidence,
                    'velocity': start_velocity,
                })

    for (channel, note_number), starts in active_notes.items():
        del channel
        for start_time, start_velocity in starts:
            end_time = max(start_time + 0.08, max_time or fallback_duration)
            frequency = midi_to_frequency(note_number)
            notes.append({
                'time': start_time,
                'startTime': start_time,
                'endTime': end_time,
                'duration': end_time - start_time,
                'frequency': frequency,
                'note': frequency_to_note_name(frequency),
                'kind': 'note',
                'confidence': float(max(0.0, min(1.0, start_velocity / 127.0))),
                'velocity': start_velocity,
            })

    notes.sort(key=lambda note: (float(note['startTime']), float(note.get('frequency') or 0.0)))
    return notes, max(max_time, fallback_duration)


def extract_file_path(value: Any) -> str | None:
    if isinstance(value, str) and os.path.exists(value):
        return value

    if isinstance(value, dict):
        for key in ('path', 'name', 'orig_name'):
            candidate = value.get(key)
            if isinstance(candidate, str) and os.path.exists(candidate):
                return candidate
        for nested in value.values():
            found = extract_file_path(nested)
            if found:
                return found

    if isinstance(value, (list, tuple)):
        for item in value:
            found = extract_file_path(item)
            if found:
                return found

    return None


def analyze_audio_hosted_gradio(y: np.ndarray, sample_rate: int, tempo: float = 120.0) -> dict[str, Any] | None:
    provider = os.environ.get('TRANSCRIPTION_PROVIDER', '').strip().lower()
    space = os.environ.get('HF_TRANSCRIPTION_SPACE', '').strip()
    api_name = os.environ.get('HF_TRANSCRIPTION_API_NAME', '').strip()
    if provider not in {'huggingface', 'gradio', 'external'} or not space or not api_name:
        return None

    try:
        from gradio_client import Client, handle_file
    except Exception as error:
        app.logger.warning('Hosted transcription client unavailable: %s', error)
        return None

    duration = float(len(y) / sample_rate) if sample_rate else 0.0
    if duration <= 0.0:
        return None

    audio = librosa.util.normalize(y.astype(np.float32)) if np.any(y) else y.astype(np.float32)
    audio_path = None
    local_midi_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as audio_file:
            audio_path = audio_file.name
        sf.write(audio_path, audio, sample_rate)

        token = os.environ.get('HF_TOKEN') or None
        client = Client(space, hf_token=token)
        result = client.predict(handle_file(audio_path), api_name=api_name)
        midi_path = extract_file_path(result)
        if not midi_path:
            app.logger.warning('Hosted transcription returned no local MIDI file: %r', result)
            return None

        with tempfile.NamedTemporaryFile(suffix='.mid', delete=False) as midi_file:
            local_midi_path = midi_file.name
        shutil.copyfile(midi_path, local_midi_path)

        with open(local_midi_path, 'rb') as midi_file:
            midi_base64 = base64.b64encode(midi_file.read()).decode('ascii')

        notes, midi_duration = midi_file_to_notes(local_midi_path, duration)
    except Exception as error:
        app.logger.warning('Hosted transcription failed: %s', error)
        return None
    finally:
        for path in (audio_path, local_midi_path):
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass

    if not notes:
        return None

    active_time = sum(float(note['duration']) for note in notes)
    average_confidence = float(np.mean([note.get('confidence', 0.0) for note in notes])) if notes else 0.0
    polyphonic_groups = 0
    previous_start = -1.0
    for note in notes:
        start = float(note['startTime'])
        if previous_start >= 0 and abs(start - previous_start) <= 0.025:
            polyphonic_groups += 1
        previous_start = start

    return {
        'duration': midi_duration,
        'notes': notes,
        'pitchContour': [{
            'time': float(note['startTime']),
            'frequency': float(note['frequency']),
            'confidence': float(note.get('confidence', 0.0)),
        } for note in notes if note.get('frequency')],
        'summary': {
            'voicedRatio': min(1.0, active_time / max(0.001, midi_duration)),
            'averageConfidence': average_confidence,
            'noteCount': len(notes),
            'polyphonicGroups': polyphonic_groups,
            'quality': 'hosted-model',
            'warning': None,
            'model': f'Hosted transcription: {space}',
        },
        'musicxml': build_musicxml(notes, float(tempo)),
        'midiBase64': midi_base64,
        'midiFileName': 'hosted-transcription.mid',
        'algorithm': 'hosted-gradio',
    }


def analyze_audio_piano_model(y: np.ndarray, sample_rate: int, tempo: float = 120.0) -> dict[str, Any] | None:
    global PIANO_TRANSCRIPTOR

    try:
        import torch
        from piano_transcription_inference import PianoTranscription, sample_rate as piano_sample_rate
    except Exception as error:
        app.logger.info('Piano transcription model not available: %s', error)
        return None

    duration = float(len(y) / sample_rate) if sample_rate else 0.0
    if duration <= 0.0:
        return None

    try:
        audio = y.astype(np.float32)
        audio = librosa.util.normalize(audio) if np.any(audio) else audio
        if sample_rate != int(piano_sample_rate):
            audio = librosa.resample(audio, orig_sr=sample_rate, target_sr=int(piano_sample_rate))

        device_name = os.environ.get('PIANO_TRANSCRIPTION_DEVICE', '').strip().lower()
        if not device_name:
            device_name = 'cuda' if torch.cuda.is_available() else 'cpu'
        device = torch.device(device_name)

        if PIANO_TRANSCRIPTOR is None:
            PIANO_TRANSCRIPTOR = PianoTranscription(device=device, checkpoint_path=None)

        midi_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix='.mid', delete=False) as midi_file:
                midi_path = midi_file.name

            transcribed = PIANO_TRANSCRIPTOR.transcribe(audio, midi_path)
            note_events = transcribed.get('est_note_events') or []
            pedal_events = transcribed.get('est_pedal_events') or []

            midi_base64 = None
            if midi_path and os.path.exists(midi_path):
                with open(midi_path, 'rb') as midi_file:
                    midi_base64 = base64.b64encode(midi_file.read()).decode('ascii')
        finally:
            if midi_path:
                try:
                    os.unlink(midi_path)
                except OSError:
                    pass
    except Exception as error:
        app.logger.warning('Piano transcription failed: %s', error)
        return None

    notes: list[dict[str, Any]] = []
    pitch_contour: list[dict[str, float]] = []
    for event in note_events:
        start_time = max(0.0, float(event.get('onset_time', 0.0)))
        end_time = min(duration, max(start_time, float(event.get('offset_time', start_time))))
        event_duration = end_time - start_time
        if event_duration < 0.02:
            continue

        midi_note = int(event.get('midi_note', 60))
        velocity = int(max(1, min(127, event.get('velocity', 64))))
        frequency = midi_to_frequency(midi_note)
        confidence = float(max(0.0, min(1.0, velocity / 127.0)))
        note = {
            'time': start_time,
            'startTime': start_time,
            'endTime': end_time,
            'duration': event_duration,
            'frequency': frequency,
            'note': frequency_to_note_name(frequency),
            'kind': 'note',
            'confidence': confidence,
            'velocity': velocity,
        }
        notes.append(note)
        pitch_contour.append({
            'time': start_time,
            'frequency': frequency,
            'confidence': confidence,
        })

    notes.sort(key=lambda note: (float(note['startTime']), float(note.get('frequency') or 0.0)))
    if not notes:
        return None

    active_time = sum(float(note['duration']) for note in notes)
    average_confidence = float(np.mean([note.get('confidence', 0.0) for note in notes])) if notes else 0.0
    polyphonic_groups = 0
    previous_start = -1.0
    for note in notes:
        start = float(note['startTime'])
        if previous_start >= 0 and abs(start - previous_start) <= 0.025:
            polyphonic_groups += 1
        previous_start = start

    warning = None
    quality = 'model'
    if len(notes) > 1500:
        quality = 'busy'
        warning = 'Piano transcription found many note events. The MIDI is best treated as an editable draft.'

    xml = build_musicxml(notes, float(tempo))

    return {
        'duration': duration,
        'notes': notes,
        'pitchContour': pitch_contour,
        'summary': {
            'voicedRatio': min(1.0, active_time / max(0.001, duration)),
            'averageConfidence': average_confidence,
            'noteCount': len(notes),
            'polyphonicGroups': polyphonic_groups,
            'pedalCount': len(pedal_events) if pedal_events else 0,
            'quality': quality,
            'warning': warning,
            'model': 'ByteDance high-resolution piano',
        },
        'musicxml': xml,
        'midiBase64': midi_base64,
        'midiFileName': 'piano-model-transcription.mid',
        'algorithm': 'piano-transcription-inference',
    }


def analyze_audio_basic_pitch(y: np.ndarray, sample_rate: int, tempo: float = 120.0) -> dict[str, Any] | None:
    try:
        from basic_pitch import ICASSP_2022_MODEL_PATH
        from basic_pitch.inference import predict
    except Exception:
        return None

    duration = float(len(y) / sample_rate) if sample_rate else 0.0
    if duration <= 0.0:
        return None

    audio = librosa.util.normalize(y.astype(np.float32)) if np.any(y) else y.astype(np.float32)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            temp_path = temp_file.name

        sf.write(temp_path, audio, sample_rate)
        _, midi_data, note_events = predict(
            temp_path,
            ICASSP_2022_MODEL_PATH,
            onset_threshold=0.42,
            frame_threshold=0.28,
            minimum_note_length=60.0,
            minimum_frequency=librosa.note_to_hz('A0'),
            maximum_frequency=librosa.note_to_hz('C8'),
            multiple_pitch_bends=False,
            melodia_trick=True,
            midi_tempo=float(tempo),
        )
    except Exception as error:
        app.logger.warning('Basic Pitch transcription unavailable: %s', error)
        return None
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    notes: list[dict[str, Any]] = []
    pitch_contour: list[dict[str, float]] = []
    for event in note_events:
        start_time, end_time, midi_note, amplitude, pitch_bends = event
        start_time = max(0.0, float(start_time))
        end_time = min(duration, max(start_time, float(end_time)))
        event_duration = end_time - start_time
        if event_duration < 0.035:
            continue

        frequency = midi_to_frequency(int(midi_note))
        confidence = float(max(0.0, min(1.0, amplitude)))
        notes.append({
            'time': start_time,
            'startTime': start_time,
            'endTime': end_time,
            'duration': event_duration,
            'frequency': frequency,
            'note': frequency_to_note_name(frequency),
            'kind': 'note',
            'confidence': confidence,
            'velocity': int(round(127 * confidence)),
            'pitchBends': [int(value) for value in pitch_bends] if pitch_bends else [],
        })
        pitch_contour.append({
            'time': start_time,
            'frequency': frequency,
            'confidence': confidence,
        })

    notes.sort(key=lambda note: (float(note['startTime']), float(note.get('frequency') or 0.0)))
    if not notes:
        return None

    active_time = sum(float(note['duration']) for note in notes)
    average_confidence = float(np.mean([note.get('confidence', 0.0) for note in notes])) if notes else 0.0
    polyphonic_groups = 0
    previous_start = -1.0
    for note in notes:
        start = float(note['startTime'])
        if previous_start >= 0 and abs(start - previous_start) <= 0.025:
            polyphonic_groups += 1
        previous_start = start

    warning = None
    quality = 'model'
    if len(notes) > 350:
        quality = 'busy'
        warning = 'AI transcription found many note events. The MIDI is best treated as an editable draft.'

    xml = build_musicxml(notes, float(tempo))
    midi_base64 = None
    midi_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix='.mid', delete=False) as midi_file:
            midi_path = midi_file.name
        midi_data.write(midi_path)
        with open(midi_path, 'rb') as midi_file:
            midi_base64 = base64.b64encode(midi_file.read()).decode('ascii')
    except Exception as error:
        app.logger.warning('Could not serialize Basic Pitch MIDI: %s', error)
    finally:
        if midi_path:
            try:
                os.unlink(midi_path)
            except OSError:
                pass

    return {
        'duration': duration,
        'notes': notes,
        'pitchContour': pitch_contour,
        'summary': {
            'voicedRatio': min(1.0, active_time / max(0.001, duration)),
            'averageConfidence': average_confidence,
            'noteCount': len(notes),
            'polyphonicGroups': polyphonic_groups,
            'quality': quality,
            'warning': warning,
            'model': 'Spotify Basic Pitch',
        },
        'musicxml': xml,
        'midiBase64': midi_base64,
        'midiFileName': 'basic-pitch-transcription.mid',
        'algorithm': 'basic-pitch',
    }


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

    hosted_result = analyze_audio_hosted_gradio(y, sample_rate, tempo=tempo)
    if hosted_result is not None:
        return hosted_result

    if os.environ.get('TRANSCRIPTION_MODEL', 'piano').strip().lower() in {'piano', 'auto'}:
        piano_result = analyze_audio_piano_model(y, sample_rate, tempo=tempo)
        if piano_result is not None:
            return piano_result

    basic_pitch_result = analyze_audio_basic_pitch(y, sample_rate, tempo=tempo)
    if basic_pitch_result is not None:
        return basic_pitch_result

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
            'model': 'librosa pYIN fallback',
        },
        'musicxml': xml,
        'algorithm': 'librosa.pyin',
    }


@app.get('/api/health')
def health() -> Any:
    provider = os.environ.get('TRANSCRIPTION_PROVIDER', '').strip().lower()
    space = os.environ.get('HF_TRANSCRIPTION_SPACE', '').strip()
    api_name = os.environ.get('HF_TRANSCRIPTION_API_NAME', '').strip()
    algorithm = 'piano-model-with-basic-pitch-and-librosa-fallback'
    if provider in {'huggingface', 'gradio', 'external'} and space and api_name:
        algorithm = 'hosted-gradio-with-local-fallback'

    return jsonify({
        'ok': True,
        'service': 'transcription',
        'algorithm': algorithm,
        'hostedProvider': space or None,
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
