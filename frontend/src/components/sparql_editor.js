import { executeSparqlQuery } from '../api.js';

export class SparqlEditor {
    constructor(appState) {
        this.appState = appState;
        
        // Elementos de UI
        this.textarea = document.getElementById('sparql-editor-textarea');
        this.templateSelect = document.getElementById('select-sparql-template');
        this.runButton = document.getElementById('btn-run-query');
        this.formatButton = document.getElementById('btn-format-sparql');
        this.exportButton = document.getElementById('btn-export-json');
        
        this.metaElement = document.getElementById('sparql-results-meta');
        this.tableContainer = document.getElementById('sparql-results-table-container');
        this.table = document.getElementById('sparql-results-table');
        
        this.lastResults = null;
        
        this.initTemplates();
        this.initEvents();
    }

    initTemplates() {
        this.templates = {
            list_classes: `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?class (COUNT(?inst) as ?instances) WHERE {
    ?inst a ?class .
    FILTER(!isLiteral(?class))
} 
GROUP BY ?class
ORDER BY DESC(?instances)`,

            list_properties: `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?property ?label WHERE {
    ?s ?property ?o .
    OPTIONAL { ?property rdfs:label ?label }
} LIMIT 100`,

            list_properties_realestate: `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX io: <http://www.semanticweb.org/luciana/ontologies/2024/8/inmontology#>
PREFIX rec: <https://w3id.org/rec#>

SELECT ?inmueble ?coord ?geometry WHERE {
    ?inmueble a ?type .
    FILTER(?type IN (rec:Apartment, rec:House, rec:Land, rec:Store, rec:RealEstate))
    OPTIONAL {
        ?inmueble rec:geometry ?geometry .
        ?geometry rec:coordinates ?coord .
    }
} LIMIT 50`,

            list_geolocalized: `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rec: <https://w3id.org/rec#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?entidad ?clase ?coordenadas ?label WHERE {
    ?entidad a ?clase .
    ?entidad rec:geometry ?geom .
    ?geom rec:coordinates ?coordenadas .
    OPTIONAL { 
        ?entidad rdfs:label ?label .
        FILTER(lang(?label) = "es" || lang(?label) = "")
    }
} LIMIT 100`,

            list_triples_limit: `SELECT ?subject ?predicate ?object WHERE {
    ?subject ?predicate ?object .
} LIMIT 100`
        };
    }

    initEvents() {
        // Cargar plantilla al seleccionarla
        this.templateSelect.addEventListener('change', () => {
            const templateKey = this.templateSelect.value;
            if (templateKey && this.templates[templateKey]) {
                this.textarea.value = this.templates[templateKey];
            }
        });

        // Ejecutar consulta
        this.runButton.addEventListener('click', () => this.runQuery());

        // Exportar a archivo JSON
        this.exportButton.addEventListener('click', () => this.exportResults());

        // Formateador simple
        this.formatButton.addEventListener('click', () => {
            let query = this.textarea.value;
            // Un formateo muy rudimentario de sangrías de prefijos y llaves
            query = query
                .replace(/\s+/g, ' ')
                .replace(/PREFIX /g, '\nPREFIX ')
                .replace(/SELECT /g, '\n\nSELECT ')
                .replace(/WHERE\s*\{/g, ' WHERE {\n    ')
                .replace(/\s*\.\s*/g, ' .\n    ')
                .replace(/\s*\}\s*/g, '\n}')
                .trim();
            this.textarea.value = query;
        });

        // Registrar en el estado si cambia el repositorio
        this.appState.onRepositoryChanged(() => {
            this.metaElement.textContent = 'Repositorio cambiado. Listo para ejecutar.';
            this.lastResults = null;
            this.exportButton.disabled = true;
        });
    }

    async runQuery() {
        const repoId = this.appState.activeRepository;
        if (!repoId) {
            alert('Por favor, conecte un repositorio primero en el Panel General.');
            return;
        }

        const query = this.textarea.value.trim();
        if (!query) return;

        this.runButton.disabled = true;
        this.runButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Ejecutando...';
        this.metaElement.textContent = 'Enviando consulta SPARQL a GraphDB...';
        this.table.innerHTML = '';
        this.exportButton.disabled = true;

        const startTime = performance.now();

        try {
            // Verificar si es una consulta de actualización (SPARQL Update)
            const isUpdate = /INSERT|DELETE|LOAD|CLEAR|CREATE|DROP|COPY|MOVE|ADD/i.test(query);
            
            if (isUpdate) {
                // Endpoint especial del backend para actualizaciones
                // Pero este frontend asume en su mayoría consultas. Vamos a implementarlo de todos modos.
                await executeSparqlUpdate(repoId, query);
                this.metaElement.textContent = `Actualización completada exitosamente en ${((performance.now() - startTime) / 1000).toFixed(2)}s.`;
                this.table.innerHTML = '<thead><tr><th>Estado</th></tr></thead><tbody><tr><td>Actualización ejecutada correctamente. Las tripletas fueron modificadas.</td></tr></tbody>';
            } else {
                // Consulta SELECT/ASK
                const data = await executeSparqlQuery(repoId, query);
                this.lastResults = data;
                
                const duration = ((performance.now() - startTime) / 1000).toFixed(2);
                const bindings = data.get('results', {}).get('bindings', []) || [];
                
                this.metaElement.textContent = `Consulta SELECT exitosa: ${bindings.length} resultados en ${duration}s.`;
                this.renderResultsTable(data);
                
                if (bindings.length > 0) {
                    this.exportButton.disabled = false;
                }
            }
        } catch (error) {
            console.error('Error running SPARQL:', error);
            this.metaElement.textContent = 'Error al ejecutar consulta.';
            this.table.innerHTML = `
                <thead><tr><th>Error</th></tr></thead>
                <tbody>
                    <tr><td class="text-danger">${error.message}</td></tr>
                </tbody>
            `;
        } finally {
            this.runButton.disabled = false;
            this.runButton.innerHTML = '<i class="fa-solid fa-play"></i> Ejecutar Consulta';
        }
    }

    renderResultsTable(data) {
        this.table.innerHTML = '';

        // Extraer variables del encabezado
        const vars = data.get('head', {}).get('vars', []) || [];
        const bindings = data.get('results', {}).get('bindings', []) || [];

        if (vars.length === 0 || bindings.length === 0) {
            this.table.innerHTML = '<thead><tr><th>Resultado</th></tr></thead><tbody><tr><td class="text-muted text-center">La consulta no retornó variables ni tripletas.</td></tr></tbody>';
            return;
        }

        // Crear Encabezado de la Tabla
        const thead = document.createElement('thead');
        const headerTr = document.createElement('tr');
        vars.forEach(v => {
            const th = document.createElement('th');
            th.textContent = v;
            headerTr.appendChild(th);
        });
        thead.appendChild(headerTr);
        this.table.appendChild(thead);

        // Crear Cuerpo de la Tabla
        const tbody = document.createElement('tbody');
        bindings.forEach(bind => {
            const tr = document.createElement('tr');
            vars.forEach(v => {
                const td = document.createElement('td');
                const valObj = bind[v];
                
                if (valObj) {
                    if (valObj.type === 'uri') {
                        // Hacer URIs clicables para ir al explorador
                        const span = document.createElement('span');
                        span.className = 'clickable-uri';
                        span.textContent = valObj.value.split('#').pop().split('/').pop();
                        span.title = valObj.value;
                        span.addEventListener('click', () => {
                            this.appState.triggerViewChange('explorer-view', { loadUri: valObj.value });
                        });
                        td.appendChild(span);
                    } else {
                        // Literales
                        td.textContent = valObj.value;
                        td.title = `Tipo: ${valObj.datatype || valObj.type}`;
                    }
                } else {
                    td.innerHTML = '<span class="text-muted">-</span>';
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        this.table.appendChild(tbody);
    }

    exportResults() {
        if (!this.lastResults) return;
        
        try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.lastResults, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `sparql_results_${this.appState.activeRepository}_${Date.now()}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        } catch (error) {
            alert(`Error al exportar: ${error.message}`);
        }
    }
}
