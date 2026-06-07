import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import GraphWorker from './graph.worker?worker';
import { Loader2, Maximize, Minimize, RefreshCw, ZoomIn, ZoomOut, X, Info, Network, Search, Filter, FileText, BookOpen, AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useCanvasStore } from '@/stores/canvasStore';

interface GraphViewerProps {
    filePath: string;
}

interface GraphNode extends d3.SimulationNodeDatum {
    id: string;
    title: string;
    type: string;
    description: string;
    degree: number;
    community?: string;
    neighbors: Set<string>;
    text_unit_ids?: string[];
    humanReadableId?: string;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
    id: string;
    source: string | GraphNode;
    target: string | GraphNode;
    weight: number;
    description: string;
    text_unit_ids?: string[];
    humanReadableId?: string;
}

interface SourceDocument {
    id: string;
    title: string;
}

export const GraphViewer = ({ filePath }: GraphViewerProps) => {
  const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<HTMLCanvasElement>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [graphData, setGraphData] = useState<{ nodes: GraphNode[], links: GraphLink[] } | null>(null);
    // Source tracing: text_unit_id → document_id, document_id → document title
    const [textUnitDocMap, setTextUnitDocMap] = useState<Map<string, string>>(new Map());
    const [documentMap, setDocumentMap] = useState<Map<string, SourceDocument>>(new Map());

    const isDarwin = navigator.userAgent.includes('Mac');
    const [selectedItem, setSelectedItem] = useState<{ type: 'node' | 'edge'; data: any } | null>(null);
    
    const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
    const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const positionsRef = useRef<Float32Array | null>(null);
    const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
    const hoverItemRef = useRef<{ type: 'node' | 'edge'; data: any } | null>(null);

    const canvasSelectionRef = useRef<d3.Selection<HTMLCanvasElement, unknown, null, undefined> | null>(null);
    const selectedItemRef = useRef<{ type: 'node' | 'edge'; data: any } | null>(null);
    const currentScaleRef = useRef(1);
    const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [selectedTypeFilters, setSelectedTypeFilters] = useState<Set<string>>(new Set());
    const [showFilters, setShowFilters] = useState(false);
    const selectedTypeFiltersRef = useRef<Set<string>>(new Set());
    const simulatedNodesMapRef = useRef<Map<string, GraphNode>>(new Map());

    const typeColorMap = useMemo(() => {
        if (!graphData) return new Map<string, string>();
        const scale = d3.scaleOrdinal(d3.schemePaired);
        const map = new Map<string, string>();
        graphData.nodes.forEach(n => {
            if (!map.has(n.type)) map.set(n.type, scale(n.type));
        });
        return map;
    }, [graphData]);

    const nodeTypes = useMemo(() => Array.from(typeColorMap.keys()).sort(), [typeColorMap]);

    const handleNodeSelect = useCallback((rawNode: GraphNode) => {
        const node = simulatedNodesMapRef.current.get(rawNode.id) || rawNode;
        setSelectedItem({ type: 'node', data: node });
        setSearchQuery('');
        setIsSearchFocused(false);
        if (canvasSelectionRef.current && zoomRef.current && node.x !== undefined && node.y !== undefined) {
             const width = containerRef.current?.clientWidth || 800;
             const height = containerRef.current?.clientHeight || 600;
             // Scale moderately into view
             const scale = Math.max(1.5, currentScaleRef.current);
             canvasSelectionRef.current.transition().duration(500).call(
                 zoomRef.current.transform, 
                 d3.zoomIdentity.translate(width / 2 - node.x * scale, height / 2 - node.y * scale).scale(scale)
             );
        }
    }, [setSelectedItem, setSearchQuery, setIsSearchFocused]);

    const handleEdgeSelect = useCallback((rawEdge: GraphLink) => {
        setSelectedItem({ type: 'edge', data: rawEdge });
        setSearchQuery('');
        setIsSearchFocused(false);
        if (canvasSelectionRef.current && zoomRef.current) {
             let src: any = rawEdge.source;
             let tgt: any = rawEdge.target;
             if (typeof src === 'string') src = simulatedNodesMapRef.current.get(src) || src;
             if (typeof tgt === 'string') tgt = simulatedNodesMapRef.current.get(tgt) || tgt;
             
             if (src.x !== undefined && src.y !== undefined && tgt.x !== undefined && tgt.y !== undefined) {
                 const centerX = (src.x + tgt.x) / 2;
                 const centerY = (src.y + tgt.y) / 2;
                 const width = containerRef.current?.clientWidth || 800;
                 const height = containerRef.current?.clientHeight || 600;
                 // Scale moderately into view
                 const scale = Math.max(1.5, currentScaleRef.current);
                 canvasSelectionRef.current.transition().duration(500).call(
                     zoomRef.current.transform, 
                     d3.zoomIdentity.translate(width / 2 - centerX * scale, height / 2 - centerY * scale).scale(scale)
                 );
             }
        }
    }, [setSelectedItem, setSearchQuery, setIsSearchFocused]);

    const searchResults = useMemo(() => {
        if (!graphData) return [];
        let results = graphData.nodes;
        if (selectedTypeFilters.size > 0) {
            results = results.filter(n => selectedTypeFilters.has(n.type));
        }
        if (!searchQuery.trim()) return [];
        
        const query = searchQuery.toLowerCase();
        return results.filter(n => 
            (n.title || '').toLowerCase().includes(query) || 
            (n.type || '').toLowerCase().includes(query) ||
            (n.description || '').toLowerCase().includes(query) ||
            ((n as any).humanReadableId === query)
        ).slice(0, 8);
    }, [searchQuery, selectedTypeFilters, graphData]);

    useEffect(() => {
        selectedItemRef.current = selectedItem;
    }, [selectedItem]);

    useEffect(() => {
        selectedTypeFiltersRef.current = selectedTypeFilters;
    }, [selectedTypeFilters]);

    // Auto-select exact match when searchQuery is active (resolves cross-tab sync delay)
    useEffect(() => {
        if (!graphData || !searchQuery) return;
        
        const parts = searchQuery.split(':');
        const isEntityQuery = parts.length > 1 ? parts[0] === 'entities' : true;
        const isRelQuery = parts.length > 1 ? parts[0] === 'relationships' : true;
        const queryId = parts.length > 1 ? parts[1] : searchQuery;
        
        let found = false;
        if (isEntityQuery || !isRelQuery) {
            const targetNode = graphData.nodes.find((n: any) => n.humanReadableId === queryId);
            if (targetNode) {
                handleNodeSelect(targetNode);
                found = true;
            }
        }
        
        if (!found && (isRelQuery || !isEntityQuery)) {
            const targetEdge = graphData.links.find((l: any) => l.humanReadableId === queryId);
            if (targetEdge) {
                handleEdgeSelect(targetEdge);
            }
        }
    }, [graphData, searchQuery, handleNodeSelect, handleEdgeSelect]);

    // Handle external search triggers (e.g. from OutputNodeContent clicking on a tag)
    useEffect(() => {
        const handleGraphSearch = (e: any) => {
            const { filePath: targetPath, query } = e.detail;
            if (targetPath === filePath && query) {
                setSearchQuery(query);
                setIsSearchFocused(true);
            }
        };
        window.addEventListener('graph-search', handleGraphSearch);
        return () => window.removeEventListener('graph-search', handleGraphSearch);
    }, [filePath]);

    // Helper: resolve text_unit_ids → unique source document titles
    const getSourceDocuments = useCallback((textUnitIds?: string[]): SourceDocument[] => {
        if (!textUnitIds?.length) return [];
        const seen = new Set<string>();
        const docs: SourceDocument[] = [];
        for (const tuId of textUnitIds) {
            const docId = textUnitDocMap.get(tuId);
            if (docId && !seen.has(docId)) {
                seen.add(docId);
                const doc = documentMap.get(docId);
                if (doc) {
                    docs.push(doc);
                }
            }
        }
        return docs;
    }, [textUnitDocMap, documentMap]);

    useEffect(() => {
        let isMounted = true;

        /**
         * Normalize messy entity types produced by LLM:
         * - "Location|Yantai City is..." → "Location" (strip descriptions after |)
         * - "Organization|Location" → "Organization"  (take first type only)
         * - "Location" → "Location"       (de-duplicate repeated chars)
         * - "Loc" → "Location"            (fuzzy match to canonical type)
         * - "Core Term|Tech Doc" → "Core Term"
         */
        const CANONICAL_TYPES = useCanvasStore.getState().graphEntityTypes || [
            '人物', '组织机构', '位置与地点', '项目任务', '产品服务',
            '目标与规划', '独立事件', '行业领域', '前沿技术', '技术文档',
            '工具框架', '信息与消息', '核心机制', '总结笔记', '核心账号与凭据',
            '硬件服务器设备', '动作执行', '业务策略', '核心术语概念',
            '原理论点', '问题与缺陷', '解决方案', '标准规范与法规', '数据指标',
        ];

        const normalizeEntityType = (raw: string): string => {
            if (!raw || raw === 'unknown') return raw;

            // Step 1: Take the first segment before | (strip descriptions / secondary types)
            let t = raw.split('|')[0].trim();

            // Step 2: Remove repeated adjacent characters like '&&' -> '&'
            t = t.replace(/([\u4e00-\u9fff])\1+/g, '$1');

            // Step 3: Try exact match to canonical
            if (CANONICAL_TYPES.includes(t)) return t;

            // Step 4: Fuzzy match — find canonical type that best matches
            // (check if the cleaned type is a substring of a canonical type or vice versa)
            for (const ct of CANONICAL_TYPES) {
                const ctDedup = ct.replace(/([\u4e00-\u9fff])\1+/g, '$1');
                if (t === ctDedup || ct.includes(t) || t.includes(ct)) return ct;
            }

            return t; // return cleaned version even if no canonical match
        };
        
        const loadGraph = async () => {
            try {
                setLoading(true);
                setError(null);
                
                const [nodesData, edgesData, docsData, textUnitsData] = await Promise.all([
                    window.electronAPI.graph.getNodes(filePath),
                    window.electronAPI.graph.getEdges(filePath),
                    window.electronAPI.graph.getDocuments(filePath).catch(() => []),
                    window.electronAPI.graph.getTextUnits(filePath).catch(() => []),
                ]);
                
                if (!nodesData?.length) {
                    throw new Error('No nodes found. The graph might not have been indexed properly.');
                }

                const nodeNeighbors = new Map<string, Set<string>>();

                const nodes: GraphNode[] = nodesData.map((n: any) => {
                    const idVal = n.title || n.name || n.human_readable_id || n.id;
                    const degreeVal = typeof n.degree === 'bigint' ? Number(n.degree) : (n.degree || 1);
                    const id = String(idVal !== undefined ? idVal : 'unknown');
                    nodeNeighbors.set(id, new Set());
                    
                    // Normalize text_unit_ids from parquet (may be array or comma-separated string)
                    let tuIds: string[] = [];
                    if (Array.isArray(n.text_unit_ids)) {
                        tuIds = n.text_unit_ids.map(String);
                    } else if (typeof n.text_unit_ids === 'string') {
                        tuIds = n.text_unit_ids.split(',').map((s: string) => s.trim()).filter(Boolean);
                    }

                    return {
                        id,
                        title: String(idVal !== undefined ? idVal : 'unknown'),
                        type: normalizeEntityType(String(n.type || n.entity_type || 'unknown')),
                        description: String(n.description || ''),
                        degree: degreeVal,
                        community: String(n.community || (n.community_ids && n.community_ids[0]) || ''),
                        neighbors: nodeNeighbors.get(id)!,
                        text_unit_ids: tuIds,
                        humanReadableId: n.human_readable_id ? String(n.human_readable_id) : undefined,
                    };
                });

                const links: GraphLink[] = (edgesData || []).map((e: any, i: number) => {
                    const weightVal = typeof e.weight === 'bigint' ? Number(e.weight) : 
                                      typeof e.rank === 'bigint' ? Number(e.rank) : 
                                      (e.weight || e.rank || 1);
                    const source = String(e.source || e.head || e.from || '');
                    const target = String(e.target || e.tail || e.to || '');
                    
                    if (nodeNeighbors.has(source)) nodeNeighbors.get(source)!.add(target);
                    if (nodeNeighbors.has(target)) nodeNeighbors.get(target)!.add(source);

                    // Normalize text_unit_ids for edges too
                    let eTuIds: string[] = [];
                    if (Array.isArray(e.text_unit_ids)) {
                        eTuIds = e.text_unit_ids.map(String);
                    } else if (typeof e.text_unit_ids === 'string') {
                        eTuIds = e.text_unit_ids.split(',').map((s: string) => s.trim()).filter(Boolean);
                    }

                    return {
                        id: `link-${i}`,
                        source,
                        target,
                        weight: weightVal,
                        description: String(e.description || ''),
                        text_unit_ids: eTuIds,
                        humanReadableId: e.human_readable_id ? String(e.human_readable_id) : undefined,
                    };
                }).filter((e: any) => e.source && e.target);

                // Build source tracing maps
                const docMap = new Map<string, SourceDocument>();
                for (const d of (docsData || [])) {
                    const docId = String(d.id || d.human_readable_id || '');
                    docMap.set(docId, {
                        id: docId,
                        title: String(d.title || d.name || 'Unknown'),
                    });
                }

                const tuDocMap = new Map<string, string>();
                for (const tu of (textUnitsData || [])) {
                    const tuId = String(tu.id || '');
                    const docId = String(tu.document_id || tu.document_ids?.[0] || '');
                    if (tuId && docId) {
                        tuDocMap.set(tuId, docId);
                    }
                }

                if (isMounted) {
                    setGraphData({ nodes, links });
                    setDocumentMap(docMap);
                    setTextUnitDocMap(tuDocMap);
                }
            } catch (err: any) {
                console.error(err);
                if (isMounted) setError(err.message || 'Failed to load graph data');
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        loadGraph();
        return () => { isMounted = false; };
    }, [filePath]);

    useEffect(() => {
        if (loading || error || !graphData || !containerRef.current || !svgRef.current) return;

        const canvas = svgRef.current as unknown as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvasCtxRef.current = ctx;

        // Resize helper — called on init and by ResizeObserver
        const resizeCanvas = () => {
            if (!containerRef.current) return;
            const w = containerRef.current.clientWidth;
            const h = containerRef.current.clientHeight;
            if (w === 0 || h === 0) return;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            // Re-apply DPR scale (getContext keeps state across width/height resets)
            const freshCtx = canvas.getContext('2d');
            if (freshCtx) freshCtx.scale(dpr, dpr);
            canvasSizeRef.current = { width: w, height: h };
        };

        resizeCanvas();
        const width = canvasSizeRef.current.width;
        const height = canvasSizeRef.current.height;

        // Watch container size changes
        const resizeObserver = new ResizeObserver(() => resizeCanvas());
        resizeObserver.observe(containerRef.current);

        const nodes = graphData.nodes;
        const links = graphData.links;
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const nodeIndexMap = new Map(nodes.map((n, i) => [n.id, i]));
        simulatedNodesMapRef.current = nodeMap;

        // Setup Zoom
        const canvasSelection = d3.select(canvas);
        canvasSelectionRef.current = canvasSelection as any;
        
        const zoom = d3.zoom<HTMLCanvasElement, unknown>()
            .scaleExtent([0.05, 10])
            .on('zoom', (event) => {
                transformRef.current = event.transform;
                currentScaleRef.current = event.transform.k;
            });
            
        zoomRef.current = zoom;
        canvasSelection.call(zoom).on('wheel.zoom', null);
        
        canvasSelection.on('wheel', (event: WheelEvent) => {
            event.preventDefault();
            const currentTransform = transformRef.current;
            if (event.ctrlKey || event.metaKey) {
                const point = d3.pointer(event, canvas);
                const scaleChange = Math.pow(2, -event.deltaY * 0.01);
                zoom.scaleBy(canvasSelection, scaleChange, point);
            } else {
                zoom.translateBy(canvasSelection, -event.deltaX / currentTransform.k, -event.deltaY / currentTransform.k);
            }
        });

        // Setup hover and click on Canvas
        let isDraggingCanvas = false;
        let dragNode: any = null;

        canvasSelection.on('mousemove', (event) => {
            if (isDraggingCanvas) {
                if (dragNode && workerRef.current) {
                    const [mouseX, mouseY] = d3.pointer(event, canvas);
                    const invert = transformRef.current.invert([mouseX, mouseY]);
                    workerRef.current.postMessage({ type: 'drag', data: { id: dragNode.id, x: invert[0], y: invert[1] } });
                }
                return;
            }
            const [mouseX, mouseY] = d3.pointer(event, canvas);
            const invert = transformRef.current.invert([mouseX, mouseY]);
            const x = invert[0], y = invert[1];
            const scale = transformRef.current.k;
            
            // Find nearest node within its visual radius
            let closestNode = null;
            let closestDistSq = Infinity;
            
            // Linear scan (fast enough for 16k in JS ~ 0.5ms)
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                if (n.x === undefined || n.y === undefined) continue;
                const dx = n.x - x;
                const dy = n.y - y;
                const distSq = dx * dx + dy * dy;
                // Use the node's actual visual radius (matching draw code) + a small padding for easier interaction
                const nodeRadius = (Math.sqrt(Math.max(1, n.degree)) * 4 + 6) / Math.max(1, Math.sqrt(scale));
                const hitRadius = nodeRadius + 4 / scale; // 4px extra padding in world space
                if (distSq < hitRadius * hitRadius && distSq < closestDistSq) {
                    closestDistSq = distSq;
                    closestNode = n;
                }
            }
            
            if (closestNode) {
                if (hoverItemRef.current?.data?.id !== closestNode.id) {
                    hoverItemRef.current = { type: 'node', data: closestNode };
                    canvas.style.cursor = 'pointer';
                }
            } else {
                // Try finding edge (slower, simplified logic)
                let closestEdge = null;
                let closestEdgeDistSq = Infinity;
                const edgeHitRadiusSq = (6 / scale) * (6 / scale); // 6px visual hit radius

                if (positionsRef.current) {
                    for (let i = 0; i < links.length; i++) {
                        const l = links[i] as any;
                        const sourceId = typeof l.source === 'string' ? l.source : l.source.id;
                        const targetId = typeof l.target === 'string' ? l.target : l.target.id;
                        const sourceIdx = nodeIndexMap.get(sourceId);
                        const targetIdx = nodeIndexMap.get(targetId);
                        
                        if (sourceIdx === undefined || targetIdx === undefined) continue;
                        
                        const sx = positionsRef.current[sourceIdx * 2];
                        const sy = positionsRef.current[sourceIdx * 2 + 1];
                        const tx = positionsRef.current[targetIdx * 2];
                        const ty = positionsRef.current[targetIdx * 2 + 1];

                        if (!isFinite(sx) || !isFinite(sy) || !isFinite(tx) || !isFinite(ty)) continue;

                        // Bounding box culling for the edge
                        const minX = Math.min(sx, tx) - 10 / scale;
                        const maxX = Math.max(sx, tx) + 10 / scale;
                        const minY = Math.min(sy, ty) - 10 / scale;
                        const maxY = Math.max(sy, ty) + 10 / scale;
                        if (x < minX || x > maxX || y < minY || y > maxY) continue;

                        const l2 = (tx - sx) * (tx - sx) + (ty - sy) * (ty - sy);
                        let distSq;
                        if (l2 === 0) {
                            distSq = (x - sx) * (x - sx) + (y - sy) * (y - sy);
                        } else {
                            let t = ((x - sx) * (tx - sx) + (y - sy) * (ty - sy)) / l2;
                            t = Math.max(0, Math.min(1, t));
                            const projX = sx + t * (tx - sx);
                            const projY = sy + t * (ty - sy);
                            distSq = (x - projX) * (x - projX) + (y - projY) * (y - projY);
                        }

                        if (distSq < edgeHitRadiusSq && distSq < closestEdgeDistSq) {
                            closestEdgeDistSq = distSq;
                            closestEdge = l;
                        }
                    }
                }

                if (closestEdge) {
                    if (hoverItemRef.current?.data?.id !== closestEdge.id) {
                        hoverItemRef.current = { type: 'edge', data: closestEdge };
                        canvas.style.cursor = 'pointer';
                    }
                } else if (hoverItemRef.current) {
                    hoverItemRef.current = null;
                    canvas.style.cursor = 'default';
                }
            }
        });

        canvasSelection.on('mousedown', (event) => {
            if (hoverItemRef.current?.type === 'node') {
                isDraggingCanvas = true;
                dragNode = hoverItemRef.current.data;
                if (workerRef.current) {
                    workerRef.current.postMessage({ type: 'reheat' });
                }
            }
        });

        canvasSelection.on('mouseup', () => {
            if (isDraggingCanvas) {
                isDraggingCanvas = false;
                if (dragNode && workerRef.current) {
                    workerRef.current.postMessage({ type: 'drag', data: { id: dragNode.id, x: null, y: null } });
                }
                dragNode = null;
            }
        });

        canvasSelection.on('click', () => {
            // if (event.defaultPrevented) return;
            if (hoverItemRef.current) {
                setSelectedItem(hoverItemRef.current);
            } else {
                setSelectedItem(null);
            }
        });

        // Initialize Web Worker
        if (workerRef.current) {
            workerRef.current.terminate();
        }
        
        workerRef.current = new GraphWorker();
        
        const workerNodes = nodes.map(n => ({ id: n.id, degree: n.degree }));
        const workerLinks = links.map(l => ({ 
            id: l.id, 
            source: typeof l.source === 'string' ? l.source : l.source.id, 
            target: typeof l.target === 'string' ? l.target : l.target.id 
        }));

        workerRef.current.postMessage({
            type: 'init',
            data: { nodes: workerNodes, links: workerLinks, width, height }
        });

        workerRef.current.onmessage = (event) => {
            const { type, positions } = event.data;
            if ((type === 'tick' || type === 'end') && positions) {
                positionsRef.current = positions;
                // Sync positions back to nodes array for hover logic
                for (let i = 0; i < nodes.length; i++) {
                    nodes[i].x = positions[i * 2];
                    nodes[i].y = positions[i * 2 + 1];
                }
            }
        };

        // Render Loop
        const draw = () => {
            if (!ctx || !canvas) return;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            ctx.save();
            ctx.translate(transformRef.current.x, transformRef.current.y);
            ctx.scale(transformRef.current.k, transformRef.current.k);

            const scale = transformRef.current.k;
            const positions = positionsRef.current;
            
            if (positions) {
                // Use live canvas size from ref
                const { width: curW, height: curH } = canvasSizeRef.current;
                // Viewport Culling Bounds
                const x0 = -transformRef.current.x / scale;
                const y0 = -transformRef.current.y / scale;
                const x1 = x0 + curW / scale;
                const y1 = y0 + curH / scale;

                const hasTypeFilters = selectedTypeFiltersRef.current.size > 0;
                const sItem = selectedItemRef.current;
                const hItem = hoverItemRef.current;

                // 1. Draw Links
                ctx.globalAlpha = 0.6;
                ctx.lineWidth = 1;
                for (let i = 0; i < links.length; i++) {
                    const l = links[i] as any;
                    const sourceId = typeof l.source === 'string' ? l.source : l.source.id;
                    const targetId = typeof l.target === 'string' ? l.target : l.target.id;
                    const sourceIdx = nodeIndexMap.get(sourceId);
                    const targetIdx = nodeIndexMap.get(targetId);
                    
                    if (sourceIdx === undefined || targetIdx === undefined) continue;
                    
                    const sx = positions[sourceIdx * 2];
                    const sy = positions[sourceIdx * 2 + 1];
                    const tx = positions[targetIdx * 2];
                    const ty = positions[targetIdx * 2 + 1];

                    // Guard against non-finite coordinates (worker hasn't computed yet)
                    if (!isFinite(sx) || !isFinite(sy) || !isFinite(tx) || !isFinite(ty)) continue;

                    // Culling
                    if ((sx < x0 && tx < x0) || (sx > x1 && tx > x1) || (sy < y0 && ty < y0) || (sy > y1 && ty > y1)) continue;

                    const sourceNode = nodes[sourceIdx];
                    const targetNode = nodes[targetIdx];

                    if (hasTypeFilters) {
                        if (!selectedTypeFiltersRef.current.has(sourceNode.type) || !selectedTypeFiltersRef.current.has(targetNode.type)) continue;
                    }

                    // Selection highlight
                    let isHighlighted = false;
                    let isDimmed = false;

                    if (sItem || hItem) {
                        const focusNode = sItem?.type === 'node' ? sItem.data : (hItem?.type === 'node' ? hItem.data : null);
                        const focusEdge = sItem?.type === 'edge' ? sItem.data : (hItem?.type === 'edge' ? hItem.data : null);

                        if (focusNode) {
                            if (sourceNode.id === focusNode.id || targetNode.id === focusNode.id) isHighlighted = true;
                            else isDimmed = true;
                        } else if (focusEdge) {
                            if (l.id === focusEdge.id) isHighlighted = true;
                            else isDimmed = true;
                        }
                    }

                    if (isDimmed) ctx.globalAlpha = 0.1;
                    else if (isHighlighted) ctx.globalAlpha = 1.0;
                    else ctx.globalAlpha = 0.6;

                    ctx.lineWidth = (isHighlighted ? Math.sqrt(Math.max(1, l.weight)) + 1.5 : Math.sqrt(Math.max(1, l.weight))) / Math.max(1, scale * 0.5);
                    
                    // Simple line instead of gradient for performance if zoomed out
                    if (scale < 0.5 && !isHighlighted) {
                        ctx.strokeStyle = '#cbd5e1';
                    } else {
                        const grad = ctx.createLinearGradient(sx, sy, tx, ty);
                        grad.addColorStop(0, typeColorMap.get(sourceNode.type) || '#999');
                        grad.addColorStop(1, typeColorMap.get(targetNode.type) || '#999');
                        ctx.strokeStyle = grad;
                    }

                    ctx.beginPath();
                    ctx.moveTo(sx, sy);
                    ctx.lineTo(tx, ty);
                    ctx.stroke();
                }

                // 2. Draw Nodes
                for (let i = 0; i < nodes.length; i++) {
                    const n = nodes[i];
                    const nx = positions[i * 2];
                    const ny = positions[i * 2 + 1];

                    // Guard against non-finite coordinates
                    if (!isFinite(nx) || !isFinite(ny)) continue;

                    // Culling
                    const r = Math.sqrt(Math.max(1, n.degree)) * 4 + 6;
                    if (nx + r < x0 || nx - r > x1 || ny + r < y0 || ny - r > y1) continue;

                    if (hasTypeFilters && !selectedTypeFiltersRef.current.has(n.type)) continue;

                    let isHighlighted = false;
                    let isDimmed = false;

                    if (sItem || hItem) {
                        const focusNode = sItem?.type === 'node' ? sItem.data : (hItem?.type === 'node' ? hItem.data : null);
                        const focusEdge = sItem?.type === 'edge' ? sItem.data : (hItem?.type === 'edge' ? hItem.data : null);
                        
                        if (focusNode) {
                            if (n.id === focusNode.id || focusNode.neighbors.has(n.id)) isHighlighted = true;
                            else isDimmed = true;
                        } else if (focusEdge) {
                            const sourceId = typeof focusEdge.source === 'string' ? focusEdge.source : focusEdge.source?.id;
                            const targetId = typeof focusEdge.target === 'string' ? focusEdge.target : focusEdge.target?.id;
                            if (n.id === sourceId || n.id === targetId) isHighlighted = true;
                            else isDimmed = true;
                        }
                    }

                    ctx.globalAlpha = isDimmed ? 0.2 : 1.0;
                    const radius = isHighlighted ? (n.id === (sItem?.data?.id || hItem?.data?.id) ? r + 4 : r) : r;
                    
                    ctx.beginPath();
                    ctx.arc(nx, ny, radius / Math.max(1, Math.sqrt(scale)), 0, 2 * Math.PI);
                    ctx.fillStyle = typeColorMap.get(n.type) || '#999';
                    ctx.fill();
                    
                    if (isHighlighted && n.id === (sItem?.data?.id || hItem?.data?.id)) {
                        ctx.lineWidth = 3 / scale;
                        ctx.strokeStyle = '#3b82f6';
                        ctx.stroke();
                    } else {
                        ctx.lineWidth = 1 / scale;
                        ctx.strokeStyle = '#fff';
                        ctx.stroke();
                    }
                    
                    // LOD: Draw Labels only if zoomed in or highlighted
                    if ((scale >= 0.4 || isHighlighted) && (!isDimmed || isHighlighted)) {
                        ctx.globalAlpha = isDimmed ? 0.3 : 1.0;
                        ctx.fillStyle = isHighlighted && n.id === (sItem?.data?.id || hItem?.data?.id) ? '#1e3a8a' : '#374151';
                        ctx.font = `${isHighlighted && n.id === (sItem?.data?.id || hItem?.data?.id) ? 'bold' : 'normal'} ${11 / Math.max(1, Math.sqrt(scale))}px sans-serif`;
                        ctx.fillText(n.title, nx + radius / Math.max(1, Math.sqrt(scale)) + 6 / scale, ny + 4 / scale);
                    }
                }
            }

            ctx.restore();
            animationFrameRef.current = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (workerRef.current) workerRef.current.terminate();
            resizeObserver.disconnect();
        };
    }, [graphData, loading, error, typeColorMap]);

    // Handle Selection State Effect
    
    const handleZoomIn = () => {
        if (canvasSelectionRef.current && zoomRef.current) {
            zoomRef.current.scaleBy(canvasSelectionRef.current.transition().duration(300) as any, 1.3);
        }
    };

    const handleZoomOut = () => {
        if (canvasSelectionRef.current && zoomRef.current) {
            zoomRef.current.scaleBy(canvasSelectionRef.current.transition().duration(300) as any, 0.7);
        }
    };

    const handleResetZoom = () => {
        if (canvasSelectionRef.current && zoomRef.current) {
            zoomRef.current.transform(canvasSelectionRef.current.transition().duration(400) as any, d3.zoomIdentity);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-slate-50 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p className="font-medium tracking-wide">{t('graph.viewer.buildingVisual')}</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-slate-50 text-slate-500 p-8 text-center">
                <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                <div className="text-red-500 font-medium mb-1">{t('graph.viewer.loadFailed')}</div>
                <p className="text-sm opacity-80">{error}</p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className={`${isFullscreen ? 'fixed inset-0 z-[9999]' : 'relative w-full h-full'} bg-slate-50`} style={isFullscreen ? { WebkitAppRegion: 'no-drag' } as any : undefined}>
            <canvas ref={svgRef} className="w-full h-full outline-none" tabIndex={0} />
            
            {/* Status Bar */}
            {graphData && (
                <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 text-xs font-medium text-slate-600 flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span>{t('graph.viewer.nodes', { count: graphData.nodes.length })}</span>
                    </div>
                    <div className="w-px h-3 bg-slate-300" />
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-px bg-slate-400" />
                        <span>{t('graph.viewer.edges', { count: graphData.links.length })}</span>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="absolute top-4 right-4 flex flex-col gap-2">
                <div className="flex flex-col bg-white/90 backdrop-blur-md rounded-xl shadow-md border border-slate-200 overflow-hidden">
                    <button onClick={handleZoomIn} className="p-2.5 hover:bg-slate-50 text-slate-600 transition-colors border-b border-slate-100" title={t('graph.viewer.zoomIn')}>
                        <ZoomIn className="w-4 h-4" />
                    </button>
                    <button onClick={handleResetZoom} className="p-2.5 hover:bg-slate-50 text-slate-600 transition-colors border-b border-slate-100" title={t('graph.viewer.resetZoom')}>
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button onClick={handleZoomOut} className="p-2.5 hover:bg-slate-50 text-slate-600 transition-colors" title={t('graph.viewer.zoomOut')}>
                        <ZoomOut className="w-4 h-4" />
                    </button>
                </div>
                <div className="flex flex-col bg-white/90 backdrop-blur-md rounded-xl shadow-md border border-slate-200 overflow-hidden">
                    <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2.5 hover:bg-slate-50 text-slate-600 transition-colors" title={isFullscreen ? t('graph.viewer.exitFullscreen') : t('graph.viewer.fullscreen')}>
                        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Top Left Layout: Search and Context Panel */}
            <div className={cn(
                "absolute left-4 w-80 flex flex-col gap-3 z-10 max-h-[calc(100%-5rem)] pointer-events-none",
                (isFullscreen && isDarwin) ? "top-12" : "top-4"
            )}>
                
                {/* Search Box & Filters */}
                {/* Search Box & Filters */}
                <div className="flex-shrink-0 flex flex-col gap-2 relative pointer-events-auto w-full">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 absolute left-3 text-slate-500 z-10 pointer-events-none top-1/2 -translate-y-1/2" />
                            <input 
                                type="text" 
                                placeholder={t('graph.viewer.searchPlaceholder')} 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onFocus={() => { setIsSearchFocused(true); setShowFilters(false); }}
                                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                                className="w-full bg-white/95 backdrop-blur-xl border border-slate-200 rounded-xl pl-[34px] pr-8 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-slate-700 placeholder:text-slate-400"
                            />
                            {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 z-10"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}

                            {/* Search Dropdown */}
                            {isSearchFocused && searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-xl shadow-lg overflow-hidden py-1 max-h-60 overflow-y-auto z-20">
                                    {searchResults.map(node => (
                                        <button
                                            key={node.id}
                                            onClick={() => handleNodeSelect(node)}
                                            className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors flex flex-col gap-0.5 border-b border-slate-100 last:border-0"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-semibold text-slate-800 text-sm truncate flex-1">{node.title}</span>
                                                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium flex-shrink-0 truncate max-w-[80px] text-center" style={{ color: typeColorMap.get(node.type) }}>{node.type}</span>
                                            </div>
                                            <div className="text-xs text-slate-500 truncate" title={node.description}>{node.description || t('graph.viewer.noDescription')}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {isSearchFocused && searchQuery && searchResults.length === 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-xl shadow-lg p-3 text-center text-sm text-slate-500 z-20">
                                    未找到匹配节点
                                </div>
                            )}
                        </div>

                        {/* Filter Toggle */}
                        {nodeTypes.length > 0 && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowFilters(!showFilters)}
                                    className={cn(
                                        "flex-shrink-0 w-[42px] h-[42px] flex items-center justify-center rounded-xl border transition-all shadow-sm",
                                        (showFilters || selectedTypeFilters.size > 0) 
                                            ? "bg-blue-50 border-blue-400 text-blue-600 shadow-blue-500/10" 
                                            : "bg-white/95 backdrop-blur-xl border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                    )}
                                    title={t('graph.viewer.categoryFilter')}
                                >
                                    <Filter className="w-4 h-4" />
                                </button>
                                {selectedTypeFilters.size > 0 && (
                                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-white animate-in zoom-in">
                                        {selectedTypeFilters.size}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Filter Pills Dropdown */}
                    {showFilters && nodeTypes.length > 0 && (
                        <div className="absolute top-[50px] right-0 w-[300px] bg-white/95 backdrop-blur-xl border border-slate-200 rounded-xl shadow-xl p-3 z-30 animate-in fade-in slide-in-from-top-2 duration-150 flex flex-col gap-2">
                            <div className="text-xs font-semibold text-slate-400 mb-2 flex justify-between items-center px-1">
                                <span>{t('graph.viewer.filterByType')}</span>
                                {selectedTypeFilters.size > 0 && (
                                    <button 
                                        onClick={() => setSelectedTypeFilters(new Set())} 
                                        className="text-blue-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
                                    >
                                        <RefreshCw className="w-3 h-3"/> 重置
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-1.5 max-h-[220px] overflow-y-auto scrollbar-thin rounded-lg p-1">
                                {nodeTypes.map(t => {
                                    const isSelected = selectedTypeFilters.has(t);
                                    return (
                                        <button 
                                            key={t}
                                            onClick={() => {
                                                const newFilters = new Set(selectedTypeFilters);
                                                if (newFilters.has(t)) newFilters.delete(t);
                                                else newFilters.add(t);
                                                setSelectedTypeFilters(newFilters);
                                            }}
                                            className={cn(
                                                "px-2.5 py-1 rounded-full text-xs flex items-center gap-1.5 border transition-all hover:scale-105 active:scale-95",
                                                isSelected 
                                                    ? "border-blue-400 bg-blue-500 text-white shadow-md font-medium" 
                                                    : "border-slate-200/80 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:border-slate-300"
                                            )}
                                        >
                                            <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: typeColorMap.get(t) || '#ccc' }} />
                                            <span className="truncate max-w-[120px]" title={t}>{t}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Properties Panel */}
                {selectedItem && (
                    <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col flex-1 min-h-0 animate-in fade-in zoom-in-95 duration-200 pointer-events-auto">
                        <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm tracking-wide">
                                {selectedItem.type === 'node' ? (
                                    <><div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/30" />{t('graph.viewer.nodeProps')}</>
                                ) : (
                                    <><div className="w-3 h-1 bg-purple-400 rounded-full shadow-sm shadow-purple-500/30" />{t('graph.viewer.edgeProps')}</>
                                )}
                            </h3>
                            <button onClick={() => setSelectedItem(null)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto space-y-5 text-sm scrollbar-thin">
                            {selectedItem.type === 'node' ? (
                                <>
                                    <div>
                                        <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1 flex items-center gap-1"><Info className="w-3 h-3"/>{t('graph.viewer.entityName')}</div>
                                        <div className="font-semibold text-slate-900 leading-snug break-words text-base">{selectedItem.data.title}</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <div>
                                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t('graph.viewer.type')}</div>
                                            <div className="text-blue-700 bg-blue-100 border border-blue-200/50 px-2 py-0.5 rounded-md text-xs inline-flex font-medium break-all line-clamp-2" title={selectedItem.data.type}>{selectedItem.data.type}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{t('graph.viewer.degree')}</div>
                                            <div className="text-slate-700 font-mono text-sm">{selectedItem.data.degree}</div>
                                        </div>
                                    </div>
                                    {selectedItem.data.description && (
                                        <div>
                                            <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1.5">{t('graph.viewer.description')}</div>
                                            <div className="text-slate-600 leading-relaxed text-[13px] break-words bg-slate-50 p-3 rounded-xl border border-slate-100">{selectedItem.data.description}</div>
                                        </div>
                                    )}
                                    {(() => {
                                        const sourceDocs = getSourceDocuments(selectedItem.data.text_unit_ids);
                                        if (!sourceDocs.length) return null;
                                        return (
                                            <div>
                                                <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1.5 flex items-center gap-1"><BookOpen className="w-3 h-3"/>{t('graph.viewer.source')}</div>
                                                <div className="space-y-1.5">
                                                    {sourceDocs.map(doc => (
                                                        <div key={doc.id} className="flex items-center gap-2 bg-amber-50 border border-amber-200/60 rounded-lg px-3 py-2 text-[13px] text-amber-900">
                                                            <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                            <span className="truncate" title={doc.title}>{doc.title}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="text-[10px] text-slate-400 mt-1.5">{t('graph.viewer.quotes', { count: selectedItem.data.text_unit_ids?.length || 0 })}</div>
                                            </div>
                                        );
                                    })()}
                                </>
                            ) : (
                                <>
                                    <div>
                                        <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-2 flex items-center gap-1"><Network className="w-3 h-3"/>{t('graph.viewer.direction')}</div>
                                        <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                            <div className="font-medium text-blue-700 text-[13px] break-words flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                                                {selectedItem.data.source.title || selectedItem.data.source.id || selectedItem.data.source}
                                            </div>
                                            <div className="w-px h-3 bg-slate-300 ml-[3px]" />
                                            <div className="font-medium text-purple-700 text-[13px] break-words flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                                                {selectedItem.data.target.title || selectedItem.data.target.id || selectedItem.data.target}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t('graph.viewer.weight')}</div>
                                        <div className="text-slate-700 font-mono font-medium">{selectedItem.data.weight}</div>
                                    </div>
                                    {selectedItem.data.description && (
                                        <div>
                                            <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1.5">{t('graph.viewer.edgeDesc')}</div>
                                            <div className="text-slate-600 leading-relaxed text-[13px] break-words bg-slate-50 p-3 rounded-xl border border-slate-100">{selectedItem.data.description}</div>
                                        </div>
                                    )}
                                    {(() => {
                                        const sourceDocs = getSourceDocuments(selectedItem.data.text_unit_ids);
                                        if (!sourceDocs.length) return null;
                                        return (
                                            <div>
                                                <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-1.5 flex items-center gap-1"><BookOpen className="w-3 h-3"/>{t('graph.viewer.source')}</div>
                                                <div className="space-y-1.5">
                                                    {sourceDocs.map(doc => (
                                                        <div key={doc.id} className="flex items-center gap-2 bg-amber-50 border border-amber-200/60 rounded-lg px-3 py-2 text-[13px] text-amber-900">
                                                            <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                            <span className="truncate" title={doc.title}>{doc.title}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="text-[10px] text-slate-400 mt-1.5">{t('graph.viewer.quotes', { count: selectedItem.data.text_unit_ids?.length || 0 })}</div>
                                            </div>
                                        );
                                    })()}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
