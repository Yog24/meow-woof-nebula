import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Pet, UserProfile } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { Heart, Sparkles, RefreshCw, Fish, Bone, X } from 'lucide-react';

interface PetDisplayProps {
  pet: Pet;
  onInteract: (type: 'pat' | 'poke' | 'feed') => void;
  userProfile?: UserProfile | null;
  onUpdateProfile?: (profile: UserProfile) => void;
  onRefreshAvatar?: () => void;
  isGenerating?: boolean;
}

export function PetDisplay({ pet, onInteract, userProfile, onUpdateProfile, onRefreshAvatar, isGenerating }: PetDisplayProps) {
  const [feedback, setFeedback] = useState<{ text: string; x: number; y: number } | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [isJumping, setIsJumping] = useState(false);
  const [currentMood, setCurrentMood] = useState<'normal' | 'happy' | 'sleeping' | 'eating'>('normal');
  const [showFeedMenu, setShowFeedMenu] = useState(false);

  const feedOptions = [
    { id: 'freeze-dried', name: '冻干', cost: 10, icon: <Bone size={14} />, effect: '🍖' },
    { id: 'cat-treat', name: '猫条', cost: 15, icon: <Fish size={14} />, effect: '🐟' },
    { id: 'fish-oil', name: '鱼油', cost: 20, icon: <Sparkles size={14} />, effect: '💊' },
  ];

  const handleFeedSelect = (option: typeof feedOptions[0]) => {
    if (!userProfile || !onUpdateProfile) return;

    if (userProfile.coins < option.cost) {
      alert("星辰币不足，请前往充值通道买点吃的吧！");
      return;
    }

    const currentInventory = userProfile.foodInventory || {};
    onUpdateProfile({
      ...userProfile,
      coins: userProfile.coins - option.cost,
      foodInventory: {
        ...currentInventory,
        [option.id]: (currentInventory[option.id] || 0) + 1
      }
    });

    handleInteraction(null, 'feed', option.effect);
    setTimeout(() => {
        setShowFeedMenu(false);
    }, 600);
  };
  
  const handleUseFood = (option: typeof feedOptions[0]) => {
    if (!userProfile || !onUpdateProfile) return;
    
    const currentInventory = userProfile.foodInventory || {};
    const count = currentInventory[option.id] || 0;
    
    if (count <= 0) {
      alert(`没有足够的${option.name}了，快去买一点吧！`);
      return;
    }
    
    onUpdateProfile({
      ...userProfile,
      foodInventory: {
        ...currentInventory,
        [option.id]: count - 1
      }
    });
    
    handleInteraction(null, 'feed', option.effect);
    setTimeout(() => {
        setShowFeedMenu(false);
    }, 600);
  };

  const handleInteraction = (e: React.MouseEvent | null, type: 'pat' | 'poke' | 'feed', customEffect?: string) => {
    if (cooldown && type !== 'feed') return;

    if (e) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setFeedback({ text: type === 'pat' ? '😊' : (type === 'feed' ? (customEffect || '🍜') : '⚡'), x, y });
    } else {
      setFeedback({ text: type === 'feed' ? (customEffect || '🍜') : '😊', x: 200, y: 150 });
    }

    if (type === 'pat' || type === 'poke') {
        setCurrentMood('happy');
        setIsJumping(true);
        setTimeout(() => {
            setIsJumping(false);
            setCurrentMood('normal');
        }, 2000);
    } else if (type === 'feed') {
        setCurrentMood('eating');
        setTimeout(() => setCurrentMood('normal'), 3000);
    }

    onInteract(type);
    
    setCooldown(true);
    setTimeout(() => setFeedback(null), 1000);
    setTimeout(() => setCooldown(false), 2000);
  };

  const getTemplateStyles = () => {
    switch (pet.environment.templateId) {
      case 'starry': return 'from-indigo-900 via-purple-900 to-black';
      case 'forest': return 'from-emerald-800 to-teal-900';
      default: return 'from-clay-800 to-sepia-600';
    }
  };

  // Determine which image to show
  const displayImage = (() => {
    if (pet.energy < 20 && currentMood === 'normal') return pet.moodImages?.sleeping || pet.imageUrl;
    return pet.moodImages?.[currentMood] || pet.imageUrl;
  })();

  return (
    <div className={cn(
      "relative w-full h-full flex items-center justify-center pointer-events-none"
    )}>
      {/* Nest Layer: starfield background is provided by App, nest stays between sky and pet. */}
      {pet.nestImageUrl && (
        <motion.div
          className="absolute z-[6] bottom-[12%] left-1/2 w-[78%] max-w-[260px] aspect-[4/3] -translate-x-1/2 pointer-events-none"
          initial={{ opacity: 0, scale: 0.9, y: 16 }}
          animate={{ opacity: 0.72, scale: 1, y: [0, -4, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute inset-0 rounded-full bg-cyan-200/15 blur-[55px]" />
          <img
            src={pet.nestImageUrl}
            alt={`${pet.name}的小窝`}
            className="relative w-full h-full object-contain opacity-75 saturate-[0.55] brightness-110"
            style={{
              filter: 'drop-shadow(0 0 24px rgba(125, 211, 252, 0.35))',
              maskImage: 'radial-gradient(circle at center, black 48%, transparent 78%)',
              WebkitMaskImage: 'radial-gradient(circle at center, black 48%, transparent 78%)'
            }}
            referrerPolicy="no-referrer"
          />
        </motion.div>
      )}

      {/* Pet Layer */}
      <motion.div
        className="relative z-10 w-2/3 max-w-[220px] aspect-square cursor-pointer pointer-events-auto"
        onClick={(e) => handleInteraction(e, 'pat')}
        whileHover={{ scale: 1.05 }}
        animate={isJumping ? {
          y: [-25, 0],
          scale: [1, 1.2, 1]
        } : (currentMood === 'eating' ? {
            scale: [1, 1.1, 1],
            x: [0, 3, -3, 0]
        } : {
          y: [0, -15, 0],
          scale: [1, 1.02, 1]
        })}
        transition={isJumping ? {
          duration: 0.4,
          ease: "easeOut"
        } : (currentMood === 'eating' ? {
            duration: 0.2,
            repeat: Infinity
        } : {
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        })}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Outer Glow */}
          <div className={cn(
              "absolute w-[120%] h-[120%] rounded-full blur-[80px] animate-pulse transition-all duration-1000",
              currentMood === 'happy' ? "bg-pink-400/30 shadow-[0_0_100px_rgba(244,114,182,0.3)]" : 
              (currentMood === 'eating' ? "bg-yellow-400/30 shadow-[0_0_100px_rgba(250,204,21,0.3)]" : "bg-white/20 shadow-[0_0_100px_rgba(255,255,255,0.2)]")
          )} />
          
          <AnimatePresence mode="wait">
            <motion.img 
              key={displayImage}
              src={displayImage} 
              alt={pet.name}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.3 }}
              className="relative w-full h-full object-contain image-pixelated pointer-events-none"
              style={{
                filter: 'drop-shadow(0 0 18px rgba(191, 219, 254, 0.45)) drop-shadow(0 10px 20px rgba(0,0,0,0.45)) brightness(1.12) saturate(0.72)',
                opacity: 0.92,
                maskImage: 'radial-gradient(circle at center, black 40%, transparent 70%)',
                WebkitMaskImage: 'radial-gradient(circle at center, black 40%, transparent 70%)'
              }}
              referrerPolicy="no-referrer"
            />
          </AnimatePresence>
        </div>

        {/* Ambient Particles */}
        <AnimatePresence>
          {[...Array(currentMood === 'eating' ? 12 : 6)].map((_, i) => (
            <motion.div
              key={i}
              className={cn(
                  "absolute w-1.5 h-1.5 rounded-full blur-[1px]",
                  currentMood === 'eating' ? "bg-pink-300" : "bg-white/60"
              )}
              initial={{ x: "50%", y: "50%", opacity: 0 }}
              animate={{ 
                x: `${50 + (Math.random() - 0.5) * (currentMood === 'eating' ? 150 : 100)}%`, 
                y: `${50 + (Math.random() - 0.5) * (currentMood === 'eating' ? 150 : 100)}%`,
                opacity: [0, 1, 0],
                scale: currentMood === 'eating' ? [1, 1.5, 1] : 1
              }}
              transition={{ 
                duration: 2 + Math.random() * 2, 
                repeat: Infinity,
                delay: i * (currentMood === 'eating' ? 0.2 : 0.5)
              }}
            >
                {currentMood === 'eating' && <Heart size={8} fill="currentColor" className="text-pink-400" />}
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Interaction Buttons Overlay */}
      <div className="absolute top-10 right-4 flex flex-col items-center gap-4 pointer-events-auto">
        <div className="relative">
          <button 
            onClick={() => setShowFeedMenu(!showFeedMenu)}
            className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity group"
          >
            <Sparkles size={18} className="text-yellow-200 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)] group-active:scale-95" />
            <span className="text-[10px] text-white font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">喂食</span>
          </button>
        </div>

        <button 
          onClick={() => handleInteraction(null, 'pat')}
          className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity group"
        >
          <Heart size={18} className="text-pink-300 drop-shadow-[0_0_8px_rgba(244,114,182,0.8)] group-active:scale-95" />
          <span className="text-[10px] text-white font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">互动</span>
        </button>

        <button 
          onClick={() => onRefreshAvatar && onRefreshAvatar()}
          disabled={isGenerating}
          className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity group disabled:opacity-40"
        >
          <RefreshCw size={18} className={cn("text-blue-300 drop-shadow-[0_0_8px_rgba(147,197,253,0.8)] group-active:scale-95", isGenerating && "animate-spin")} />
          <span className="text-[10px] text-white font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">刷新</span>
        </button>
      </div>
      
      {/* Feed modal overlay */}
      <AnimatePresence>
        {showFeedMenu && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setShowFeedMenu(false)}
          >
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-[#11131A]/95 p-6 rounded-3xl border border-white/20 shadow-2xl flex flex-col gap-4 w-full max-w-sm relative"
                onClick={e => e.stopPropagation()}
                style={{ pointerEvents: 'auto' }}
            >
                <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col gap-1">
                        <h3 className="text-white font-bold text-lg">投喂 {pet.name}</h3>
                        <div className="text-yellow-300 text-[10px] font-bold bg-yellow-400/20 px-3 py-1 rounded-full flex items-center gap-1 w-fit">
                            <Sparkles size={10} /> {userProfile?.coins || 0} 星辰币
                        </div>
                    </div>
                    <button 
                      onClick={() => setShowFeedMenu(false)}
                      className="p-2 bg-white/10 rounded-full text-white/60 hover:bg-white/20 hover:text-white transition-colors"
                    >
                      <X size={16} />
                    </button>
                </div>
                
                <div className="flex flex-col gap-3">
                    {feedOptions.map(opt => {
                        const ownedCount = (userProfile?.foodInventory || {})[opt.id] || 0;
                        return (
                            <div key={opt.id} className="flex items-center justify-between bg-white/5 rounded-xl p-3 border border-white/10">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gradient-to-br from-yellow-400/80 to-yellow-600/80 rounded-xl flex items-center justify-center text-white shadow-inner text-lg">
                                      {opt.icon}
                                    </div>
                                    <div className="flex flex-col items-start pr-2">
                                       <span className="text-sm font-bold text-white">{opt.name}</span>
                                       <span className="text-[10px] text-white/50">余量: {ownedCount}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleFeedSelect(opt)}
                                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-yellow-200 text-xs font-bold transition-all active:scale-95"
                                    >
                                        买({opt.cost})
                                    </button>
                                    <button 
                                        onClick={() => handleUseFood(opt)}
                                        disabled={ownedCount <= 0}
                                        className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 disabled:text-gray-400 rounded-lg text-white text-xs font-bold transition-all active:scale-95"
                                    >
                                        喂食
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interaction Feedback */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 0, scale: 0.5 }}
            animate={{ opacity: 1, y: -80, scale: 1.5 }}
            exit={{ opacity: 0 }}
            className="absolute z-20 pointer-events-none text-4xl drop-shadow-lg"
            style={{ left: feedback.x, top: feedback.y }}
          >
            {feedback.text}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
