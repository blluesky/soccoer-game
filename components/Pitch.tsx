import React, { useRef, useEffect, useCallback, useState } from 'react';
import { CONFIG, PHYSICS, COLORS } from '../constants';
import { Player, Ball, Team, PlayerRole, Vector2 } from '../types';
import { playKickSound } from '../services/audioService';

interface PitchProps {
  isPlaying: boolean;
  onGoal: (team: Team) => void;
  gameTime: number;
  onGameOver: () => void;
  score: { [key in Team]: number };
  addCommentary: (text: string, type: 'goal' | 'start' | 'halftime' | 'end' | 'generic', context?: string) => void;
  quarter: number;
}

// Helper to check collision
const dist = (p1: Vector2, p2: Vector2) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

const Pitch: React.FC<PitchProps> = ({ isPlaying, onGoal, gameTime, onGameOver, score, addCommentary, quarter }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Game Logic Refs
  const activePlayerIdRef = useRef<number>(3);
  const playersRef = useRef<Player[]>([]);
  const ballRef = useRef<Ball>({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, radius: 6, mass: 1, ownerId: null });
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const animationFrameRef = useRef<number>(0);
  const prevQuarterRef = useRef<number>(1);

  // Mobile Controls State
  const [joystickVec, setJoystickVec] = useState({ x: 0, y: 0 });

  // --- Initialization ---
  const resetPositions = useCallback((scoringTeam: Team | null = null) => {
    const w = CONFIG.pitchWidth;
    const h = CONFIG.pitchHeight;
    const midX = w / 2;
    const midY = h / 2;

    ballRef.current = {
      pos: { x: midX, y: midY },
      vel: { x: 0, y: 0 },
      radius: 6,
      mass: 1,
      ownerId: null
    };

    const newPlayers: Player[] = [];
    let idCounter = 0;

    const createPlayer = (team: Team, role: PlayerRole, jerseyNum: number, x: number, y: number): Player => ({
      id: idCounter++,
      jerseyNum,
      team,
      role,
      pos: { x, y },
      vel: { x: 0, y: 0 },
      radius: 12,
      mass: 5,
      speed: role === PlayerRole.FORWARD ? PHYSICS.sprintSpeed : PHYSICS.playerSpeed,
      kickPower: PHYSICS.kickStrength,
      cooldown: 0
    });

    // Team Blue (Left, User) - 5 Players
    newPlayers.push(createPlayer(Team.BLUE, PlayerRole.GOALKEEPER, 1, 50, midY));
    newPlayers.push(createPlayer(Team.BLUE, PlayerRole.DEFENDER, 2, 180, midY - 80));
    newPlayers.push(createPlayer(Team.BLUE, PlayerRole.DEFENDER, 3, 180, midY + 80));
    newPlayers.push(createPlayer(Team.BLUE, PlayerRole.FORWARD, 7, 300, midY - 60)); 
    newPlayers.push(createPlayer(Team.BLUE, PlayerRole.FORWARD, 9, 300, midY + 60));

    // Team Red (Right, AI) - 5 Players
    newPlayers.push(createPlayer(Team.RED, PlayerRole.GOALKEEPER, 1, w - 50, midY));
    newPlayers.push(createPlayer(Team.RED, PlayerRole.DEFENDER, 2, w - 180, midY - 80));
    newPlayers.push(createPlayer(Team.RED, PlayerRole.DEFENDER, 3, w - 180, midY + 80));
    newPlayers.push(createPlayer(Team.RED, PlayerRole.FORWARD, 10, w - 300, midY - 60));
    newPlayers.push(createPlayer(Team.RED, PlayerRole.FORWARD, 11, w - 300, midY + 60));

    playersRef.current = newPlayers;
    
    // Reset active player for Blue team to one of the forwards (specifically #7 or #9)
    // Find player with ID corresponding to Blue Forward #9 (which is usually index 4 or 3)
    const blueForward = newPlayers.find(p => p.team === Team.BLUE && p.jerseyNum === 9);
    if (blueForward) activePlayerIdRef.current = blueForward.id;

  }, []);

  // Initial setup
  useEffect(() => {
    resetPositions();
  }, [resetPositions]);

  // Reset positions when quarter changes
  useEffect(() => {
    if (quarter !== prevQuarterRef.current) {
        resetPositions();
        prevQuarterRef.current = quarter;
    }
  }, [quarter, resetPositions]);

  //Input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keysRef.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Mobile Input Handlers
  const handleJoystickMove = (e: React.TouchEvent) => {
    // FIX: Use targetTouches instead of touches to avoid conflict with Shoot button (multi-touch)
    if (e.targetTouches.length === 0) return;
    const touch = e.targetTouches[0];
    
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    
    // Clamp
    const maxDist = 40;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > maxDist) {
        const ratio = maxDist / dist;
        dx *= ratio;
        dy *= ratio;
    }

    setJoystickVec({ x: dx, y: dy });

    // Threshold for key activation
    const threshold = 10;
    keysRef.current['ArrowRight'] = dx > threshold;
    keysRef.current['ArrowLeft'] = dx < -threshold;
    keysRef.current['ArrowDown'] = dy > threshold;
    keysRef.current['ArrowUp'] = dy < -threshold;
  };

  const handleJoystickEnd = () => {
    setJoystickVec({ x: 0, y: 0 });
    keysRef.current['ArrowRight'] = false;
    keysRef.current['ArrowLeft'] = false;
    keysRef.current['ArrowDown'] = false;
    keysRef.current['ArrowUp'] = false;
  };

  // Update Loop
  const update = useCallback(() => {
    if (!isPlaying) return;

    const ball = ballRef.current;
    const players = playersRef.current;
    const w = CONFIG.pitchWidth;
    const h = CONFIG.pitchHeight;
    const activePlayerId = activePlayerIdRef.current;

    // 1. Determine Active Player
    let closestDist = Infinity;
    let closestId = activePlayerId;
    
    players.forEach(p => {
      if (p.team === Team.BLUE) {
        const d = dist(p.pos, ball.pos);
        const currentActive = players.find(pl => pl.id === activePlayerId);
        const currentDist = currentActive ? dist(currentActive.pos, ball.pos) : Infinity;

        // Auto-switch hysteresis: Only switch if significantly closer
        if (d < closestDist) {
          closestDist = d;
          if (p.id !== activePlayerId && d < currentDist - 40) {
            closestId = p.id;
          } else if (p.id === activePlayerId) {
             closestId = p.id; 
          }
        }
      }
    });
    activePlayerIdRef.current = closestId;

    // 2. Player Logic
    players.forEach(p => {
      p.cooldown = Math.max(0, p.cooldown - 1);

      let targetDx = 0;
      let targetDy = 0;

      // User Controlled Player
      if (p.team === Team.BLUE && p.id === activePlayerIdRef.current) {
        if (keysRef.current['ArrowUp'] || keysRef.current['KeyW']) targetDy = -1;
        if (keysRef.current['ArrowDown'] || keysRef.current['KeyS']) targetDy = 1;
        if (keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) targetDx = -1;
        if (keysRef.current['ArrowRight'] || keysRef.current['KeyD']) targetDx = 1;
        
        if (targetDx !== 0 || targetDy !== 0) {
          const len = Math.sqrt(targetDx**2 + targetDy**2);
          targetDx /= len;
          targetDy /= len;
        }

        // Shoot / Pass logic
        if ((keysRef.current['Space'] || keysRef.current['KeyK']) && p.cooldown === 0) {
          if (dist(p.pos, ball.pos) < p.radius + ball.radius + 15) {
             playKickSound(); 
             const kickDirX = targetDx === 0 && targetDy === 0 ? (p.team === Team.BLUE ? 1 : -1) : targetDx;
             const kickDirY = targetDx === 0 && targetDy === 0 ? 0 : targetDy;
             const kLen = Math.sqrt(kickDirX**2 + kickDirY**2);
             ball.vel.x += (kickDirX / kLen) * p.kickPower;
             ball.vel.y += (kickDirY / kLen) * p.kickPower;
             ball.ownerId = null;
             p.cooldown = 10;
          }
        }

      } else {
        // AI Logic
        const isBlue = p.team === Team.BLUE;
        const goalX = isBlue ? w : 0;
        
        if (p.role === PlayerRole.GOALKEEPER) {
          // GK Logic
          const homeX = isBlue ? 40 : w - 40;
          // Constrain GK to box area
          const targetX = homeX;
          const targetY = Math.max(h/2 - 80, Math.min(h/2 + 80, ball.pos.y));
          
          const dx = targetX - p.pos.x;
          const dy = targetY - p.pos.y;
          const d = Math.sqrt(dx*dx + dy*dy);
          
          if (d > 2) {
             targetDx = dx / d;
             targetDy = dy / d;
          }
          
          // GK Kick
          if (dist(p.pos, ball.pos) < 60) {
              // Move towards ball if very close
              const angle = Math.atan2(ball.pos.y - p.pos.y, ball.pos.x - p.pos.x);
              targetDx = Math.cos(angle);
              targetDy = Math.sin(angle);
              
              if (dist(p.pos, ball.pos) < p.radius + ball.radius + 5 && p.cooldown === 0) {
                   playKickSound();
                   const clearAngle = isBlue ? 0 : Math.PI; 
                   const variance = (Math.random() - 0.5) * 0.5;
                   ball.vel.x = Math.cos(clearAngle + variance) * p.kickPower;
                   ball.vel.y = Math.sin(clearAngle + variance) * p.kickPower;
                   ball.ownerId = null;
                   p.cooldown = 20;
              }
          }

        } else {
           // Field Players AI
           const dToBall = dist(p.pos, ball.pos);
           
           // Determine active zone for AI
           let activeRange = 0;
           if (p.role === PlayerRole.DEFENDER) activeRange = 200;
           if (p.role === PlayerRole.FORWARD) activeRange = 250;
           
           // Special case: If AI team has the ball, support the ball carrier or move forward
           const teamHasBall = ball.ownerId !== null && players.find(pl => pl.id === ball.ownerId)?.team === p.team;

           if (dToBall < activeRange && !teamHasBall) {
             // Chase ball
             const angle = Math.atan2(ball.pos.y - p.pos.y, ball.pos.x - p.pos.x);
             targetDx = Math.cos(angle);
             targetDy = Math.sin(angle);

             // Shoot logic
             if (dToBall < p.radius + ball.radius + 5) {
                const gAngle = Math.atan2(h/2 - p.pos.y, goalX - p.pos.x);
                const variance = (Math.random() - 0.5) * 0.2; 
                const distToGoal = Math.abs(goalX - p.pos.x);
                
                // Shoot if close to goal, else dribble/pass
                if (distToGoal < 300 && p.cooldown === 0) {
                    playKickSound();
                    ball.vel.x = Math.cos(gAngle + variance) * (p.kickPower * 1.1);
                    ball.vel.y = Math.sin(gAngle + variance) * (p.kickPower * 1.1);
                    ball.ownerId = null;
                    p.cooldown = 30;
                } else if (p.cooldown === 0) {
                   // Dribble towards goal
                   targetDx = Math.cos(gAngle);
                   targetDy = Math.sin(gAngle);
                }
             }
           } else {
             // Return to formation
             const ballXPercent = ball.pos.x / w;
             let formationX = 0;
             let formationY = 0;

             // Improved Formation Logic for 5v5
             if (isBlue) {
                 // Blue attacking (Left -> Right)
                 if (p.role === PlayerRole.DEFENDER) {
                     // Defenders move up to center line when attacking
                     formationX = 150 + ballXPercent * 250; 
                 }
                 if (p.role === PlayerRole.FORWARD) {
                     // Forwards stay high
                     formationX = 300 + ballXPercent * 350; 
                 }
             } else {
                 // Red attacking (Right -> Left)
                 if (p.role === PlayerRole.DEFENDER) {
                     formationX = w - (150 + (1-ballXPercent) * 250);
                 }
                 if (p.role === PlayerRole.FORWARD) {
                     formationX = w - (300 + (1-ballXPercent) * 350);
                 }
             }
             
             // Spread out vertically
             const yOffset = p.role === PlayerRole.DEFENDER ? 120 : 100;
             formationY = (p.id % 2 === 0) ? h/2 - yOffset : h/2 + yOffset;

             // Add dynamic width movement (track ball y slightly)
             formationY += (ball.pos.y - h/2) * 0.3;

             const dx = formationX - p.pos.x;
             const dy = formationY - p.pos.y;
             const distF = Math.sqrt(dx*dx + dy*dy);
             if (distF > 10) {
                targetDx = dx / distF;
                targetDy = dy / distF;
             }
           }
        }
      }

      // Apply Movement
      if (targetDx !== 0 || targetDy !== 0) {
        p.vel.x += targetDx * 0.5;
        p.vel.y += targetDy * 0.5;
      }

      p.vel.x *= PHYSICS.playerFriction;
      p.vel.y *= PHYSICS.playerFriction;

      const speed = Math.sqrt(p.vel.x**2 + p.vel.y**2);
      if (speed > p.speed) {
        p.vel.x = (p.vel.x / speed) * p.speed;
        p.vel.y = (p.vel.y / speed) * p.speed;
      }

      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;

      // Keep players in bounds
      if (p.pos.x < p.radius) p.pos.x = p.radius;
      if (p.pos.x > w - p.radius) p.pos.x = w - p.radius;
      if (p.pos.y < p.radius) p.pos.y = p.radius;
      if (p.pos.y > h - p.radius) p.pos.y = h - p.radius;
    });

    // 3. Ball Physics
    ball.vel.x *= PHYSICS.friction;
    ball.vel.y *= PHYSICS.friction;
    ball.pos.x += ball.vel.x;
    ball.pos.y += ball.vel.y;

    // Wall Collision
    if (ball.pos.y < ball.radius) {
      ball.pos.y = ball.radius;
      ball.vel.y *= -PHYSICS.wallBounciness;
    }
    if (ball.pos.y > h - ball.radius) {
      ball.pos.y = h - ball.radius;
      ball.vel.y *= -PHYSICS.wallBounciness;
    }

    // Goal Check
    const goalYMin = h/2 - CONFIG.goalWidth/2 - 5;
    const goalYMax = h/2 + CONFIG.goalWidth/2 + 5;

    if (ball.pos.x < 0) {
      if (ball.pos.y > goalYMin && ball.pos.y < goalYMax) {
        onGoal(Team.RED);
        resetPositions(Team.RED);
        return;
      } else {
        ball.pos.x = ball.radius;
        ball.vel.x *= -PHYSICS.wallBounciness;
      }
    }
    if (ball.pos.x > w) {
      if (ball.pos.y > goalYMin && ball.pos.y < goalYMax) {
        onGoal(Team.BLUE);
        resetPositions(Team.BLUE);
        return;
      } else {
        ball.pos.x = w - ball.radius;
        ball.vel.x *= -PHYSICS.wallBounciness;
      }
    }

    // 4. Ball Collision with Players (Simulated Physics + Dribble)
    players.forEach(p => {
       const d = dist(p.pos, ball.pos);
       if (d < p.radius + ball.radius) {
         const angle = Math.atan2(ball.pos.y - p.pos.y, ball.pos.x - p.pos.x);
         const force = 1.5; 
         
         // If ball is moving fast towards player, bounce it
         // If ball is slow or player is moving towards it, control it (dribble logic simplified)
         
         ball.vel.x += Math.cos(angle) * force;
         ball.vel.y += Math.sin(angle) * force;
         
         // "Sticky" effect for dribbling could be added here, 
         // but simple collision is often better for arcade feel unless we implement full ball holding
         ball.ownerId = p.id;
       }
    });

  }, [isPlaying, onGoal, resetPositions]); 

  // --- Rendering Loop ---
  useEffect(() => {
    const render = () => {
      update();
      
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const w = CONFIG.pitchWidth;
      const h = CONFIG.pitchHeight;

      // Clear
      ctx.fillStyle = COLORS.pitch;
      ctx.fillRect(0, 0, w, h);

      // Buriman Ads (Modified)
      const drawAdBoards = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
        const boardHeight = 24; 
        const segments = 4;
        const segmentWidth = w / segments;

        // Top Board
        for (let i = 0; i < segments; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#ef4444' : '#ffffff'; 
            ctx.fillRect(i * segmentWidth, 0, segmentWidth, boardHeight);
            
            ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#ef4444';
            ctx.font = '900 16px "Noto Sans KR", Arial'; 
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("창의미래교육", i * segmentWidth + segmentWidth/2, boardHeight/2 + 1);
        }
        
        // Bottom Board
        for (let i = 0; i < segments; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#ef4444' : '#ffffff'; 
            ctx.fillRect(i * segmentWidth, h - boardHeight, segmentWidth, boardHeight);
            
            ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#ef4444';
            ctx.font = '900 16px "Noto Sans KR", Arial';
            ctx.fillText("창의미래교육", i * segmentWidth + segmentWidth/2, h - boardHeight/2 + 1);
        }
      };

      drawAdBoards(ctx, w, h);

      // Pitch Lines
      ctx.strokeStyle = COLORS.lines;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const adOffset = 24; 
      ctx.strokeRect(0, adOffset, w, h - adOffset*2);
      ctx.moveTo(w / 2, adOffset);
      ctx.lineTo(w / 2, h - adOffset);
      ctx.moveTo(w / 2 + 50, h / 2);
      ctx.arc(w / 2, h / 2, 50, 0, Math.PI * 2);
      
      // Center dot
      ctx.moveTo(w/2 + 3, h/2);
      ctx.arc(w/2, h/2, 3, 0, Math.PI*2);
      
      ctx.stroke();

      // Goals (Visual Net)
      const gw = CONFIG.goalWidth;
      const goalDepth = 25; 
      const drawGoalNet = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, isLeft: boolean) => {
         ctx.save();
         ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
         ctx.fillRect(x, y, w, h);
         ctx.beginPath();
         ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
         ctx.lineWidth = 2;
         ctx.rect(x, y, w, h);
         ctx.stroke();
         ctx.beginPath();
         ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
         ctx.lineWidth = 1;
         const step = 5;
         for(let i=x; i<=x+w; i+=step) {
           ctx.moveTo(i, y); ctx.lineTo(i, y+h);
         }
         for(let j=y; j<=y+h; j+=step) {
           ctx.moveTo(x, j); ctx.lineTo(x+w, j);
         }
         ctx.stroke();
         ctx.beginPath();
         ctx.strokeStyle = "#fff";
         ctx.lineWidth = 3;
         if (isLeft) {
            ctx.moveTo(x+w, y); ctx.lineTo(x+w, y+h); 
         } else {
            ctx.moveTo(x, y); ctx.lineTo(x, y+h); 
         }
         ctx.stroke();
         ctx.restore();
      };

      drawGoalNet(ctx, 0, h/2 - gw/2, goalDepth, gw, true);
      drawGoalNet(ctx, w - goalDepth, h/2 - gw/2, goalDepth, gw, false);

      // Draw Players
      playersRef.current.forEach(p => {
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(p.pos.x + 2, p.pos.y + 4, p.radius, p.radius*0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Player Body
        const grad = ctx.createRadialGradient(p.pos.x - 3, p.pos.y - 3, 2, p.pos.x, p.pos.y, p.radius);
        const baseColor = p.team === Team.BLUE ? COLORS.blueTeam : COLORS.redTeam;
        const highlightColor = p.team === Team.BLUE ? '#93c5fd' : '#fca5a5';
        grad.addColorStop(0, highlightColor);
        grad.addColorStop(0.3, baseColor);
        grad.addColorStop(1, '#1f2937'); 
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Jersey Number
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px "Noto Sans KR", Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.jerseyNum.toString(), p.pos.x, p.pos.y);

        // Active Player Indicator (Ring)
        if (p.id === activePlayerIdRef.current && p.team === Team.BLUE) {
          ctx.strokeStyle = '#fbbf24'; 
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(p.pos.x, p.pos.y, p.radius + 5, 0, Math.PI * 2);
          ctx.stroke();
          
          // Indicator Arrow above player
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.moveTo(p.pos.x, p.pos.y - p.radius - 12);
          ctx.lineTo(p.pos.x - 4, p.pos.y - p.radius - 18);
          ctx.lineTo(p.pos.x + 4, p.pos.y - p.radius - 18);
          ctx.fill();
        }
      });

      // Draw Ball
      const ball = ballRef.current;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(ball.pos.x + 2, ball.pos.y + 2, ball.radius, ball.radius*0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.ball;
      ctx.beginPath();
      ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(ball.pos.x, ball.pos.y, ball.radius/2.5, 0, Math.PI * 2);
      ctx.fill();

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [update]);

  return (
    <div className="w-full flex flex-col gap-4 items-center">
      {/* Game Canvas Container */}
      <div className="relative rounded-lg overflow-hidden shadow-2xl border-4 border-gray-800 w-full touch-none select-none">
        <canvas 
          ref={canvasRef} 
          width={CONFIG.pitchWidth} 
          height={CONFIG.pitchHeight}
          className="block bg-emerald-500 cursor-none w-full h-auto max-w-full"
        />
      </div>
      
      {/* Mobile Controls - Placed outside the canvas */}
      <div className="flex justify-between items-center w-full px-4 lg:hidden pb-2 touch-none select-none max-w-lg">
          
          {/* Joystick */}
          <div className="relative">
             <div className="text-center text-gray-400 text-xs font-bold mb-2">MOVE</div>
             <div 
               className="w-32 h-32 bg-gray-800 rounded-full border-4 border-gray-600 relative shadow-inner"
               onTouchStart={handleJoystickMove} 
               onTouchMove={handleJoystickMove}
               onTouchEnd={handleJoystickEnd}
             >
                {/* Joystick Knob */}
                <div 
                  className="w-14 h-14 bg-blue-500 rounded-full absolute shadow-xl border-4 border-blue-400 transition-transform duration-75 ease-linear"
                  style={{ 
                    left: `calc(50% - 28px)`, 
                    top: `calc(50% - 28px)`,
                    transform: `translate(${joystickVec.x}px, ${joystickVec.y}px)`
                  }}
                />
             </div>
          </div>

          {/* Shoot Button */}
          <div className="relative">
            <div className="text-center text-gray-400 text-xs font-bold mb-2">ACTION</div>
            <button
              className="w-24 h-24 bg-red-600 rounded-full border-b-8 border-red-800 active:border-b-0 active:translate-y-2 active:bg-red-700 shadow-xl flex items-center justify-center transition-all"
              onTouchStart={(e) => { e.preventDefault(); keysRef.current['Space'] = true; }}
              onTouchEnd={(e) => { e.preventDefault(); keysRef.current['Space'] = false; }}
            >
              <span className="font-black text-white text-xl drop-shadow-md">SHOOT</span>
            </button>
          </div>
      </div>
    </div>
  );
};

export default Pitch;