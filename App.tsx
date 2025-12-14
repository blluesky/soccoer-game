import React, { useState, useEffect, useCallback } from 'react';
import Pitch from './components/Pitch';
import Scoreboard from './components/Scoreboard';
import Commentary from './components/Commentary';
import { Team, CommentaryLog } from './types';
import { CONFIG } from './constants';
import { generateCommentary } from './services/geminiService';
import { playGoalSound, playWhistleSound, startBackgroundAmbience, stopBackgroundAmbience, speakCommentary } from './services/audioService';
import { Gamepad2, Info, Play, Pause, RotateCcw, SkipForward, Smartphone, Download, HelpCircle, X, Cpu } from 'lucide-react';

const App: React.FC = () => {
  const [hasStarted, setHasStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameTime, setGameTime] = useState(CONFIG.matchDuration);
  const [quarter, setQuarter] = useState(1);
  const [score, setScore] = useState<{ [key in Team]: number }>({ [Team.BLUE]: 0, [Team.RED]: 0 });
  const [commentaryLogs, setCommentaryLogs] = useState<CommentaryLog[]>([]);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showHelp, setShowHelp] = useState(false);

  // PWA Install Prompt Listener
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // F1 Key Listener for Help
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setShowHelp(prev => !prev);
      }
      if (e.key === 'Escape' && showHelp) {
        setShowHelp(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHelp]);

  const handleInstallClick = () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        setInstallPrompt(null);
      }
    });
  };

  const addCommentary = useCallback(async (text: string, type: 'goal' | 'start' | 'halftime' | 'end' | 'generic', context: string = "") => {
    const id = Date.now().toString();
    const timeVal = CONFIG.matchDuration - gameTime;
    
    let finalText = text;
    if (process.env.API_KEY && (type === 'goal' || type === 'start' || type === 'end')) {
       const aiText = await generateCommentary(text, `현재 스코어: 블루 ${score.BLUE} - 레드 ${score.RED}. ${quarter}쿼터, 남은 시간: ${gameTime}초. ${context}`);
       if (aiText) finalText = aiText;
    }
    
    // Speak the commentary (AI generated or default) if it's a major event
    if (type === 'goal' || type === 'start' || type === 'end' || type === 'halftime') {
       speakCommentary(finalText);
    }

    setCommentaryLogs(prev => [...prev, {
      id,
      text: finalText,
      timestamp: timeVal,
      type
    }]);
  }, [gameTime, score, quarter]);

  const handleStartGame = () => {
    setHasStarted(true);
    setIsPlaying(true);
    setGameOver(false);
    setQuarter(1);
    setGameTime(CONFIG.matchDuration);
    setScore({ [Team.BLUE]: 0, [Team.RED]: 0 });
    setCommentaryLogs([]);
    playWhistleSound();
    startBackgroundAmbience(); 
    addCommentary("창의미래교육 축구대회, 1쿼터가 시작됩니다!", "start");
  };

  const handleNextQuarter = () => {
    if (quarter >= 4) return;
    setQuarter(prev => prev + 1);
    setGameTime(CONFIG.matchDuration);
    setIsPlaying(true);
    playWhistleSound();
    startBackgroundAmbience();
    addCommentary(`${quarter + 1}쿼터 시작!`, "start");
  };

  const handleGoal = useCallback((scoringTeam: Team) => {
    setScore(prev => ({ ...prev, [scoringTeam]: prev[scoringTeam] + 1 }));
    playGoalSound();
    
    const context = scoringTeam === Team.BLUE ? "사용자(블루팀)가 멋진 골을 넣었습니다!" : "AI(레드팀)가 골을 넣어 반격합니다!";
    const teamName = scoringTeam === Team.BLUE ? "블루팀" : "레드팀";
    addCommentary(`${teamName} 득점!`, 'goal', context);
    
  }, [addCommentary]);

  const handleQuarterEnd = useCallback(() => {
    setIsPlaying(false);
    playWhistleSound();
    stopBackgroundAmbience();
    if (quarter < 4) {
      addCommentary(`${quarter}쿼터 종료! 잠시 휴식 후 계속됩니다.`, 'halftime');
    } else {
      setGameOver(true);
      const winner = score[Team.BLUE] > score[Team.RED] ? "블루팀" : score[Team.RED] > score[Team.BLUE] ? "레드팀" : "무승부";
      addCommentary(`경기 완전 종료! ${winner} 승리!`, 'end', `최종 스코어: 블루 ${score.BLUE} - 레드 ${score.RED}`);
    }
  }, [quarter, score, addCommentary]);

  // Handle BGM Control
  useEffect(() => {
    if (!isPlaying) {
       stopBackgroundAmbience();
    } else {
       startBackgroundAmbience();
    }
  }, [isPlaying]);

  // Timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying && gameTime > 0) {
      interval = setInterval(() => {
        setGameTime(prev => {
          if (prev <= 1) {
            handleQuarterEnd();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, gameTime, handleQuarterEnd]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-2 font-sans overflow-x-hidden relative">
      
      {/* PWA Install Button (Top Right) */}
      {installPrompt && (
        <button
          onClick={handleInstallClick}
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-full shadow-lg transition-transform hover:scale-105 animate-bounce"
        >
          <Download size={16} /> 앱 설치
        </button>
      )}

      {/* Header (Always Visible) */}
      <div className="text-center mb-2 pt-1 w-full max-w-7xl relative z-10">
        <h1 className="text-xl md:text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400 mb-1">
          창의미래교육 축구대회
        </h1>
        <div className="flex justify-center items-center gap-2 text-gray-400 text-xs md:text-sm flex-wrap relative">
          <div className="flex items-center gap-2">
            <Gamepad2 size={14} /> 
            <span><span className="font-bold text-white px-1 bg-gray-800 rounded">WASD</span> 이동</span>
            <span><span className="font-bold text-white px-1 bg-gray-800 rounded">Space</span> 슛</span>
          </div>
          <button 
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-1 px-2 py-0.5 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors border border-gray-700 text-xs md:text-xs font-mono text-yellow-400 ml-2"
          >
            <HelpCircle size={12} /> F1 도움말
          </button>
        </div>
      </div>

      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* Center: Pitch & Controls */}
        <div className="lg:col-span-3 flex flex-col items-center order-1 lg:order-1 w-full relative min-h-[400px]">
          
          <div className="flex w-full items-center justify-between mb-1 px-2">
             <div className="text-sm md:text-lg font-black italic text-emerald-400">
                {gameOver ? "경기 종료" : `QUARTER ${quarter}/4`}
             </div>
          </div>
          
          <Scoreboard score={score} time={gameTime} />
          
          <Pitch 
            isPlaying={isPlaying} 
            onGoal={handleGoal} 
            gameTime={gameTime}
            onGameOver={handleQuarterEnd}
            score={score}
            addCommentary={addCommentary}
            quarter={quarter}
          />

          {/* Controls Bar */}
          <div className="w-full mt-2 flex gap-4 justify-center flex-wrap">
            {/* Initial Start Button REMOVED - Handled by Overlay */}

            {/* Next Quarter */}
            {!isPlaying && !gameOver && quarter < 4 && gameTime === 0 && (
               <button 
                onClick={handleNextQuarter}
                className="flex items-center gap-2 px-6 py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded-lg shadow-lg transition-transform hover:scale-105 animate-pulse text-sm"
              >
                <SkipForward size={18} fill="currentColor" /> {quarter + 1}쿼터 시작
              </button>
            )}

            {/* Playing / Pause */}
            {isPlaying && (
              <button 
                onClick={() => setIsPlaying(false)}
                className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg shadow-lg transition-transform hover:scale-105 text-sm"
              >
                <Pause size={18} fill="currentColor" /> 일시 정지
              </button>
            )}
            
            {/* Resume from Pause */}
            {!isPlaying && !gameOver && gameTime > 0 && gameTime < CONFIG.matchDuration && hasStarted && (
               <button 
               onClick={() => setIsPlaying(true)}
               className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg transition-transform hover:scale-105 text-sm"
             >
               <Play size={18} fill="currentColor" /> 계속 하기
             </button>
            )}

            {/* Restart after Game Over */}
            {gameOver && (
              <button 
                onClick={handleStartGame}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg transition-transform hover:scale-105 animate-pulse text-sm"
              >
                <RotateCcw size={18} /> 새 경기 시작
              </button>
            )}
          </div>
          
          {/* Mobile controls hint */}
          <div className="lg:hidden mt-2 bg-gray-800 p-2 rounded-lg text-center w-full max-w-sm mx-auto">
             <div className="text-xs text-yellow-400 font-bold mb-0.5 flex items-center justify-center gap-1">
               <Smartphone size={14} /> 모바일 컨트롤
             </div>
          </div>

          {/* START SCREEN OVERLAY */}
          {!hasStarted && (
            <div className="absolute inset-0 z-20 bg-gray-900/90 flex flex-col items-center justify-center p-6 text-center rounded-xl backdrop-blur-sm">
               <div className="mb-6 animate-bounce">
                  <Cpu size={64} className="text-emerald-400 mx-auto mb-2" />
                  <div className="text-blue-400 font-bold text-sm tracking-widest uppercase">AI-Powered Soccer</div>
               </div>
               
               <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-emerald-400 to-indigo-400 mb-4 drop-shadow-2xl">
                 CREATIVE CUP
               </h1>
               
               <p className="text-gray-300 text-base md:text-lg mb-8 max-w-lg leading-relaxed">
                 <span className="text-white font-bold">Google Gemini</span>가 전해주는 생생한 실시간 해설!<br/>
                 AI 팀을 상대로 펼쳐지는 5:5 아케이드 축구 매치
               </p>
               
               <div className="grid grid-cols-2 gap-4 mb-8 text-sm text-gray-400 bg-black/40 p-6 rounded-2xl border border-gray-700/50 backdrop-blur w-full max-w-md">
                 <div className="flex flex-col items-center gap-2">
                   <span className="font-bold text-white">이동 (Move)</span>
                   <div className="flex gap-1">
                      <span className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 shadow-sm font-mono text-xs">W</span>
                      <span className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 shadow-sm font-mono text-xs">A</span>
                      <span className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 shadow-sm font-mono text-xs">S</span>
                      <span className="bg-gray-700 text-white px-2 py-1 rounded border border-gray-600 shadow-sm font-mono text-xs">D</span>
                   </div>
                 </div>
                 <div className="flex flex-col items-center gap-2">
                   <span className="font-bold text-white">액션 (Action)</span>
                   <span className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600 shadow-sm font-mono text-xs">SPACE BAR</span>
                 </div>
               </div>

               <button 
                 onClick={handleStartGame}
                 className="group relative px-10 py-4 bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-black text-xl md:text-2xl rounded-2xl shadow-xl transition-all hover:scale-105 hover:shadow-2xl flex items-center gap-3 overflow-hidden"
               >
                 <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                 <Play size={32} fill="currentColor" className="relative z-10" /> 
                 <span className="relative z-10">KICK OFF</span>
               </button>
               
               <div className="mt-6 text-xs text-gray-500 font-mono">
                  Powered by Google Gemini 2.5 Flash
               </div>
            </div>
          )}

        </div>

        {/* Right: Commentary (Always visible on LG) */}
        <div className="hidden lg:block lg:col-span-1 space-y-4 order-3 w-full h-full">
           <Commentary logs={commentaryLogs} />
           
           <div className="bg-gradient-to-br from-indigo-900 to-purple-900 p-4 rounded-xl border border-indigo-700/50 shadow-lg">
             <div className="flex items-center gap-2 mb-2">
                <Cpu size={16} className="text-indigo-300" />
                <h4 className="font-bold text-indigo-300 text-sm">AI Commentary Engine</h4>
             </div>
             <p className="text-xs text-indigo-200/70 leading-relaxed">
               이 게임의 해설은 <strong>Google Gemini API</strong>를 통해 경기 상황을 실시간으로 분석하여 생성됩니다.
               <br/><br/>
               <span className="opacity-50 block mt-1 border-t border-indigo-700/50 pt-1">
                 * 네트워크 상태에 따라 해설이 지연될 수 있습니다.
               </span>
             </p>
           </div>
        </div>

      </div>

      {/* Game Over Overlay */}
      {gameOver && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-gray-800 p-8 rounded-2xl border-2 border-gray-600 text-center max-w-md w-full shadow-2xl transform transition-all scale-100 animate-in fade-in zoom-in duration-300">
              <h2 className="text-3xl md:text-4xl font-black text-white mb-2">대회 종료</h2>
              <div className="text-xl font-mono mb-6 text-gray-300">
                <span className="text-blue-400">{score.BLUE}</span> - <span className="text-red-400">{score.RED}</span>
              </div>
              <p className="text-gray-400 mb-8 italic">
                {score.BLUE > score.RED ? "블루팀의 승리입니다!" : score.RED > score.BLUE ? "아쉬운 패배입니다..." : "무승부로 끝났습니다!"}
              </p>
              <button 
                onClick={handleStartGame}
                className="w-full py-3 bg-white text-gray-900 font-black text-lg rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
              >
                <RotateCcw size={20} /> 새 대회 시작
              </button>
           </div>
        </div>
      )}

      {/* Help Modal (Toggled by F1) */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
           <div className="bg-gray-800 p-6 rounded-xl border border-blue-500/50 w-full max-w-lg shadow-2xl relative" onClick={e => e.stopPropagation()}>
              <button 
                onClick={() => setShowHelp(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white"
              >
                <X size={24} />
              </button>
              
              <h3 className="font-bold text-2xl text-blue-400 mb-4 flex items-center gap-2 border-b border-gray-700 pb-2">
                <Info size={24} /> 게임 방법
              </h3>
              
              <ul className="text-base text-gray-300 space-y-3 list-disc list-inside">
                <li><span className="text-blue-400 font-bold">블루 팀</span>을 조종합니다.</li>
                <li>공과 가장 가까운 선수가 <span className="text-yellow-400">자동으로 선택</span>됩니다 (노란 링).</li>
                <li><span className="text-white font-mono bg-gray-700 px-2 py-0.5 rounded border border-gray-600">WASD</span> 또는 <span className="text-white font-mono bg-gray-700 px-2 py-0.5 rounded border border-gray-600">방향키</span>로 이동하세요.</li>
                <li><span className="text-white font-mono bg-gray-700 px-2 py-0.5 rounded border border-gray-600">Space</span> 또는 <span className="text-white font-mono bg-gray-700 px-2 py-0.5 rounded border border-gray-600">K</span>로 슛/패스하세요.</li>
                <li className="pt-2 border-t border-gray-700/50 mt-2">총 4쿼터 (각 1분)로 진행됩니다.</li>
                <li>오프라인 상태에서도 기본 AI 해설이 제공됩니다.</li>
                <li>네트워크 연결 시 Gemini AI의 생생한 해설을 들을 수 있습니다.</li>
              </ul>

              <div className="mt-6 text-center text-sm text-gray-500">
                 (이 창을 닫으려면 ESC를 누르거나 화면을 클릭하세요)
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default App;