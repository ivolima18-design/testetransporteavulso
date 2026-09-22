/**
 * Geocodificação de endereços residenciais usando Nominatim (OpenStreetMap)
 * com cache determinístico no Cloudflare KV (WFS_KV) e respeito às políticas
 * de uso (User-Agent identificável e delay de segurança de ~1.1s para requisições novas).
 */

export async function geocodeAddress(
  address: string,
  kv: KVNamespace
): Promise<{ lat: number; lng: number } | null> {
  if (!address || typeof address !== 'string') {
    return null;
  }

  // 1. Normalizar o endereço recebido (trim, lowercase, remover espaços duplicados)
  const normalizado = address
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  if (!normalizado) {
    return null;
  }

  // Chave determinística de cache no KV
  let hash = 0;
  for (let i = 0; i < normalizado.length; i++) {
    hash = (hash << 5) - hash + normalizado.charCodeAt(i);
    hash |= 0;
  }
  const hashKey = Math.abs(hash).toString(36);
  const safePrefix = normalizado.replace(/[^a-z0-9]/g, '_').slice(0, 60);
  const cacheKey = `geocode:${safePrefix}_${hashKey}`;

  // 2. Antes de chamar qualquer API externa, verificar no KV se já existe a chave
  if (kv) {
    try {
      const cached = await kv.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (
          parsed &&
          typeof parsed.lat === 'number' &&
          typeof parsed.lng === 'number' &&
          !isNaN(parsed.lat) &&
          !isNaN(parsed.lng)
        ) {
          return { lat: parsed.lat, lng: parsed.lng };
        }
      }
    } catch (kvReadErr) {
      console.warn('[geocodeAddress] Erro ao ler KV cache:', kvReadErr);
    }
  }

  // 6. Delay de segurança (~1100ms) SOMENTE quando for uma chamada nova ao Nominatim (não quando vier do cache)
  await new Promise((resolve) => setTimeout(resolve, 1100));

  // 3. Chamar a API pública do Nominatim (OpenStreetMap)
  try {
    const endpoint = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(
      normalizado
    )}`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'User-Agent': 'SistemaTransporteAvulsoWFS/1.0 (contato: ivoaltctrl@gmail.com)',
        Accept: 'application/json',
      },
    });

    // 4. Se a resposta vier vazia ou der erro, retornar null (não quebrar o fluxo do app)
    if (!response.ok) {
      console.warn(`[geocodeAddress] Nominatim retornou status ${response.status}`);
      return null;
    }

    const data: any = await response.json().catch(() => null);

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    // 5. Extrair lat/lon do primeiro item
    const first = data[0];
    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);

    if (isNaN(lat) || isNaN(lng)) {
      return null;
    }

    const coords = { lat, lng };

    // Salvar no KV
    if (kv) {
      try {
        await kv.put(
          cacheKey,
          JSON.stringify({
            lat,
            lng,
            endereco: address,
            geocodedEm: new Date().toISOString(),
          })
        );
      } catch (kvPutErr) {
        console.warn('[geocodeAddress] Erro ao salvar no KV cache:', kvPutErr);
      }
    }

    return coords;
  } catch (err) {
    // 4. Se der erro na chamada, retorne null sem interromper o fluxo
    console.warn('[geocodeAddress] Falha ao consultar Nominatim:', err);
    return null;
  }
}
