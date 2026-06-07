import { Network, Database } from 'lucide-react';
import { DataNodeData } from '@/stores/canvasStore';
import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvasStore';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';

interface GraphNodeContentProps {
  nodeId: string;
  data: DataNodeData;
  isFullscreen?: boolean;
}

export function GraphNodeContent({ data, isFullscreen = false }: GraphNodeContentProps) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<{ nodes: number, edges: number } | null>(null);

  useEffect(() => {
    // If the data has a fileUrl (which is actually a local file path), 
    // attempt to load basic stats from the graph
    const loadStats = async () => {
      if (data.fileUrl) {
        let filePath = data.fileUrl;
        if (filePath.startsWith('local-file://')) {
          filePath = decodeURIComponent(filePath.replace('local-file://', ''));
        } else if (filePath.startsWith('local-asset://')) {
          filePath = decodeURIComponent(filePath.replace('local-asset://', ''));
        }
        
        try {
          const nodes = await window.electronAPI.graph.getNodes(filePath);
          const edges = await window.electronAPI.graph.getEdges(filePath);
          setStats({ nodes: nodes.length, edges: edges.length });
        } catch (e) {
          console.error("Failed to load graph stats", e);
        }
      }
    };
    
    loadStats();
  }, [data.fileUrl]);

  return (
    <div className={cn("flex flex-col h-full bg-white relative rounded-b-xl overflow-hidden", isFullscreen ? "p-8" : "p-4")}>
      <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none text-indigo-600">
        <Network size={120} />
      </div>
      
      <div className="flex flex-col items-center justify-center h-full gap-4 w-full relative z-10">
        <div className={cn(
          "bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm shrink-0",
          isFullscreen ? "w-16 h-16 rounded-2xl" : "w-12 h-12 rounded-xl"
        )}>
          <Database size={isFullscreen ? 32 : 24} />
        </div>
        
        <div className="text-center space-y-1.5">
          <h4 className={cn("font-bold text-gray-800", isFullscreen ? "text-xl" : "text-sm")}>
            {data.fileName || t('nodes.graph.kgData')}
          </h4>
          <p className={cn("text-gray-400 border-indigo-500/0", isFullscreen ? "text-sm" : "text-[10px]")}>
            {t('nodes.graph.connectPrompt')}
          </p>
        </div>
        
        {stats && (
          <div className={cn("flex items-center gap-4 mt-2 px-4 py-2 bg-slate-50 rounded-lg border border-slate-100", isFullscreen ? "text-sm" : "text-[10px]")}>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span className="text-slate-500">{t('nodes.graph.nodes')}<span className="text-slate-700 font-semibold">{stats.nodes}</span></span>
            </div>
            <div className="w-px h-3 bg-slate-200"></div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
              <span className="text-slate-500">{t('nodes.graph.edges')}<span className="text-slate-700 font-semibold">{stats.edges}</span></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
