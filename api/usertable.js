// api/usertable.js
export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Debug logging
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  console.log('Environment vars present:', {
    url: !!process.env.PACKRIPPR_SUPABASE_URL,
    key: !!process.env.PACKRIPPR_SUPABASE_ANON_KEY
  });

  try {
    // Parse JSON body if it exists
    let body = {};
    if (req.body && typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else if (req.body && typeof req.body === 'object') {
      body = req.body;
    }
    
    console.log('Parsed body:', body);

    const { walletAddress, fid, username, avatar_url, total_points, tier, last_login, current_login_streak, longest_login_streak, notifications_enabled, frame_added } = body;

    if (!walletAddress) {
      return res.status(400).json({ error: 'walletAddress is required' });
    }

    const SUPABASE_URL = process.env.PACKRIPPR_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.PACKRIPPR_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.log('Missing env vars:', { SUPABASE_URL: !!SUPABASE_URL, SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY });
      return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    if (req.method === 'POST') {
      console.log('Creating user with wallet:', walletAddress);
      
      // CREATE or UPDATE user (upsert)
      const response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'resolution=merge-duplicates,return=representation'  // ← KEY FIX: Request data back
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          fid: fid || null,
          username: username || null,
          avatar_url: avatar_url || null,
          total_points: total_points || 0,
          tier: tier || 'Rookie',
          last_login: last_login || new Date().toISOString().split('T')[0],
          current_login_streak: current_login_streak || 1,
          longest_login_streak: longest_login_streak || 1,
          notifications_enabled: notifications_enabled !== undefined ? notifications_enabled : true,
          frame_added: frame_added || false,
          updated_at: new Date().toISOString()
        })
      });

      console.log('Supabase response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Supabase error response:', errorText);
        throw new Error(`Supabase error: ${errorText}`);
      }

      // ← KEY FIX: Handle empty responses
      const responseText = await response.text();
      console.log('Supabase raw response:', responseText);
      
      let data = [];
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.log('Could not parse response as JSON:', parseError);
        }
      }

      console.log('Supabase parsed data:', data);

      return res.status(200).json({
        success: true,
        action: 'created/updated',
        user: data[0] || { wallet_address: walletAddress }
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (err) {
    console.error('User API Error:', err);
    
    res.status(500).json({
      error: 'User operation failed',
      details: err?.message || String(err)
    });
  }
}
