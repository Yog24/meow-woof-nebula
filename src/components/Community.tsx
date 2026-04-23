import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, Sparkles, Heart, MapPin, Send } from 'lucide-react';
import { cn } from '../lib/utils';
import { LANDMARKS, DOG_BREEDS, CAT_BREEDS } from '../constants';
import { Landmark, Pet } from '../types';
import { PublicUserProfile, searchBackendUsers, sendBackendFriendRequest } from '../services/backendClient';
import { chooseLandmarkForPersonality, getPersonalitySpeed } from '../services/nebulaRules';

interface PetNode {
  id: string;
  name: string;
  breed: string;
  type: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  vx: number;
  vy: number;
  landmarkId?: string;
  isPlayer?: boolean;
  action?: string;
  pauseUntil?: number;
  userId?: string;
  avatarUrl?: string;
  isRealUser?: boolean;
  isFriend?: boolean;
  hasPendingRequest?: boolean;
}

interface StarMessage {
  id: string;
  petId: string;
  text: string;
  x: number;
  y: number;
  timestamp: number;
}

interface Encounter {
  id: string;
  p1: string;
  p2: string;
  x: number;
  y: number;
  timestamp: number;
}

interface CommunityProps {
  myPet: Pet;
}

interface SimulationState {
  pets: PetNode[];
  encounters: Encounter[];
}

export function Community({ myPet }: CommunityProps) {
  const [selectedLandmark, setSelectedLandmark] = useState<Landmark | null>(null);
  const [selectedPet, setSelectedPet] = useState<PetNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [messageInput, setMessageInput] = useState('');
  const [socialStatus, setSocialStatus] = useState('');
  const [starMessages, setStarMessages] = useState<StarMessage[]>([]);
  const [{ pets, encounters }, setSimState] = useState<SimulationState>({
    pets: [],
    encounters: []
  });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const realUsersRef = useRef<PublicUserProfile[]>([]);

  // Fallback map generation - minimal reliance on advanced browser features
  const starField = React.useMemo(() => (
    [...Array(60)].map((_, i) => ({
      id: i,
      size: Math.random() * 2 + 1,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      delay: `${Math.random() * 3}s`,
    }))
  ), []);

  const milkyWayStars = React.useMemo(() => (
    [...Array(80)].map((_, i) => ({
      id: `mw-${i}`,
      size: Math.random() * 2.5 + 1.5,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      delay: `${Math.random() * 4}s`,
      opacity: Math.random() * 0.8 + 0.2
    }))
  ), []);

  useEffect(() => {
    const LANDMARK_POSITIONS: Record<string, { x: number, y: number }> = {
      '1': { x: 25, y: 40 }, '2': { x: 50, y: 15 }, '3': { x: 60, y: 55 },
      '4': { x: 30, y: 75 }, '5': { x: 50, y: 95 }, '6': { x: 80, y: 25 }, '7': { x: 70, y: 85 },
    };

    const breeds = [...DOG_BREEDS, ...CAT_BREEDS];
    const initialPets: PetNode[] = Array.from({ length: 10 }).map((_, i) => {
      let startX = Math.random() * 100;
      let startY = Math.random() * 100;
      let pause = 0;
      if (Math.random() < 0.8) {
        const l = LANDMARKS[Math.floor(Math.random() * LANDMARKS.length)];
        const pos = LANDMARK_POSITIONS[l.id] || { x: 50, y: 50 };
        const angle = Math.random() * Math.PI * 2;
        const radius = 6 + Math.random() * 6; // 6% to 12% away from center
        startX = pos.x + Math.cos(angle) * radius;
        startY = pos.y + Math.sin(angle) * (radius * 0.8);
        pause = Date.now() + Math.random() * 20000 + 5000;
      }
      return {
        id: `sim-${i}`,
        name: `探险者${i + 1}`,
        type: Math.random() > 0.5 ? '小狗' : '小猫',
        breed: breeds[Math.floor(Math.random() * breeds.length)],
        x: startX,
        y: startY,
        targetX: startX,
        targetY: startY,
        vx: 0,
        vy: 0,
        pauseUntil: pause
      };
    });

    const playerPet: PetNode = {
      id: 'player',
      name: myPet.name,
      type: myPet.type,
      breed: myPet.breed || '未知',
      x: 50,
      y: 50,
      targetX: 50,
      targetY: 50,
      vx: 0,
      vy: 0,
      isPlayer: true
    };

    setSimState({
      pets: [...initialPets, playerPet],
      encounters: []
    });
    
    // Auto-scroll to center on mount safely.
    const timer = setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = 200;
        containerRef.current.scrollLeft = 200;
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [myPet]);

  useEffect(() => {
    const loadRealUsers = async () => {
      try {
        const users = await searchBackendUsers('');
        realUsersRef.current = users;
        setSimState(prev => {
          const existingIds = new Set(prev.pets.map(pet => pet.userId).filter(Boolean));
          const realPetNodes = users
            .filter(user => !existingIds.has(user.id))
            .slice(0, 12)
            .map((user, index): PetNode => {
              const startX = 20 + Math.random() * 65;
              const startY = 20 + Math.random() * 70;
              return {
                id: `user-${user.id}`,
                userId: user.id,
                name: user.nickName,
                type: '星云旅人',
                breed: user.isFriend ? '看星伙伴' : '路过旅人',
                x: startX,
                y: startY,
                targetX: startX,
                targetY: startY,
                vx: 0,
                vy: 0,
                avatarUrl: user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.nickName || String(index))}&backgroundColor=c0aede`,
                isRealUser: true,
                isFriend: user.isFriend,
                hasPendingRequest: user.hasPendingRequest,
              };
            });
          return {
            ...prev,
            pets: [...prev.pets.filter(pet => !pet.id.startsWith('user-')), ...realPetNodes],
          };
        });
      } catch {
        // The universe still works with local simulated travelers when social loading fails.
      }
    };
    void loadRealUsers();
  }, []);

  useEffect(() => {
    const LANDMARK_POSITIONS: Record<string, { x: number, y: number }> = {
      '1': { x: 25, y: 40 },
      '2': { x: 50, y: 15 },
      '3': { x: 60, y: 55 },
      '4': { x: 30, y: 75 },
      '5': { x: 50, y: 95 },
      '6': { x: 80, y: 25 },
      '7': { x: 70, y: 85 },
    };

    const loop = setInterval(() => {
      setSimState(prev => {
        const { pets: currentPets, encounters: currentEncounters } = prev;
        
        const nextPets = currentPets.map(p => {
          let { x, y, targetX, targetY, vx, vy, landmarkId, pauseUntil } = p;
          
          const now = Date.now();
          if (pauseUntil && now < pauseUntil) {
             vx *= 0.8;
             vy *= 0.8;
             return { ...p, x: x + vx, y: y + vy, vx, vy };
          }
          
          const dx = targetX - x;
          const dy = targetY - y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          let action = undefined;
          if (dist < 2) {
            if (Math.random() < 0.8) {
              const l = p.isPlayer
                ? chooseLandmarkForPersonality(myPet.personality)
                : LANDMARKS[Math.floor(Math.random() * LANDMARKS.length)];
              const pos = LANDMARK_POSITIONS[l.id] || { x: 50, y: 50 };
              const angle = Math.random() * Math.PI * 2;
              const radius = 6 + Math.random() * 6;
              targetX = pos.x + Math.cos(angle) * radius;
              targetY = pos.y + Math.sin(angle) * (radius * 0.8);
              landmarkId = l.id;
              pauseUntil = now + Math.random() * 20000 + 10000;
            } else {
              targetX = Math.random() * 100;
              targetY = Math.random() * 100;
              landmarkId = undefined;
              pauseUntil = 0;
            }
          }

          if (landmarkId && dist < 5) {
            const acts: Record<string, string> = {
              '1': '赏花中',
              '2': '冲刺中',
              '3': '洗香香',
              '4': '呼呼大睡',
              '5': '猛吃零食',
              '6': '看表演',
              '7': '想主人'
            };
            action = acts[landmarkId] || '游玩中';
          }

          const speedMultiplier = p.isPlayer ? getPersonalitySpeed(myPet.personality) : (p.isRealUser ? 0.9 : 1);
          const force = 0.0033 * speedMultiplier;
          vx += (targetX - x) * force;
          vy += (targetY - y) * force;
          vx *= p.isPlayer && speedMultiplier < 0.8 ? 0.86 : 0.90;
          vy *= p.isPlayer && speedMultiplier < 0.8 ? 0.86 : 0.90;

          return { ...p, x: x + vx, y: y + vy, targetX, targetY, vx, vy, landmarkId, action, pauseUntil };
        });

        const now = Date.now();
        const activeEncounters = currentEncounters.filter(e => now - e.timestamp < 2000);
        const activeEncounterIds = new Set(activeEncounters.map(e => e.id));

        const possibleEncounters: Encounter[] = [];
        for (let i = 0; i < nextPets.length; i++) {
          for (let j = i + 1; j < nextPets.length; j++) {
            const p1 = nextPets[i];
            const p2 = nextPets[j];
            const dx = p1.x - p2.x;
            const dy = p1.y - p2.y;
            if (dx * dx + dy * dy < 4) { // D < 2
              const encounterId = [p1.id, p2.id].sort().join('-');
              if (!activeEncounterIds.has(encounterId)) {
                possibleEncounters.push({
                  id: encounterId,
                  p1: p1.id,
                  p2: p2.id,
                  x: (p1.x + p2.x) / 2,
                  y: (p1.y + p2.y) / 2,
                  timestamp: now
                });
                activeEncounterIds.add(encounterId); 
              }
            }
          }
        }

        return { pets: nextPets, encounters: [...activeEncounters, ...possibleEncounters] };
      });
      
      setStarMessages(prevMessages => {
        const now = Date.now();
        return prevMessages.filter(m => now - m.timestamp < 4000);
      });
    }, 80);

    return () => clearInterval(loop);
  }, [myPet.personality]);

  const LANDMARK_POSITIONS: Record<string, { x: number, y: number }> = {
    '1': { x: 25, y: 40 },
    '2': { x: 50, y: 15 },
    '3': { x: 60, y: 55 },
    '4': { x: 30, y: 75 },
    '5': { x: 50, y: 95 },
    '6': { x: 80, y: 25 },
    '7': { x: 70, y: 85 },
  };

  const handleSendStarMessage = () => {
    if (messageInput.trim() && selectedPet) {
      setStarMessages(prev => [...prev, {
        id: Date.now().toString(),
        petId: selectedPet.id,
        text: messageInput.trim(),
        x: selectedPet.x,
        y: selectedPet.y,
        timestamp: Date.now()
      }]);
      setMessageInput('');
      setSelectedPet(null);
    }
  };

  const handleAddFriend = async (petNode: PetNode) => {
    if (!petNode.userId || petNode.isFriend || petNode.hasPendingRequest) return;
    setSocialStatus('');
    try {
      await sendBackendFriendRequest(petNode.userId);
      setSocialStatus('好友请求已发出');
      setSimState(prev => ({
        ...prev,
        pets: prev.pets.map(pet => (
          pet.id === petNode.id ? { ...pet, hasPendingRequest: true } : pet
        )),
      }));
      setSelectedPet(prev => prev ? { ...prev, hasPendingRequest: true } : prev);
    } catch (error) {
      setSocialStatus(error instanceof Error ? error.message : '好友请求发送失败');
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col font-sans bg-[#050510]" style={{ zIndex: 0 }}>
      {/* Header */}
      <div className="absolute top-10 left-0 right-0 px-6 pl-14 z-40 flex justify-between items-center pointer-events-none">
        <h2 className="text-xl font-serif font-bold text-white flex items-center gap-3 drop-shadow-md pointer-events-auto">
          <Compass size={24} className="text-blue-400" />
          星云宇宙
        </h2>
        <div className="flex flex-col items-end gap-3 translate-y-1">
          <div className="px-4 py-2 bg-white/10 backdrop-blur-md rounded-full border border-white/20 flex items-center gap-2 pointer-events-auto">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-blue-200">正在通讯</span>
          </div>
          
          <div className="flex flex-col gap-2 pointer-events-auto bg-black/20 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-lg">
            <button 
              onClick={() => setZoom(prev => Math.min(prev + 0.2, 3))}
              className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90"
              title="放大"
            >
              <span className="text-xl font-bold">+</span>
            </button>
            <button 
              onClick={() => setZoom(prev => Math.max(prev - 0.2, 0.5))}
              className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-all active:scale-90"
              title="缩小"
            >
              <span className="text-xl font-bold">-</span>
            </button>
            <button 
              onClick={() => setZoom(1)}
              className="w-10 h-10 flex items-center justify-center text-white/40 hover:text-white transition-all text-[8px] font-bold uppercase tracking-tighter"
            >
              1:1
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Area using standard CSS scrolling for absolute maximum compatibility */}
      <div 
        ref={containerRef}
        className="block w-full h-full overflow-auto scroll-smooth z-0 relative scrollbar-hide"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <motion.div 
          animate={{ scale: zoom }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          style={{ transformOrigin: '0 0' }}
          className="relative w-[1000px] h-[1400px] bg-transparent"
        >
          <div 
            className="absolute inset-0 z-[-1]"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1518066000714-58c45f1a2c0a?q=80&w=1080&auto=format&fit=crop')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'contrast(1.2) brightness(0.9)'
            }}
          />
          <div className="absolute inset-0 bg-[#050510]/10 z-0 pointer-events-none" />
          
          {/* Extremely safe Milky Way glowing elements (basic divs with blur) */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
            <div className="absolute w-[400px] h-[1800px] top-[-200px] left-[300px] -rotate-[15deg]">
              <div className="absolute inset-0 bg-blue-500/15 blur-[60px]" />
              <div className="absolute inset-0 bg-purple-500/10 blur-[40px] left-[100px]" />
              
              {/* Milky Way specific internal stars */}
              {milkyWayStars.map((star) => (
                <div 
                  key={star.id}
                  className="absolute bg-white rounded-full shadow-[0_0_8px_#ffffff]"
                  style={{ 
                    width: star.size, 
                    height: star.size, 
                    left: star.left, 
                    top: star.top,
                    opacity: star.opacity,
                    animation: `twinkle 4s infinite ease-in-out ${star.delay}`
                  }}
                />
              ))}
            </div>
          </div>

          {/* Simple Stars */}
          {starField.map((star) => (
            <div 
              key={star.id}
              className="absolute bg-white rounded-full opacity-80"
              style={{ 
                width: star.size, 
                height: star.size, 
                left: star.left, 
                top: star.top,
                animation: `twinkle 3s infinite ease-in-out ${star.delay}`
              }}
            />
          ))}

          {/* Encounters */}
          {encounters.map(e => (
            <div
              key={e.id}
              className="absolute z-20 pointer-events-none transition-all duration-300"
              style={{ left: `${e.x}%`, top: `${e.y}%`, transform: 'translate(-50%, -50%)' }}
            >
              <div className="w-8 h-8 bg-blue-400/40 rounded-full blur-md animate-ping" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="text-yellow-300" size={16} />
              </div>
            </div>
          ))}

          {/* Landmarks aligned gracefully on the background strip */}
          {LANDMARKS.map(l => {
            const pos = LANDMARK_POSITIONS[l.id] || { x: 50, y: 50 };
            return (
              <button
                key={l.id}
                className="absolute z-10 flex flex-col items-center group cursor-pointer"
                style={{ 
                  left: `${pos.x}%`, 
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)' 
                }}
                onClick={(ev) => {
                  ev.preventDefault();
                  setSelectedLandmark(l);
                }}
              >
                <div className="w-16 h-16 rounded-full border border-white/20 bg-white/5 backdrop-blur-md flex items-center justify-center relative transition-colors group-hover:bg-white/10 group-hover:border-blue-400/50">
                  <MapPin size={24} className="text-white/80 group-hover:text-blue-300 transition-colors" />
                </div>
                <div className="mt-2 px-4 py-1.5 bg-[#1C1C24]/90 rounded-full border border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                  <p className="text-[12px] text-white/90 font-medium tracking-wide whitespace-nowrap">{l.name}</p>
                </div>
              </button>
            );
          })}

          {/* Pets Simulation */}
          {pets.map(p => (
            <div
              key={p.id}
              className="absolute z-30 transition-transform duration-100 ease-linear pointer-events-none"
              style={{ 
                left: `${p.x}%`, 
                top: `${p.y}%`,
                transform: 'translate(-50%, -50%)'
              }}
            >
              <button 
                onClick={(ev) => {
                  ev.preventDefault();
                  setSelectedPet(p);
                }} 
                className={cn(
                  "relative flex flex-col items-center pointer-events-auto transition-transform",
                  p.isPlayer ? "scale-100" : "scale-[0.65] opacity-90 hover:scale-[0.8]"
                )}
              >
                {p.isPlayer && (
                  <div className="absolute -top-7 px-3 py-1.5 bg-blue-500/90 backdrop-blur text-[11px] font-bold text-white rounded-full uppercase tracking-widest shadow-lg whitespace-nowrap">
                    在这里
                  </div>
                )}
                {p.action && (
                  <div className="absolute -top-7 px-3 py-1.5 bg-white/20 backdrop-blur-md text-[11px] font-bold text-white rounded-full border border-white/30 truncate shadow-xl whitespace-nowrap">
                    {p.action}
                  </div>
                )}
                <div className={cn(
                   "w-16 h-16 rounded-full overflow-hidden shadow-2xl relative",
                   p.isPlayer ? "border-[3px] border-blue-400" : "border-2 border-white/40"
                )}>
                    <img 
                      src={p.isPlayer ? myPet.imageUrl : (p.avatarUrl || `https://loremflickr.com/150/150/${p.type === '小狗' ? 'dog' : 'cat'}?lock=${p.id.replace(/\D/g, '') || '1'}`)}
                      className="w-full h-full object-cover bg-[#1a1a2e] image-pixelated"
                      alt={p.name}
                      referrerPolicy="no-referrer"
                    />
                </div>
                <div className="mt-2 px-4 py-1.5 bg-black/70 backdrop-blur-md rounded-full border border-white/10 shadow-lg">
                  <p className="text-xs font-bold text-white text-center whitespace-nowrap">{p.name}</p>
                </div>
              </button>
            </div>
          ))}

          {/* Star Messages */}
          {starMessages.map(msg => (
            <div
              key={msg.id}
              className="absolute z-40 px-4 py-2 bg-gradient-to-r from-blue-500/80 to-purple-500/80 backdrop-blur-lg rounded-full shadow-[0_0_20px_rgba(59,130,246,0.4)] pointer-events-none transition-all duration-500 transform -translate-y-6"
              style={{ left: `${msg.x}%`, top: `${msg.y}%`, transform: 'translate(-50%, -100%)' }}
            >
              <p className="text-[11px] font-bold text-white whitespace-nowrap">{msg.text}</p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Popovers Layer */}
      <AnimatePresence>
        {selectedLandmark && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 pb-28"
            onClick={() => setSelectedLandmark(null)}
          >
            <div 
              className="w-full max-w-sm max-h-[75vh] overflow-y-auto overflow-x-hidden bg-[#11131A] rounded-[3rem] p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/10 scrollbar-hide"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-6 border border-white/10">
                <MapPin size={32} className="text-white/80" />
              </div>
              
              <h3 className="text-3xl font-serif font-bold text-white mb-6">{selectedLandmark.name}</h3>

              <div className="space-y-4 mb-8">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                  <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">宇宙原型</p>
                  <p className="text-sm text-white/90 font-medium">{selectedLandmark.cosmicConcept}</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                  <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">对应日常</p>
                  <p className="text-sm text-white/90 font-medium">{selectedLandmark.lifeConcept}</p>
                </div>
              </div>

              <p className="text-white/50 text-sm leading-relaxed italic border-l-2 border-blue-500/30 pl-4 mb-8">
                “{selectedLandmark.description}”
              </p>

              <div className="flex gap-4">
                <button className="flex-1 bg-white/10 text-white py-4 rounded-2xl font-bold text-sm hover:bg-white/20 transition-colors">
                  打卡去玩
                </button>
                <button 
                  onClick={() => setSelectedLandmark(null)}
                  className="bg-transparent text-white/40 border border-white/10 py-4 px-6 rounded-2xl font-bold text-sm hover:bg-white/5"
                >
                  关闭
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 pb-28"
            onClick={() => setSelectedPet(null)}
          >
            <div 
              className="w-full max-w-sm max-h-[75vh] overflow-y-auto overflow-x-hidden bg-[#11131A] rounded-[3rem] p-8 shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/10 scrollbar-hide"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex flex-col items-center mb-6">
                <img 
                  src={selectedPet.isPlayer ? myPet.imageUrl : (selectedPet.avatarUrl || `https://loremflickr.com/150/150/${selectedPet.type === '小狗' ? 'dog' : 'cat'}?lock=${selectedPet.id.replace(/\D/g, '') || '1'}`)}
                  alt={selectedPet.name}
                  className="w-24 h-24 rounded-full border-4 border-white/10 mb-4 bg-slate-800 object-cover image-pixelated"
                  referrerPolicy="no-referrer"
                />
                <h3 className="text-2xl font-bold text-white mb-2">{selectedPet.name}</h3>
                <p className="text-xs text-white/40 bg-white/5 px-3 py-1 rounded-full">{selectedPet.breed} · {selectedPet.type}</p>
              </div>

              <div className="flex justify-center mb-6">
                <button 
                  className="bg-rose-500/10 text-rose-400 p-4 rounded-full hover:bg-rose-500/20 transition-colors"
                  onClick={() => {
                    setStarMessages(prev => [...prev, {
                      id: Date.now().toString(),
                      petId: selectedPet.id,
                      text: "送出了这颗心意 ❤️",
                      x: selectedPet.x,
                      y: selectedPet.y,
                      timestamp: Date.now()
                    }]);
                    setSelectedPet(null);
                  }}
                >
                  <Heart size={28} />
                </button>
              </div>

              {selectedPet.isRealUser && !selectedPet.isPlayer && (
                <button
                  onClick={() => handleAddFriend(selectedPet)}
                  disabled={selectedPet.isFriend || selectedPet.hasPendingRequest}
                  className="w-full mb-4 bg-white/10 disabled:bg-white/5 disabled:text-white/40 text-white py-3 rounded-2xl font-bold text-sm hover:bg-white/20 transition-colors border border-white/10"
                >
                  {selectedPet.isFriend ? '已经是看星伙伴' : selectedPet.hasPendingRequest ? '好友请求已发出' : '加为看星伙伴'}
                </button>
              )}

              {socialStatus && (
                <p className="text-center text-xs text-white/50 mb-4">{socialStatus}</p>
              )}

              <div className="bg-[#0B0F19]/60 backdrop-blur-xl p-2 rounded-full flex gap-2 border border-blue-500/30 items-center pl-4 shadow-[0_0_15px_rgba(59,130,246,0.15)] relative">
                <input 
                  type="text" 
                  placeholder="发送星语..." 
                  className="flex-1 bg-transparent py-2 text-sm text-white focus:outline-none placeholder:text-white/40"
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleSendStarMessage();
                    }
                  }}
                />
                <button 
                  onClick={handleSendStarMessage}
                  className="p-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-full transition-colors flex items-center justify-center shadow-lg"
                >
                  <Send size={16} className="ml-0.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}} />
    </div>
  );
}
