const fs = require('fs');
const url = 'https://xtrceqpuwqetzslwxxux.supabase.co/rest/v1/licencias?select=config&clave=eq.ROL26_%23kR8t!v2M';
const key = 'sb_publishable_Wt5TmlxBw3FOtZ_L_oWt0Q_RoMMVuni';

fetch(url, { headers: { 'apikey': key, 'Authorization': `Bearer ${key}` } })
  .then(r => r.json())
  .then(data => {
      fs.writeFileSync('hubs_dump2.json', JSON.stringify(data[0].config.hubs, null, 2));
  }).catch(console.error);
