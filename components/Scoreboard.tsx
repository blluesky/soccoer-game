import React from 'react';
import { Team } from '../types';

interface ScoreboardProps {
  score: { [key in Team]: number };
  time: number;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const Scoreboard: React.FC<ScoreboardProps> = ({ score, time }) => {
  return (
    <div className="flex items-center justify-between bg-gray-900 text-white p-2 rounded-lg shadow-lg border border-gray-700 w-full max-w-sm mx-auto mb-2 scale-90 md:scale-100">
      <div className="flex items-center gap-2">
        <div className="text-right">
          <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">블루</div>
          <div className="text-2xl font-black font-mono leading-none">{score[Team.BLUE]}</div>
        </div>
      </div>

      <div className="bg-gray-800 px-4 py-1 rounded border border-gray-700">
        <div className="text-lg font-mono text-yellow-400 font-bold tracking-widest">
          {formatTime(time)}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="text-left">
          <div className="text-[10px] text-red-400 font-bold uppercase tracking-wider">레드</div>
          <div className="text-2xl font-black font-mono leading-none">{score[Team.RED]}</div>
        </div>
      </div>
    </div>
  );
};

export default Scoreboard;