// WAV writing, MP3 encoding and a MIDI note counter. Plan §3.9.

/** Interleaved float samples (-1..1) to 16-bit PCM. */
export function toInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function concatFloat32(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** 16-bit PCM WAV with the standard 44-byte header. */
export function encodeWav(interleaved: Float32Array, sampleRate: number, channels = 2): Uint8Array {
  const pcm = toInt16(interleaved);
  const bytes = new Uint8Array(44 + pcm.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i], true);
  return bytes;
}

/** Seconds of audio in a WAV made by encodeWav. */
export function wavSeconds(wav: Uint8Array): number {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  return view.getUint32(40, true) / view.getUint32(28, true);
}

/** Count note-on events (velocity above 0) in a standard MIDI file. */
export function countMidiNotes(midi: Uint8Array): number {
  const view = new DataView(midi.buffer, midi.byteOffset, midi.byteLength);
  const tag = (at: number) => String.fromCharCode(midi[at], midi[at + 1], midi[at + 2], midi[at + 3]);
  if (tag(0) !== 'MThd') throw new Error('Not a MIDI file');
  let at = 8 + view.getUint32(4);
  let notes = 0;
  while (at < midi.length) {
    if (tag(at) !== 'MTrk') throw new Error('Bad MIDI track');
    const end = at + 8 + view.getUint32(at + 4);
    at += 8;
    let status = 0;
    const varLen = () => {
      let v = 0;
      let b: number;
      do {
        b = midi[at++];
        v = (v << 7) | (b & 0x7f);
      } while (b & 0x80);
      return v;
    };
    while (at < end) {
      varLen(); // delta time
      let b = midi[at];
      if (b & 0x80) {
        status = b;
        at++;
      }
      if (status === 0xff) {
        at++; // meta type
        const length = varLen(); // read first: varLen moves `at`
        at += length;
      } else if (status === 0xf0 || status === 0xf7) {
        const length = varLen();
        at += length;
      } else {
        const kind = status & 0xf0;
        at++; // first data byte
        if (kind !== 0xc0 && kind !== 0xd0) {
          b = midi[at++];
          if (kind === 0x90 && b > 0) notes++;
        }
      }
    }
    at = end;
  }
  return notes;
}
