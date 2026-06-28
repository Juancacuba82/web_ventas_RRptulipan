import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getCoordinates(zip: string): Promise<{lat: number, lon: number}> {
    const cleanZip = zip.replace(/\D/g, '').substring(0, 5);
    try {
        const zipResp = await fetch(`https://api.zippopotam.us/us/${cleanZip}`);
        if (zipResp.ok) {
            const zipData = await zipResp.json();
            if (zipData && zipData.places && zipData.places.length > 0) {
                return { lat: parseFloat(zipData.places[0].latitude), lon: parseFloat(zipData.places[0].longitude) };
            }
        }
    } catch (e) {
        console.warn("Zippopotamus error:", e);
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&postalcode=${cleanZip}&countrycodes=us`;
    const response = await fetch(url, { headers: { 'User-Agent': 'CalcLogistics-API/1.0' } });
    const data = await response.json();
    if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
    throw new Error('Coordinates not found for ' + zip);
}

async function getDrivingDistanceMiles(originZip: string, destZip: string): Promise<number> {
    try {
        const originCoords = await getCoordinates(originZip);
        const destCoords = await getCoordinates(destZip);
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
        // Fallback a las tarifas globales antiguas si el hub no tiene rangos
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
    
    // Redondear siempre a la decena superior (ej: 342 -> 350, o 340 -> 340)
    // Nota: El redondeo en la webapp original podría ser diferente, pero Math.ceil(x/10)*10 es seguro.
    return Math.ceil(deliveryCost / 10) * 10;
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
        const deliveryRates = config.deliveryRates || { "0-30": 350, "31-60": 400, "61-80": 475, "81-100": 550, "over-100": 5.5 };
        const activeHubs = hubs.filter((h: any) => h.active);
        const route20ftDiscount = config.features?.descuento_20ft ? 150 : 0; 
        
        // Dynamic export certificate cost read from database (fallback to 150)
        const dynamicCertCost = config.certExportCost !== undefined ? config.certExportCost : 150;
        
        // Extra fees options
        const extraServiceFee = options.extra_service ? 150 : 0;
        const craneServiceFee = options.crane_service ? 800 : 0;
        const certFee = options.export_certificate ? dynamicCertCost : 0; 
        const is20ft = container_size ? container_size.startsWith('20') : false;

        // ─────────────────────────────────────────────────────────────────────────────
        // 1. MODO: SOLO TRANSPORTE (TRANSPORT_ONLY)
        // ─────────────────────────────────────────────────────────────────────────────
        if (operation_mode === 'transport_only') {
            if (!zip_origen || !zip_destino) {
                return new Response(JSON.stringify({ error: "zip_origen y zip_destino requeridos para transport_only" }), { status: 400, headers: corsHeaders });
            }
            
            const dist = await getDrivingDistanceMiles(zip_origen, zip_destino);
            const originHub = hubs.find((h: any) => h.zip === zip_origen);
            const deliveryRanges = originHub ? originHub.deliveryRanges : null;
            
            const baseDelivery = calculateDeliveryFee(dist, deliveryRates, is20ft, route20ftDiscount, deliveryRanges);
            const total = baseDelivery + extraServiceFee + craneServiceFee;
            
            // Calculate Immediate Price (Yard -> Origin -> Dest)
            let immediate_price = null;
            let immediate_distance = null;
            let closest_yard = null;

            try {
                // Find closest active hub to zip_origen
                let minDistToPickup = Infinity;
                
                const distancePromises = activeHubs.map((hub: any) => {
                    // Skip Titusville as per business logic (usually not used for dispatch)
                    if (hub.zip === '32780') return Promise.resolve({hub, dist: Infinity});
                    return getDrivingDistanceMiles(hub.zip, zip_origen)
                        .then(d => ({hub, dist: d}))
                        .catch(() => ({hub, dist: Infinity}));
                });
                
                const hubDistances = await Promise.all(distancePromises);
                
                for (const item of hubDistances) {
                    if (item.dist < minDistToPickup) {
                        minDistToPickup = item.dist;
                        closest_yard = item.hub;
                    }
                }

                if (closest_yard && minDistToPickup !== Infinity) {
                    immediate_distance = minDistToPickup + dist;
                    // Usually yard dispatch uses global rates, or its own ranges if we want.
                    // We'll use global rates as fallback if it has no ranges
                    const yardRanges = closest_yard.deliveryRanges || null;
                    const baseImmed = calculateDeliveryFee(immediate_distance, deliveryRates, is20ft, route20ftDiscount, yardRanges);
                    immediate_price = baseImmed + extraServiceFee + craneServiceFee;
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
                closest_yard_zip: closest_yard ? closest_yard.zip : null
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // 2. MODO: MATRIZ COMPLETA (CHATBOT O LISTADOS DE WEBSITE)
        // ─────────────────────────────────────────────────────────────────────────────
        if (!container_size) {
            if (!zip_destino) throw new Error("zip_destino es requerido para generar la matriz");

            const distances = await Promise.all(
                activeHubs.map((hub: any) => getDrivingDistanceMiles(hub.zip, zip_destino).catch(() => 999999))
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
                
                const deliveryCost40 = calculateDeliveryFee(dist, deliveryRates, false, 0, hub.deliveryRanges);
                const deliveryCost20 = calculateDeliveryFee(dist, deliveryRates, true, route20ftDiscount, hub.deliveryRanges);
                
                shippingCosts[hub.name] = deliveryCost40; 

                stdSizes.forEach(size => {
                    const isSize20 = size.startsWith('20');
                    const myDelivery = isSize20 ? deliveryCost20 : deliveryCost40;
                    
                    if (hub.used && hub.used[size] > 0) {
                        const total = hub.used[size] + myDelivery + craneServiceFee + certFee;
                        if (!bestUsed[size] || total < bestUsed[size]) bestUsed[size] = total;
                    }
                    if (hub.new && hub.new[size] > 0) {
                        const total = hub.new[size] + myDelivery + craneServiceFee + certFee;
                        if (!bestNew[size] || total < bestNew[size]) bestNew[size] = total;
                    }
                });

                reeferSizes.forEach(size => {
                    const isSize20 = size.startsWith('20');
                    const myDelivery = isSize20 ? deliveryCost20 : deliveryCost40;
                    
                    if (hub.reefer && hub.reefer[size] > 0) {
                        const total = hub.reefer[size] + myDelivery + craneServiceFee + certFee;
                        if (!bestReefer[size] || total < bestReefer[size]) bestReefer[size] = total;
                    }
                });
            });

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

            return new Response(JSON.stringify({
                bestUsed: mappedUsed,
                bestNew: mappedNew,
                rawUsed: bestUsed, 
                rawNew: bestNew,
                rawReefer: bestReefer,
                shippingCosts: shippingCosts
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // 3. MODO: UN SOLO CONTENEDOR (SALE O RENT)
        // ─────────────────────────────────────────────────────────────────────────────
        let originHub = null;
        let bestDistance = 0;
        let bestDeliveryCost = 0;
        let bestContainerPrice = 0;
        let bestTotalPrice = Infinity;
        
        const isReefer = container_size.includes('reefer') || condition === 'func' || condition === 'nofunc';
        let reeferKey = "";
        if (isReefer) {
            const prefix = container_size.startsWith('20') ? '20' : '40';
            reeferKey = prefix + condition; 
        }

        if (zip_origen) {
            originHub = hubs.find((h: any) => h.zip === zip_origen);
            if (originHub) {
                bestDistance = await getDrivingDistanceMiles(originHub.zip, zip_destino);
            }
        } else if (zip_destino) {
            const distances = await Promise.all(
                activeHubs.map((hub: any) => getDrivingDistanceMiles(hub.zip, zip_destino).catch(() => 999999))
            );

            activeHubs.forEach((hub: any, index: number) => {
                const dist = distances[index];
                if (dist === 999999) return; 

                if (operation_mode === 'rent') {
                    const allowedRentZips = ['32218', '32780', '33619', '33178']; 
                    if (!allowedRentZips.includes(hub.zip)) return;
                }

                let deliveryCost = calculateDeliveryFee(dist, deliveryRates, is20ft, route20ftDiscount, hub.deliveryRanges);
                
                if (operation_mode === 'rent') {
                    deliveryCost = deliveryCost * 2; 
                }

                let containerPrice = 0;
                
                if (operation_mode === 'rent') {
                    if (hub.rent && hub.rent[condition] && hub.rent[condition][container_size] !== undefined) {
                        containerPrice = hub.rent[condition][container_size];
                    } else if (hub.rent && hub.rent[container_size] !== undefined) {
                        containerPrice = hub.rent[container_size];
                    }
                } else if (isReefer) {
                    if (hub.reefer && hub.reefer[reeferKey]) {
                        containerPrice = hub.reefer[reeferKey];
                    }
                } else {
                    if (condition === 'new' && hub.new && hub.new[container_size]) {
                        containerPrice = hub.new[container_size];
                    } else if (condition === 'used' && hub.used && hub.used[container_size]) {
                        containerPrice = hub.used[container_size];
                    }
                }

                if (containerPrice === 0) return;
                
                const totalPrice = containerPrice + deliveryCost + craneServiceFee + certFee + extraServiceFee;

                if (totalPrice < bestTotalPrice) {
                    bestTotalPrice = totalPrice;
                    originHub = hub;
                    bestDistance = dist;
                    bestDeliveryCost = deliveryCost;
                    bestContainerPrice = containerPrice;
                }
            });
        }

        if (!originHub || bestTotalPrice === Infinity) {
            return new Response(JSON.stringify({ error: "No available hubs, containers, or route impossible" }), { status: 400, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
            origin_hub: originHub.name,
            origin_zip: originHub.zip,
            distance_miles: bestDistance,
            delivery_cost: bestDeliveryCost,
            container_price: bestContainerPrice,
            crane_service_fee: craneServiceFee,
            extra_service_fee: extraServiceFee,
            cert_fee: certFee,
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
