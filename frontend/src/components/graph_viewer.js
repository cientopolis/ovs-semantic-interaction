import { BaseComponent } from './base_component.js';
import { getEntityRelations } from '../api.js';

export class GraphViewer extends BaseComponent {
    constructor(appState) {
        // Inicializar clase base con el ID de contenedor de la vista
        super(appState, 'graph-view');
        
        // Elementos de UI
        this.rootInput = document.getElementById('graph-root-uri');
        this.loadButton = document.getElementById('btn-load-graph-root');
        this.canvasContainer = document.getElementById('graph-network-canvas');
        
        // DataSet de Vis.js
        this.nodes = new vis.DataSet();
        this.edges = new vis.DataSet();
        this.network = null;
        
        // Historial de nodos expandidos para evitar redundancia
        this.expandedNodes = new Set();
        
        // Registrar componentes para el modo desarrollo
        this.registerDevComponent('#graphViewer', 'Visor de Relaciones', this.query('.graph-workspace-layout'));
        this.registerDevComponent('#graphSidebar', 'Panel de Control de Red', this.query('.graph-sidebar'));
        this.registerDevComponent('#graphCanvas', 'Lienzo de Grafo Interactivo', this.query('.graph-canvas-container'));
        
        this.initEvents();
    }

    initEvents() {
        this.loadButton.addEventListener('click', () => {
            const uri = this.rootInput.value.trim();
            if (uri) {
                this.loadNetwork(uri);
            } else {
                alert('Por favor ingrese una URI válida en el campo.');
            }
        });

        // Registrar en el estado si cambia el repositorio
        this.appState.onRepositoryChanged(() => {
            this.clearCanvas();
        });
    }

    clearCanvas() {
        this.nodes.clear();
        this.edges.clear();
        this.expandedNodes.clear();
        this.canvasContainer.innerHTML = `
            <div class="canvas-placeholder">
                <i class="fa-solid fa-diagram-project placeholder-icon"></i>
                <p>Ingrese un nodo inicial o explore para interactuar con la red.</p>
            </div>
        `;
        if (this.network) {
            this.network.destroy();
            this.network = null;
        }
    }

    // Método para cargar la red desde una vista externa (ej. Entity Explorer)
    loadFromExternalUri(uri) {
        this.rootInput.value = uri;
        this.loadNetwork(uri);
    }

    async loadNetwork(rootUri) {
        const repoId = this.appState.activeRepository;
        if (!repoId) {
            alert('Conecte un repositorio primero en el Panel General.');
            return;
        }

        // Limpiar lienzo e inicializar contenedores
        this.canvasContainer.innerHTML = '';
        this.nodes.clear();
        this.edges.clear();
        this.expandedNodes.clear();
        
        // Configurar nodo raíz
        const rootLabel = rootUri.split('#').pop().split('/').pop();
        
        // Agregar nodo raíz al dataset
        this.addNode(rootUri, rootLabel, 'root');
        
        // Crear la red
        this.initVisNetwork();
        
        // Expandir el nodo raíz
        await this.expandNode(rootUri);
    }

    initVisNetwork() {
        const data = {
            nodes: this.nodes,
            edges: this.edges
        };

        const options = {
            nodes: {
                shape: 'dot',
                size: 16,
                font: {
                    color: '#1e293b',
                    size: 12,
                    face: 'Outfit'
                },
                borderWidth: 2,
                shadow: true
            },
            edges: {
                width: 1.5,
                color: {
                    color: 'rgba(124, 77, 255, 0.25)',
                    highlight: '#7c4dff',
                    hover: '#7c4dff'
                },
                font: {
                    color: '#475569',
                    size: 10,
                    face: 'Plus Jakarta Sans',
                    align: 'middle'
                },
                arrows: {
                    to: {
                        enabled: true,
                        scaleFactor: 0.5
                    }
                },
                smooth: {
                    type: 'continuous',
                    roundness: 0.5
                }
            },
            interaction: {
                hover: true,
                navigationButtons: true,
                keyboard: true
            },
            physics: {
                solver: 'forceAtlas2Based',
                forceAtlas2Based: {
                    gravitationalConstant: -50,
                    centralGravity: 0.01,
                    springLength: 100,
                    springConstant: 0.08
                },
                maxVelocity: 50,
                minVelocity: 0.1,
                stabilization: {
                    enabled: true,
                    iterations: 150,
                    updateInterval: 25
                }
            }
        };

        this.network = new vis.Network(this.canvasContainer, data, options);

        // Eventos del grafo
        this.network.on('doubleClick', async (params) => {
            if (params.nodes.length > 0) {
                const nodeUri = params.nodes[0];
                // Los literales y nodos de texto no se expanden
                if (nodeUri.startsWith('literal:')) return;
                
                await this.expandNode(nodeUri);
            }
        });

        this.network.on('click', (params) => {
            if (params.nodes.length > 0) {
                const nodeUri = params.nodes[0];
                if (!nodeUri.startsWith('literal:')) {
                    // Sincronizar campo de texto
                    this.rootInput.value = nodeUri;
                    this.appState.setSelectedEntity(nodeUri);
                }
            }
        });
    }

    async expandNode(nodeUri) {
        if (this.expandedNodes.has(nodeUri)) return;
        this.expandedNodes.add(nodeUri);

        const repoId = this.appState.activeRepository;
        try {
            // Visualmente cambiar estado a expandido/cargando
            const node = this.nodes.get(nodeUri);
            if (node) {
                this.nodes.update({ id: nodeUri, borderWidth: 4, color: { border: '#7c4dff' } });
            }

            const data = await getEntityRelations(repoId, nodeUri);
            
            // Procesar relaciones salientes
            data.outgoing.forEach(rel => {
                const isLiteral = rel.object_type === 'literal';
                const targetId = isLiteral ? `literal:${nodeUri}_${rel.predicate}_${rel.object}` : rel.object;
                const targetLabel = isLiteral ? rel.object : (rel.object_label || rel.object.split('#').pop().split('/').pop());
                
                // Agregar nodo de destino
                this.addNode(targetId, targetLabel, isLiteral ? 'literal' : rel.predicate, rel.object);
                
                // Agregar arista (arcos dirigidos)
                const edgeId = `${nodeUri}_to_${targetId}_via_${rel.predicate}`;
                const predLabel = rel.predicate.split('#').pop().split('/').pop();
                
                if (!this.edges.get(edgeId)) {
                    this.edges.add({
                        id: edgeId,
                        from: nodeUri,
                        to: targetId,
                        label: predLabel,
                        title: rel.predicate
                    });
                }
            });

            // Procesar relaciones entrantes
            data.incoming.forEach(rel => {
                const sourceId = rel.subject;
                const sourceLabel = rel.subject_label || rel.subject.split('#').pop().split('/').pop();
                
                // Agregar nodo de origen
                this.addNode(sourceId, sourceLabel, rel.predicate);
                
                // Agregar arista
                const edgeId = `${sourceId}_to_${nodeUri}_via_${rel.predicate}`;
                const predLabel = rel.predicate.split('#').pop().split('/').pop();
                
                if (!this.edges.get(edgeId)) {
                    this.edges.add({
                        id: edgeId,
                        from: sourceId,
                        to: nodeUri,
                        label: predLabel,
                        title: rel.predicate
                    });
                }
            });

            // Restaurar estilo del nodo y marcar como expandido completo
            if (node) {
                const baseColors = this.getNodeColors(nodeUri, node.group);
                this.nodes.update({ 
                    id: nodeUri, 
                    borderWidth: 2, 
                    color: baseColors.color
                });
            }

        } catch (error) {
            console.error('Error expanding node:', error);
        }
    }

    addNode(id, label, relationType, originalUri = '') {
        if (this.nodes.get(id)) return;

        // Determinar grupo/categoría según predicados o URIs
        let group = 'other';
        const uriToCheck = originalUri || id;
        
        if (id.startsWith('literal:')) {
            group = 'literal';
        } else if (uriToCheck.includes('Apartment') || uriToCheck.includes('House') || uriToCheck.includes('Land') || uriToCheck.includes('Store') || uriToCheck.includes('RealEstate')) {
            group = 'realestate';
        } else if (relationType.includes('geometry') || relationType.includes('coordinates') || relationType.includes('space') || relationType.includes('Region') || relationType.includes('address')) {
            group = 'space';
        } else if (relationType.includes('features') || relationType.includes('Feature') || relationType.includes('bedrooms') || relationType.includes('bathrooms') || relationType.includes('has')) {
            group = 'feature';
        }

        const styling = this.getNodeColors(id, group);

        // Cortar etiquetas extremadamente largas
        let displayLabel = label;
        if (label.length > 25) {
            displayLabel = label.substring(0, 22) + '...';
        }

        this.nodes.add({
            id: id,
            label: displayLabel,
            title: id.startsWith('literal:') ? label : `URI: ${id}`,
            group: group,
            ...styling
        });
    }

    getNodeColors(id, group) {
        // Colores combinados con el CSS general
        const colors = {
            root: {
                color: {
                    background: '#7c4dff',
                    border: '#4a148c',
                    highlight: { background: '#7c4dff', border: '#1e293b' }
                },
                size: 20
            },
            realestate: {
                color: {
                    background: '#9c27b0',
                    border: '#7b1fa2',
                    highlight: { background: '#b24dfb', border: '#1e293b' }
                }
            },
            feature: {
                color: {
                    background: '#00bcd4',
                    border: '#0097a7',
                    highlight: { background: '#33d9e8', border: '#1e293b' }
                }
            },
            space: {
                color: {
                    background: '#4caf50',
                    border: '#388e3c',
                    highlight: { background: '#66bb6a', border: '#1e293b' }
                }
            },
            literal: {
                color: {
                    background: '#ff9800',
                    border: '#f57c00',
                    highlight: { background: '#ffb74d', border: '#1e293b' }
                },
                font: {
                    color: '#1e293b'
                },
                shape: 'box',
                size: 12
            },
            other: {
                color: {
                    background: '#9e9e9e',
                    border: '#616161',
                    highlight: { background: '#bdbdbd', border: '#1e293b' }
                }
            }
        };

        if (id === this.rootInput.value) {
            return colors.root;
        }

        return colors[group] || colors.other;
    }
}
