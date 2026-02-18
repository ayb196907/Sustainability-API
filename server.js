// ============================================
// SUSTAINABILITY INTELLIGENCE API
// Node.js + Express + Supabase
// ============================================

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create or get organization
app.post('/api/organizations', async (req, res) => {
    try {
        const { user_id, name, sector } = req.body;
        
        // Check if organization already exists
        const { data: existing } = await supabase
            .from('organizations')
            .select('*')
            .eq('user_id', user_id)
            .eq('name', name)
            .single();
        
        if (existing) {
            return res.json({ success: true, data: existing });
        }
        
        // Create new organization
        const { data, error } = await supabase
            .from('organizations')
            .insert([{ user_id, name, sector, country: 'MENA/GCC' }])
            .select()
            .single();
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Create project
app.post('/api/projects', async (req, res) => {
    try {
        const { user_id, organization_id, name, reporting_year, frameworks, status } = req.body;
        
        const { data, error } = await supabase
            .from('projects')
            .insert([{
                user_id,
                organization_id,
                name,
                reporting_year,
                frameworks,
                status: status || 'Draft'
            }])
            .select()
            .single();
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        console.error('Project creation error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

app.post('/api/assessments/bulk', async (req, res) => {
    try {
        const { assessments } = req.body;
        const { data, error } = await supabase
            .from('assessments')
            .upsert(assessments)
            .select();
        
        if (error) throw error;
        res.json({ success: true, count: data.length, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get('/api/benchmarks/sector/:sector', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('benchmarks')
            .select('*')
            .eq('sector', req.params.sector);
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 API running on port ${PORT}`);
});

module.exports = app;
