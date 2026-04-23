import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Users, MessageSquare, ArrowLeft, Send, Search, UserPlus, Check, X, RefreshCw } from 'lucide-react';
import {
  FriendRequest,
  listBackendFriendRequests,
  listBackendFriends,
  PublicUserProfile,
  respondBackendFriendRequest,
  searchBackendUsers,
  sendBackendFriendRequest,
} from '../services/backendClient';

export function Friends() {
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistories, setChatHistories] = useState<Record<string, {sender: 'me', text: string, time: string}[]>>({});
  const [friends, setFriends] = useState<PublicUserProfile[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<PublicUserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('');

  const loadSocialData = async () => {
    setIsLoading(true);
    setStatusText('');
    try {
      const [nextFriends, requests] = await Promise.all([
        listBackendFriends(),
        listBackendFriendRequests(),
      ]);
      setFriends(nextFriends);
      setIncoming(requests.incoming);
      setOutgoing(requests.outgoing);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '好友数据加载失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSocialData();
  }, []);

  const handleSearch = async () => {
    setIsLoading(true);
    setStatusText('');
    try {
      setSearchResults(await searchBackendUsers(searchText));
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '搜索失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendRequest = async (targetUserId: string) => {
    try {
      await sendBackendFriendRequest(targetUserId);
      setStatusText('好友请求已发出');
      await Promise.all([loadSocialData(), handleSearch()]);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '好友请求发送失败');
    }
  };

  const handleRespond = async (requestId: string, action: 'accept' | 'reject') => {
    try {
      await respondBackendFriendRequest(requestId, action);
      setStatusText(action === 'accept' ? '已成为看星伙伴' : '已拒绝请求');
      await loadSocialData();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : '处理请求失败');
    }
  };
  
  const activeFriend = friends.find(friend => friend.id === activeChat);

  const handleSendFriendMessage = () => {
    if (!chatMessage.trim() || !activeChat) return;
    setChatHistories(prev => ({
      ...prev,
      [activeChat]: [
        ...(prev[activeChat] || []),
        { sender: 'me', text: chatMessage.trim(), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      ]
    }));
    setChatMessage('');
  };

  return (
    <div className="h-full bg-transparent pt-0 pb-0 overflow-y-auto px-6 relative flex flex-col">
      <div className="sticky top-0 left-0 right-0 pt-10 pb-6 pl-14 z-40 flex items-center justify-between pointer-events-none">
        <h2 className="text-xl font-serif font-bold text-white flex items-center gap-3 drop-shadow-md pointer-events-auto">
          <Users size={24} className="text-white" /> 看星的人
        </h2>
        <button
          onClick={loadSocialData}
          disabled={isLoading}
          className="pointer-events-auto p-2 bg-white/10 border border-white/20 rounded-full text-white/70 disabled:opacity-50"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="space-y-5 flex-1 pb-24">
        {!activeChat ? (
          <>
            <div className="bg-white/10 backdrop-blur-md rounded-[2rem] p-4 border border-white/20 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-black/20 rounded-full px-4 border border-white/10">
                  <Search size={14} className="text-white/40" />
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
                    placeholder="搜索昵称，加一个看星伙伴"
                    className="flex-1 bg-transparent py-2.5 text-xs text-white outline-none placeholder:text-white/40"
                  />
                </div>
                <button onClick={handleSearch} className="px-4 py-2.5 rounded-full bg-indigo-500/80 text-white text-xs font-bold">
                  搜索
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map(user => (
                    <UserRow
                      key={user.id}
                      user={user}
                      right={
                        <button
                          onClick={() => handleSendRequest(user.id)}
                          disabled={user.isFriend || user.hasPendingRequest}
                          className="p-2 bg-white/10 rounded-full text-white/70 disabled:opacity-40"
                        >
                          {user.isFriend ? <Check size={15} /> : <UserPlus size={15} />}
                        </button>
                      }
                      subtitle={user.isFriend ? '已经是看星伙伴' : user.hasPendingRequest ? '请求处理中' : '可以发送好友请求'}
                    />
                  ))}
                </div>
              )}
            </div>

            {incoming.some(request => request.status === 'pending') && (
              <section className="space-y-3">
                <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2">收到的请求</p>
                {incoming.filter(request => request.status === 'pending').map(request => (
                  <UserRow
                    key={request.id}
                    user={request.fromUser || { id: request.fromUserId, nickName: '看星的人' }}
                    subtitle="想和你成为看星伙伴"
                    right={
                      <div className="flex gap-2">
                        <button onClick={() => handleRespond(request.id, 'accept')} className="p-2 bg-emerald-500/80 rounded-full text-white">
                          <Check size={15} />
                        </button>
                        <button onClick={() => handleRespond(request.id, 'reject')} className="p-2 bg-white/10 rounded-full text-white/70">
                          <X size={15} />
                        </button>
                      </div>
                    }
                  />
                ))}
              </section>
            )}

            <section className="space-y-3">
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest px-2">我的看星伙伴</p>
              {friends.map(friend => (
                <UserRow
                  key={friend.id}
                  user={friend}
                  subtitle="已经连接到你的星云宇宙"
                  onClick={() => setActiveChat(friend.id)}
                  right={
                    <div className="p-3 bg-white/10 rounded-full text-white/70">
                      <MessageSquare size={16} />
                    </div>
                  }
                />
              ))}
              {friends.length === 0 && (
                <div className="p-6 bg-white/5 border border-white/10 rounded-[2rem] text-center">
                  <p className="text-xs text-white/50">还没有真实好友。搜索另一个登录昵称，发送好友请求后会出现在这里。</p>
                </div>
              )}
            </section>

            {outgoing.some(request => request.status === 'pending') && (
              <section className="space-y-2">
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-2">等待回应</p>
                {outgoing.filter(request => request.status === 'pending').map(request => (
                  <UserRow
                    key={request.id}
                    user={request.toUser || { id: request.toUserId, nickName: '看星的人' }}
                    subtitle="好友请求等待对方回应"
                  />
                ))}
              </section>
            )}

            {statusText && <p className="text-xs text-center text-white/50">{statusText}</p>}
          </>
        ) : (
          <div className="bg-white/10 backdrop-blur-md h-[60vh] rounded-[2rem] border border-white/20 shadow-lg flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center gap-3 bg-black/10">
              <button onClick={() => setActiveChat(null)} className="p-2 -ml-2 text-white/60 hover:text-white transition-colors">
                <ArrowLeft size={20} />
              </button>
              <Avatar user={activeFriend} />
              <p className="font-bold text-sm text-white drop-shadow-md">
                 {activeFriend?.nickName || '看星的人'}
              </p>
            </div>
            <div className="flex-1 p-4 bg-transparent overflow-y-auto space-y-4">
              <div className="text-center text-[10px] text-white/40 my-4 uppercase tracking-widest font-bold">你们成为了看星伙伴</div>
              {(chatHistories[activeChat] || []).map((msg, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex justify-end"
                >
                  <div className="bg-indigo-500/80 backdrop-blur-sm text-white px-4 py-2 rounded-2xl rounded-tr-none text-sm max-w-[80%] shadow-md border border-indigo-400/30 relative">
                    {msg.text}
                    <span className="absolute -bottom-4 right-1 text-[8px] text-white/40">{msg.time}</span>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="p-3 bg-black/20 border-t border-white/10 flex items-center gap-2">
              <input 
                type="text" 
                placeholder="发送消息..." 
                className="flex-1 bg-white/10 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 border border-white/10 text-white placeholder:text-white/40"
                value={chatMessage}
                onChange={e => setChatMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendFriendMessage()}
              />
              <button 
                onClick={handleSendFriendMessage}
                className="p-2 w-9 h-9 flex items-center justify-center bg-indigo-500/80 text-white rounded-full shadow-md hover:bg-indigo-400 transition-colors border border-indigo-400/50"
              >
                <Send size={14} className="translate-x-[1px]" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UserRow(props: {
  user: PublicUserProfile;
  subtitle?: string;
  right?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className="bg-white/10 backdrop-blur-md rounded-[2rem] p-4 border border-white/20 shadow-sm flex items-center justify-between hover:bg-white/20 transition-colors cursor-pointer"
      onClick={props.onClick}
    >
      <div className="flex items-center gap-4 min-w-0">
        <Avatar user={props.user} />
        <div className="min-w-0">
          <p className="font-bold text-sm text-white truncate">{props.user.nickName}</p>
          {props.subtitle && <p className="text-[10px] text-white/50 mt-1 truncate">{props.subtitle}</p>}
        </div>
      </div>
      {props.right}
    </div>
  );
}

function Avatar({ user }: { user?: PublicUserProfile }) {
  const src = user?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user?.nickName || 'star')}&backgroundColor=b6e3f4`;
  return <img src={src} alt="avatar" className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 shrink-0" />;
}
