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
// Calculate sector benchmarks
app.post('/api/benchmarks/calculate', async (req, res) => {
    try {
        const { sector } = req.body;
        
        // Get all projects in this sector
        const { data: projects, error: projectsError } = await supabase
            .from('projects')
            .select('id, organization_id')
            .eq('sector', sector);
        
        if (projectsError) throw projectsError;
        
        if (!projects || projects.length === 0) {
            return res.json({ 
                success: true, 
                message: 'No projects found for this sector',
                count: 0 
            });
        }
        
        const projectIds = projects.map(p => p.id);
        
        // Get all assessments for these projects
        const { data: assessments, error: assessError } = await supabase
            .from('assessments')
            .select('impact_score, financial_score')
            .in('project_id', projectIds);
        
        if (assessError) throw assessError;
        
        // Calculate averages
        let avgImpact = 0;
        let avgFinancial = 0;
        
        if (assessments && assessments.length > 0) {
            const validAssessments = assessments.filter(a => 
                a.impact_score != null && a.financial_score != null
            );
            
            if (validAssessments.length > 0) {
                avgImpact = validAssessments.reduce((sum, a) => sum + a.impact_score, 0) / validAssessments.length;
                avgFinancial = validAssessments.reduce((sum, a) => sum + a.financial_score, 0) / validAssessments.length;
            }
        }
        
        // Insert/update benchmarks
        const benchmarkData = [
            {
                sector: sector,
                metric_name: 'Average Impact Score',
                metric_value: avgImpact,
                sample_size: projects.length,
                percentile_25: avgImpact * 0.9,
                percentile_50: avgImpact,
                percentile_75: avgImpact * 1.1
            },
            {
                sector: sector,
                metric_name: 'Average Financial Score',
                metric_value: avgFinancial,
                sample_size: projects.length,
                percentile_25: avgFinancial * 0.9,
                percentile_50: avgFinancial,
                percentile_75: avgFinancial * 1.1
            }
        ];
        
        const { error: benchError } = await supabase
            .from('benchmarks')
            .upsert(benchmarkData, { 
                onConflict: 'sector,metric_name',
                ignoreDuplicates: false 
            });
        
        if (benchError) throw benchError;
        
        res.json({ 
            success: true, 
            message: `Benchmarks calculated for ${sector}`,
            metrics: benchmarkData.length,
            projects: projects.length
        });
        
    } catch (error) {
        console.error('Benchmark calculation error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});
