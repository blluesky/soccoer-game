// Simple Audio Service using Web Audio API
const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
let audioCtx: AudioContext | null = null;
let bgmNodes: AudioScheduledSourceNode[] = [];
let nextNoteTime = 0;
let schedulerTimer: number | null = null;
let noteIndex = 0;
let isMuted = false;

// Initialize voices for TTS
let voices: SpeechSynthesisVoice[] = [];
if (typeof window !== 'undefined' && window.speechSynthesis) {
  const loadVoices = () => {
    voices = window.speechSynthesis.getVoices();
  };
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

const getCtx = () => {
  if (!audioCtx) audioCtx = new AudioContextClass();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

// --- Sound Effects ---

export const playKickSound = () => {
  if (isMuted) return;
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    console.error(e);
  }
};

export const playGoalSound = () => {
  if (isMuted) return;
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    
    // Play a generic major chord arpeggio (Crowd cheering simulation via synth)
    const notes = [523.25, 659.25, 783.99, 1046.50]; 
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth'; // More aggressive for goal
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      
      gain.gain.setValueAtTime(0, now + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.1, now + i * 0.1 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 1.0);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 1.0);
    });
  } catch (e) {
    console.error(e);
  }
};

export const playWhistleSound = () => {
  if (isMuted) return;
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator(); // For trill effect

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2500, ctx.currentTime);

    lfo.frequency.value = 40; // Trill speed
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 500; // Trill depth
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    lfo.start();
    osc.stop(ctx.currentTime + 0.6);
    lfo.stop(ctx.currentTime + 0.6);
  } catch (e) {
    console.error(e);
  }
};

// --- TTS Commentary ---

export const speakCommentary = (text: string) => {
  if (isMuted) return;
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  // Cancel any ongoing speech to prioritize new commentary
  window.speechSynthesis.cancel();

  // Sanitize Text for TTS:
  // 1. Remove Markdown (*, _, ~, `)
  // 2. Remove ambiguous symbols (#, @, ^) that shouldn't be spoken
  // 3. Keep punctuation (!, ?, ., ,) for intonation
  const cleanText = text.replace(/[\*\_#\~`@\^\[\]]/g, '');

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'ko-KR';
  utterance.rate = 1.1; // Slightly fast for sports excitement
  utterance.volume = 1.0;

  // Try to find a Korean voice
  const korVoice = voices.find(v => v.lang.includes('ko') || v.lang.includes('KO'));
  if (korVoice) {
    utterance.voice = korVoice;
  }

  window.speechSynthesis.speak(utterance);
};

// --- Background Music: Canon in D ---

// Helper to play a single note
const playNote = (ctx: AudioContext, freq: number, time: number, duration: number, vol: number = 0.1) => {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  
  osc.type = 'triangle'; // Soft sound like a music box or organ
  osc.frequency.value = freq;
  
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(vol, time + 0.05);
  gain.gain.setValueAtTime(vol, time + duration - 0.05);
  gain.gain.linearRampToValueAtTime(0, time + duration);
  
  osc.connect(gain);
  gain.connect(ctx.destination);
  
  osc.start(time);
  osc.stop(time + duration);
  
  bgmNodes.push(osc); // Track nodes to stop them later
};

// Canon Progression Chords (Root, 3rd, 5th)
const canonChords = [
  [293.66, 369.99, 440.00], // D Major
  [220.00, 277.18, 329.63], // A Major
  [246.94, 293.66, 369.99], // B Minor
  [185.00, 220.00, 277.18], // F# Minor
  [196.00, 246.94, 293.66], // G Major
  [146.83, 185.00, 220.00], // D Major
  [196.00, 246.94, 293.66], // G Major
  [220.00, 277.18, 329.63]  // A Major
];

const scheduleCanon = () => {
  const ctx = getCtx();
  // Lookahead: schedule notes for the next 1.5 seconds
  while (nextNoteTime < ctx.currentTime + 1.5) {
    const beatLen = 0.4; // Tempo
    const chordIndex = Math.floor(noteIndex / 4) % canonChords.length; // 4 notes per chord
    const noteInChord = noteIndex % 4;
    
    const chord = canonChords[chordIndex];
    let freq = chord[0]; // Default to root

    // Simple Arpeggio Pattern: Root -> 3rd -> 5th -> 3rd
    if (noteInChord === 0) freq = chord[0];
    if (noteInChord === 1) freq = chord[1];
    if (noteInChord === 2) freq = chord[2];
    if (noteInChord === 3) freq = chord[1];

    // Play Main Arpeggio
    playNote(ctx, freq, nextNoteTime, beatLen, 0.08);
    
    // Play Bass Note (on first beat of chord)
    if (noteInChord === 0) {
       playNote(ctx, chord[0] / 2, nextNoteTime, beatLen * 4, 0.08);
    }
    
    // Add a simple high melody hint (Canon theme simplified)
    // Just playing high octave roots for simplicity to match chord
    if (noteInChord === 0) {
        playNote(ctx, chord[0] * 2, nextNoteTime, beatLen * 4, 0.03);
    }

    nextNoteTime += beatLen;
    noteIndex++;
  }
  
  schedulerTimer = window.setTimeout(scheduleCanon, 500);
};

export const startBackgroundAmbience = () => {
  if (schedulerTimer) return; // Already playing
  
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    nextNoteTime = now;
    noteIndex = 0;

    // 1. Crowd Noise (Ambience) - Keep this for atmosphere
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02; 
      lastOut = output[i];
      output[i] *= 3.5; 
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 600; 
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.08; 
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    bgmNodes.push(noise);

    // 2. Start Canon Scheduler
    scheduleCanon();

  } catch (e) {
    console.error("BGM Start Error", e);
  }
};

export const stopBackgroundAmbience = () => {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  bgmNodes.forEach(node => {
    try {
      node.stop();
      node.disconnect();
    } catch (e) { /* ignore */ }
  });
  bgmNodes = [];
};
