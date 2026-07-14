export const PAGE_ACCESS_TOKEN = Deno.env.get('META_PAGE_ACCESS_TOKEN') || '';

export async function sendMessage(recipientId: string, text: string) {
    if (!PAGE_ACCESS_TOKEN) {
        console.warn('No META_PAGE_ACCESS_TOKEN found. Cannot send message to', recipientId);
        return;
    }
    
    const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    const payload = {
        recipient: { id: recipientId },
        message: { text: text }
    };
    
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
        const errorText = await res.text();
        console.error('Error sending Meta message:', errorText);
    }
}

export async function sendQuickReplies(recipientId: string, text: string, options: string[]) {
    if (!PAGE_ACCESS_TOKEN) {
        console.warn('No META_PAGE_ACCESS_TOKEN found. Cannot send quick replies to', recipientId);
        return;
    }
    
    const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    
    const quickReplies = options.map(opt => ({
        content_type: 'text',
        title: opt,
        payload: opt // We use the button text as the payload for simplicity
    }));
    
    const payload = {
        recipient: { id: recipientId },
        message: { 
            text: text,
            quick_replies: quickReplies
        }
    };
    
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
        const errorText = await res.text();
        console.error('Error sending Meta quick replies:', errorText);
    }
}

export async function sendButtonMessage(recipientId: string, text: string, buttonTitle: string, buttonUrl: string) {
    if (!PAGE_ACCESS_TOKEN) {
        console.warn('No META_PAGE_ACCESS_TOKEN found. Cannot send button message to', recipientId);
        return;
    }
    
    const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    
    const payload = {
        recipient: { id: recipientId },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: text.substring(0, 640), // FB limit is 640 chars for text
                    buttons: [
                        {
                            type: "web_url",
                            url: buttonUrl,
                            title: buttonTitle.substring(0, 20) // FB limit is 20 chars for button title
                        }
                    ]
                }
            }
        }
    };
    
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
        const errorText = await res.text();
        console.error('Error sending Meta button message:', errorText);
    }
}
