import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cpu, Terminal, RefreshCw, Info, CheckCircle2, Key, Save, Eye, EyeOff, Link, Settings as SettingsIcon, Database } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface AiSettingsProps {
  onClose: () => void;
  onResetChat: () => void;
}

export function AiSettings({ onClose, onResetChat }: AiSettingsProps) {
  const [activeTab, setActiveTab] = useState<'api' | 'data'>('api');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('wangxing_user_api_key') || '');
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('wangxing_user_base_url') || 'https://once.novai.su/v1');
  const [showKey, setShowKey] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [textModel, setTextModel] = useState(() => localStorage.getItem('wangxing_text_model') || '[次]gemini-2.5-pro');
  const [imageModel, setImageModel] = useState(() => {
    const saved = localStorage.getItem('wangxing_image_model');
    if (saved === 'gemini-2.5-flash-image-preview') return '[次]gemini-2.5-pro';
    return saved || '[次]gemini-2.5-pro';
  });

  const textModels = [
    { id: '[次]gemini-2.5-pro', name: '[次]Gemini 2.5 Pro', desc: '全能旗舰模型', tier: '旗舰' },
    { id: '[次]gemini-3-pro-preview', name: '[次]Gemini 3 Pro', desc: '新代智慧巅峰', tier: '前沿' },
    { id: '[次]gemini-3.1-pro-preview', name: '[次]Gemini 3.1 Pro', desc: '极致逻辑推理', tier: '顶尖' },
    { id: '[次]gemini-3-flash', name: '[次]Gemini 3 Flash', desc: '极速毫秒响应', tier: '标准' },
    { id: 'nano-banana', name: 'Nano Banana', desc: '超轻量化实验', tier: '实验' },
  ];

  const imageModels = [
    { id: '[次]gemini-2.5-pro', name: '[次]Gemini 2.5 Pro', desc: '专业图像分析 & 绘图', tier: '旗舰' },
    { id: '[次]gemini-3-pro-preview', name: '[次]Gemini 3 Pro', desc: '极致光影渲染', tier: '前沿' },
    { id: 'gemini-2.5-flash-image-preview', name: 'Gemini 2.5 Flash', desc: '更快的识图速度', tier: '识图' },
  ];

  useEffect(() => {
    const savedKey = localStorage.getItem('wangxing_user_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }

    const savedBaseUrl = localStorage.getItem('wangxing_user_base_url');
    // Migrate from old default URL if found
    if (savedBaseUrl === 'https://api.go-model.com' || savedBaseUrl === 'https://twob.pp.ua/v1') {
      localStorage.setItem('wangxing_user_base_url', 'https://once.novai.su/v1');
      setBaseUrl('https://once.novai.su/v1');
    } else if (savedBaseUrl) {
      setBaseUrl(savedBaseUrl);
    }

    const savedTextModel = localStorage.getItem('wangxing_text_model');
    // Migrate old model names
    if (savedTextModel === 'gemini-2.5-pro' || savedTextModel === 'gemini-3-flash') {
       const mapped = savedTextModel === 'gemini-2.5-pro' ? '[次]gemini-2.5-pro' : '[次]gemini-3-flash';
       localStorage.setItem('wangxing_text_model', mapped);
       setTextModel(mapped);
    } else if (savedTextModel) {
      setTextModel(savedTextModel);
    }

    const savedImageModel = localStorage.getItem('wangxing_image_model');
    if (savedImageModel === 'gemini-2.5-flash-image-preview') {
      localStorage.setItem('wangxing_image_model', '[次]gemini-2.5-pro');
      setImageModel('[次]gemini-2.5-pro');
    } else if (savedImageModel) {
      setImageModel(savedImageModel);
    }
  }, []);

  const handleReset = () => {
    onResetChat();
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 2000);
  };

  const handleSaveSettings = () => {
    const cleanedKey = apiKey.trim().replace(/[^\x00-\x7F]/g, "");
    if (cleanedKey) {
      localStorage.setItem('wangxing_user_api_key', cleanedKey);
      setApiKey(cleanedKey);
    } else {
      localStorage.removeItem('wangxing_user_api_key');
      setApiKey('');
    }

    const trimmedBaseUrl = baseUrl.trim();
    if (trimmedBaseUrl) {
      localStorage.setItem('wangxing_user_base_url', trimmedBaseUrl);
      setBaseUrl(trimmedBaseUrl);
    } else {
      localStorage.removeItem('wangxing_user_base_url');
      setBaseUrl('https://once.novai.su/v1');
    }
    
    localStorage.setItem('wangxing_text_model', textModel);
    localStorage.setItem('wangxing_image_model', imageModel);

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
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
          {activeTab === 'api' ? (
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
                  配置 AI 代理 service (如 OneAPI/Go-Model)。此配置将用于所有文本分析与绘图任务。
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
                    placeholder="https://once.novai.su/v1"
                    className="w-full bg-sepia-50 border border-sepia-100 rounded-2xl px-4 py-4 text-[13px] focus:outline-none focus:ring-2 focus:ring-sepia-200 focus:border-sepia-300 transition-all font-mono text-sepia-700"
                  />
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

                {/* Model Selections */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-sepia-400 uppercase tracking-widest ml-1">对话模型</label>
                      <div className="space-y-1 overflow-y-auto max-h-[160px] pr-1 custom-scrollbar">
                        {textModels.map(model => (
                          <button
                            key={model.id}
                            onClick={() => setTextModel(model.id)}
                            className={cn(
                              "w-full text-left px-3 py-2.5 rounded-xl border text-[10px] font-bold transition-all mb-1",
                              textModel === model.id 
                                ? "bg-sepia-900 text-white border-sepia-900 shadow-md" 
                                : "bg-white border-sepia-100 hover:border-sepia-200 text-sepia-500"
                            )}
                          >
                            <div className="flex justify-between items-center">
                              <span>{model.name}</span>
                              <span className={cn("text-[8px] opacity-70 px-1 border rounded", textModel === model.id ? "border-white" : "border-sepia-200")}>{model.tier}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-sepia-400 uppercase tracking-widest ml-1">图像模型</label>
                      <div className="space-y-1 overflow-y-auto max-h-[160px] pr-1 custom-scrollbar">
                        {imageModels.map(model => (
                          <button
                            key={model.id}
                            onClick={() => setImageModel(model.id)}
                            className={cn(
                              "w-full text-left px-3 py-2.5 rounded-xl border text-[10px] font-bold transition-all mb-1",
                              imageModel === model.id 
                                ? "bg-sepia-500 text-white border-sepia-500 shadow-md" 
                                : "bg-white border-sepia-100 hover:border-sepia-200 text-sepia-500"
                            )}
                          >
                            <div className="flex justify-between items-center">
                              <span>{model.name}</span>
                              <span className={cn("text-[8px] opacity-70 px-1 border rounded", imageModel === model.id ? "border-white" : "border-sepia-200")}>{model.tier}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
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
