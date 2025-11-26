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

  const SUPABASE_URL = process.env.PACKRIPPR_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.PACKRIPPR_SUPABASE_ANON_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log('Missing env vars:', { SUPABASE_URL: !!SUPABASE_URL, SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY });
    return res.status(500).json({ error: 'Supabase configuration missing' });
  }

  try {
    // ============ GET METHOD - Retrieve user by wallet address ============
    if (req.method === 'GET') {
      // Get wallet address from query parameter
      const { walletAddress } = req.query;

      if (!walletAddress) {
        return res.status(400).json({ error: 'walletAddress query parameter is required' });
      }

      console.log('Fetching user with wallet:', walletAddress);

      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/users?wallet_address=eq.${walletAddress}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.log('Supabase error response:', errorText);
        throw new Error(`Supabase error: ${errorText}`);
      }

      const data = await response.json();
      console.log('Supabase response:', data);

      if (data.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(200).json({
        success: true,
        user: data[0]
      });
    }

    // ============ POST METHOD - Create/Update user ============
    if (req.method === 'POST') {
      // Parse JSON body
      let body = {};
      if (req.body && typeof req.body === 'string') {
        body = JSON.parse(req.body);
      } else if (req.body && typeof req.body === 'object') {
        body = req.body;
      }
      
      console.log('Parsed body:', body);

      const { 
        walletAddress, 
        fid, 
        username, 
        avatar_url, 
        total_points, 
        tier, 
        last_login, 
        current_login_streak, 
        longest_login_streak, 
        notifications_enabled, 
        frame_added 
      } = body;

      if (!walletAddress) {
        return res.status(400).json({ error: 'walletAddress is required' });
      }

      console.log('Creating/updating user with wallet:', walletAddress);
      
      // First, check if user exists
      const checkResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/users?wallet_address=eq.${walletAddress}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          }
        }
      );

      const existingUsers = await checkResponse.json();
      const userExists = existingUsers.length > 0;

      let response;
      let action;

      if (userExists) {
        // UPDATE existing user
        console.log('User exists, updating...');
        
        const updateData = {
          updated_at: new Date().toISOString()
        };
        
        // Only update fields that are provided
        if (fid !== undefined) updateData.fid = fid;
        if (username !== undefined) updateData.username = username;
        if (avatar_url !== undefined) updateData.avatar_url = avatar_url;
        if (total_points !== undefined) updateData.total_points = total_points;
        if (tier !== undefined) updateData.tier = tier;
        if (last_login !== undefined) updateData.last_login = last_login;
        if (current_login_streak !== undefined) updateData.current_login_streak = current_login_streak;
        if (longest_login_streak !== undefined) updateData.longest_login_streak = longest_login_streak;
        if (notifications_enabled !== undefined) updateData.notifications_enabled = notifications_enabled;
        if (frame_added !== undefined) updateData.frame_added = frame_added;

        response = await fetch(
          `${SUPABASE_URL}/rest/v1/users?wallet_address=eq.${walletAddress}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(updateData)
          }
        );
        action = 'updated';
      } else {
        // CREATE new user
        console.log('User does not exist, creating...');
        
        response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Prefer': 'return=representation'
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
        action = 'created';
      }

      console.log('Supabase response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Supabase error response:', errorText);
        throw new Error(`Supabase error: ${errorText}`);
      }

      const responseText = await response.text();
      let data = [];
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.log('Could not parse response as JSON:', parseError);
        }
      }

      console.log('Supabase success response:', data);

      return res.status(200).json({
        success: true,
        action: action,
        user: data[0] || { wallet_address: walletAddress }
      });
    }

    // Method not allowed
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('User API Error:', err);
    
    res.status(500).json({
      error: 'User operation failed',
      details: err?.message || String(err)
    });
  }
}
