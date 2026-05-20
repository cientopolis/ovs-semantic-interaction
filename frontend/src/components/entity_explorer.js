import { executeSparqlQuery, getEntityRelations } from '../api.js';

export class EntityExplorer {
    constructor(appState) {
        this.appState = appState;
        
        // Elementos de UI
        this.searchInput = document.getElementById('explorer-search-input');
        this.searchButton = document.getElementById('btn-explorer-search');
        this.classSelect = document.getElementById('explorer-class-select');
        this.instancesList = document.getElementById('explorer-instances-list');
        
        this.entityTitle = document.getElementById('explorer-entity-title');
        this.entityClassBadge = document.getElementById('explorer-entity-class-badge');
        this.entityUri = document.getElementById('explorer-entity-uri');
        
        this.outgoingTableBody = document.querySelector('#table-outgoing-relations tbody');
        this.incomingTableBody = document.querySelector('#table-incoming-relations tbody');
        
        this.initEvents();
    }

    initEvents() {
        this.searchButton.addEventListener('click', () => this.handleSearch());
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });
        
        this.classSelect.addEventListener('change', () => {
            const selectedClass = this.classSelect.value;
            if (selectedClass) {
                this.loadInstancesOfClass(selectedClass);
            }
        });

        // Registrar callback en el estado para cuando cambia el repositorio
        this.appState.onRepositoryChanged((repoId) => {
            this.loadClasses();
            this.resetExplorer();
        });
    }

    resetExplorer() {
        this.instancesList.innerHTML = '<li class="text-muted">Seleccione una clase o busque arriba.</li>';
        this.entityTitle.textContent = 'Seleccione una entidad';
        this.entityClassBadge.style.display = 'none';
        this.entityUri.textContent = '-';
        this.outgoingTableBody.innerHTML = '<tr><td colspan="2" class="text-muted text-center">No hay datos que mostrar.</td></tr>';
        this.incomingTableBody.innerHTML = '<tr><td colspan="2" class="text-muted text-center">No hay datos que mostrar.</td></tr>';
    }

    async loadClasses() {
        const repoId = this.appState.activeRepository;
        if (!repoId) return;

        try {
            const query = `
                SELECT DISTINCT ?class WHERE {
                    ?s a ?class .
                    FILTER (!isLiteral(?class))
                } ORDER BY ?class
            `;
            const result = await executeSparqlQuery(repoId, query);
            
            this.classSelect.innerHTML = '<option value="">Todas las clases</option>';
            const bindings = result.get('results', {}).get('bindings', []);
            bindings.forEach(b => {
                const classUri = b.class.value;
                const option = document.createElement('option');
                option.value = classUri;
                // Mostrar nombre corto
                const shortName = classUri.split('#').pop().split('/').pop();
                option.textContent = shortName;
                option.title = classUri;
                this.classSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading classes in explorer:', error);
        }
    }

    async loadInstancesOfClass(classUri) {
        const repoId = this.appState.activeRepository;
        if (!repoId) return;

        this.instancesList.innerHTML = '<li class="text-muted">Cargando instancias...</li>';

        try {
            const query = `
                PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
                SELECT DISTINCT ?inst ?label WHERE {
                    ?inst a <${classUri}> .
                    OPTIONAL { 
                        ?inst rdfs:label ?label .
                        FILTER(lang(?label) = "es" || lang(?label) = "es-ar" || lang(?label) = "")
                    }
                } LIMIT 100
            `;
            const result = await executeSparqlQuery(repoId, query);
            this.renderInstancesList(result.get('results', {}).get('bindings', []));
        } catch (error) {
            this.instancesList.innerHTML = `<li class="text-danger">Error: ${error.message}</li>`;
        }
    }

    async handleSearch() {
        const repoId = this.appState.activeRepository;
        if (!repoId) return;

        const term = this.searchInput.value.trim();
        if (!term) return;

        this.instancesList.innerHTML = '<li class="text-muted">Buscando...</li>';
        
        try {
            const classFilter = this.classSelect.value;
            let classPattern = '?inst a ?class .';
            if (classFilter) {
                classPattern = `?inst a <${classFilter}> .`;
            }

            const query = `
                PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
                SELECT DISTINCT ?inst ?label WHERE {
                    ${classPattern}
                    OPTIONAL { ?inst rdfs:label ?label }
                    FILTER(
                        regex(str(?inst), "${term}", "i") || 
                        (bound(?label) && regex(str(?label), "${term}", "i"))
                    )
                } LIMIT 100
            `;
            const result = await executeSparqlQuery(repoId, query);
            this.renderInstancesList(result.get('results', {}).get('bindings', []));
        } catch (error) {
            this.instancesList.innerHTML = `<li class="text-danger">Error: ${error.message}</li>`;
        }
    }

    renderInstancesList(bindings) {
        this.instancesList.innerHTML = '';
        
        if (bindings.length === 0) {
            this.instancesList.innerHTML = '<li class="text-muted">No se encontraron instancias.</li>';
            return;
        }

        bindings.forEach(b => {
            const uri = b.inst.value;
            const label = b.label ? b.label.value : uri.split('#').pop().split('/').pop();
            
            const li = document.createElement('li');
            li.textContent = label;
            li.title = uri;
            
            li.addEventListener('click', () => {
                // Quitar clase activa previa
                const active = this.instancesList.querySelector('.active');
                if (active) active.classList.remove('active');
                
                li.classList.add('active');
                this.loadEntityDetails(uri, label);
            });
            
            this.instancesList.appendChild(li);
        });
    }

    async loadEntityDetails(uri, friendlyName = null) {
        const repoId = this.appState.activeRepository;
        if (!repoId) return;

        // Establecer entidad seleccionada en el estado global
        this.appState.setSelectedEntity(uri);

        this.entityTitle.textContent = friendlyName || uri.split('#').pop().split('/').pop();
        this.entityUri.textContent = uri;
        
        this.outgoingTableBody.innerHTML = '<tr><td colspan="2" class="text-muted text-center">Cargando relaciones salientes...</td></tr>';
        this.incomingTableBody.innerHTML = '<tr><td colspan="2" class="text-muted text-center">Cargando relaciones entrantes...</td></tr>';

        try {
            const data = await getEntityRelations(repoId, uri);
            
            // Intentar adivinar tipo a partir de las relaciones salientes (rdf:type)
            const typeRelation = data.outgoing.find(rel => rel.predicate === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
            if (typeRelation) {
                const shortClass = typeRelation.object.split('#').pop().split('/').pop();
                this.entityClassBadge.textContent = shortClass;
                this.entityClassBadge.style.display = 'inline-block';
            } else {
                this.entityClassBadge.style.display = 'none';
            }

            // Renderizar Salientes
            this.outgoingTableBody.innerHTML = '';
            if (data.outgoing.length === 0) {
                this.outgoingTableBody.innerHTML = '<tr><td colspan="2" class="text-muted text-center">Ninguna propiedad saliente encontrada.</td></tr>';
            } else {
                data.outgoing.forEach(rel => {
                    const tr = document.createElement('tr');
                    
                    const tdPred = document.createElement('td');
                    tdPred.textContent = rel.predicate.split('#').pop().split('/').pop();
                    tdPred.title = rel.predicate;
                    
                    const tdObj = document.createElement('td');
                    if (rel.object_type === 'uri') {
                        const span = document.createElement('span');
                        span.className = 'clickable-uri';
                        span.textContent = rel.object_label || rel.object.split('#').pop().split('/').pop();
                        span.title = rel.object;
                        span.addEventListener('click', () => {
                            this.loadEntityDetails(rel.object, rel.object_label);
                        });
                        tdObj.appendChild(span);
                    } else {
                        // Es un literal
                        tdObj.textContent = rel.object;
                        tdObj.title = `Tipo: ${rel.object_type}`;
                    }

                    tr.appendChild(tdPred);
                    tr.appendChild(tdObj);
                    this.outgoingTableBody.appendChild(tr);
                });
            }

            // Renderizar Entrantes
            this.incomingTableBody.innerHTML = '';
            if (data.incoming.length === 0) {
                this.incomingTableBody.innerHTML = '<tr><td colspan="2" class="text-muted text-center">Ninguna propiedad entrante encontrada.</td></tr>';
            } else {
                data.incoming.forEach(rel => {
                    const tr = document.createElement('tr');
                    
                    const tdSub = document.createElement('td');
                    const span = document.createElement('span');
                    span.className = 'clickable-uri';
                    span.textContent = rel.subject_label || rel.subject.split('#').pop().split('/').pop();
                    span.title = rel.subject;
                    span.addEventListener('click', () => {
                        this.loadEntityDetails(rel.subject, rel.subject_label);
                    });
                    tdSub.appendChild(span);

                    const tdPred = document.createElement('td');
                    tdPred.textContent = rel.predicate.split('#').pop().split('/').pop();
                    tdPred.title = rel.predicate;

                    tr.appendChild(tdSub);
                    tr.appendChild(tdPred);
                    this.incomingTableBody.appendChild(tr);
                });
            }
            
            // Añadir botón flotante o superior para cargar en el grafo o en mapa
            this.addContextButtons(uri, data);

        } catch (error) {
            this.outgoingTableBody.innerHTML = `<tr><td colspan="2" class="text-danger">Error: ${error.message}</td></tr>`;
            this.incomingTableBody.innerHTML = `<tr><td colspan="2" class="text-danger">Error: ${error.message}</td></tr>`;
        }
    }

    addContextButtons(uri, data) {
        // Eliminar botones previos si existían
        const prevActions = document.getElementById('entity-details-actions-bar');
        if (prevActions) prevActions.remove();

        const actionsBar = document.createElement('div');
        actionsBar.id = 'entity-details-actions-bar';
        actionsBar.style.display = 'flex';
        actionsBar.style.gap = '12px';
        actionsBar.style.marginTop = '16px';
        actionsBar.style.paddingTop = '16px';
        actionsBar.style.borderTop = '1px solid var(--border-color)';

        // Botón Ver en Grafo
        const btnGraph = document.createElement('button');
        btnGraph.className = 'btn btn-secondary btn-sm';
        btnGraph.innerHTML = '<i class="fa-solid fa-diagram-project"></i> Ver en Grafo';
        btnGraph.addEventListener('click', () => {
            this.appState.triggerViewChange('graph-view', { rootUri: uri });
        });
        actionsBar.appendChild(btnGraph);

        // Si tiene coordenadas geográficas, habilitar botón Ver en Mapa
        const hasGeom = data.outgoing.some(rel => rel.predicate === 'https://w3id.org/rec#geometry');
        if (hasGeom) {
            const btnMap = document.createElement('button');
            btnMap.className = 'btn btn-primary btn-sm';
            btnMap.innerHTML = '<i class="fa-solid fa-map-location-dot"></i> Ver en Mapa';
            btnMap.addEventListener('click', () => {
                this.appState.triggerViewChange('map-view', { highlightUri: uri });
            });
            actionsBar.appendChild(btnMap);
        }

        // Insertar en la cabecera del panel de detalles
        const header = document.querySelector('.explorer-details-card');
        header.appendChild(actionsBar);
    }
}
