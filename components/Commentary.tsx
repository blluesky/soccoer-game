import React, { useEffect, useRef } from 'react';
import { CommentaryLog } from '../types';
import { Mic } from 'lucide-react';

interface CommentaryProps {
  logs: CommentaryLog[];
}

const Commentary: React.FC<CommentaryProps> = ({ logs }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 h-64 flex flex-col w-full">
      <div className="flex items-center gap-2 mb-3 border-b border-gray-700 pb-2">
        <Mic className="w-4 h-4 text-rose-500 animate-pulse" />
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">실시간 AI 해설</h3>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-600">
        {logs.length === 0 && (
          <p className="text-gray-500 text-xs italic text-center mt-10">킥오프 대기 중...</p>
        )}
        {logs.map((log) => (
          <div key={log.id} className={`text-sm p-2 rounded ${log.type === 'goal' ? 'bg-yellow-900/30 border border-yellow-700/50 text-yellow-200' : 'text-gray-300'}`}>
            <span className="text-xs text-gray-500 font-mono mr-2">
              {Math.floor(log.timestamp / 60)}:{(log.timestamp % 60).toString().padStart(2, '0')}
            </span>
            <span>{log.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default Commentary;