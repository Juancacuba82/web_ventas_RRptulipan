const fetch = require('node-fetch');

async function test() {
  const payload = {
    object: 'page',
    entry: [{
      messaging: [{
        sender: { id: 'test_user_' + Date.now() },
        recipient: { id: 'page_id' },
        message: { text: "20' 33606" }
      }]
    }]
  };

  const res = await fetch('https://xtrceqpuwqetzslwxxux.supabase.co/functions/v1/meta-webhook-v3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  console.log(res.status, await res.text());
}
test();
