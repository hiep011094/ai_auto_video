import fs from 'fs';
import path from 'path';

async function fetchVoices() {
    const envContent = fs.readFileSync('.env.local', 'utf-8');
    const tokenMatch = envContent.match(/VBEE_BEARER_TOKEN=(.*)/);
    if (!tokenMatch) {
        console.error("Token not found");
        return;
    }
    const token = tokenMatch[1].trim();
    
    try {
        const res = await fetch('https://vbee.vn/api/v1/voices', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await res.json();
        fs.writeFileSync('vbee_voices_test.json', JSON.stringify(data, null, 2));
        console.log("Success, wrote to vbee_voices_test.json");
    } catch (e) {
        console.error(e);
    }
}

fetchVoices();
