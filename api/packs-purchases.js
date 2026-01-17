// api/packs-purchases.js - Standardized with explicit table parameter
export default async function handler(req, res) {
  // --- CORS HEADERS ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Debug logging
  console.log('Method:', req.method);
  console.log('Query:', req.query);

  try {
    // Parse JSON body if it exists
    let body = {};
    if (req.body && typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else if (req.body && typeof req.body === 'object') {
      body = req.body;
    }
    
    console.log('Parsed body:', body);

    const { 
      // Pack fields
      name, description, price_usdc, image_url, is_active,
      // Purchase fields
      user_id, pack_id, tx_hash, status, token_id,
      // Common
      id 
    } = body;

    const SUPABASE_URL = process.env.PACKRIPPR_SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.PACKRIPPR_SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    // REQUIRED: Table must be specified in query parameter
    const targetTable = req.query.table;
    if (!targetTable) {
      return res.status(400).json({ 
        error: 'Table parameter is required',
        details: 'Specify ?table=packs or ?table=purchases in the URL'
      });
    }

    if (!['packs', 'purchases'].includes(targetTable)) {
      return res.status(400).json({ 
        error: 'Invalid table specified',
        details: 'Table must be either "packs" or "purchases"'
      });
    }

    if (req.method === 'POST') {
      console.log(`Creating ${targetTable} with data:`, body);
      
      let createData = {};
      
      if (targetTable === 'packs') {
        if (!name) {
          return res.status(400).json({ error: 'name is required for packs' });
        }
        createData = {
          name: name,
          description: description || null,
          price_usdc: price_usdc || 50.000000,
          image_url: image_url || null,
          is_active: is_active !== undefined ? is_active : true
        };
      } else if (targetTable === 'purchases') {
        if (!user_id || !pack_id || !token_id) {
          return res.status(400).json({ error: 'user_id, pack_id, and token_id are required for purchases' });
        }
        createData = {
          user_id: user_id,
          pack_id: pack_id,
          token_id: token_id,
          tx_hash: tx_hash || null,
          status: status || 'pending'
        };
      }

      const response = await fetch(`${SUPABASE_URL}/rest/v1/${targetTable}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(createData)
      });

      console.log('Supabase response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Supabase error response:', errorText);
        throw new Error(`Supabase error: ${errorText}`);
      }

      const data = await response.json();

      return res.status(200).json({
        success: true,
        action: 'created',
        table: targetTable,
        data: data[0]
      });

    } else if (req.method === 'GET') {
      // GET data from specified table
      const { id, is_active, user_id, pack_id, status, token_id } = req.query;
      
      let url = `${SUPABASE_URL}/rest/v1/${targetTable}?select=*`;
      
      // Add filters based on table
      if (id) url += `&id=eq.${id}`;
      
      if (targetTable === 'packs') {
        if (is_active !== undefined) url += `&is_active=eq.${is_active}`;
        url += '&order=created_at.desc';
      } else if (targetTable === 'purchases') {
        if (user_id) url += `&user_id=eq.${user_id}`;
        if (pack_id) url += `&pack_id=eq.${pack_id}`;
        if (token_id) url += `&token_id=eq.${token_id}`;
        if (status) url += `&status=eq.${status}`;
        url += '&order=created_at.desc';
      }

      console.log('Fetching from:', url);

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
        table: targetTable,
        data: data,
        count: data.length
      });

    } else if (req.method === 'PUT') {
      // UPDATE data in specified table
      if (!id) {
        return res.status(400).json({ error: 'id is required for update' });
      }

      const updateData = {};
      
      if (targetTable === 'packs') {
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (price_usdc !== undefined) updateData.price_usdc = price_usdc;
        if (image_url !== undefined) updateData.image_url = image_url;
        if (is_active !== undefined) updateData.is_active = is_active;
      } else if (targetTable === 'purchases') {
        if (user_id !== undefined) updateData.user_id = user_id;
        if (pack_id !== undefined) updateData.pack_id = pack_id;
        if (token_id !== undefined) updateData.token_id = token_id;
        if (tx_hash !== undefined) updateData.tx_hash = tx_hash;
        if (status !== undefined) updateData.status = status;
      }

      console.log(`Updating ${targetTable}:`, id, 'with data:', updateData);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/${targetTable}?id=eq.${id}`, {
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
        return res.status(404).json({ error: `${targetTable} not found` });
      }

      return res.status(200).json({
        success: true,
        action: 'updated',
        table: targetTable,
        data: data[0]
      });

    } else if (req.method === 'DELETE') {
      // DELETE from specified table
      if (!id) {
        return res.status(400).json({ error: 'id is required for deletion' });
      }

      console.log(`Deleting from ${targetTable}:`, id);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/${targetTable}?id=eq.${id}`, {
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
        table: targetTable,
        deleted_count: data.length
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (err) {
    console.error('API Error:', err);
    
    res.status(500).json({
      error: 'Operation failed',
      details: err?.message || String(err)
    });
  }
}
