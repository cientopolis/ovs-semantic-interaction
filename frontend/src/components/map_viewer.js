import { getGeolocalizedEntities } from '../api.js';

export class MapViewer {
    constructor(appState) {
        this.appState = appState;
        
        // Elementos de UI
        this.canvasContainer = document.getElementById('map-leaflet-canvas');
        this.loadButton = document.getElementById('btn-load-map-markers');
        this.markerCountElement = document.getElementById('map-marker-count');
        this.markerListElement = document.getElementById('map-marker-list');
        this.filterCheckboxes = document.querySelectorAll('.map-filter-checkbox');
        
        this.map = null;
        this.markersGroup = null;
        this.allMarkersData = []; // Guardar datos cargados en memoria
        this.leafletMarkersMap = new Map(); // Mapeo URI -> Marker de Leaflet
        
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

        // Usar capa de mapa claro (CartoDB Positron) para combinar con el diseño iluminado
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(this.map);

        this.markersGroup = L.layerGroup().addTo(this.map);
    }

    initEvents() {
        this.loadButton.addEventListener('click', () => this.loadGeolocalized());

        // Eventos de cambios en filtros
        this.filterCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => this.applyFilters());
        });

        // Registrar en el estado si cambia el repositorio
        this.appState.onRepositoryChanged(() => {
            this.clearMarkers();
        });
    }

    clearMarkers() {
        this.markersGroup.clearLayers();
        this.allMarkersData = [];
        this.leafletMarkersMap.clear();
        this.markerCountElement.textContent = '0';
        this.markerListElement.innerHTML = '<li class="text-muted">Haga clic en \'Cargar Marcadores\' para escanear el repositorio.</li>';
    }

    async loadGeolocalized() {
        const repoId = this.appState.activeRepository;
        if (!repoId) {
            alert('Por favor, conecte un repositorio primero en el Panel General.');
            return;
        }

        this.loadButton.disabled = true;
        this.loadButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando...';
        this.markerListElement.innerHTML = '<li class="text-muted">Escaneando entidades en GraphDB...</li>';
        
        try {
            const data = await getGeolocalizedEntities(repoId);
            this.allMarkersData = data;
            this.applyFilters();
        } catch (error) {
            console.error('Error loading map coordinates:', error);
            this.markerListElement.innerHTML = `<li class="text-danger">Error: ${error.message}</li>`;
        } finally {
            this.loadButton.disabled = false;
            this.loadButton.innerHTML = 'Cargar Marcadores en Mapa';
        }
    }

    applyFilters() {
        this.markersGroup.clearLayers();
        this.leafletMarkersMap.clear();
        this.markerListElement.innerHTML = '';
        
        // Obtener filtros seleccionados
        const activeFilters = Array.from(this.filterCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        let count = 0;
        
        this.allMarkersData.forEach(item => {
            // Determinar clase simplificada (el backend devuelve la URI de la clase en el campo 'type')
            const fullClass = item.type || item.class || '';
            const shortClass = fullClass ? fullClass.split('#').pop().split('/').pop() : 'Unknown';
            
            // Verificar si encaja en los filtros activos
            let filterGroup = 'other';
            if (['Apartment', 'House', 'Land', 'Store'].includes(shortClass)) {
                filterGroup = shortClass;
            }

            if (!activeFilters.includes(filterGroup)) return;

            // Parsear coordenadas. Formatos comunes:
            // "POINT(-57.9546 -34.9213)" -> WKT (normalmente X=lon, Y=lat en Sudamérica)
            // "-34.9213, -57.9546" -> simple lat,lon
            const parsedCoords = this.parseCoordinatesString(item.coords || item.coordinates);
            if (!parsedCoords) return;

            const [lat, lon] = parsedCoords;
            count++;

            // Determinar color de marcador según grupo
            const markerColor = this.getMarkerColorByClass(filterGroup);
            
            // Crear icono personalizado brillante
            const customIcon = L.divIcon({
                className: 'custom-map-marker',
                html: `<div style="background-color: ${markerColor}; box-shadow: 0 0 10px ${markerColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });

            // Crear popup
            const popupContent = document.createElement('div');
            popupContent.innerHTML = `
                <h4>${item.label || shortClass}</h4>
                <p><strong>Clase:</strong> ${shortClass}</p>
                <p><strong>Coords:</strong> ${lat.toFixed(5)}, ${lon.toFixed(5)}</p>
                <p class="popup-uri">${item.entity}</p>
                <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <button class="btn btn-primary btn-sm btn-view-explorer" style="padding: 4px 8px; font-size: 10px;">Explorar</button>
                    <button class="btn btn-secondary btn-sm btn-view-graph" style="padding: 4px 8px; font-size: 10px;">Grafo</button>
                </div>
            `;

            // Vincular eventos a botones del popup
            popupContent.querySelector('.btn-view-explorer').addEventListener('click', () => {
                this.appState.triggerViewChange('explorer-view', { loadUri: item.entity });
            });
            popupContent.querySelector('.btn-view-graph').addEventListener('click', () => {
                this.appState.triggerViewChange('graph-view', { rootUri: item.entity });
            });

            // Crear marcador de Leaflet
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
            this.markerListElement.innerHTML = '<li class="text-muted">Ninguna ubicación coincide con los filtros.</li>';
        } else {
            // Ajustar los límites del mapa para mostrar todos los marcadores cargados
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

    parseCoordinatesString(coordStr) {
        if (!coordStr) return null;

        // Limpiar espacios adicionales
        const cleanStr = coordStr.trim();

        // Caso 1: Formato WKT POINT(lon lat) o POINT(lat lon)
        // OVS e Inmontology suelen usar POINT(X Y) donde X=longitud e Y=latitud o viceversa.
        // Asumimos que si el primer valor es menor que -50 (por ejemplo -57 La Plata) es longitud,
        // y el segundo alrededor de -34 es latitud. Esto es crucial para colocarlo bien en Argentina.
        const wktRegex = /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i;
        const match = cleanStr.match(wktRegex);
        if (match) {
            const val1 = parseFloat(match[1]);
            const val2 = parseFloat(match[2]);
            
            // Lógica inteligente de detección de Lat/Lon para Argentina (-34 lat, -57 lon)
            if (val1 < -50 && val2 > -40 && val2 < -30) {
                // val1 es lon (-57), val2 es lat (-34)
                return [val2, val1];
            } else if (val2 < -50 && val1 > -40 && val1 < -30) {
                // val2 es lon (-57), val1 es lat (-34)
                return [val1, val2];
            }
            // Fallback: Asumir Y=lat, X=lon
            return [val2, val1];
        }

        // Caso 2: Simple "lat, lon" o "lat lon"
        const parts = cleanStr.split(/[\s,]+/);
        if (parts.length >= 2) {
            const val1 = parseFloat(parts[0]);
            const val2 = parseFloat(parts[1]);
            
            if (!isNaN(val1) && !isNaN(val2)) {
                // Lógica de detección de latitud/longitud
                if (val1 < -50 && val2 > -40 && val2 < -30) {
                    return [val2, val1];
                }
                return [val1, val2];
            }
        }

        return null;
    }

    getMarkerColorByClass(clsGroup) {
        const colors = {
            Apartment: '#9c27b0', // Morado
            House: '#ff9800',     // Naranja
            Land: '#4caf50',      // Verde
            Store: '#00bcd4',     // Cyan
            other: '#9e9e9e'      // Gris
        };
        return colors[clsGroup] || colors.other;
    }

    // Método para centrar el mapa y abrir popup de una entidad específica
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
