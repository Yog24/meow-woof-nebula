import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, MessageCircle, Share2, Send, Check, RefreshCw, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';
import { Starfield } from './Starfield';
import {
  createWhisperComment,
  getTodayWhispers,
  listWhisperComments,
  SocialWhisper,
  toggleWhisperLike,
  WhisperComment,
} from '../services/backendClient';
import { buildMemorySnippets } from '../services/nebulaRules';
import { Story } from '../types';

type WhisperWithComments = SocialWhisper & { comments?: WhisperComment[] };

interface WhisperProps {
  petId: string;
  ownerTitle: string;
  petName: string;
  petType?: string; // Added to support generation
  personality?: string;
  speakingStyle?: string;
  stories?: Story[];
}

export function Whisper({
  petId,
  ownerTitle,
  petName,
  petType = '小狗',
  personality = '活泼',
  speakingStyle,
  stories,
}: WhisperProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [whispers, setWhispers] = useState<WhisperWithComments[]>([]);
  const [loadError, setLoadError] = useState('');
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [showShareToast, setShowShareToast] = useState(false);

  const loadTodayWhispers = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const result = await getTodayWhispers({
        petId,
        petName,
        petType,
        personality,
        ownerTitle,
        speakingStyle,
        memories: buildMemorySnippets(stories),
      });
      setWhispers(result.whispers);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '耳语加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTodayWhispers();
  }, [petId]);

  const handleLike = async (id: string) => {
    const previous = whispers;
    setWhispers(prev => prev.map(w => {
      if (w.id !== id) return w;
      return {
        ...w,
        likedByMe: !w.likedByMe,
        likeCount: w.likedByMe ? Math.max(0, w.likeCount - 1) : w.likeCount + 1,
      };
    }));
    try {
      const result = await toggleWhisperLike(id);
      setWhispers(prev => prev.map(w => (
        w.id === id ? { ...w, likedByMe: result.liked, likeCount: result.likeCount } : w
      )));
    } catch (error) {
      setWhispers(previous);
      setLoadError(error instanceof Error ? error.message : '点赞失败');
    }
  };

  const handleShare = (w: WhisperWithComments) => {
    // Try to use native share if available
    if (navigator.share) {
      navigator.share({
        title: '遥远太空的信号',
        text: w.text,
        url: window.location.href,
      }).catch(err => {
        if (err.name !== 'AbortError' && !err.message?.includes('canceled')) {
          console.error(err);
        }
      });
    } else {
      // Fallback: Copy to clipboard and show toast
      navigator.clipboard.writeText(`${w.text}\n\n遥远太空的信号 - ${formatWhisperDate(w)}`).then(() => {
        setShowShareToast(true);
        setTimeout(() => setShowShareToast(false), 2000);
      });
    }
  };

  const handleToggleComments = async (id: string) => {
    const nextActiveId = activeCommentId === id ? null : id;
    setActiveCommentId(nextActiveId);
    if (!nextActiveId) return;

    const target = whispers.find(w => w.id === id);
    if (target?.comments) return;
    try {
      const comments = await listWhisperComments(id);
      setWhispers(prev => prev.map(w => (w.id === id ? { ...w, comments } : w)));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '评论加载失败');
    }
  };

  const handleAddComment = async (id: string) => {
    if (!commentText.trim()) return;
    const text = commentText.trim();
    setCommentText('');
    try {
      const comment = await createWhisperComment(id, text);
      setWhispers(prev => prev.map(w => (
        w.id === id
          ? {
              ...w,
              comments: [...(w.comments || []), comment],
              commentCount: w.commentCount + 1,
            }
          : w
      )));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '评论发送失败');
    }
  };

  return (
    <div className="h-full flex flex-col pb-24 overflow-y-auto no-scrollbar relative w-full overflow-x-hidden bg-transparent">
      <Starfield count={50} />
      
      <div className="sticky top-0 left-0 right-0 pt-10 pb-6 pl-14 z-40 flex items-center pointer-events-none mb-4">
        <h2 className="text-xl font-serif font-bold text-white drop-shadow-md pointer-events-auto">耳语</h2>
      </div>

      <div className="max-w-[340px] mx-auto w-full px-4 flex flex-col gap-6 relative z-10">
        <header className="flex justify-between items-end mb-4 relative z-10">
          <div className="flex-1">
            <p className="text-white/60 font-medium text-sm">遥远太空的信号</p>
          </div>
          <div className="flex flex-col items-end gap-3 translate-y-2">
            <button 
              onClick={loadTodayWhispers}
              disabled={isLoading}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full border border-white/20 text-white transition-all shadow-xl active:scale-95 disabled:opacity-50 group",
                isLoading && "bg-white/5"
              )}
            >
              {isLoading ? (
                <RefreshCw size={16} className="animate-spin text-blue-300" />
              ) : (
                <RefreshCw size={16} className="text-amber-300 group-hover:rotate-12 transition-transform" />
              )}
              <span className="text-[13px] font-bold tracking-wider">同步今日信号</span>
            </button>
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-[0.2em]">{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </header>

        {loadError && (
          <div className="bg-rose-500/10 border border-rose-400/30 text-rose-100 text-xs rounded-2xl px-4 py-3">
            {loadError}
          </div>
        )}

        <div className="space-y-10 relative z-10">
          {whispers.map((w, idx) => (
          <motion.div 
            key={w.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="group"
          >
            <div className="bg-[#11131A]/80 backdrop-blur-xl rounded-[3rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/10">
              <div className="relative aspect-[3/2] overflow-hidden">
                <img 
                  src={w.imageUrl || `https://picsum.photos/seed/${encodeURIComponent(w.id)}/600/400`}
                  alt="whisper" 
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-90" 
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#11131A] via-transparent to-transparent opacity-100" />
                <div className="absolute top-6 left-6 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
                  <p className="text-[10px] text-white/80 font-bold tracking-widest uppercase shadow-sm">{formatWhisperDate(w)}</p>
                </div>
              </div>
              
              <div className="p-8 space-y-6 relative z-10 w-full mt-[-20px] bg-transparent">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full border border-white/10 text-[10px] text-blue-100 font-bold">
                  <MapPin size={12} />
                  {w.locationName || '喵汪星'}
                </div>
                <p className="text-lg text-white/90 font-medium leading-relaxed font-serif drop-shadow-sm">
                  {w.text}
                </p>
                
                <div className="flex items-center justify-between pt-4 border-t border-white/10">
                  <div className="flex gap-6">
                    <button 
                      onClick={() => handleLike(w.id)}
                      className={cn(
                        "flex items-center gap-2 transition-all duration-300 active:scale-125",
                        w.likedByMe ? "text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.5)]" : "text-white/40 hover:text-rose-300"
                      )}
                    >
                      <motion.div
                        animate={w.likedByMe ? { scale: [1, 1.4, 1] } : {}}
                      >
                        <Heart size={20} fill={w.likedByMe ? "currentColor" : "none"} />
                      </motion.div>
                      <span className="text-xs font-bold font-mono">{w.likeCount}</span>
                    </button>
                    <button 
                      onClick={() => handleToggleComments(w.id)}
                      className={cn(
                        "flex items-center gap-2 transition-colors",
                        activeCommentId === w.id ? "text-blue-300" : "text-white/40 hover:text-blue-200"
                      )}
                    >
                      <MessageCircle size={20} />
                      <span className="text-xs font-bold font-mono text-white/50">{w.commentCount}</span>
                    </button>
                  </div>
                  <button 
                    onClick={() => handleShare(w)}
                    className="p-2 text-white/40 hover:text-white transition-colors active:scale-110"
                  >
                    <Share2 size={20} />
                  </button>
                </div>

                <AnimatePresence>
                  {activeCommentId === w.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-4 space-y-4">
                        {(w.comments || []).map(c => (
                          <div key={c.id} className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{c.author?.nickName || '看星的人'}</span>
                              <span className="text-[8px] text-white/30">{formatRelativeTime(c.createdAt)}</span>
                            </div>
                            <p className="text-sm text-white bg-white/5 p-3 rounded-2xl rounded-tl-none border border-white/5">
                              {c.text}
                            </p>
                          </div>
                        ))}
                        <div className="relative flex items-center gap-2 bg-black/60 rounded-full px-4 py-2 border border-white/10">
                          <input 
                            type="text"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddComment(w.id)}
                            placeholder="给远方的它留个言吧..."
                            className="bg-transparent border-none outline-none focus:ring-0 text-sm text-white placeholder:text-white/30 flex-1 py-1"
                          />
                          <button 
                            onClick={() => handleAddComment(w.id)}
                            className="p-1.5 bg-blue-500/80 text-white rounded-full hover:bg-blue-500 transition-colors shadow-lg"
                          >
                            <Send size={14} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="py-12 text-center relative z-10">
        <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.3em] font-serif shadow-sm">- 所有的陪伴 都有回音 -</p>
      </div>
      </div>

      <AnimatePresence>
        {showShareToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-black/80 backdrop-blur-xl text-white rounded-full flex items-center gap-3 shadow-[0_0_20px_rgba(59,130,246,0.3)] border border-blue-500/30"
          >
            <div className="bg-blue-500 rounded-full p-1 shadow-inner">
              <Check size={14} />
            </div>
            <span className="text-sm font-medium tracking-wide">复制成功 · 已生成分享卡片</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatWhisperDate(whisper: WhisperWithComments) {
  const date = whisper.dateKey || whisper.createdAt.slice(0, 10);
  return `${date.replace(/-/g, '.')} ${whisper.timeLabel || ''}`.trim();
}

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return '刚刚';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return new Date(value).toLocaleDateString('zh-CN');
}
