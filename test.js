const url = 'https://xtrceqpuwqetzslwxxux.supabase.co/functions/v1/calculate-quote';
const key = 'sb_publishable_Wt5TmlxBw3FOtZ_L_oWt0Q_RoMMVuni';
fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ operation_mode: 'sale', condition: 'used', zip_destino: '33606', container_size: '20std', options: { export_certificate: true, extra_service: false, crane_service: false } })
}).then(r => r.text().then(t => console.log(r.status, t))).catch(console.error);
