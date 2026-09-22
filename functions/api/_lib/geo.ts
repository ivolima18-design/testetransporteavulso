/**
 * Funções utilitárias de cálculos geográficos e distâncias
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Calcula a distância geodésica em quilômetros entre dois pontos (latitude/longitude)
 * utilizando a fórmula padrão de Haversine.
 */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  if (lat1 === lat2 && lng1 === lng2) {
    return 0;
  }

  const toRad = (degree: number) => (degree * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const radLat1 = toRad(lat1);
  const radLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Coordenadas fixas dos terminais do Aeroporto Internacional de Guarulhos (GRU)
 */
export const GRU_TERMINAL_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'Terminal 1': { lat: -23.4429, lng: -46.4862 },
  'Terminal 2': { lat: -23.4307, lng: -46.4730 },
  'Terminal 3': { lat: -23.4262, lng: -46.4679 },
  'Default': { lat: -23.4356, lng: -46.4731 },
};

export function getTerminalCoordinates(terminalName?: string): { lat: number; lng: number } {
  if (!terminalName) return GRU_TERMINAL_COORDINATES['Default'];
  if (terminalName.includes('1')) return GRU_TERMINAL_COORDINATES['Terminal 1'];
  if (terminalName.includes('2')) return GRU_TERMINAL_COORDINATES['Terminal 2'];
  if (terminalName.includes('3')) return GRU_TERMINAL_COORDINATES['Terminal 3'];
  return GRU_TERMINAL_COORDINATES['Default'];
}

/**
 * Heurística do Vizinho Mais Próximo para ordenação de paradas a partir de uma origem:
 * A cada passo, seleciona o ponto ainda não visitado mais próximo do último ponto visitado.
 */
export function nearestNeighborOrder(
  pontos: { id: string; lat: number; lng: number }[],
  origem: { lat: number; lng: number }
): string[] {
  if (pontos.length === 0) return [];
  if (pontos.length === 1) return [pontos[0].id];

  const unvisited = [...pontos];
  const orderedIds: string[] = [];
  let currentPos = origem;

  while (unvisited.length > 0) {
    let nearestIdx = -1;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const p = unvisited[i];
      const d = haversineDistanceKm(currentPos.lat, currentPos.lng, p.lat, p.lng);
      if (d < minDistance) {
        minDistance = d;
        nearestIdx = i;
      }
    }

    if (nearestIdx >= 0) {
      const [nextPoint] = unvisited.splice(nearestIdx, 1);
      orderedIds.push(nextPoint.id);
      currentPos = { lat: nextPoint.lat, lng: nextPoint.lng };
    } else {
      break;
    }
  }

  return orderedIds;
}
