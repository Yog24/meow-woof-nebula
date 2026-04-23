import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Camera, Sparkles, Heart, ArrowRight, Home as HomeIcon, Settings, Mail, Gift, Clover, User, Feather, Crosshair, Users, Command, ArrowLeft, Coins } from 'lucide-react';
import { Pet, ChatMessage, PetStatus, UserProfile, Environment, Story } from './types';
import { BasicInfo } from './components/BasicInfo';
import { Friends } from './components/Friends';
import { SystemMail } from './components/SystemMail';
import { Shop } from './components/Shop';
import { PetDisplay } from './components/PetDisplay';
import { Chat } from './components/Chat';
import { Community } from './components/Community';
import { Whisper } from './components/Whisper';
import { AscensionCeremony } from './components/AscensionCeremony';
import { Memories } from './components/Memories';
import { AiSettings } from './components/AiSettings';
import { Starfield } from './components/Starfield';
import { getPetResponse, generatePetAvatar, analyzePetImages, generateAllPetMoods } from './services/geminiService';
import { cn } from './lib/utils';
import {
  getAccountStorageItem,
  migrateLegacyAccountStorage,
  removeAccountStorageItem,
  setAccountStorageItem,
} from './services/accountStorage';
import { getBackendCurrentUser, getCachedBackendUser, loginWithDisplayName } from './services/backendClient';
import { buildMemorySnippets, shouldPromptForShyHungryPet } from './services/nebulaRules';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [pet, setPet] = useState<Pet | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackendLoggedIn, setIsBackendLoggedIn] = useState(false);
  const [loginName, setLoginName] = useState(() => localStorage.getItem('wangxing_login_name') || '喵汪星旅人');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Load data from local storage
  useEffect(() => {
    const loadData = async () => {
      await getBackendCurrentUser().then((user) => {
        setIsBackendLoggedIn(Boolean(user));
        if (user) migrateLegacyAccountStorage(user.id);
      }).catch(() => null);

      const savedPet = getAccountStorageItem('wangxing_pet_v2');
      const savedProfile = getAccountStorageItem('wangxing_profile_v2');
      const savedMessages = getAccountStorageItem('wangxing_messages_v2');

      if (savedProfile) {
        setUserProfile(JSON.parse(savedProfile));
      } else {
        const defaultProfile: UserProfile = {
          uid: 'local_user',
          displayName: '喵汪星旅人',
          coins: 500,
          inventory: []
        };
        setUserProfile(defaultProfile);
        setAccountStorageItem('wangxing_profile_v2', JSON.stringify(defaultProfile));
      }

      if (savedPet) {
        setPet(JSON.parse(savedPet));
      } else {
        setIsCreating(true);
      }

      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      }

      setIsLoading(false);
    };

    void loadData();
  }, []);

  const reloadAccountData = () => {
    setIsBackendLoggedIn(Boolean(getCachedBackendUser()));
    const savedPet = getAccountStorageItem('wangxing_pet_v2');
    const savedProfile = getAccountStorageItem('wangxing_profile_v2');
    const savedMessages = getAccountStorageItem('wangxing_messages_v2');

    if (savedProfile) {
      setUserProfile(JSON.parse(savedProfile));
    } else {
      const defaultProfile: UserProfile = {
        uid: 'local_user',
        displayName: '喵汪星旅人',
        coins: 500,
        inventory: []
      };
      setUserProfile(defaultProfile);
      setAccountStorageItem('wangxing_profile_v2', JSON.stringify(defaultProfile));
    }

    setPet(savedPet ? JSON.parse(savedPet) : null);
    setMessages(savedMessages ? JSON.parse(savedMessages) : []);
    setIsCreating(!savedPet);
    setActiveTab('home');
  };

  const handleLoginBeforeCreate = async () => {
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const result = await loginWithDisplayName(loginName);
      localStorage.setItem('wangxing_login_name', result.user.nickName);
      migrateLegacyAccountStorage(result.user.id);
      setIsBackendLoggedIn(true);
      reloadAccountData();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : '登录失败');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Auto-recovery of energy
  useEffect(() => {
    if (!pet) return;
    const interval = setInterval(() => {
      setPet(prev => {
        if (!prev) return null;
        const newEnergy = Math.min(100, prev.energy + 1);
        const newPet = { ...prev, energy: newEnergy };
        setAccountStorageItem('wangxing_pet_v2', JSON.stringify(newPet));
        return newPet;
      });
    }, 30000); // Recover 1 energy every 30s
    return () => clearInterval(interval);
  }, [pet?.id]);

  useEffect(() => {
    if (!pet || !userProfile) return;
    const today = new Date().toLocaleDateString('en-CA');
    const storageKey = `wangxing_hungry_hint:${pet.id}:${today}`;
    if (localStorage.getItem(storageKey)) return;
    if (!shouldPromptForShyHungryPet(pet.personality)) return;

    const timer = setTimeout(() => {
      const hint: ChatMessage = {
        id: `hungry-${Date.now()}`,
        sender: 'pet',
        text: `${pet.ownerTitle}，我刚刚路过双星食堂又绕开了……有一点点饿，但是那里好多小伙伴，我有点不好意思去。你要是有星辰币，能不能给我买点小零食呀？`,
        timestamp: Date.now(),
      };
      setMessages(prev => {
        const nextMessages = [...prev, hint];
        setAccountStorageItem('wangxing_messages_v2', JSON.stringify(nextMessages));
        return nextMessages;
      });
      localStorage.setItem(storageKey, '1');
    }, 4500 + Math.random() * 6000);

    return () => clearTimeout(timer);
  }, [pet?.id, userProfile?.coins]);

  const handleAscensionComplete = async (data: any) => {
    setIsGenerating(true);
    
    // Create a promise that resolves when the ceremony animation is finished
    const animationPromise = new Promise<void>(resolve => {
      const listener = () => {
        window.removeEventListener('ceremonyAnimationComplete', listener);
        resolve();
      };
      window.addEventListener('ceremonyAnimationComplete', listener);
    });

    try {
      const analysisData = await analyzePetImages(data.images);
      
      const personalityStr = Array.isArray(data.personality) ? data.personality.join(', ') : data.personality;
      const speakingStyleStr = Array.isArray(data.speakingStyle) ? data.speakingStyle.join(', ') : data.speakingStyle;
      
      const refinedDescription = analysisData 
        ? `${analysisData.breed || data.type}, coat colors: ${analysisData.primaryColor} and ${analysisData.secondaryColor || ''}, patterns: ${analysisData.patterns}, ears: ${analysisData.earType}, tail: ${analysisData.tailType}, unique features: ${analysisData.uniqueFeatures}, colors to use: ${analysisData.colorPalette?.join(', ') || ''}, character: ${personalityStr}`
        : `${data.type}, ${personalityStr}`;

      const moodImages = await generateAllPetMoods(refinedDescription, data.breed, data.images);

      const newPet: Pet = {
        id: Date.now().toString(),
        name: data.name,
        type: data.type,
        breed: data.breed,
        imageUrl: moodImages.normal || data.images[0],
        moodImages,
        personality: personalityStr,
        ownerTitle: data.ownerTitle,
        speakingStyle: speakingStyleStr || '温柔',
        nestImageUrl: data.nestImage,
        happiness: 100,
        energy: 100,
        health: 100,
        lastInteraction: Date.now(),
        status: 'happy',
        environment: {
          templateId: 'starry',
          furniture: []
        },
        referenceImages: await createReferenceImagePreviews(data.images),
        visualTraits: analysisData ? {
          earType: analysisData.earType,
          tailType: analysisData.tailType,
          primaryColor: analysisData.primaryColor
        } : {
          primaryColor: '#a5b4fc'
        }
      };

      // Ensure we wait for the animation to finish showing all text before moving on
      await animationPromise;

      setPet(newPet);
      savePetData(newPet);
      setIsCreating(false);
      
      const greeting: ChatMessage = {
        id: '1',
        sender: 'pet',
        text: `${data.ownerTitle}，我已经在星云家园安顿好啦。这里的一切都闪闪发光的，谢谢你接我过来。`,
        timestamp: Date.now(),
      };
      setMessages([greeting]);
      setAccountStorageItem('wangxing_messages_v2', JSON.stringify([greeting]));
    } catch (error) {
      console.error("Ascension Error:", error);
      alert("创建失败：" + (error instanceof Error ? error.message : "图像生成或网络请求失败"));
    } finally {
      setIsGenerating(false);
    }
  };

  const savePetData = (updatedPet: Pet) => {
    try {
      setAccountStorageItem('wangxing_pet_v2', JSON.stringify(stripLargeReferenceImages(updatedPet)));
    } catch (e) {
      if (e instanceof DOMException && (e.code === 22 || e.code === 1014 || e.name === 'QuotaExceededError')) {
        console.warn("localStorage quota exceeded, attempting to prune reference images...");
        // Prune large data: referenceImages are usually the biggest offenders (Base64)
        const prunedPet = stripLargeReferenceImages(updatedPet, 0);
        try {
          setAccountStorageItem('wangxing_pet_v2', JSON.stringify(prunedPet));
          setPet(prunedPet);
          alert("由于存储空间限制，部分参考图片已被清理，但您的宠物信息已成功保存。");
        } catch (innerError) {
          console.error("Failed to save even after pruning:", innerError);
        }
      } else {
        console.error("Storage Error:", e);
      }
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!pet) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text,
      timestamp: Date.now(),
    };

    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setAccountStorageItem('wangxing_messages_v2', JSON.stringify(newMsgs));
    setIsTyping(true);

    const history = newMsgs.slice(-10).map(m => ({
      role: m.sender === 'user' ? 'user' as const : 'model' as const,
      parts: [{ text: m.text }]
    }));

    try {
      const responseText = await getPetResponse(
        pet.name, 
        pet.type, 
        pet.personality, 
        pet.speakingStyle || '温柔', 
        text, 
        history,
        pet.breed,
        pet.encounterDate,
        buildMemorySnippets(pet.stories)
      );
      
      const petMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'pet',
        text: responseText,
        timestamp: Date.now(),
      };

      const finalMsgs = [...newMsgs, petMsg];
      setMessages(finalMsgs);
      setAccountStorageItem('wangxing_messages_v2', JSON.stringify(finalMsgs));
    } catch (error) {
      console.error("Message Error:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleRefreshAvatar = async () => {
    if (!pet) return;
    setIsGenerating(true);
    try {
      let refinedDescription = `${pet.type}, breed: ${pet.breed || 'mixed'}, personality: ${pet.personality}`;
      if (pet.visualTraits) {
        refinedDescription += `, traits: ears ${pet.visualTraits.earType}, tail ${pet.visualTraits.tailType}, color ${pet.visualTraits.primaryColor}`;
      }

      const moodImages = await generateAllPetMoods(
        refinedDescription,
        pet.breed,
        undefined,
      );
      const newImageUrl = moodImages.normal;
      
      const updatedPet = {
        ...pet,
        imageUrl: newImageUrl,
        moodImages: moodImages
      };
      
      setPet(updatedPet);
      savePetData(updatedPet);
      alert("形象已根据最新设定刷新！");
    } catch (e) {
      console.error(e);
      alert("刷新形象失败，请检查网络或稍后再试。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInteract = (type: 'pat' | 'poke' | 'feed') => {
    if (!pet) return;
    
    // Low energy blocks pat/poke, but feeding is always allowed if not full?
    if ((type === 'pat' || type === 'poke') && pet.energy < 5) return;

    let newHappiness = pet.happiness;
    let newEnergy = pet.energy;

    if (type === 'pat') {
      newHappiness = Math.min(100, pet.happiness + 5);
      newEnergy = Math.max(0, pet.energy - 2);
    } else if (type === 'poke') {
      newHappiness = Math.min(100, pet.happiness + 2);
      newEnergy = Math.max(0, pet.energy - 5);
    } else if (type === 'feed') {
      newHappiness = Math.min(100, pet.happiness + 10);
      newEnergy = Math.min(100, pet.energy + 20);
    }
    
    const updatedPet = { 
      ...pet, 
      happiness: newHappiness, 
      energy: newEnergy,
      lastInteraction: Date.now(),
      status: newEnergy < 20 ? 'tired' as const : 'happy' as const
    };
    
    setPet(updatedPet);
    savePetData(updatedPet);
  };

  const updateEnvironment = (templateId: Environment['templateId']) => {
    if (!pet) return;
    const updatedPet = {
      ...pet,
      environment: { ...pet.environment, templateId }
    };
    setPet(updatedPet);
    savePetData(updatedPet);
  };

  const handleResetChat = () => {
    setMessages([]);
    removeAccountStorageItem('wangxing_messages_v2');
  };

  const [isInventoryOpen, setIsInventoryOpen] = useState(false);

  const placeFurniture = (itemId: string) => {
    if (!pet || !userProfile) return;
    
    // Find item details from Shop's items list (or move items list to constants)
    // For now, let's assume we have access to the items list or just use the ID
    const newFurniture = {
      id: Date.now().toString(),
      itemId: itemId,
      x: 20 + Math.random() * 60,
      y: 20 + Math.random() * 60
    };

    const updatedPet = {
      ...pet,
      environment: {
        ...pet.environment,
        furniture: [...pet.environment.furniture, newFurniture]
      }
    };

    setPet(updatedPet);
    savePetData(updatedPet);
    setIsInventoryOpen(false);
  };

  const handleUpdatePet = async (updatedData?: { name: string; type: string; breed?: string; encounterDate?: string; images: string[]; stories: Story[]; ownerTitle: string; personality: string; speakingStyle: string }) => {
    if (!pet) return;
    setIsGenerating(true);
    
    // Use the passed data (from Memories)
    const data = updatedData!;
    
    try {
      let refinedDescription = `${data.type}, ${data.personality}`;
      if (data.breed) refinedDescription = `${data.breed}, ${refinedDescription}`;

      let analysisData = null;
      let newAvatarUrl = pet.imageUrl;
      let newMoodImages = pet.moodImages;
      let newVisualTraits = pet.visualTraits;

      // Only re-analyze and re-generate if new images are provided OR personality/type/breed changed
      if (
        data.images.length > 0 ||
        data.personality !== pet.personality ||
        data.type !== pet.type ||
        data.breed !== pet.breed
      ) {
        analysisData = await analyzePetImages(data.images);
        if (analysisData) {
          refinedDescription = `${analysisData.breed || data.breed || data.type}, coat colors: ${analysisData.primaryColor} and ${analysisData.secondaryColor || ''}, patterns: ${analysisData.patterns}, ears: ${analysisData.earType}, tail: ${analysisData.tailType}, unique features: ${analysisData.uniqueFeatures}, colors to use: ${analysisData.colorPalette?.join(', ') || ''}, character: ${data.personality}`;
          newVisualTraits = {
            earType: analysisData.earType,
            tailType: analysisData.tailType,
            primaryColor: analysisData.primaryColor
          };
        }
        const moodImages = await generateAllPetMoods(
          refinedDescription,
          data.breed,
          data.images,
        );
        newMoodImages = moodImages;
        if (moodImages.normal) newAvatarUrl = moodImages.normal;
      }

      const updatedPet: Pet = {
        ...pet,
        name: data.name,
        type: data.type,
        breed: data.breed,
        encounterDate: data.encounterDate,
        personality: data.personality,
        ownerTitle: data.ownerTitle,
        speakingStyle: data.speakingStyle,
        imageUrl: newAvatarUrl,
        moodImages: newMoodImages,
        customTextureUrl: newAvatarUrl,
        referenceImages: data.images.length > 0
          ? await createReferenceImagePreviews(data.images)
          : pet.referenceImages,
        stories: data.stories,
        visualTraits: newVisualTraits
      };

      setPet(updatedPet);
      savePetData(updatedPet);
    } catch (error) {
      console.error("Update Error:", error);
      alert("更新失败: " + (error instanceof Error ? error.message : "存储空间不足或网络错误"));
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-sepia-50 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-sepia-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (isCreating) {
    if (!isBackendLoggedIn) {
      return (
        <div className="min-h-screen bg-[#050510] flex items-center justify-center px-6 relative overflow-hidden">
          <Starfield count={80} />
          <div className="relative z-10 w-full max-w-sm bg-white rounded-[2rem] p-7 shadow-2xl border border-white/30">
            <div className="w-14 h-14 rounded-2xl bg-sepia-900 text-white flex items-center justify-center mb-5 shadow-lg">
              <User size={26} />
            </div>
            <h1 className="text-2xl font-serif font-bold text-sepia-900">先登录账号</h1>
            <p className="mt-2 text-sm leading-relaxed text-sepia-500">
              宠物资料、AI 配置和上传图片都会绑定到当前账号。退出后不会继续使用这个账号的数据。
            </p>
            <div className="mt-6 space-y-3">
              <input
                value={loginName}
                onChange={(event) => setLoginName(event.target.value)}
                placeholder="输入体验昵称"
                className="w-full bg-sepia-50 border border-sepia-100 rounded-2xl px-4 py-4 text-[14px] focus:outline-none focus:ring-2 focus:ring-sepia-200 text-sepia-800"
              />
              <button
                onClick={handleLoginBeforeCreate}
                disabled={isLoggingIn}
                className="w-full bg-sepia-900 text-white py-4 rounded-2xl font-bold shadow-xl hover:bg-sepia-800 transition-all disabled:opacity-60"
              >
                {isLoggingIn ? "登录中..." : "登录并开始创建"}
              </button>
              {loginError && <p className="text-xs text-red-500 text-center">{loginError}</p>}
            </div>
          </div>
        </div>
      );
    }
    return <AscensionCeremony onComplete={handleAscensionComplete} isGenerating={isGenerating} />;
  }

  return (
    <div 
      className="min-h-screen flex flex-col max-w-md mx-auto relative shadow-2xl overflow-hidden font-sans bg-[#050510]"
      style={{
        backgroundImage: `url('https://images.unsplash.com/photo-1518066000714-58c45f1a2c0a?q=80&w=1080&auto=format&fit=crop')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Removed the dark overlay to make background sharper */}
      <Starfield count={80} />
      
      {/* Global Return Button when not on main screen */}
      <AnimatePresence>
        {activeTab !== 'home' && (
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onClick={() => setActiveTab('home')}
            className="absolute top-10 left-5 z-[60] p-2 bg-black/20 backdrop-blur-md rounded-full text-white/80 shadow-md hover:bg-black/40 hover:text-white transition-all focus:outline-none"
          >
            <ArrowLeft size={18} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="flex-1 w-full relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col pt-12"
            >
              {/* Left Side Buttons Overlay */}
              <div className="absolute top-10 left-4 flex flex-col items-center gap-5 z-20 pointer-events-auto">
                <div className="flex flex-col items-center mb-4">
                  <span className="text-white/80 font-bold text-sm tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">星云纪年</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-white font-bold text-3xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">31</span>
                    <span className="text-white font-bold text-sm drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">岁啦</span>
                  </div>
                </div>

                <div className="space-y-4 flex flex-col items-center">
                  <button onClick={() => setActiveTab('mail')} className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
                    <Mail size={22} className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                    <span className="text-[10px] text-white font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">系统邮件</span>
                  </button>
                  <button onClick={() => setActiveTab('basic_info')} className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
                    <User size={22} className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
                    <span className="text-[10px] text-white font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">基础设定</span>
                  </button>
                  <button onClick={() => setActiveTab('shop')} className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
                    <Gift size={22} className="text-yellow-200 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)]" />
                    <span className="text-[10px] text-white font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">充值通道</span>
                  </button>
                </div>
              </div>

              {/* Top Right Coins & Settings Display */}
              <div className="absolute top-4 right-4 z-40 pointer-events-auto flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/20 shadow-md">
                  <Coins size={14} className="text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]" />
                  <span className="text-white font-bold text-sm tracking-widest">{userProfile?.coins || 0}</span>
                </div>
                <button 
                  onClick={() => setIsSettingsOpen(true)}
                  className="p-2 bg-black/40 backdrop-blur-md rounded-full border border-white/20 shadow-md text-gray-300 hover:text-white transition-colors"
                >
                  <Settings size={18} />
                </button>
              </div>

              {pet && (
                <div className="relative w-full h-full flex flex-col pointer-events-none">
                  {/* Central Pet layer (highest z-index for visibility, pushed up) */}
                  <div className="absolute top-[8%] left-0 w-full flex items-center justify-center pointer-events-none h-[40%]">
                    <PetDisplay 
                      pet={pet} 
                      onInteract={handleInteract} 
                      userProfile={userProfile}
                      onUpdateProfile={(profile) => {
                        setUserProfile(profile);
                        setAccountStorageItem('wangxing_profile_v2', JSON.stringify(profile));
                      }}
                      onRefreshAvatar={handleRefreshAvatar}
                      isGenerating={isGenerating}
                    />
                  </div>

                  {/* Lower Chat Layer (From middle to bottom-80px) */}
                  <div className="absolute top-[50%] bottom-[88px] left-0 w-full pointer-events-auto z-20 flex justify-center">
                    <div className="w-[340px] max-w-full h-full pb-4">
                      <Chat 
                        pet={pet} 
                        messages={messages} 
                        onSendMessage={handleSendMessage} 
                        isTyping={isTyping}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom Nav Overlays */}
              <div className="absolute bottom-6 left-0 w-full px-6 flex justify-between items-end z-30 pointer-events-auto">
                <div className="flex gap-4">
                  <button 
                    onClick={() => setActiveTab('whisper')}
                    className="flex flex-col items-center gap-1 group"
                  >
                    <div className="w-12 h-12 rounded-full bg-[#1A1C29]/80 border border-indigo-500/30 flex items-center justify-center text-indigo-300 shadow-lg group-hover:scale-110 transition-transform">
                      <Feather size={20} />
                    </div>
                    <span className="text-white font-bold text-sm tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">耳语</span>
                  </button>

                  <button 
                    onClick={() => setActiveTab('memories')}
                    className="flex flex-col items-center gap-1 group"
                  >
                    <div className="w-12 h-12 rounded-full bg-[#1A1C29]/80 border border-blue-500/30 flex items-center justify-center text-blue-300 shadow-lg group-hover:scale-110 transition-transform">
                      <Crosshair size={20} />
                    </div>
                    <span className="text-white font-bold text-sm tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">记忆</span>
                  </button>

                  <button 
                    onClick={() => setActiveTab('friends')}
                    className="flex flex-col items-center gap-1 group"
                  >
                    <div className="w-12 h-12 rounded-full bg-[#1A1C29]/80 border border-purple-500/30 flex items-center justify-center text-purple-300 shadow-lg group-hover:scale-110 transition-transform">
                      <Users size={20} />
                    </div>
                    <span className="text-white font-bold text-sm tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">朋友</span>
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  <button 
                    onClick={() => setActiveTab('nebula')}
                    className="flex flex-col items-center gap-1 group"
                  >
                    <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/40 flex items-center justify-center text-white shadow-[0_0_20px_rgba(255,255,255,0.2)] group-hover:bg-white/20 transition-all">
                      <Command size={28} />
                    </div>
                    <span className="text-white font-bold text-sm tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">星云之门</span>
                  </button>
                </div>
              </div>

            </motion.div>
          )}

          {activeTab === 'nebula' && (
            <motion.div 
              key="nebula"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-0 bg-[#050510]"
            >
              {pet && <Community myPet={pet} />}
            </motion.div>
          )}

          {activeTab === 'friends' && (
            <motion.div 
              key="friends"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-0 z-0"
            >
              <Friends />
            </motion.div>
          )}

          {activeTab === 'mail' && (
            <motion.div 
              key="mail"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 z-0"
            >
              <SystemMail />
            </motion.div>
          )}

          {activeTab === 'shop' && (
            <motion.div 
              key="shop"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 z-0"
            >
              <Shop 
                userProfile={userProfile}
                onUpdateProfile={(profile) => {
                  if (setUserProfile) {
                    setUserProfile(profile);
                    setAccountStorageItem('wangxing_profile_v2', JSON.stringify(profile));
                  }
                }}
              />
            </motion.div>
          )}

          {activeTab === 'basic_info' && (
            <motion.div 
              key="basic_info"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute inset-0 z-0"
            >
              {pet && (
                <BasicInfo 
                  pet={pet} 
                  isGenerating={isGenerating} 
                  onUpdatePet={handleUpdatePet} 
                />
              )}
            </motion.div>
          )}

          {activeTab === 'whisper' && (
            <motion.div 
              key="whisper"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute inset-0 z-0 bg-transparent"
            >
              {pet && (
                <Whisper 
                  petId={pet.id}
                  ownerTitle={pet.ownerTitle} 
                  petName={pet.name} 
                  petType={pet.type}
                  personality={pet.personality}
                  speakingStyle={pet.speakingStyle}
                  stories={pet.stories}
                />
              )}
            </motion.div>
          )}

          {activeTab === 'memories' && (
            <motion.div 
              key="memories"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="h-full bg-white pt-20 pb-0 overflow-y-auto"
            >
              {pet && (
                <Memories 
                  pet={pet} 
                  isGenerating={isGenerating} 
                  onUpdatePet={handleUpdatePet} 
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* API Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setIsSettingsOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-[3rem] p-8 shadow-2xl flex flex-col gap-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-serif font-bold text-sepia-600">系统控制</h3>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 bg-sepia-50 rounded-full text-sepia-300"
                >
                  <Plus size={20} className="rotate-45" />
                </button>
              </div>

              <div className="overflow-y-auto max-h-[60vh] px-1 no-scrollbar">
                <AiSettings
                  onClose={() => setIsSettingsOpen(false)}
                  onResetChat={handleResetChat}
                  onAccountChanged={reloadAccountData}
                />
              </div>

              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="w-full bg-sepia-500 text-white py-4 rounded-2xl font-bold shadow-xl hover:bg-sepia-600 transition-all"
              >
                关闭控制台
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function stripLargeReferenceImages(pet: Pet, maxPreviewCount = 4): Pet {
  const safeReferenceImages = (pet.referenceImages || [])
    .filter((image) => typeof image === 'string' && image.length < 180_000)
    .slice(0, maxPreviewCount);
  return {
    ...pet,
    referenceImages: safeReferenceImages,
  };
}

async function createReferenceImagePreviews(images: string[]): Promise<string[]> {
  const previews = await Promise.all(images.slice(0, 4).map((image) => createImagePreview(image)));
  return previews.filter(Boolean);
}

async function createImagePreview(imageDataUrl: string): Promise<string> {
  if (!imageDataUrl.startsWith('data:image/')) return '';
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const maxSize = 160;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        resolve('');
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.65));
    };
    image.onerror = () => resolve('');
    image.src = imageDataUrl;
  });
}
