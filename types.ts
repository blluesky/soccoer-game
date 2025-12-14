export type Vector2 = { x: number; y: number };

export enum Team {
  BLUE = 'BLUE',
  RED = 'RED',
}

export enum PlayerRole {
  GOALKEEPER = 'GK',
  DEFENDER = 'DEF',
  FORWARD = 'FWD',
}

export interface Entity {
  pos: Vector2;
  vel: Vector2;
  radius: number;
  mass: number;
}

export interface Player extends Entity {
  id: number;
  jerseyNum: number;
  team: Team;
  role: PlayerRole;
  speed: number;
  kickPower: number;
  cooldown: number; // For kicking
}

export interface Ball extends Entity {
  ownerId: number | null; // ID of player currently dribbling
}

export interface GameConfig {
  pitchWidth: number;
  pitchHeight: number;
  goalWidth: number;
  matchDuration: number; // Seconds
}

export interface CommentaryLog {
  id: string;
  text: string;
  timestamp: number;
  type: 'goal' | 'start' | 'halftime' | 'end' | 'generic';
}