import { useCanvasStore } from '@/stores/canvasStore';
import { ENTITY_TYPE_TEMPLATES, EntityTypeTemplate } from '@/stores/slices/settingsSlice';
import { Cpu, Key, Globe, MessageSquare, Info, FileText, Network, ChevronDown, X, Settings, Plus, Trash2, Database, HardDrive, CpuIcon, HelpCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModelManagementPanel } from './ModelManagementPanel';

interface SettingsModalProps {
    onClose: () => void;
    initialTab?: 'ai' | 'docs' | 'general' | 'about';
}

export function SettingsModal({ onClose, initialTab = 'ai' }: SettingsModalProps) {
    const { t } = useTranslation();
    const {
        aiModel,
        setAiModel,
        aiApiKey,
        setAiApiKey,
        aiBaseUrl,
        setAiBaseUrl,
        aiEmbeddingModel,
        setAiEmbeddingModel,
        aiEmbeddingApiKey,
        setAiEmbeddingApiKey,
        aiEmbeddingBaseUrl,
        setAiEmbeddingBaseUrl,
        language,
        setLanguage,
        systemPrompt,
        setSystemPrompt,
        docParserEngine,
        setDocParserEngine,
        maxConcurrentTasks,
        setMaxConcurrentTasks,
        customEntityTemplates,
        addCustomEntityTemplate,
        removeCustomEntityTemplate,
        imaClientId,
        setImaClientId,
        imaApiKey,
        setImaApiKey
    } = useCanvasStore();

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // New 3-tab layout: ai, docs, general
    const [activeTab, setActiveTab] = useState<'ai' | 'docs' | 'general' | 'about'>(initialTab);

    // Custom Template Form State
    const [isAddingTemplate, setIsAddingTemplate] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [newTemplateIcon, setNewTemplateIcon] = useState('📌');
    const [newTemplateTypesStr, setNewTemplateTypesStr] = useState('');

    const handleSaveCustomTemplate = () => {
        if (!newTemplateName.trim()) return;
        const types = newTemplateTypesStr.split(/[,，、\n]+/).map(t => t.trim()).filter(Boolean);
        if (types.length === 0) return;

        addCustomEntityTemplate({
            id: `custom-${Date.now()}`,
            name: newTemplateName.trim(),
            icon: newTemplateIcon || '📌',
            types
        });

        setIsAddingTemplate(false);
        setNewTemplateName('');
        setNewTemplateTypesStr('');
    };

    const inputClass = "w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-gray-400";
    const labelClass = "text-xs text-gray-500 ml-0.5 flex items-center gap-1";
    const sectionTitleClass = "flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-4";
    const tabClass = (tab: string) => `w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors text-left ${activeTab === tab ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`;

    return (
        <div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-[800px] h-[600px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0 bg-white z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
                            <Settings className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">{t('settings.title')}</h2>
                            <p className="text-xs text-gray-400">{t('settings.subtitle')}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body - Flex layout with sidebar */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left Sidebar */}
                    <div className="w-48 bg-gray-50/50 border-r border-gray-100 p-4 space-y-1 flex-shrink-0">
                        <button onClick={() => setActiveTab('ai')} className={tabClass('ai')}>
                            <CpuIcon className="w-4 h-4" /> {t('settings.tab.ai')}
                        </button>
                        <button onClick={() => setActiveTab('docs')} className={tabClass('docs')}>
                            <FileText className="w-4 h-4" /> {t('settings.tab.docs')}
                        </button>
                        <button onClick={() => setActiveTab('general')} className={tabClass('general')}>
                            <Settings className="w-4 h-4" /> {t('settings.tab.general')}
                        </button>
                        <button onClick={() => setActiveTab('about')} className={tabClass('about')}>
                            <HelpCircle className="w-4 h-4" /> {t('settings.tab.about')}
                        </button>
                    </div>

                    {/* Right Content Area */}
                    <div className="flex-1 overflow-y-auto p-6 bg-white relative">

                        {/* Tab 1: AI Services */}
                        {activeTab === 'ai' && (
                            <div className="max-w-xl mx-auto space-y-8 pb-12">
                                {/* AI Model (LLM) */}
                                <div>
                                    <div className={sectionTitleClass}>
                                        <MessageSquare className="w-3.5 h-3.5" />
                                        <span>{t('settings.models.llm')}</span>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <label className={labelClass}>
                                                <Globe className="w-3 h-3" /> Base URL
                                            </label>
                                            <input
                                                type="text"
                                                value={aiBaseUrl}
                                                onChange={(e) => setAiBaseUrl(e.target.value)}
                                                placeholder="https://api.deepseek.com/v1"
                                                className={inputClass}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className={labelClass}>
                                                <Key className="w-3 h-3" /> API Key
                                            </label>
                                            <input
                                                type="password"
                                                value={aiApiKey}
                                                onChange={(e) => setAiApiKey(e.target.value)}
                                                placeholder={t('settings.models.apiKeyPlaceholder')}
                                                className={inputClass}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className={labelClass}>{t('settings.models.modelName')}</label>
                                            <input
                                                type="text"
                                                value={aiModel}
                                                onChange={(e) => setAiModel(e.target.value)}
                                                placeholder={t('settings.models.llmModelPlaceholder')}
                                                className={inputClass}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-gray-100" />

                                {/* Embedding */}
                                <div>
                                    <div className={sectionTitleClass}>
                                        <Network className="w-3.5 h-3.5" />
                                        <span>{t('settings.models.embedding')}</span>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <label className={labelClass}>
                                                <Globe className="w-3 h-3" /> Base URL
                                            </label>
                                            <input
                                                type="text"
                                                value={aiEmbeddingBaseUrl}
                                                onChange={(e) => setAiEmbeddingBaseUrl(e.target.value)}
                                                placeholder="https://api.siliconflow.cn/v1"
                                                className={inputClass}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className={labelClass}>
                                                <Key className="w-3 h-3" /> API Key
                                            </label>
                                            <input
                                                type="password"
                                                value={aiEmbeddingApiKey}
                                                onChange={(e) => setAiEmbeddingApiKey(e.target.value)}
                                                placeholder={t('settings.models.apiKeyPlaceholder')}
                                                className={inputClass}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className={labelClass}>{t('settings.models.modelName')}</label>
                                            <input
                                                type="text"
                                                value={aiEmbeddingModel}
                                                onChange={(e) => setAiEmbeddingModel(e.target.value)}
                                                placeholder={t('settings.models.embeddingModelPlaceholder')}
                                                className={inputClass}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-gray-100" />

                                {/* IMA Configuration */}
                                <div>
                                    <div className={sectionTitleClass}>
                                        <Database className="w-3.5 h-3.5" />
                                        <span>{t('ima.title')}</span>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <label className={labelClass}>Client ID</label>
                                            <input
                                                type="text"
                                                value={imaClientId || ''}
                                                onChange={(e) => setImaClientId(e.target.value)}
                                                placeholder="your-ima-client-id"
                                                className={inputClass + " font-mono"}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className={labelClass}>API Key</label>
                                            <input
                                                type="password"
                                                value={imaApiKey || ''}
                                                onChange={(e) => setImaApiKey(e.target.value)}
                                                placeholder="your-ima-api-key"
                                                className={inputClass + " font-mono"}
                                            />
                                            <p className="text-[10px] text-gray-500 ml-0.5 mt-1 leading-relaxed">
                                                {t('ima.desc1')}<a href="https://ima.qq.com/agent-interface" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{t('ima.descLink')}</a>{t('ima.desc2')}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-gray-100" />

                                {/* System Prompt */}
                                <div>
                                    <div className={sectionTitleClass}>
                                        <Cpu className="w-3.5 h-3.5" />
                                        <span>{t('settings.behavior.systemPromptTitle')}</span>
                                    </div>
                                    <div className="space-y-2">
                                        <textarea
                                            value={systemPrompt}
                                            onChange={(e) => setSystemPrompt(e.target.value)}
                                            placeholder={t('settings.behavior.systemPromptPlaceholder')}
                                            className="w-full h-40 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-gray-400 resize-none leading-relaxed"
                                        />
                                        <p className="text-[10px] text-gray-500 ml-0.5">
                                            {t('settings.behavior.systemPromptDesc')}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tab 2: Docs & Graph */}
                        {activeTab === 'docs' && (
                            <div className="max-w-2xl mx-auto space-y-8 pb-12">

                                {/* Document Parsing */}
                                <div>
                                    <div className={sectionTitleClass}>
                                        <FileText className="w-3.5 h-3.5" />
                                        <span>{t('settings.system.docParseTitle')}</span>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <label className={labelClass}>{t('settings.system.docParseEngine')}</label>
                                            <select
                                                value={docParserEngine || 'docling'}
                                                onChange={(e) => setDocParserEngine(e.target.value)}
                                                className={inputClass + " text-gray-700 w-1/2"}
                                            >
                                                <option value="markitdown">{t('settings.system.markitdownLightweight')}</option>
                                                <option value="docling">{t('settings.system.doclingRecommended')}</option>
                                                <option value="mineru">MinerU</option>
                                            </select>
                                            <p className="text-[10px] text-gray-500 ml-0.5 mt-1">
                                                {t('settings.system.docParseDesc')}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-gray-100" />

                                {/* Templates */}
                                <div>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                                            <Network className="w-3.5 h-3.5" />
                                            <span>{t('settings.behavior.templatesTitle')}</span>
                                        </div>
                                        <button
                                            onClick={() => setIsAddingTemplate(!isAddingTemplate)}
                                            className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded"
                                        >
                                            {isAddingTemplate ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                            {isAddingTemplate ? t('common.cancel') : t('settings.behavior.addTemplate')}
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
                                        {t('settings.behavior.templatesDesc')}
                                    </p>

                                    {/* Add Custom Template Form */}
                                    {isAddingTemplate && (
                                        <div className="mb-4 p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3 animate-in slide-in-from-top-2 duration-200">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={newTemplateIcon}
                                                    onChange={(e) => setNewTemplateIcon(e.target.value)}
                                                    placeholder={t('settings.behavior.iconPlaceholder')}
                                                    className="w-20 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-center"
                                                />
                                                <input
                                                    type="text"
                                                    value={newTemplateName}
                                                    onChange={(e) => setNewTemplateName(e.target.value)}
                                                    placeholder={t('settings.behavior.namePlaceholder')}
                                                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-500"
                                                />
                                            </div>
                                            <textarea
                                                value={newTemplateTypesStr}
                                                onChange={(e) => setNewTemplateTypesStr(e.target.value)}
                                                placeholder={t('settings.behavior.typesPlaceholder')}
                                                className="w-full h-20 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm resize-none focus:ring-1 focus:ring-blue-500"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => setIsAddingTemplate(false)}
                                                    className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md"
                                                >
                                                    {t('common.cancel')}
                                                </button>
                                                <button
                                                    onClick={handleSaveCustomTemplate}
                                                    disabled={!newTemplateName.trim() || !newTemplateTypesStr.trim()}
                                                    className="px-4 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {t('settings.behavior.saveTemplate')}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        {[...customEntityTemplates, ...ENTITY_TYPE_TEMPLATES].map((tpl) => {
                                            const isCustom = tpl.id.startsWith('custom-');
                                            return (
                                                <details key={tpl.id} className="group bg-gray-50 border border-gray-100 rounded-lg overflow-hidden">
                                                    <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer text-sm text-gray-700 hover:bg-gray-100 transition-colors select-none list-none">
                                                        <span className="text-lg">{tpl.icon}</span>
                                                        <span className="font-medium flex-1 flex items-center gap-2">
                                                            {tpl.name}
                                                            {isCustom && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase tracking-wider">{t('settings.behavior.custom')}</span>}
                                                        </span>
                                                        <span className="text-xs font-medium text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-200">{t('settings.behavior.typeCount', { count: tpl.types.length })}</span>
                                                        {isCustom && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    removeCustomEntityTemplate(tpl.id);
                                                                }}
                                                                className="ml-2 p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                                                title={t('settings.behavior.deleteTemplate')}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <ChevronDown className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform ml-2" />
                                                    </summary>
                                                    <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-white">
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {tpl.types.map((type) => (
                                                                <span key={type} className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-600 font-medium">
                                                                    {type}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </details>
                                            );
                                        })}
                                    </div>
                                </div>

                                <hr className="border-gray-100" />

                                <div className="pt-4">
                                    <ModelManagementPanel />
                                </div>

                            </div>
                        )}

                        {/* Tab 3: General */}
                        {activeTab === 'general' && (
                            <div className="max-w-xl mx-auto space-y-8 pb-12">
                                {/* Language */}
                                <div>
                                    <div className={sectionTitleClass}>
                                        <Globe className="w-3.5 h-3.5" />
                                        <span>{t('settings.system.languageTitle')}</span>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <select
                                                value={language || 'zh'}
                                                onChange={(e) => setLanguage(e.target.value as 'zh' | 'en')}
                                                className={inputClass + " text-gray-700 w-1/2"}
                                            >
                                                <option value="zh">{t('settings.system.languageZh')}</option>
                                                <option value="en">{t('settings.system.languageEn')}</option>
                                            </select>
                                            <p className="text-[10px] text-gray-500 ml-0.5 mt-1">
                                                {t('settings.system.languageDesc')}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <hr className="border-gray-100" />

                                {/* Performance */}
                                <div>
                                    <div className={sectionTitleClass}>
                                        <Settings className="w-3.5 h-3.5" />
                                        <span>{t('settings.system.perfTitle')}</span>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <label className={labelClass}>{t('settings.system.concurrentTasks')}</label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="10"
                                                    value={maxConcurrentTasks || 2}
                                                    onChange={(e) => setMaxConcurrentTasks(parseInt(e.target.value, 10))}
                                                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                />
                                                <span className="text-sm font-medium text-gray-700 w-8 text-center">{maxConcurrentTasks || 2}</span>
                                            </div>
                                            <p className="text-[10px] text-gray-500 ml-0.5 mt-1">
                                                {t('settings.system.concurrentTasksDesc')}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        )}

                        {/* Tab 4: About */}
                        {activeTab === 'about' && (
                            <div className="max-w-xl mx-auto pb-12">
                                <div className="flex flex-col items-center justify-center py-6 text-center select-none">
                                    <div className="w-20 h-20 rounded-[1.25rem] bg-gradient-to-tr from-blue-50 to-indigo-50 shadow-lg shadow-blue-500/10 flex items-center justify-center mb-4 transform hover:scale-105 transition-transform duration-300 border border-white/60 p-1">
                                        <img src={new URL('../../../../../assets/icon.png', import.meta.url).href} alt="Brainhole Logo" className="w-full h-full object-contain drop-shadow-md rounded-[1rem]" />
                                    </div>

                                    <h3 className="text-xl font-black text-slate-800 tracking-tight">Brainhole</h3>
                                    <p className="text-[11px] font-semibold text-blue-600 mt-0.5">{t('settings.about.slogan')}</p>

                                    <div className="mt-5 flex flex-col items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-5 py-3 w-full max-w-sm">
                                        <div className="flex items-center justify-between w-full border-b border-slate-200/50 pb-2">
                                            <span className="text-[11px] font-semibold text-slate-500">{t('settings.about.version')}</span>
                                            <span className="text-[10px] font-mono font-bold text-slate-800 bg-blue-100/60 px-2 py-0.5 rounded text-blue-700">v0.1.0</span>
                                        </div>
                                        <div className="flex items-center justify-between w-full border-b border-slate-200/50 py-2">
                                            <span className="text-[11px] font-semibold text-slate-500">GitHub</span>
                                            <a
                                                href="https://github.com/aning35/brainhole"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[11px] font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline transition-colors flex items-center gap-1"
                                            >
                                                aning35/brainhole
                                            </a>
                                        </div>
                                        <div className="flex items-center justify-between w-full pt-1">
                                            <span className="text-[11px] font-semibold text-slate-500">{t('settings.about.techStack')}</span>
                                            <span className="text-[10px] font-mono text-slate-600">Electron + React + TypeScript</span>
                                        </div>
                                    </div>

                                    <p className="text-[11px] text-slate-400 mt-5 max-w-xs leading-relaxed">
                                        {t('settings.about.description')}
                                    </p>

                                    <div className="mt-5 text-[9px] text-slate-400 font-mono">
                                        {t('settings.about.copyright')}
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>

                {/* Global Footer */}
                <div className="shrink-0 px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Info className="w-4 h-4 text-blue-500" />
                        <span>{t('settings.footer.savedAuto')}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                        {t('settings.footer.press')} <kbd className="px-1.5 py-0.5 bg-white rounded border border-gray-200 text-[10px] font-mono shadow-sm text-gray-500">Esc</kbd> {t('settings.footer.closeFast')}
                    </div>
                </div>
            </div>
        </div>
    );
}
