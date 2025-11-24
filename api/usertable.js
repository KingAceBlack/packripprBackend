// api/user.js - Using fetch instead of @supabase/supabase-js
export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { walletAddress, fid, username, avatar_url, total_points, tier, last_login, current_login_streak, longest_login_streak, notifications_enabled, frame_added } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ error: 'walletAddress is required' });
    }

    const SUPABASE_URL = process.env.PACKRIPPR_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.PACKRIPPR_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    if (req.method === 'POST') {
      // CREATE or UPDATE user (upsert)
      const response = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'resolution=merge-duplicates'
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

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Supabase error: ${error}`);
      }

      const data = await response.json();

      return res.status(200).json({
        success: true,
        action: 'created/updated',
        user: data[0]
      });

    } else if (req.method === 'PUT') {
      // UPDATE specific fields
      const updateData = {};
      
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
      
      updateData.updated_at = new Date().toISOString();

      const response = await fetch(`${SUPABASE_URL}/rest/v1/users?wallet_address=eq.${encodeURIComponent(walletAddress)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Supabase error: ${error}`);
      }

      const data = await response.json();

      if (data.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(200).json({
        success: true,
        action: 'updated',
        user: data[0]
      });

    } else if (req.method === 'GET') {
      // GET user by wallet address
      const { walletAddress } = req.query;

      if (!walletAddress) {
        return res.status(400).json({ error: 'walletAddress query parameter is required' });
      }

      const response = await fetch(`${SUPABASE_URL}/rest/v1/users?wallet_address=eq.${encodeURIComponent(walletAddress)}&select=*`, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Supabase error: ${error}`);
      }

      const data = await response.json();

      if (data.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(200).json({
        success: true,
        user: data[0]
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