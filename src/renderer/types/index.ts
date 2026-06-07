export interface FileData {
  file: File;
  sheets: ExcelSheet[];
  lastModified: number;
}

export interface ExcelSheet {
  name: string;
  data: any[][];
  headers?: string[];
}

export interface AnalysisResult {
  type: 'text' | 'table' | 'chart';
  content: any;
  summary?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  canvasData?: any;
}

export interface NodeData {
  label: string;
  type: 'data' | 'analysis' | 'result';
  fileData?: FileData;
  analysisCode?: string;
  analysisResult?: AnalysisResult;
  isExecuting?: boolean;
  progress?: number;
}

export interface ConnectionData {
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string;
  targetHandle: string;
}

export interface HistoryState {
  nodes: any[];
  edges: any[];
  timestamp: number;
  description: string;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  duration?: number;
}

export type NodeType = 'data' | 'analysis' | 'result';

export interface ChartConfig {
  type: 'line' | 'bar' | 'pie' | 'scatter';
  xAxis?: string;
  yAxis?: string;
  series?: string[];
  title?: string;
} 