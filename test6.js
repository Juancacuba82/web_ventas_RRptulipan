const url = 'https://xtrceqpuwqetzslwxxux.supabase.co/rest/v1/call_logs?limit=1';
const key = 'sb_publishable_Wt5TmlxBw3FOtZ_L_oWt0Q_RoMMVuni';
fetch(url, { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } })
.then(r => r.json())
.then(data => { console.log(data); })
.catch(console.error);
