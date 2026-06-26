import { BaseComponent } from './base_component.js';
import { getGeolocalizedEntities } from '../api.js';

export class MapViewer extends BaseComponent {
    constructor(appState) {
        // Inicializar clase base con el ID de contenedor de la vista
        super(appState, 'map-view');
        
        // Elementos de UI
        this.canvasContainer = document.getElementById('map-leaflet-canvas');
        this.loadButton = document.getElementById('btn-load-map-markers');
        this.markerCountElement = document.getElementById('map-marker-count');
        this.markerListElement = document.getElementById('map-marker-list');
        this.filtersGroupElement = document.getElementById('map-filters-group');
        
        this.map = null;
        this.markersGroup = null;
        this.allMarkersData = []; // Guardar datos cargados en memoria
        this.leafletMarkersMap = new Map(); // Mapeo URI -> Marker de Leaflet
        this.activeClasses = new Set(); // Clases actualmente visibles (filtro)
        
        // Registrar componentes para el modo desarrollo
        this.registerDevComponent('#mapViewer', 'Explorador de Mapa', this.query('.map-workspace-layout'));
        this.registerDevComponent('#mapSidebar', 'Filtros y Marcadores', this.query('.map-sidebar'));
        this.registerDevComponent('#mapCanvas', 'Lienzo de Mapa Geográfico', this.query('.map-canvas-container'));
        
        this.initMap();
        this.initEvents();
    }

    initMap() {
        // Inicializar mapa centrado por defecto en La Plata, Argentina (sede UNLP / Cientopolis)
        const laPlataCoords = [-34.9213, -57.9546];
        
        this.map = L.map(this.canvasContainer, {
            center: laPlataCoords,
            zoom: 13,
            zoomControl: true
        });

        // Usar capa de mapa claro (CartoDB Positron)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(this.map);

        this.markersGroup = L.layerGroup().addTo(this.map);
    }

    initEvents() {
        this.loadButton.addEventListener('click', () => this.loadGeolocalized());

        // Limpiar marcadores cuando cambia el repositorio activo
        this.appState.onRepositoryChanged(() => {
            this.clearMarkers();
        });
    }

    clearMarkers() {
        this.markersGroup.clearLayers();
        this.allMarkersData = [];
        this.leafletMarkersMap.clear();
        this.activeClasses.clear();
        this.markerCountElement.textContent = '0';
        this.markerListElement.innerHTML = '<li class="text-muted">Haga clic en \'Cargar Marcadores\' para escanear el repositorio.</li>';
        // Resetear panel de filtros
        this.filtersGroupElement.innerHTML = '<span class="text-muted" style="font-size:12px">Cargue marcadores para ver filtros disponibles.</span>';
    }

    async loadGeolocalized() {
        const repoId = this.appState.activeRepository;
        if (!repoId) {
            alert('Por favor, conecte un repositorio primero en el Panel General.');
            return;
        }

        this.loadButton.disabled = true;
        this.loadButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando...';
        this.markerListElement.innerHTML = '<li class="text-muted">Escaneando entidades RealEstate en GraphDB...</li>';
        
        try {
            const data = await getGeolocalizedEntities(repoId);
            this.allMarkersData = data;
            this.buildDynamicFilters(data);
            this.applyFilters();
        } catch (error) {
            console.error('Error loading map coordinates:', error);
            this.markerListElement.innerHTML = `<li class="text-danger">Error: ${error.message}</li>`;
        } finally {
            this.loadButton.disabled = false;
            this.loadButton.innerHTML = 'Cargar Marcadores en Mapa';
        }
    }

    /**
     * Construye dinámicamente los checkboxes de filtro según las clases reales
     * que devuelve el backend (subclases de rec:RealEstate).
     */
    buildDynamicFilters(data) {
        // Recopilar todas las clases presentes y su frecuencia
        const classMap = new Map();
        data.forEach(item => {
            const shortClass = this.getShortClass(item.type);
            classMap.set(shortClass, (classMap.get(shortClass) || 0) + 1);
        });

        // Limpiar el panel de filtros y el set de clases activas
        this.filtersGroupElement.innerHTML = '';
        this.activeClasses.clear();

        if (classMap.size === 0) {
            this.filtersGroupElement.innerHTML = '<span class="text-muted" style="font-size:12px">Sin entidades geolocalizadas.</span>';
            return;
        }

        // Paleta de colores para asignar a cada clase
        const palette = [
            '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
            '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6b7280'
        ];
        let paletteIndex = 0;

        // Ordenar por frecuencia descendente
        const sorted = [...classMap.entries()].sort((a, b) => b[1] - a[1]);

        sorted.forEach(([shortClass, count]) => {
            const color = palette[paletteIndex % palette.length];
            paletteIndex++;
            this.activeClasses.add(shortClass);

            const label = document.createElement('label');
            label.className = 'form-check-label';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.value = shortClass;
            checkbox.className = 'map-filter-checkbox';
            checkbox.dataset.color = color;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.activeClasses.add(shortClass);
                } else {
                    this.activeClasses.delete(shortClass);
                }
                this.applyFilters();
            });

            const dot = document.createElement('span');
            dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin:0 4px;vertical-align:middle;`;

            label.appendChild(checkbox);
            label.appendChild(dot);
            label.appendChild(document.createTextNode(`${shortClass} `));

            const small = document.createElement('small');
            small.className = 'text-muted';
            small.textContent = `(${count})`;
            label.appendChild(small);

            this.filtersGroupElement.appendChild(label);
        });
    }

    applyFilters() {
        this.markersGroup.clearLayers();
        this.leafletMarkersMap.clear();
        this.markerListElement.innerHTML = '';

        // Construir mapa de clase -> color desde los checkboxes actuales
        const colorMap = new Map();
        this.filtersGroupElement.querySelectorAll('.map-filter-checkbox').forEach(cb => {
            colorMap.set(cb.value, cb.dataset.color || '#6b7280');
        });

        let count = 0;
        
        this.allMarkersData.forEach(item => {
            const shortClass = this.getShortClass(item.type);
            
            // Saltar si la clase no está activa en el filtro
            if (!this.activeClasses.has(shortClass)) return;

            // Parsear coordenadas WKT
            const parsedCoords = this.parseCoordinatesString(item.coords || item.coordinates);
            if (!parsedCoords) return;

            const [lat, lon] = parsedCoords;
            if (isNaN(lat) || isNaN(lon)) return;
            count++;

            const markerColor = colorMap.get(shortClass) || '#6b7280';
            
            // Crear icono personalizado con color de la clase
            const customIcon = L.divIcon({
                className: 'custom-map-marker',
                html: `<div style="background-color: ${markerColor}; box-shadow: 0 0 8px ${markerColor}88; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });

            // Crear popup con información del RealEstate
            const popupContent = document.createElement('div');
            popupContent.innerHTML = `
                <h4 style="margin:0 0 6px 0">${item.label || shortClass}</h4>
                <p style="margin:2px 0"><strong>Clase:</strong> ${shortClass}</p>
                <p style="margin:2px 0"><strong>Coords:</strong> ${lat.toFixed(5)}, ${lon.toFixed(5)}</p>
                <p style="margin:2px 0;font-size:10px;color:#888;word-break:break-all">${item.entity}</p>
                <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <button class="btn btn-primary btn-sm btn-view-explorer" style="padding: 4px 8px; font-size: 10px;">Explorar</button>
                    <button class="btn btn-secondary btn-sm btn-view-graph" style="padding: 4px 8px; font-size: 10px;">Grafo</button>
                </div>
            `;

            popupContent.querySelector('.btn-view-explorer').addEventListener('click', () => {
                this.appState.triggerViewChange('explorer-view', { loadUri: item.entity });
            });
            popupContent.querySelector('.btn-view-graph').addEventListener('click', () => {
                this.appState.triggerViewChange('graph-view', { rootUri: item.entity });
            });

            const marker = L.marker([lat, lon], { icon: customIcon })
                .bindPopup(popupContent)
                .addTo(this.markersGroup);

            this.leafletMarkersMap.set(item.entity, marker);

            // Agregar a la lista lateral
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="marker-title">${item.label || shortClass}</div>
                <div class="marker-desc">${shortClass} | ${lat.toFixed(4)}, ${lon.toFixed(4)}</div>
            `;
            li.addEventListener('click', () => {
                this.map.setView([lat, lon], 16);
                marker.openPopup();
            });
            this.markerListElement.appendChild(li);
        });

        this.markerCountElement.textContent = count;
        
        if (count === 0) {
            this.markerListElement.innerHTML = '<li class="text-muted">Ninguna ubicación coincide con los filtros activos.</li>';
        } else {
            // Ajustar los límites del mapa para mostrar todos los marcadores visibles
            try {
                const group = L.featureGroup(Array.from(this.leafletMarkersMap.values()));
                if (group.getBounds().isValid()) {
                    this.map.fitBounds(group.getBounds(), { padding: [30, 30] });
                }
            } catch (e) {
                console.warn('Error adjusting map bounds:', e);
            }
        }
    }

    /** Obtiene el nombre corto de una clase a partir de su URI completa */
    getShortClass(fullTypeUri) {
        if (!fullTypeUri) return 'Unknown';
        return fullTypeUri.split('#').pop().split('/').pop() || 'Unknown';
    }

    parseCoordinatesString(coordStr) {
        if (!coordStr) return null;

        // Limpiar espacios y eliminar prefijo de sistema de referencia (<http://...>)
        let cleanStr = coordStr.trim().replace(/<[^>]+>\s*/g, '').trim();

        // Caso 1: Formato WKT POINT(X Y)
        // En GeoSPARQL estándar: POINT(lon lat), val1=lon, val2=lat
        const wktRegex = /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i;
        const match = cleanStr.match(wktRegex);
        if (match) {
            const val1 = parseFloat(match[1]);
            const val2 = parseFloat(match[2]);
            
            // Detectar orden para Argentina (lat ~ -25 a -55, lon ~ -53 a -73)
            if (val1 < -50 && val2 > -55 && val2 < -25) {
                // val1=lon, val2=lat -> devolver [lat, lon]
                return [val2, val1];
            } else if (val2 < -50 && val1 > -55 && val1 < -25) {
                // val2=lon, val1=lat
                return [val1, val2];
            }
            // Fallback WKT estándar: POINT(lon lat) -> [lat, lon]
            return [val2, val1];
        }

        // Caso 2: Simple "lat, lon" o "lat lon"
        const parts = cleanStr.split(/[\s,]+/);
        if (parts.length >= 2) {
            const val1 = parseFloat(parts[0]);
            const val2 = parseFloat(parts[1]);
            if (!isNaN(val1) && !isNaN(val2)) {
                if (val1 < -50 && val2 > -55 && val2 < -25) {
                    return [val2, val1];
                }
                return [val1, val2];
            }
        }

        return null;
    }

    /** Centra el mapa y abre el popup de una entidad específica por URI */
    highlightEntity(uri) {
        const marker = this.leafletMarkersMap.get(uri);
        if (marker) {
            const latLng = marker.getLatLng();
            this.map.setView(latLng, 16);
            marker.openPopup();
        } else {
            console.warn(`No se encontró marcador de mapa para: ${uri}`);
        }
    }
}
