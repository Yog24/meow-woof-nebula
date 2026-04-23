import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cpu, Terminal, RefreshCw, Info, CheckCircle2, Key, Save, Eye, EyeOff, Link, Settings as SettingsIcon, Database, UserRound, LogOut } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { BackendUser, getBackendCurrentUser, loginWithDisplayName, logoutBackend } from '@/src/services/backendClient';
import {
  getAccountStorageItem,
  migrateLegacyAccountStorage,
  removeAccountStorageItem,
  setAccountStorageItem,
} from '@/src/services/accountStorage';

interface AiSettingsProps {
  onClose: () => void;
  onResetChat: () => void;
  onAccountChanged?: () => void;
}

export function AiSettings({ onClose, onResetChat, onAccountChanged }: AiSettingsProps) {
  const [activeTab, setActiveTab] = useState<'account' | 'api' | 'data'>('account');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [apiKey, setApiKey] = useState(() => getAccountStorageItem('wangxing_user_api_key') || '');
  const [baseUrl, setBaseUrl] = useState(() => getAccountStorageItem('wangxing_user_base_url') || '');
  const [backendUrl, setBackendUrl] = useState(() => localStorage.getItem('wangxing_backend_url') || 'http://127.0.0.1:3100');
  const [showKey, setShowKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [textModel, setTextModel] = useState(() => getAccountStorageItem('wangxing_text_model') || '');
  const [imageModel, setImageModel] = useState(() => getAccountStorageItem('wangxing_image_model') || '');
  const [loginName, setLoginName] = useState(() => localStorage.getItem('wangxing_login_name') || '喵汪星旅人');
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null);
  const [authMessage, setAuthMessage] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  useEffect(() => {
    const savedKey = getAccountStorageItem('wangxing_user_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }

    const savedBaseUrl = getAccountStorageItem('wangxing_user_base_url');
    if (savedBaseUrl) {
      setBaseUrl(savedBaseUrl);
    }

    const savedBackendUrl = localStorage.getItem('wangxing_backend_url');
    if (savedBackendUrl) {
      setBackendUrl(savedBackendUrl);
    }

    const savedTextModel = getAccountStorageItem('wangxing_text_model');
    if (savedTextModel) {
      setTextModel(savedTextModel);
    }

    const savedImageModel = getAccountStorageItem('wangxing_image_model');
    if (savedImageModel) {
      setImageModel(savedImageModel);
    }

    void refreshBackendUser();
  }, []);

  const loadAccountScopedAiSettings = () => {
    setApiKey(getAccountStorageItem('wangxing_user_api_key') || '');
    setBaseUrl(getAccountStorageItem('wangxing_user_base_url') || '');
    setTextModel(getAccountStorageItem('wangxing_text_model') || '');
    setImageModel(getAccountStorageItem('wangxing_image_model') || '');
  };

  const handleReset = () => {
    onResetChat();
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 2000);
  };

  const handleSaveSettings = () => {
    const cleanedKey = apiKey.trim().replace(/[^\x00-\x7F]/g, "");
    if (cleanedKey) {
      setAccountStorageItem('wangxing_user_api_key', cleanedKey);
      setApiKey(cleanedKey);
    } else {
      removeAccountStorageItem('wangxing_user_api_key');
      setApiKey('');
    }

    const trimmedBaseUrl = normalizeBaseUrl(baseUrl);
    if (trimmedBaseUrl) {
      setAccountStorageItem('wangxing_user_base_url', trimmedBaseUrl);
      setBaseUrl(trimmedBaseUrl);
    } else {
      removeAccountStorageItem('wangxing_user_base_url');
      setBaseUrl('');
    }

    const trimmedBackendUrl = backendUrl.trim();
    if (trimmedBackendUrl) {
      localStorage.setItem('wangxing_backend_url', trimmedBackendUrl);
      setBackendUrl(trimmedBackendUrl);
    } else {
      localStorage.removeItem('wangxing_backend_url');
      setBackendUrl('http://127.0.0.1:3100');
    }
    
    const trimmedTextModel = textModel.trim();
    if (trimmedTextModel) {
      setAccountStorageItem('wangxing_text_model', trimmedTextModel);
      setTextModel(trimmedTextModel);
    } else {
      removeAccountStorageItem('wangxing_text_model');
      setTextModel('');
    }

    const trimmedImageModel = imageModel.trim();
    if (trimmedImageModel) {
      setAccountStorageItem('wangxing_image_model', trimmedImageModel);
      setImageModel(trimmedImageModel);
    } else {
      removeAccountStorageItem('wangxing_image_model');
      setImageModel('');
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const refreshBackendUser = async () => {
    try {
      const user = await getBackendCurrentUser();
      setBackendUser(user);
      if (user) {
        migrateLegacyAccountStorage(user.id);
        loadAccountScopedAiSettings();
      }
      setAuthMessage(user ? '已恢复登录态' : '当前未登录');
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : '获取登录态失败');
    }
  };

  const handleLogin = async () => {
    setIsAuthLoading(true);
    setAuthMessage('');
    try {
      const result = await loginWithDisplayName(loginName);
      setBackendUser(result.user);
      migrateLegacyAccountStorage(result.user.id);
      loadAccountScopedAiSettings();
      localStorage.setItem('wangxing_login_name', result.user.nickName);
      setAuthMessage('登录成功，后端会话已写入 SQLite');
      onAccountChanged?.();
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : '登录失败');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    setIsAuthLoading(true);
    setAuthMessage('');
    try {
      await logoutBackend();
      setBackendUser(null);
      loadAccountScopedAiSettings();
      setAuthMessage('已退出登录');
      onAccountChanged?.();
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : '退出登录失败');
    } finally {
      setIsAuthLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-3xl overflow-hidden shadow-2xl border border-sepia-100">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-sepia-50">
        <h2 className="text-base font-bold text-sepia-800">设置面板</h2>
        <button onClick={onClose} className="p-2 hover:bg-sepia-50 rounded-full transition-colors">
          <Terminal size={18} className="text-sepia-400" />
        </button>
      </div>

      {/* Custom Tabs */}
      <div className="flex border-b border-sepia-50 bg-white z-10 px-6">
        <button
          onClick={() => setActiveTab('account')}
          className={cn(
            "flex items-center gap-2 py-4 text-[13px] font-bold transition-all relative mr-8",
            activeTab === 'account' ? "text-sepia-900" : "text-sepia-400 hover:text-sepia-500"
          )}
        >
          <UserRound size={16} /> 账号登录
          {activeTab === 'account' && (
            <motion.div layoutId="settingTab" className="absolute bottom-0 left-0 right-0 h-[3px] bg-sepia-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('api')}
          className={cn(
            "flex items-center gap-2 py-4 text-[13px] font-bold transition-all relative mr-8",
            activeTab === 'api' ? "text-sepia-900" : "text-sepia-400 hover:text-sepia-500"
          )}
        >
          <SettingsIcon size={16} /> API 连接
          {activeTab === 'api' && (
            <motion.div layoutId="settingTab" className="absolute bottom-0 left-0 right-0 h-[3px] bg-sepia-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('data')}
          className={cn(
            "flex items-center gap-2 py-4 text-[13px] font-bold transition-all relative",
            activeTab === 'data' ? "text-sepia-900" : "text-sepia-400 hover:text-sepia-500"
          )}
        >
          <Database size={16} /> 数据管理
          {activeTab === 'data' && (
            <motion.div layoutId="settingTab" className="absolute bottom-0 left-0 right-0 h-[3px] bg-sepia-500 rounded-full" />
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        <AnimatePresence mode="wait">
          {activeTab === 'account' ? (
            <motion.div
              key="account"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-6"
            >
              <div className="p-4 bg-sepia-50/50 rounded-2xl border border-sepia-100/50 flex items-start gap-3">
                <div className="text-sepia-500 mt-0.5">
                  <Info size={18} />
                </div>
                <p className="text-[13px] text-sepia-600 leading-snug font-medium">
                  当前登录入口接入的是后端模拟微信登录接口，用于体验账号、Token、SQLite 会话持久化。后续接小程序时会替换成真实微信 code。
                </p>
              </div>

              <div className="bg-white border border-sepia-100 rounded-3xl p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-sepia-900 text-white flex items-center justify-center shadow-lg">
                    <UserRound size={26} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-sepia-900 truncate">
                      {backendUser?.nickName || '未登录'}
                    </p>
                    <p className="text-[10px] text-sepia-400 font-mono truncate mt-1">
                      {backendUser?.id || '暂无后端用户 ID'}
                    </p>
                  </div>
                </div>

                {backendUser && (
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="bg-sepia-50 rounded-2xl p-3">
                      <p className="text-[9px] text-sepia-400 font-bold uppercase tracking-widest">OpenID</p>
                      <p className="text-[10px] text-sepia-600 font-mono truncate mt-1">{backendUser.openId}</p>
                    </div>
                    <div className="bg-sepia-50 rounded-2xl p-3">
                      <p className="text-[9px] text-sepia-400 font-bold uppercase tracking-widest">Updated</p>
                      <p className="text-[10px] text-sepia-600 font-mono truncate mt-1">
                        {new Date(backendUser.updatedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 ml-1">
                  <div className="p-1.5 bg-sepia-50 rounded-lg text-sepia-500">
                    <UserRound size={14} />
                  </div>
                  <label className="text-[10px] font-bold text-sepia-400 uppercase tracking-widest">体验昵称</label>
                </div>
                <input
                  type="text"
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  placeholder="输入一个昵称"
                  className="w-full bg-sepia-50 border border-sepia-100 rounded-2xl px-4 py-4 text-[13px] focus:outline-none focus:ring-2 focus:ring-sepia-200 focus:border-sepia-300 transition-all text-sepia-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleLogin}
                  disabled={isAuthLoading}
                  className="py-4 rounded-2xl flex items-center justify-center gap-2 text-[14px] font-bold transition-all active:scale-[0.98] bg-sepia-900 text-white hover:bg-sepia-800 shadow-[0_12px_24px_-6px_rgba(15,23,42,0.3)] disabled:opacity-60"
                >
                  <Key size={17} /> {backendUser ? '重新登录' : '登录'}
                </button>
                <button
                  onClick={handleLogout}
                  disabled={isAuthLoading || !backendUser}
                  className="py-4 rounded-2xl flex items-center justify-center gap-2 text-[14px] font-bold transition-all active:scale-[0.98] bg-clay-50 text-clay-600 border border-clay-100 hover:bg-clay-100 disabled:opacity-50"
                >
                  <LogOut size={17} /> 退出
                </button>
              </div>

              {authMessage && (
                <p className="text-[12px] text-sepia-500 text-center font-medium">{authMessage}</p>
              )}
            </motion.div>
          ) : activeTab === 'api' ? (
            <motion.div
              key="api"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-6"
            >
              <div className="p-4 bg-sepia-50/50 rounded-2xl border border-sepia-100/50 flex items-start gap-3">
                <div className="text-sepia-500 mt-0.5">
                  <Info size={18} />
                </div>
                <p className="text-[13px] text-sepia-600 leading-snug font-medium">
                  填入兼容 OpenAI Chat Completions / Images 接口的供应商配置，例如 OneAPI、OpenRouter、硅基流动或自建网关。模型名称完全由你输入，不再使用预设列表。
                </p>
              </div>

              <div className="space-y-5">
                {/* Base URL */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 ml-1">
                    <div className="p-1.5 bg-sepia-50 rounded-lg text-sepia-500">
                      <Link size={14} />
                    </div>
                    <label className="text-[10px] font-bold text-sepia-400 uppercase tracking-widest">Base URL</label>
                  </div>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://your-provider.example.com/v1"
                    className="w-full bg-sepia-50 border border-sepia-100 rounded-2xl px-4 py-4 text-[13px] focus:outline-none focus:ring-2 focus:ring-sepia-200 focus:border-sepia-300 transition-all font-mono text-sepia-700"
                  />
                  <p className="text-[11px] text-sepia-400 ml-1">
                    需要包含 API 版本路径，例如 OpenAI 官方为 https://api.openai.com/v1。
                  </p>
                </div>

                {/* API Key */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 ml-1">
                    <div className="p-1.5 bg-sepia-100 rounded-lg text-sepia-600">
                      <Key size={14} />
                    </div>
                    <label className="text-[10px] font-bold text-sepia-400 uppercase tracking-widest">API Key</label>
                  </div>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-.........................................."
                      className="w-full bg-sepia-50 border border-sepia-100 rounded-2xl px-4 py-4 text-[13px] focus:outline-none focus:ring-2 focus:ring-sepia-200 focus:border-sepia-300 transition-all font-mono text-sepia-700"
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-sepia-400 hover:text-sepia-600 transition-colors"
                    >
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 ml-1">
                    <div className="p-1.5 bg-sepia-50 rounded-lg text-sepia-500">
                      <Database size={14} />
                    </div>
                    <label className="text-[10px] font-bold text-sepia-400 uppercase tracking-widest">Backend URL</label>
                  </div>
                  <input
                    type="text"
                    value={backendUrl}
                    onChange={(e) => setBackendUrl(e.target.value)}
                    placeholder="http://127.0.0.1:3100"
                    className="w-full bg-sepia-50 border border-sepia-100 rounded-2xl px-4 py-4 text-[13px] focus:outline-none focus:ring-2 focus:ring-sepia-200 focus:border-sepia-300 transition-all font-mono text-sepia-700"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 ml-1">
                    <div className="p-1.5 bg-sepia-50 rounded-lg text-sepia-500">
                      <Cpu size={14} />
                    </div>
                    <label className="text-[10px] font-bold text-sepia-400 uppercase tracking-widest">LLM 模型名称</label>
                  </div>
                  <input
                    type="text"
                    value={textModel}
                    onChange={(e) => setTextModel(e.target.value)}
                    placeholder="例如：gpt-4o-mini、deepseek-chat、qwen-plus"
                    className="w-full bg-sepia-50 border border-sepia-100 rounded-2xl px-4 py-4 text-[13px] focus:outline-none focus:ring-2 focus:ring-sepia-200 focus:border-sepia-300 transition-all font-mono text-sepia-700"
                  />
                  <p className="text-[11px] text-sepia-400 ml-1">
                    用于宠物对话、耳语生成、宠物照片视觉分析。模型需支持你当前供应商的 chat/completions 接口；如要分析照片，模型还需要支持图片输入。
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 ml-1">
                    <div className="p-1.5 bg-sepia-50 rounded-lg text-sepia-500">
                      <Cpu size={14} />
                    </div>
                    <label className="text-[10px] font-bold text-sepia-400 uppercase tracking-widest">图像生成模型名称（可选）</label>
                  </div>
                  <input
                    type="text"
                    value={imageModel}
                    onChange={(e) => setImageModel(e.target.value)}
                    placeholder="例如：dall-e-3、gpt-image-1；留空则复用 LLM 模型名称"
                    className="w-full bg-sepia-50 border border-sepia-100 rounded-2xl px-4 py-4 text-[13px] focus:outline-none focus:ring-2 focus:ring-sepia-200 focus:border-sepia-300 transition-all font-mono text-sepia-700"
                  />
                  <p className="text-[11px] text-sepia-400 ml-1">
                    仅用于没有参考照片时的旧图像生成兜底。真实宠物照片转像素图走后端 FAL，不受此项影响。
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSaveSettings}
                    disabled={saveSuccess}
                    className={cn(
                      "w-full py-4 rounded-2xl flex items-center justify-center gap-2 text-[14px] font-bold transition-all active:scale-[0.98]",
                      saveSuccess 
                        ? "bg-emerald-500 text-white" 
                        : "bg-sepia-900 text-white hover:bg-sepia-800 shadow-[0_12px_24px_-6px_rgba(15,23,42,0.3)]"
                    )}
                  >
                    {saveSuccess ? (
                      <><CheckCircle2 size={18} /> 已保存成功</>
                    ) : (
                      <><Save size={18} /> 保存并更新配置</>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="data"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-6"
            >
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Cpu size={16} className="text-sepia-400" />
                  <h3 className="text-[11px] font-bold text-sepia-400 uppercase tracking-widest">运行状态</h3>
                </div>

                <div className="bg-white border border-sepia-100 rounded-3xl p-5 flex justify-between items-center shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500">
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold text-sepia-900">服务网关</p>
                      <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mt-0.5">已同步</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-sepia-300 font-bold">响应 182ms</p>
                  </div>
                </div>

                <div className="bg-white border border-sepia-100 rounded-3xl p-5 flex justify-between items-center shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-sepia-50 rounded-2xl flex items-center justify-center text-sepia-500">
                      <Terminal size={24} />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold text-sepia-900">喵汪星通信协议</p>
                      <p className="text-[10px] text-sepia-500 font-bold uppercase tracking-widest mt-0.5">V2.4.0 active</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-t border-sepia-50 pt-8">
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw size={16} className="text-sepia-400" />
                  <h3 className="text-[11px] font-bold text-sepia-400 uppercase tracking-widest">高级操作</h3>
                </div>

                <button 
                  onClick={handleReset}
                  className="w-full bg-clay-50/50 border border-clay-100/50 p-5 rounded-3xl flex flex-col items-center gap-1.5 group transition-all active:scale-[0.98] hover:bg-clay-50"
                >
                  <span className="text-[14px] font-bold text-clay-600">
                    {resetSuccess ? "已成功清除记忆" : "重置宠物记忆"}
                  </span>
                  <span className="text-[11px] text-clay-400 font-medium opacity-70">清空与当前宠物的历史对话数据</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function normalizeBaseUrl(rawValue: string): string {
  const extractedUrl = rawValue.trim().match(/https?:\/\/[^\s，,，）)]+/i)?.[0] || rawValue.trim();
  return extractedUrl
    .replace(/\/chat\/completions\/?$/i, '')
    .replace(/\/images\/generations\/?$/i, '')
    .replace(/\/$/, '');
}
