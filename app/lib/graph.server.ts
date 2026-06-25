import { getAvailableTemplates } from "./templates.server";

interface GraphEdge {
  target: string;
  weight: number;
}

class PriorityQueue {
  private elements: Array<{ element: string; priority: number }> = [];

  enqueue(element: string, priority: number): void {
    this.elements.push({ element, priority });
    this.elements.sort((a, b) => a.priority - b.priority);
  }

  dequeue(): { element: string; priority: number } | undefined {
    return this.elements.shift();
  }

  isEmpty(): boolean {
    return this.elements.length === 0;
  }
}

export class TranslationGraph {
  nodes: Record<string, GraphEdge[]> = {};

  private constructor() {}

  /** Factory — use instead of `new TranslationGraph()` since init is async. */
  static async create(): Promise<TranslationGraph> {
    const g = new TranslationGraph();
    const templates = await getAvailableTemplates();
    for (const t of templates) {
      const src = `${t.input_model}:${t.input_version}`;
      const dst = `${t.output_model}:${t.output_version}`;
      if (!g.nodes[src]) g.nodes[src] = [];
      if (!g.nodes[dst]) g.nodes[dst] = [];
      g.nodes[src].push({ target: dst, weight: 1 });
    }
    return g;
  }

  dijkstra(start: string): Record<string, string | null> {
    const distances: Record<string, number> = {};
    const predecessors: Record<string, string | null> = {};
    const visited: Record<string, boolean> = {};
    const queue = new PriorityQueue();

    for (const node of Object.keys(this.nodes)) {
      distances[node] = Infinity;
      predecessors[node] = null;
    }
    distances[start] = 0;
    queue.enqueue(start, 0);

    while (!queue.isEmpty()) {
      const current = queue.dequeue()!.element;
      if (!visited[current]) {
        for (const neighbor of this.nodes[current] ?? []) {
          const d = distances[current] + neighbor.weight;
          if (d < distances[neighbor.target]) {
            distances[neighbor.target] = d;
            predecessors[neighbor.target] = current;
            queue.enqueue(neighbor.target, d);
          }
        }
        visited[current] = true;
      }
    }

    return predecessors;
  }

  getPath(
    start: string,
    end: string,
    predecessors: Record<string, string | null>,
    maxIterations = 100
  ): {
    translationsToApply?: Array<{ name: string; version: string }>;
    error?: { status: number; message: string };
  } {
    const path: string[] = [];
    let current: string | null = end;
    let iterations = 0;

    while (current !== start && iterations < maxIterations) {
      path.unshift(current);
      current = predecessors[current];
      if (current === null || current === undefined) break;
      iterations++;
    }

    if (current !== start) {
      return { error: { status: 400, message: `unable to find a translation between ${start} and ${end}` } };
    }

    path.unshift(start);

    return {
      translationsToApply: path.map((node) => {
        const [name, version] = node.split(":");
        return { name, version };
      }),
    };
  }
}
