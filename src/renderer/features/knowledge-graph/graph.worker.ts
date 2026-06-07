import * as d3 from 'd3';

// Minimal types for worker simulation
interface WorkerNode extends d3.SimulationNodeDatum {
    id: string;
    degree: number;
}

interface WorkerLink extends d3.SimulationLinkDatum<WorkerNode> {
    id: string;
    source: string | WorkerNode;
    target: string | WorkerNode;
}

let simulation: d3.Simulation<WorkerNode, WorkerLink> | null = null;
let positions: Float32Array | null = null;
const nodesMap: Map<string, number> = new Map();

self.onmessage = (event: MessageEvent) => {
    const { type, data } = event.data;

    if (type === 'init') {
        const { nodes, links, width, height } = data as {
            nodes: { id: string; degree: number }[];
            links: { id: string; source: string; target: string }[];
            width: number;
            height: number;
        };

        if (simulation) {
            simulation.stop();
        }

        // Initialize positions array [x0, y0, x1, y1, ...]
        positions = new Float32Array(nodes.length * 2);
        
        const workerNodes: WorkerNode[] = nodes.map((n, i) => {
            nodesMap.set(n.id, i);
            return {
                id: n.id,
                degree: n.degree,
            };
        });

        const workerLinks: WorkerLink[] = links.map(l => ({
            id: l.id,
            source: l.source,
            target: l.target
        }));

        simulation = d3.forceSimulation<WorkerNode>(workerNodes)
            .force('link', d3.forceLink<WorkerNode, WorkerLink>(workerLinks).id(d => d.id).distance(120))
            .force('charge', d3.forceManyBody().strength(-400))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collide', d3.forceCollide().radius(d => Math.sqrt(Math.max(1, (d as WorkerNode).degree)) * 5 + 15));

        // We can send positions at every tick
        simulation.on('tick', () => {
            if (!positions) return;
            for (let i = 0; i < workerNodes.length; i++) {
                positions[i * 2] = workerNodes[i].x || 0;
                positions[i * 2 + 1] = workerNodes[i].y || 0;
            }
            
            // To avoid flooding the main thread, we can throttle or just send a copy
            // Using postMessage with a copy of Float32Array is fast enough for 16k nodes
            const payload = new Float32Array(positions);
            self.postMessage({ type: 'tick', positions: payload }, [payload.buffer]);
        });

        simulation.on('end', () => {
            if (!positions) return;
            for (let i = 0; i < workerNodes.length; i++) {
                positions[i * 2] = workerNodes[i].x || 0;
                positions[i * 2 + 1] = workerNodes[i].y || 0;
            }
            const payload = new Float32Array(positions);
            self.postMessage({ type: 'end', positions: payload }, [payload.buffer]);
        });
    }

    if (type === 'stop') {
        if (simulation) {
            simulation.stop();
        }
    }
    
    if (type === 'reheat') {
        if (simulation) {
            simulation.alphaTarget(0.3).restart();
        }
    }
    
    if (type === 'cool') {
        if (simulation) {
            simulation.alphaTarget(0);
        }
    }

    if (type === 'drag') {
        const { id, x, y } = data;
        if (simulation) {
            const nodes = simulation.nodes();
            const index = nodesMap.get(id);
            if (index !== undefined) {
                const node = nodes[index];
                if (x !== null && y !== null) {
                    node.fx = x;
                    node.fy = y;
                } else {
                    node.fx = null;
                    node.fy = null;
                }
            }
        }
    }
};
