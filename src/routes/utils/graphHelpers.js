const { getAvailableTemplates } = require("../../middleware/templateHandler");

class TranslationGraph {
    constructor(data) {
        this.nodes = {};
        return (async () => {
            await this.initialize();
            return this;
        })();
    }

    async initialize() {
        const data = await getAvailableTemplates();
        for (const item of data) {
            this.addNode(`${item.input_model}:${item.input_version}`);
            this.addNode(`${item.output_model}:${item.output_version}`);
            this.addEdge(
                `${item.input_model}:${item.input_version}`,
                `${item.output_model}:${item.output_version}`,
                1
            );
        }
    }

    addNode(name) {
        if (!this.nodes[name]) {
            this.nodes[name] = [];
        }
    }

    addEdge(source, target, weight) {
        this.nodes[source].push({ target, weight });
    }

    getPath(start, end, predecessors) {
        const path = [];
        let current = end;

        while (current !== start) {
            path.unshift(current);
            current = predecessors[current];
        }
        path.unshift(start);

        return path.map((node) => {
            const [name, version] = node.split(":");
            return { name, version };
        });
    }

    dijkstra(start) {
        const distances = {};
        const predecessors = {};
        const visited = {};
        const queue = new PriorityQueue();

        // Initialize distances with Infinity
        for (const node in this.nodes) {
            distances[node] = Infinity;
            predecessors[node] = null;
        }
        distances[start] = 0;

        queue.enqueue(start, 0);

        while (!queue.isEmpty()) {
            const currentNode = queue.dequeue().element;

            if (!visited[currentNode]) {
                for (const neighbor of this.nodes[currentNode]) {
                    const distance = distances[currentNode] + neighbor.weight;

                    if (distance < distances[neighbor.target]) {
                        distances[neighbor.target] = distance;
                        predecessors[neighbor.target] = currentNode;
                        queue.enqueue(neighbor.target, distance);
                    }
                }
                visited[currentNode] = true;
            }
        }

        return predecessors;
    }
}

class PriorityQueue {
    constructor() {
        this.elements = [];
    }

    enqueue(element, priority) {
        this.elements.push({ element, priority });
        this.elements.sort((a, b) => a.priority - b.priority);
    }

    dequeue() {
        return this.elements.shift();
    }

    isEmpty() {
        return this.elements.length === 0;
    }
}

module.exports = { TranslationGraph };
