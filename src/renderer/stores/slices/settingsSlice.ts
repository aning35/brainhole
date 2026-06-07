import { StateCreator } from 'zustand';
import { CanvasState } from '../canvasStore';

export const DEFAULT_GRAPH_ENTITY_TYPES = [
    '人物', '组织机构', '位置与地点',
    '项目任务', '产品服务', '目标与规划',
    '独立事件', '行业领域', '前沿技术',
    '技术文档', '工具框架', '信息与消息',
    '核心机制', '总结笔记', '核心账号与凭据',
    '硬件服务器设备', '动作执行', '业务策略',
    '核心术语概念', '原理论点', '问题与缺陷',
    '解决方案', '标准规范与法规', '数据指标'
];

export interface EntityTypeTemplate {
    id: string;
    name: string;
    icon: string;
    types: string[];
}

export const ENTITY_TYPE_TEMPLATES: EntityTypeTemplate[] = [
    {
        id: 'general',
        name: '通用（默认）',
        icon: '🌐',
        types: DEFAULT_GRAPH_ENTITY_TYPES,
    },
    {
        id: 'insurance',
        name: '保险领域',
        icon: '🛡️',
        types: [
            '投保', '承保', '核保', '保全', '理赔', '退保', '续保', '批改',
            '报案', '定损', '查勘', '核赔', '赔付', '追偿', '代位求偿', '协赔',
            '投保人', '被保险人', '受益人', '保险代理人', '保险经纪人', '理赔员', '核保员', '精算师',
            '保险产品', '保险合同', '保单', '批单', '保险条款', '免责条款', '特别约定', '附加险', '主险',
            '保险事故', '风险标的', '承保风险', '除外责任', '案件', '欺诈案件', '骗保',
            '保费', '保额', '保险金', '赔付金额', '免赔额', '费率', '佣金', '手续费', '准备金', '再保摊回',
            '保险公司', '再保险公司', '保险中介', '保险公估', '销售渠道', '监管机构', '行业协会',
            '人身险', '财产险', '健康险', '意外险', '车险', '责任险', '工程险', '信用险', '农业险', '团体险',
            '保险法规', '监管政策', '行业标准', '合规要求', '偿付能力', '保险牌照',
            '保险期间', '等待期', '犹豫期', '宽限期', '观察期', '责任起期', '责任止期',
            '核保规则', '风控模型', '精算模型', '费率表', '生命表', '疾病定义',
            '渠道管理', '银保渠道', '个险渠道', '经代渠道', '互联网渠道', '电销渠道',
            '保险科技', '智能核保', '智能理赔', '智能客服', '电子保单', '在线投保',
        ],
    },
    {
        id: 'finance',
        name: '金融领域',
        icon: '💰',
        types: [
            '金融机构', '银行', '证券公司', '基金公司', '信托公司', '交易所',
            '客户', '账户', '交易', '订单', '持仓', '头寸',
            '股票', '债券', '基金', '期货', '期权', '外汇', '衍生品', '理财产品',
            '贷款', '存款', '抵押物', '担保', '信用评级', '征信报告',
            '利率', '汇率', '收益率', '净值', '市值', '估值',
            '风险管理', '信用风险', '市场风险', '操作风险', '流动性风险', '合规风险',
            '监管政策', '金融法规', '反洗钱', '合规要求', '资本充足率',
            '支付结算', '清算', '托管', '资金池', '资产配置',
            '金融科技', '数字货币', '区块链', '智能投顾', '量化交易',
        ],
    },
    {
        id: 'medical',
        name: '医疗健康',
        icon: '🏥',
        types: [
            '患者', '医生', '护士', '药师', '医疗团队',
            '医疗机构', '医院', '诊所', '科室', '药房', '实验室',
            '疾病', '症状', '体征', '并发症', '病因', '诊断', '鉴别诊断',
            '治疗方案', '手术', '化疗', '放疗', '康复治疗', '护理计划',
            '药品', '处方', '剂量', '不良反应', '药物相互作用', '禁忌症',
            '检查检验', '影像检查', '化验指标', '病理报告', '基因检测',
            '病历', '医嘱', '知情同意', '转诊', '会诊', '随访',
            '医保政策', '收费项目', '诊疗规范', '临床指南', '医疗法规',
            '临床试验', '医学研究', '循证医学', '医疗器械', '医疗技术',
            '公共卫生', '传染病', '疫苗', '流行病学', '健康管理',
        ],
    },
    {
        id: 'legal',
        name: '法律领域',
        icon: '⚖️',
        types: [
            '当事人', '原告', '被告', '律师', '法官', '检察官', '证人', '鉴定人',
            '法院', '检察院', '仲裁机构', '律师事务所', '公证处',
            '案件', '民事案件', '刑事案件', '行政案件', '仲裁案件',
            '法律法规', '司法解释', '地方法规', '部门规章', '国际条约',
            '合同', '协议', '条款', '权利义务', '违约责任', '免责条款',
            '起诉', '答辩', '举证', '质证', '辩论', '判决', '裁定', '调解', '执行',
            '知识产权', '专利', '商标', '著作权', '商业秘密',
            '证据', '书证', '物证', '电子数据', '鉴定意见', '证人证言',
            '诉讼请求', '赔偿金额', '诉讼费', '律师费', '保全措施',
            '公司法务', '合规审查', '法律意见书', '尽职调查',
        ],
    },
    {
        id: 'tech',
        name: 'IT 技术',
        icon: '💻',
        types: [
            '编程语言', '框架', '库', '工具', 'API', 'SDK',
            '系统架构', '微服务', '数据库', '缓存', '消息队列', '中间件',
            '服务器', '容器', '集群', '云服务', '网络设备', '存储设备',
            '代码仓库', '分支', '版本', '发布', '部署', '回滚',
            '需求', '功能模块', '技术方案', '设计文档', '接口文档',
            'Bug', '漏洞', '故障', '告警', '性能瓶颈', '技术债务',
            '开发人员', '产品经理', '测试人员', '运维人员', '架构师',
            '开发流程', '敏捷迭代', '代码评审', '持续集成', '持续部署',
            '安全策略', '权限控制', '数据加密', '认证授权', '渗透测试',
            '人工智能', '机器学习', '深度学习', '大模型', '数据管道',
        ],
    },
    {
        id: 'education',
        name: '教育领域',
        icon: '📚',
        types: [
            '学生', '教师', '教授', '导师', '辅导员', '校长',
            '学校', '院系', '教研室', '实验室', '图书馆', '教育机构',
            '课程', '教材', '教学大纲', '课程标准', '教学计划', '学分',
            '考试', '测评', '成绩', '学位', '毕业论文', '答辩',
            '专业', '学科', '研究方向', '学术论文', '科研项目', '课题',
            '教学方法', '在线教学', '混合式教学', '翻转课堂', '案例教学',
            '招生', '录取', '转专业', '休学', '退学', '奖学金', '助学金',
            '教育政策', '教学评估', '学科竞赛', '产学研合作', '校企合作',
            '教育技术', '学习平台', '教学资源', '知识图谱', '自适应学习',
        ],
    },
];

export interface SettingsSlice {
    aiModel: string;
    aiApiKey: string;
    aiBaseUrl: string;
    aiEmbeddingModel: string;
    aiEmbeddingApiKey: string;
    aiEmbeddingBaseUrl: string;
    systemPrompt: string;
    docParserEngine: string;
    maxConcurrentTasks: number;
    language: 'zh' | 'en';
    graphEntityTypes: string[];
    customEntityTemplates: EntityTypeTemplate[];
    imaClientId: string;
    imaApiKey: string;
    
    setAiModel: (model: string) => void;
    setAiApiKey: (apiKey: string) => void;
    setAiBaseUrl: (baseUrl: string) => void;
    setAiEmbeddingModel: (model: string) => void;
    setAiEmbeddingApiKey: (apiKey: string) => void;
    setAiEmbeddingBaseUrl: (baseUrl: string) => void;
    setSystemPrompt: (prompt: string) => void;
    setDocParserEngine: (engine: string) => void;
    setMaxConcurrentTasks: (tasks: number) => void;
    setLanguage: (lang: 'zh' | 'en') => void;
    setGraphEntityTypes: (types: string[]) => void;
    addCustomEntityTemplate: (template: EntityTypeTemplate) => void;
    updateCustomEntityTemplate: (id: string, updates: Partial<EntityTypeTemplate>) => void;
    removeCustomEntityTemplate: (id: string) => void;
    setImaClientId: (clientId: string) => void;
    setImaApiKey: (apiKey: string) => void;
}

export const createSettingsSlice: StateCreator<
    CanvasState,
    [],
    [],
    SettingsSlice
> = (set) => ({
    aiModel: 'deepseek-v4-flash',
    aiApiKey: '',
    aiBaseUrl: 'https://api.deepseek.com/v1',
    aiEmbeddingModel: 'BAAI/bge-m3',
    aiEmbeddingApiKey: '',
    aiEmbeddingBaseUrl: 'https://api.siliconflow.cn/v1',
    systemPrompt: 'You are a helpful AI assistant in a knowledge canvas environment. Use the provided context to answer the user request. Output in Markdown.',
    docParserEngine: 'docling',
    maxConcurrentTasks: 2,
    language: (localStorage.getItem('brainhole-language') as 'zh' | 'en') || 'zh',
    graphEntityTypes: DEFAULT_GRAPH_ENTITY_TYPES,
    customEntityTemplates: [],
    imaClientId: '',
    imaApiKey: '',

    setAiModel: (model) => set({ aiModel: model }),
    setAiApiKey: (apiKey) => set({ aiApiKey: apiKey }),
    setAiBaseUrl: (baseUrl) => set({ aiBaseUrl: baseUrl }),
    setAiEmbeddingModel: (model) => set({ aiEmbeddingModel: model }),
    setAiEmbeddingApiKey: (apiKey) => set({ aiEmbeddingApiKey: apiKey }),
    setAiEmbeddingBaseUrl: (baseUrl) => set({ aiEmbeddingBaseUrl: baseUrl }),
    setSystemPrompt: (prompt) => set({ systemPrompt: prompt }),
    setDocParserEngine: (engine) => {
        set({ docParserEngine: engine });
        if (window.electronAPI && window.electronAPI.vault && window.electronAPI.vault.updateSettings) {
            window.electronAPI.vault.updateSettings({ docParserEngine: engine });
        }
    },
    setMaxConcurrentTasks: (tasks) => {
        set({ maxConcurrentTasks: tasks });
        if (window.electronAPI && window.electronAPI.vault && window.electronAPI.vault.updateSettings) {
            window.electronAPI.vault.updateSettings({ maxConcurrentTasks: tasks });
        }
    },
    setLanguage: (lang) => {
        localStorage.setItem('brainhole-language', lang);
        import('@/i18n/index').then(({ default: i18n }) => {
            i18n.changeLanguage(lang);
        });
        // Notify main process to rebuild native menu
        if (window.electronAPI?.setLanguage) {
            window.electronAPI.setLanguage(lang);
        }
        set({ language: lang });
    },
    setGraphEntityTypes: (types) => set({ graphEntityTypes: types }),
    addCustomEntityTemplate: (template) => set((state) => ({ 
        customEntityTemplates: [...state.customEntityTemplates, template] 
    })),
    updateCustomEntityTemplate: (id, updates) => set((state) => ({
        customEntityTemplates: state.customEntityTemplates.map(tpl => 
            tpl.id === id ? { ...tpl, ...updates } : tpl
        )
    })),
    removeCustomEntityTemplate: (id) => set((state) => ({
        customEntityTemplates: state.customEntityTemplates.filter(tpl => tpl.id !== id)
    })),
    setImaClientId: (clientId) => set({ imaClientId: clientId }),
    setImaApiKey: (apiKey) => set({ imaApiKey: apiKey }),
});

