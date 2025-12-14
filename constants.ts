import { GameConfig } from './types';

export const CONFIG: GameConfig = {
  pitchWidth: 800,
  pitchHeight: 500,
  goalWidth: 120,
  matchDuration: 60, // 1 minute per quarter
};

export const PHYSICS = {
  friction: 0.96, // Ball friction
  playerFriction: 0.85,
  wallBounciness: 0.5,
  kickStrength: 12,
  dribbleDistance: 18,
  maxBallSpeed: 18,
  playerSpeed: 3.5,
  sprintSpeed: 5.0,
};

export const COLORS = {
  pitch: '#34d399', // emerald-400 roughly
  pitchDark: '#10b981', // emerald-500
  lines: 'rgba(255, 255, 255, 0.6)',
  blueTeam: '#3b82f6', // blue-500
  redTeam: '#ef4444', // red-500
  ball: '#ffffff',
  text: '#ffffff',
};