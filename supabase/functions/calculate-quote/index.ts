import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const memoryCache = new Map<string, any>();

async function getCoordinates(zip: string): Promise<{lat: number, lon: number}> {
    const cleanZip = zip.replace(/\D/g, '').substring(0, 5);
    const cacheKey = 'coord_' + cleanZip;
    if (memoryCache.has(cacheKey)) {
        return memoryCache.get(cacheKey);
    }
    
    // 1. Zippopotam.us (Primary - No strict rate limits, highly reliable for US zips)
    try {
        const urlZip = `https://api.zippopotam.us/us/${cleanZip}`;
        const responseZip = await fetch(urlZip);
        if (responseZip.ok) {
            const dataZip = await responseZip.json();
            if (dataZip && dataZip.places && dataZip.places.length > 0) {
                const coords = { lat: parseFloat(dataZip.places[0].latitude), lon: parseFloat(dataZip.places[0].longitude) };
                memoryCache.set(cacheKey, coords);
                return coords;
            }
        }
    } catch (e) {
        console.warn('Zippopotam.us failed, falling back to Nominatim');
    }

    // 2. Fallback to Nominatim OSM strict postalcode
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cleanZip}&countrycodes=us&limit=1`;
        const response = await fetch(url, { headers: { 'User-Agent': 'CalcLogistics-API/1.0' } });
        if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
                const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
                memoryCache.set(cacheKey, coords);
                return coords;
            }
        }
    } catch(e) {}
    
    // 3. Fallback to Nominatim OSM free search
    try {
        const urlFallback = `https://nominatim.openstreetmap.org/search?format=json&q=${cleanZip}+USA&limit=1`;
        const responseFallback = await fetch(urlFallback, { headers: { 'User-Agent': 'CalcLogistics-API/1.0' } });
        if (responseFallback.ok) {
            const dataFallback = await responseFallback.json();
            if (dataFallback && dataFallback.length > 0) {
                const coords = { lat: parseFloat(dataFallback[0].lat), lon: parseFloat(dataFallback[0].lon) };
                memoryCache.set(cacheKey, coords);
                return coords;
            }
        }
    } catch(e) {}
    
    throw new Error('Coordinates not found for ' + zip);
}

function getStraightLineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8; // Radius of the earth in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
}

async function getDrivingDistanceMiles(origin: string | {lat: number, lon: number}, dest: string | {lat: number, lon: number}): Promise<number> {
    const originCoords = typeof origin === 'string' ? await getCoordinates(origin) : origin;
    const destCoords = typeof dest === 'string' ? await getCoordinates(dest) : dest;
    
    const cacheKey = `dist_${originCoords.lat},${originCoords.lon}_${destCoords.lat},${destCoords.lon}`;
    if (memoryCache.has(cacheKey)) {
        return memoryCache.get(cacheKey);
    }

    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${originCoords.lon},${originCoords.lat};${destCoords.lon},${destCoords.lat}?overview=false`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const distanceMiles = data.routes[0].distance / 1609.344;
            memoryCache.set(cacheKey, distanceMiles);
            return distanceMiles;
        }
        throw new Error('OSRM Route Failed');
    } catch (e) {
        console.warn('OSRM failed, falling back to straight-line distance x 1.35');
        const straightMiles = getStraightLineDistance(originCoords.lat, originCoords.lon, destCoords.lat, destCoords.lon);
        const estimatedMiles = straightMiles * 1.35;
        memoryCache.set(cacheKey, estimatedMiles);
        return estimatedMiles;
    }
}

function calculateDeliveryFee(dist: number, globalRates: any, is20ft: boolean = false, route20ftDiscount: number = 0, hubDeliveryRanges?: any[]): number {
    let deliveryCost = 0;
    
    // Si el puerto tiene rangos dinámicos configurados, usarlos prioritariamente
    if (hubDeliveryRanges && hubDeliveryRanges.length > 0) {
        // Encontrar el rango correspondiente
        const range = hubDeliveryRanges.find((r: any) => dist >= r.min && (r.max === null || dist <= r.max));
        if (range) {
            deliveryCost = (range.max === null) ? dist * range.price : range.price;
        } else {
            deliveryCost = dist * 5.5; // Fallback extremo
        }
    } else {
        // Classic global calculation logic
        if (dist <= 30) deliveryCost = globalRates["0-30"] || 350;
        else if (dist <= 60) deliveryCost = globalRates["31-60"] || 400;
        else if (dist <= 80) deliveryCost = globalRates["61-80"] || 475;
        else if (dist <= 100) deliveryCost = globalRates["81-100"] || 550;
        else deliveryCost = dist * (globalRates["over-100"] || 5.5);
    }
    
    // Aplicar descuento 20ft si aplica
    if (is20ft && route20ftDiscount > 0) {
        deliveryCost = Math.max(0, deliveryCost - route20ftDiscount);
    }
    
    // No intermediate rounding, match webapp precisely
    return deliveryCost;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const payload = await req.json();
        const zip_origen = payload.zip_origen;
        const zip_destino = payload.zip_destino;
        const container_size = payload.container_size; 
        const condition = payload.condition; 
        const operation_mode = payload.operation_mode || "sale"; 
        const options = payload.options || {};
        const quantity = Math.max(1, parseInt(payload.quantity) || 1);
        // Truck logic: 1 truck = 1x40' OR 2x20'. For 2x20': containers=2, trucks=1.
        const is20ftSize = container_size && (container_size.startsWith('20') || container_size === '20std' || container_size.startsWith('20'));
        const trucksNeeded = is20ftSize ? Math.ceil(quantity / 2) : quantity;

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: licenseData, error } = await supabase
            .from('licencias')
            .select('config')
            .eq('clave', 'ROL26_#kR8t!v2M')
            .single();

        if (error) throw error;
        
        const config = licenseData?.config || {};
        const hubs = config.hubs || [];
        const features = config.features || {};
        const deliveryRates = config.deliveryRates || { "0-30": 350, "31-60": 400, "61-80": 475, "81-100": 550, "over-100": 5.5 };
        const activeHubs = hubs.filter((h: any) => h.active);
        const route20ftDiscount = 0; // Desactivado para la web de ventas
        
        // Extra fees options
        const extraServiceFee = options.extra_service ? 150 : 0;
        const craneServiceFee = options.crane_service ? 800 : 0;
        const is20ft = container_size ? container_size.startsWith('20') : false;

        // ─────────────────────────────────────────────────────────────────────────────
        // 0. MODO: INTERCEPTAR EXPORTACIONES / ZONAS NO CONTINENTALES
        // ─────────────────────────────────────────────────────────────────────────────
        const nonContinentalPrefixes = ['006', '007', '009', '995', '996', '997', '998', '999', '967', '968'];
        const isExportZip = (zip: string) => {
            if (!zip) return false;
            const prefix = zip.toString().substring(0, 3);
            return nonContinentalPrefixes.includes(prefix);
        };

        if (isExportZip(zip_destino) || isExportZip(zip_origen) || options.export_certificate) {
            return new Response(JSON.stringify({
                requires_manual_quote: true,
                is_export: true
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // 1. MODO: SOLO TRANSPORTE (TRANSPORT_ONLY)
        // ─────────────────────────────────────────────────────────────────────────────
        if (operation_mode === 'transport_only') {
            if (!zip_origen || !zip_destino) {
                return new Response(JSON.stringify({ error: "zip_origen y zip_destino requeridos para transport_only" }), { status: 400, headers: corsHeaders });
            }
            
            const originCoords = (hubs.find((h:any) => h.zip === zip_origen)?.lat) ? {lat: hubs.find((h:any) => h.zip === zip_origen).lat, lon: hubs.find((h:any) => h.zip === zip_origen).lon} : zip_origen;
            const destCoords = (hubs.find((h:any) => h.zip === zip_destino)?.lat) ? {lat: hubs.find((h:any) => h.zip === zip_destino).lat, lon: hubs.find((h:any) => h.zip === zip_destino).lon} : zip_destino;
            
            const dist = await getDrivingDistanceMiles(originCoords, destCoords);
            let immedOriginCoords: any = zip_origen;
            try {
                if (zip_origen) immedOriginCoords = await getCoordinates(zip_origen);
            } catch(e) {}
            
            let closest_hub_for_rates = hubs.find((h: any) => h.zip === zip_origen);
            if (!closest_hub_for_rates && immedOriginCoords && immedOriginCoords.lat) {
                let min_dist_for_rates = Infinity;
                for (const hub of activeHubs) {
                    if (hub.zip === '32780') continue;
                    const hubCoords = (hub.lat && hub.lon) ? {lat: hub.lat, lon: hub.lon} : null;
                    if (!hubCoords) continue;
                    const d = getStraightLineDistance(immedOriginCoords.lat, immedOriginCoords.lon, hubCoords.lat, hubCoords.lon);
                    if (d < min_dist_for_rates) {
                        min_dist_for_rates = d;
                        closest_hub_for_rates = hub;
                    }
                }
            }
            
            const deliveryRanges = closest_hub_for_rates ? closest_hub_for_rates.deliveryRanges : null;
            
            let baseDelivery = calculateDeliveryFee(dist, deliveryRates, is20ft, route20ftDiscount, deliveryRanges);
            let total = baseDelivery + extraServiceFee + craneServiceFee;
            
            // Apply Redondeo 25 feature exactly like webapp
            if (features.redondeo_25) {
                const ceiledTotal = Math.ceil(total / 25) * 25;
                baseDelivery += (ceiledTotal - total);
                total = ceiledTotal;
            }
            
            // Calculate Immediate Price (Yard -> Origin -> Dest)
            let immediate_price = null;
            let immediate_distance = null;
            let closest_yard = null;
            let closest_yard_zip = null;

            try {
                // Find closest active hub to zip_origen
                let minDistToPickup = Infinity;
                let hubDistances: any[] = [];
                
                // Si la grua sale de Miami, la yarda obligatoriamente tiene que ser Miami
                if (options.crane_service) {
                    closest_yard = activeHubs.find((h: any) => h.name.toLowerCase().includes('miami')) || { lat: 25.8640, lon: -80.4074, name: 'Miami Hub', zip: '33178' };
                    closest_yard_zip = closest_yard.zip;
                } else if (immedOriginCoords && immedOriginCoords.lat) {
                    for (const hub of activeHubs) {
                        if (hub.zip === '32780') continue;
                        const hubCoords = (hub.lat && hub.lon) ? {lat: hub.lat, lon: hub.lon} : null;
                        if (!hubCoords) continue;
                        const d = getStraightLineDistance(immedOriginCoords.lat, immedOriginCoords.lon, hubCoords.lat, hubCoords.lon);
                        if (d < minDistToPickup) {
                            minDistToPickup = d;
                            closest_yard = hub;
                            closest_yard_zip = hub.zip;
                        }
                    }
                }

                if (closest_yard) {
                    const yardCoords = (closest_yard.lat && closest_yard.lon) ? {lat: closest_yard.lat, lon: closest_yard.lon} : closest_yard.zip;
                    const d = await getDrivingDistanceMiles(yardCoords, immedOriginCoords).catch(() => Infinity);
                    if (d !== Infinity) {
                        immediate_distance = d + dist;
                    // Usually yard dispatch uses global rates, or its own ranges if we want.
                    // We'll use global rates as fallback if it has no ranges
                    const yardRanges = closest_yard.deliveryRanges || null;
                    let baseImmed = calculateDeliveryFee(immediate_distance, deliveryRates, is20ft, route20ftDiscount, yardRanges);
                    let immedTotal = baseImmed + extraServiceFee + craneServiceFee;
                    
                    if (features.redondeo_25) {
                        const ceiledImmed = Math.ceil(immedTotal / 25) * 25;
                        baseImmed += (ceiledImmed - immedTotal);
                        immedTotal = ceiledImmed;
                    }
                    immediate_price = immedTotal;
                    }
                }
            } catch (e) {
                console.warn("Could not calculate immediate price:", e);
            }
            
            return new Response(JSON.stringify({
                distance_miles: dist,
                base_delivery: baseDelivery,
                extra_service_fee: extraServiceFee,
                crane_service_fee: craneServiceFee,
                total_price: total,
                immediate_price: immediate_price,
                immediate_distance: immediate_distance,
                closest_yard: closest_yard ? closest_yard.name : null,
                closest_yard_zip: closest_yard_zip
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // 2. MODO: MATRIZ COMPLETA (CHATBOT O LISTADOS DE WEBSITE)
        // ─────────────────────────────────────────────────────────────────────────────
        if (!container_size) {
            return new Response(JSON.stringify({ error: "Este endpoint ya no soporta cálculos de matriz completa para optimizar tiempos. Por favor usa 'operation_mode' con un 'container_size' específico." }), { status: 400, headers: corsHeaders });
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // 3. MODO: UN SOLO CONTENEDOR (SALE O RENT)
        // ─────────────────────────────────────────────────────────────────────────────
        let bestHub = null;
        let bestDistance = 0;
        let bestDeliveryCost = 0;
        let bestContainerPrice = 0;
        let bestTotalPrice = Infinity;
        let bestCertFee = 0;
        
        const isReefer = container_size.includes('reefer') || container_size.includes('func') || condition === 'func' || condition === 'nofunc' || condition === 'reefer';
        
        let reeferKey = "";
        if (isReefer) {
            if (container_size.includes('func')) {
                reeferKey = container_size; // already in format '20func' or '40func'
            } else {
                const prefix = container_size.startsWith('20') ? '20' : '40';
                reeferKey = prefix + (condition === 'reefer' ? 'func' : condition); 
            }
        }

        if (zip_destino) {
            let destCoords = zip_destino;
            try { destCoords = await getCoordinates(zip_destino); } catch(e) {}

            let candidates: any[] = [];

            // 1. Evaluar todos los puertos usando estimación de línea recta * 1.35
            for (const hub of activeHubs) {
                const hubCoords = (hub.lat && hub.lon) ? {lat: hub.lat, lon: hub.lon} : null;
                if (!hubCoords || !destCoords.lat) continue;
                
                const straightMiles = getStraightLineDistance(hubCoords.lat, hubCoords.lon, destCoords.lat, destCoords.lon);
                const estimatedMiles = straightMiles * 1.35;
                
                let estimatedDeliveryCost = calculateDeliveryFee(estimatedMiles, deliveryRates, false, 0, hub.deliveryRanges);
                
                let containerPrice = 0;
                
                if (operation_mode === 'rent') {
                    if (isReefer) {
                        containerPrice = 0;
                    } else {
                        const rentData = condition === 'new' ? hub.rent?.new : hub.rent?.used;
                        containerPrice = rentData ? (rentData[container_size] || 0) : 0;
                        if (containerPrice === 0 && hub.rent && typeof hub.rent[container_size] === 'number') {
                            containerPrice = hub.rent[container_size];
                        }
                    }
                    estimatedDeliveryCost = estimatedDeliveryCost * 2;
                } else if (isReefer) {
                    if (hub.reefer) {
                        containerPrice = hub.reefer[reeferKey] || hub.reefer[reeferKey.toUpperCase()] || 0;
                    }
                } else {
                    const priceData = condition === 'new' ? hub.new : hub.used;
                    if (priceData) {
                        containerPrice = priceData[container_size] || priceData[container_size.toUpperCase()] || priceData[container_size.toLowerCase()] || 0;
                        if (containerPrice === 0) {
                            // Try to find ANY key containing 45
                            const fortyFiveKey = Object.keys(priceData).find(k => k.includes("45"));
                            if (fortyFiveKey) {
                                containerPrice = priceData[fortyFiveKey] || 0;
                            }
                        }
                    }
                }

                if (containerPrice === 0) continue;
                
                let estimatedSubtotal = containerPrice + estimatedDeliveryCost;
                candidates.push({ hub, containerPrice, estimatedSubtotal });
            }

            // 2. Escoger el ganador y hacer una única llamada a OSRM
            if (candidates.length > 0) {
                candidates.sort((a, b) => a.estimatedSubtotal - b.estimatedSubtotal);
                const bestCandidate = candidates[0];
                const hub = bestCandidate.hub;
                const containerPrice = bestCandidate.containerPrice;

                const hubCoords = (hub.lat && hub.lon) ? {lat: hub.lat, lon: hub.lon} : hub.zip;
                const actualDist = await getDrivingDistanceMiles(hubCoords, destCoords).catch(() => Infinity);

                if (actualDist !== Infinity) {
                    let deliveryCost = calculateDeliveryFee(actualDist, deliveryRates, false, 0, hub.deliveryRanges);
                    
                    if (operation_mode === 'rent') deliveryCost = deliveryCost * 2;

                    let subtotal = containerPrice + deliveryCost;
                    
                    if (features.redondeo_25) {
                        const ceiledSub = Math.ceil(subtotal / 25) * 25;
                        deliveryCost += (ceiledSub - subtotal);
                        subtotal = ceiledSub;
                    }
                    
                    const localCertFee = options.export_certificate ? (is20ft ? (hub.certCosts?.['20ft'] || 250) : (hub.certCosts?.['40ft'] || 250)) : 0;
                    const totalPrice = subtotal + craneServiceFee + localCertFee + extraServiceFee;

                    bestTotalPrice = totalPrice;
                    bestHub = hub;
                    bestDistance = actualDist;
                    bestDeliveryCost = deliveryCost;
                    bestContainerPrice = containerPrice;
                    bestCertFee = localCertFee;
                }
            }
        }

        if (!bestHub || bestTotalPrice === Infinity) {
            return new Response(JSON.stringify({ error: "No available hubs, containers, or route impossible" }), { status: 400, headers: corsHeaders });
        }

        // Apply quantity multiplier
        const totalContainerPrice = bestContainerPrice * quantity;
        const totalDeliveryCost = bestDeliveryCost * trucksNeeded;
        const totalPrice = totalContainerPrice + totalDeliveryCost + craneServiceFee + extraServiceFee + bestCertFee;

        let nonDiscountedPrice;
        if (is20ftSize && quantity >= 2) {
            const totalDeliveryCostNoDiscount = bestDeliveryCost * quantity;
            nonDiscountedPrice = totalContainerPrice + totalDeliveryCostNoDiscount + craneServiceFee + extraServiceFee + bestCertFee;
        }

        return new Response(JSON.stringify({
            origin_hub: bestHub.name,
            origin_zip: bestHub.zip,
            distance_miles: bestDistance,
            delivery_cost: totalDeliveryCost,
            container_price: totalContainerPrice,
            crane_service_fee: craneServiceFee,
            extra_service_fee: extraServiceFee,
            cert_fee: bestCertFee,
            total_price: totalPrice,
            non_discounted_price: nonDiscountedPrice,
            quantity: quantity,
            trucks_needed: trucksNeeded
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
