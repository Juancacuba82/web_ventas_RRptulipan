import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getCoordinates(zip: string): Promise<{lat: number, lon: number}> {
    const cleanZip = zip.replace(/\D/g, '').substring(0, 5);
    
    // STRICTLY USE NOMINATIM TO MATCH WEBAPP EXACTLY
    const url = `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cleanZip}&countrycodes=us&limit=1`;
    const response = await fetch(url, { headers: { 'User-Agent': 'CalcLogistics-API/1.0' } });
    const data = await response.json();
    if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
    throw new Error('Coordinates not found for ' + zip);
}

async function getDrivingDistanceMiles(origin: string | {lat: number, lon: number}, dest: string | {lat: number, lon: number}): Promise<number> {
    try {
        const originCoords = typeof origin === 'string' ? await getCoordinates(origin) : origin;
        const destCoords = typeof dest === 'string' ? await getCoordinates(dest) : dest;
        const url = `https://router.project-osrm.org/route/v1/driving/${originCoords.lon},${originCoords.lat};${destCoords.lon},${destCoords.lat}?overview=false`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const distanceMeters = data.routes[0].distance;
            return distanceMeters / 1609.344;
        }
        throw new Error('OSRM Route Failed');
    } catch (e) {
        throw new Error('Routing Error');
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
            
            const originHub = hubs.find((h: any) => h.zip === zip_origen);
            const deliveryRanges = originHub ? originHub.deliveryRanges : null;
            
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
                    const miamiHub = activeHubs.find((h: any) => h.name.toLowerCase().includes('miami')) || { lat: 25.8640, lon: -80.4074, name: 'Miami Hub', zip: '33178' };
                    const hubCoords = (miamiHub.lat && miamiHub.lon) ? {lat: miamiHub.lat, lon: miamiHub.lon} : miamiHub.zip;
                    const d = await getDrivingDistanceMiles(hubCoords, immedOriginCoords).catch(() => Infinity);
                    hubDistances = [{ hub: miamiHub, dist: d }];
                } else {
                    const distancePromises = activeHubs.map((hub: any) => {
                        // Skip Titusville as per business logic (usually not used for dispatch)
                        if (hub.zip === '32780') return Promise.resolve({hub, dist: Infinity});
                        const hubCoords = (hub.lat && hub.lon) ? {lat: hub.lat, lon: hub.lon} : hub.zip;
                        return getDrivingDistanceMiles(hubCoords, immedOriginCoords)
                            .then(d => ({hub, dist: d}))
                            .catch(() => ({hub, dist: Infinity}));
                    });
                    hubDistances = await Promise.all(distancePromises);
                }
                
                for (const item of hubDistances) {
                    if (item.dist < minDistToPickup) {
                        minDistToPickup = item.dist;
                        closest_yard = item.hub;
                        closest_yard_zip = item.hub.zip;
                    }
                }

                if (closest_yard && minDistToPickup !== Infinity) {
                    immediate_distance = minDistToPickup + dist;
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
            if (!zip_destino) throw new Error("zip_destino es requerido para generar la matriz");

            let destCoords = zip_destino;
            try { destCoords = await getCoordinates(zip_destino); } catch(e) {}

            const distances = await Promise.all(
                activeHubs.map((hub: any) => {
                    const hubCoords = (hub.lat && hub.lon) ? {lat: hub.lat, lon: hub.lon} : hub.zip;
                    return getDrivingDistanceMiles(hubCoords, destCoords).catch(() => 999999);
                })
            );

            const stdSizes = ["20std", "40std", "40hc", "45hc", "20os", "40os", "20dd", "40dd"];
            const reeferSizes = ["20func", "20nofunc", "40func", "40nofunc"];
            
            const bestUsed: Record<string, number> = {};
            const bestNew: Record<string, number> = {};
            const bestReefer: Record<string, number> = {};
            const shippingCosts: Record<string, number> = {};

            activeHubs.forEach((hub: any, index: number) => {
                const dist = distances[index];
                if (dist === 999999) return;
                
                // NO 20ft discount for sales!
                const deliveryCost = calculateDeliveryFee(dist, deliveryRates, false, 0, hub.deliveryRanges);
                
                shippingCosts[hub.name] = deliveryCost; 

                stdSizes.forEach(size => {
                    const is20 = size.startsWith('20');
                    const localCertFee = options.export_certificate ? (is20 ? (hub.certCosts?.['20ft'] || 250) : (hub.certCosts?.['40ft'] || 250)) : 0;
                    if (hub.used && hub.used[size] > 0) {
                        let total = hub.used[size] + deliveryCost + craneServiceFee + localCertFee;
                        if (features.redondeo_25) total = Math.ceil(total / 25) * 25;
                        if (!bestUsed[size] || total < bestUsed[size]) bestUsed[size] = total;
                    }
                    if (hub.new && hub.new[size] > 0) {
                        let total = hub.new[size] + deliveryCost + craneServiceFee + localCertFee;
                        if (features.redondeo_25) total = Math.ceil(total / 25) * 25;
                        if (!bestNew[size] || total < bestNew[size]) bestNew[size] = total;
                    }
                });

                reeferSizes.forEach(size => {
                    const is20 = size.startsWith('20');
                    const localCertFee = options.export_certificate ? (is20 ? (hub.certCosts?.['20ft'] || 250) : (hub.certCosts?.['40ft'] || 250)) : 0;
                    if (hub.reefer && hub.reefer[size] > 0) {
                        let total = hub.reefer[size] + deliveryCost + craneServiceFee + localCertFee;
                        if (features.redondeo_25) total = Math.ceil(total / 25) * 25;
                        if (!bestReefer[size] || total < bestReefer[size]) bestReefer[size] = total;
                    }
                });
            });

            // Extract base rent prices from the first active hub that has them
            let baseRentUsed = { "20std": 150, "40std": 225, "40hc": 250, "45hc": 300 }; // Fallbacks
            let baseRentNew = { "20std": 250, "40std": 325, "40hc": 350, "45hc": 400 };
            const hubWithRent = activeHubs.find((h: any) => h.rent && h.rent.used);
            if (hubWithRent && hubWithRent.rent) {
                if (hubWithRent.rent.used) baseRentUsed = { ...baseRentUsed, ...hubWithRent.rent.used };
                if (hubWithRent.rent.new) baseRentNew = { ...baseRentNew, ...hubWithRent.rent.new };
            }

            const mappedUsed = {
                "20'": bestUsed["20std"],
                "40' STD": bestUsed["40std"],
                "40' HC": bestUsed["40hc"],
                "45'": bestUsed["45hc"]
            };
            const mappedNew = {
                "20'": bestNew["20std"],
                "40' STD": bestNew["40std"],
                "40' HC": bestNew["40hc"],
                "45'": bestNew["45hc"]
            };
            const mappedReefer = {
                "20' Funcional": bestReefer["20func"],
                "20' Sin A/C": bestReefer["20nofunc"],
                "40' Funcional": bestReefer["40func"],
                "40' Sin A/C": bestReefer["40nofunc"]
            };
            const mappedRentUsed = {
                "20'": baseRentUsed["20std"] || 150,
                "40' STD": baseRentUsed["40std"] || 225,
                "40' HC": baseRentUsed["40hc"] || 250,
                "45'": baseRentUsed["45hc"] || 300
            };
            const mappedRentNew = {
                "20'": baseRentNew["20std"] || 250,
                "40' STD": baseRentNew["40std"] || 325,
                "40' HC": baseRentNew["40hc"] || 350,
                "45'": baseRentNew["45hc"] || 400
            };

            return new Response(JSON.stringify({
                bestUsed: mappedUsed,
                bestNew: mappedNew,
                bestReefer: mappedReefer,
                rentUsed: mappedRentUsed,
                rentNew: mappedRentNew,
                rawUsed: bestUsed, 
                rawNew: bestNew,
                rawReefer: bestReefer,
                shippingCosts: shippingCosts
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
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

            const hubDistances = await Promise.all(
                activeHubs.map(async (hub: any) => {
                    try {
                        const hubCoords = (hub.lat && hub.lon) ? {lat: hub.lat, lon: hub.lon} : hub.zip;
                        const dist = await getDrivingDistanceMiles(hubCoords, destCoords);
                        return { hub, dist };
                    } catch (e) {
                        return { hub, dist: Infinity };
                    }
                })
            );

            // 3. Evaluar el mejor puerto
            for (const item of hubDistances) {
                if (item.dist === Infinity) continue;
                
                const hub = item.hub;
                let deliveryCost = calculateDeliveryFee(item.dist, deliveryRates, false, 0, hub.deliveryRanges);
                
                // Fetch container price from the exact size
                let containerPrice = 0;
                
                if (operation_mode === 'rent') {
                    // For rent, use global rent rates (if available in settings or hardcoded). Usually rent prices are global.
                    if (isReefer) {
                        containerPrice = 0;
                    } else {
                        const rentData = condition === 'new' ? hub.rent?.new : hub.rent?.used;
                        containerPrice = rentData ? (rentData[container_size] || 0) : 0;
                    }
                    
                    // En renta cobramos envío de ida y vuelta
                    deliveryCost = deliveryCost * 2;
                } else if (isReefer) {
                    if (hub.reefer && hub.reefer[reeferKey]) {
                        containerPrice = hub.reefer[reeferKey];
                    }
                } else {
                    const priceData = condition === 'new' ? hub.new : hub.used;
                    containerPrice = priceData ? (priceData[container_size] || 0) : 0;
                }

                if (containerPrice === 0) continue;
                
                let subtotal = containerPrice + deliveryCost;
                
                // Apply Redondeo 25 exactly like Webapp Mode 1
                if (features.redondeo_25) {
                    const ceiledSub = Math.ceil(subtotal / 25) * 25;
                    deliveryCost += (ceiledSub - subtotal);
                    subtotal = ceiledSub;
                }
                
                const localCertFee = options.export_certificate ? (is20ft ? (hub.certCosts?.['20ft'] || 250) : (hub.certCosts?.['40ft'] || 250)) : 0;
                const totalPrice = subtotal + craneServiceFee + localCertFee + extraServiceFee;

                if (totalPrice < bestTotalPrice) {
                    bestTotalPrice = totalPrice;
                    bestHub = hub;
                    bestDistance = item.dist;
                    bestDeliveryCost = deliveryCost;
                    bestContainerPrice = containerPrice;
                    bestCertFee = localCertFee;
                }
            }
        }

        if (!bestHub || bestTotalPrice === Infinity) {
            return new Response(JSON.stringify({ error: "No available hubs, containers, or route impossible" }), { status: 400, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
            origin_hub: bestHub.name,
            origin_zip: bestHub.zip,
            distance_miles: bestDistance,
            delivery_cost: bestDeliveryCost,
            container_price: bestContainerPrice,
            crane_service_fee: craneServiceFee,
            extra_service_fee: extraServiceFee,
            cert_fee: bestCertFee,
            total_price: bestTotalPrice
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
