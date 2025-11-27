// api/packs.js
export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Debug logging
  console.log('Method:', req.method);
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

    const { name, description, price_usdc, image_url, is_active } = body;

    const SUPABASE_URL = process.env.PACKRIPPR_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.PACKRIPPR_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.log('Missing env vars:', { SUPABASE_URL: !!SUPABASE_URL, SUPABASE_ANON_KEY: !!SUPABASE_ANON_KEY });
      return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    if (req.method === 'POST') {
      console.log('Creating pack with data:', body);
      
      // CREATE new pack
      const response = await fetch(`${SUPABASE_URL}/rest/v1/packs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          name: name || null,
          description: description || null,
          price_usdc: price_usdc || 50.000000,
          image_url: image_url || null,
          is_active: is_active !== undefined ? is_active : true
        })
      });

      console.log('Supabase response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Supabase error response:', errorText);
        throw new Error(`Supabase error: ${errorText}`);
      }

      const data = await response.json();
      console.log('Supabase success response:', data);

      return res.status(200).json({
        success: true,
        action: 'created',
        pack: data[0]
      });

    } else if (req.method === 'GET') {
      // GET packs - with optional filtering
      const { id, is_active } = req.query;
      
      let url = `${SUPABASE_URL}/rest/v1/packs?select=*`;
      
      // Add filters if provided
      if (id) {
        url += `&id=eq.${id}`;
      }
      if (is_active !== undefined) {
        url += `&is_active=eq.${is_active}`;
      }
      
      // Order by creation date
      url += '&order=created_at.desc';

      console.log('Fetching packs from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase error: ${errorText}`);
      }

      const data = await response.json();
      
      return res.status(200).json({
        success: true,
        packs: data,
        count: data.length
      });

    } else if (req.method === 'PUT') {
      // UPDATE pack by ID
      const { id, name, description, price_usdc, image_url, is_active } = body;

      if (!id) {
        return res.status(400).json({ error: 'Pack ID is required for update' });
      }

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (price_usdc !== undefined) updateData.price_usdc = price_usdc;
      if (image_url !== undefined) updateData.image_url = image_url;
      if (is_active !== undefined) updateData.is_active = is_active;

      console.log('Updating pack:', id, 'with data:', updateData);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/packs?id=eq.${id}`, {
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
        const errorText = await response.text();
        throw new Error(`Supabase error: ${errorText}`);
      }

      const data = await response.json();

      if (data.length === 0) {
        return res.status(404).json({ error: 'Pack not found' });
      }

      return res.status(200).json({
        success: true,
        action: 'updated',
        pack: data[0]
      });

    } else if (req.method === 'DELETE') {
      // DELETE pack by ID
      const { id } = body;

      if (!id) {
        return res.status(400).json({ error: 'Pack ID is required for deletion' });
      }

      console.log('Deleting pack:', id);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/packs?id=eq.${id}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=representation'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Supabase error: ${errorText}`);
      }

      const data = await response.json();

      return res.status(200).json({
        success: true,
        action: 'deleted',
        deleted_count: data.length
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (err) {
    console.error('Packs API Error:', err);
    
    res.status(500).json({
      error: 'Packs operation failed',
      details: err?.message || String(err)
    });
  }
}