/**
 * Cliente de API para interactuar con el backend de FastAPI
 */

const API_BASE = '/api';

export async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE}/repositories/health`);
        return await response.json();
    } catch (error) {
        console.error('Error checking health:', error);
        return { status: 'unhealthy', detail: 'No se pudo conectar al servidor backend.' };
    }
}

export async function listRepositories() {
    const response = await fetch(`${API_BASE}/repositories`);
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Fallo al listar repositorios');
    }
    return await response.json();
}

export async function getRepositoryStats(repoId) {
    const response = await fetch(`${API_BASE}/repositories/${repoId}/stats`);
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Fallo al obtener estadísticas');
    }
    return await response.json();
}

export async function executeSparqlQuery(repoId, query) {
    const response = await fetch(`${API_BASE}/sparql/query/${repoId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Error al ejecutar consulta SPARQL');
    }
    return await response.json();
}

export async function executeSparqlUpdate(repoId, update) {
    const response = await fetch(`${API_BASE}/sparql/update/${repoId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ update }),
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Error al ejecutar actualización SPARQL');
    }
    return await response.json();
}

export async function getEntityRelations(repoId, uri) {
    const response = await fetch(`${API_BASE}/sparql/entity/${repoId}/relations?uri=${encodeURIComponent(uri)}`);
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Fallo al obtener relaciones de la entidad');
    }
    return await response.json();
}

export async function getGeolocalizedEntities(repoId) {
    const response = await fetch(`${API_BASE}/sparql/entities/${repoId}/geolocalized`);
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Fallo al obtener entidades geolocalizadas');
    }
    return await response.json();
}
