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

// Middleware
app.use(cors());
app.use(express.json());

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY // Use service key for Excel API access
);

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// AUTHENTICATION
// ============================================
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        const { data, error } = await supabase.auth.signUp({ email, password });
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// ORGANIZATIONS
// ============================================
app.post('/api/organizations', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('organizations')
            .insert([req.body])
            .select();
        
        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get('/api/organizations/:userId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('user_id', req.params.userId);
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// PROJECTS
// ============================================
app.post('/api/projects', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('projects')
            .insert([req.body])
            .select();
        
        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get('/api/projects/:projectId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('projects')
            .select(`
                *,
                organization:organizations(*),
                assessments(*),
                ghg_emissions(*),
                stakeholders(*),
                framework_coverage(*)
            `)
            .eq('id', req.params.projectId)
            .single();
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get('/api/projects/user/:userId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('projects')
            .select('*, organization:organizations(*)')
            .eq('user_id', req.params.userId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// ASSESSMENTS
// ============================================
app.post('/api/assessments/bulk', async (req, res) => {
    try {
        const { assessments } = req.body;
        
        // Upsert assessments (insert or update)
        const { data, error } = await supabase
            .from('assessments')
            .upsert(assessments, {
                onConflict: 'project_id,topic_id'
            })
            .select();
        
        if (error) throw error;
        
        // Update project completion percentage
        if (assessments.length > 0) {
            const projectId = assessments[0].project_id;
            await updateProjectCompletion(projectId);
        }
        
        res.json({ success: true, count: data.length, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get('/api/assessments/project/:projectId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('assessments')
            .select('*')
            .eq('project_id', req.params.projectId);
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// GHG EMISSIONS
// ============================================
app.post('/api/ghg-emissions', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ghg_emissions')
            .upsert([req.body], {
                onConflict: 'project_id,reporting_year'
            })
            .select();
        
        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get('/api/ghg-emissions/project/:projectId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ghg_emissions')
            .select('*')
            .eq('project_id', req.params.projectId)
            .order('reporting_year', { ascending: false });
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// BENCHMARKS (Main feature for Excel)
// ============================================

// Get sector benchmarks
app.get('/api/benchmarks/sector/:sector', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('benchmarks')
            .select('*')
            .eq('sector', req.params.sector)
            .order('metric_name');
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Calculate and update benchmarks
app.post('/api/benchmarks/calculate', async (req, res) => {
    try {
        const { sector } = req.body;
        
        // Calculate benchmarks from all projects in this sector
        const benchmarks = await calculateSectorBenchmarks(sector);
        
        // Upsert benchmarks
        const { data, error } = await supabase
            .from('benchmarks')
            .upsert(benchmarks, {
                onConflict: 'sector,metric_name'
            })
            .select();
        
        if (error) throw error;
        res.json({ success: true, count: data.length, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// Get peer comparison for a specific project
app.get('/api/benchmarks/peer-comparison/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        
        // Get project details
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('*, organization:organizations(*)')
            .eq('id', projectId)
            .single();
        
        if (projectError) throw projectError;
        
        const sector = project.organization.sector;
        
        // Get project metrics
        const { data: assessments } = await supabase
            .from('assessments')
            .select('*')
            .eq('project_id', projectId);
        
        const { data: ghg } = await supabase
            .from('ghg_emissions')
            .select('*')
            .eq('project_id', projectId)
            .single();
        
        // Get sector benchmarks
        const { data: benchmarks } = await supabase
            .from('benchmarks')
            .select('*')
            .eq('sector', sector);
        
        // Calculate peer comparison
        const comparison = calculatePeerComparison(assessments, ghg, benchmarks);
        
        res.json({ success: true, data: comparison });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// STAKEHOLDERS
// ============================================
app.post('/api/stakeholders/bulk', async (req, res) => {
    try {
        const { stakeholders } = req.body;
        
        const { data, error } = await supabase
            .from('stakeholders')
            .insert(stakeholders)
            .select();
        
        if (error) throw error;
        res.json({ success: true, count: data.length, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// FRAMEWORK COVERAGE
// ============================================
app.post('/api/framework-coverage', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('framework_coverage')
            .upsert([req.body], {
                onConflict: 'project_id,framework'
            })
            .select();
        
        if (error) throw error;
        res.json({ success: true, data: data[0] });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

app.get('/api/framework-coverage/project/:projectId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('framework_coverage')
            .select('*')
            .eq('project_id', req.params.projectId);
        
        if (error) throw error;
        res.json({ success: true, data });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function updateProjectCompletion(projectId) {
    // Count total possible assessments (95 topics)
    const totalTopics = 95;
    
    // Count completed assessments
    const { count } = await supabase
        .from('assessments')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId);
    
    const completionPercentage = Math.round((count / totalTopics) * 100);
    
    // Update project
    await supabase
        .from('projects')
        .update({ completion_percentage: completionPercentage })
        .eq('id', projectId);
}

async function calculateSectorBenchmarks(sector) {
    // Get all organizations in this sector
    const { data: orgs } = await supabase
        .from('organizations')
        .select('id')
        .eq('sector', sector);
    
    if (!orgs || orgs.length === 0) return [];
    
    const orgIds = orgs.map(o => o.id);
    
    // Get all projects for these organizations
    const { data: projects } = await supabase
        .from('projects')
        .select('id')
        .in('organization_id', orgIds);
    
    if (!projects || projects.length === 0) return [];
    
    const projectIds = projects.map(p => p.id);
    
    // Benchmark 1: Average Impact Score
    const { data: assessments } = await supabase
        .from('assessments')
        .select('impact_score, financial_score')
        .in('project_id', projectIds);
    
    const impactScores = assessments.map(a => a.impact_score).filter(s => s != null);
    const financialScores = assessments.map(a => a.financial_score).filter(s => s != null);
    
    // Benchmark 2: GHG Intensity
    const { data: ghgData } = await supabase
        .from('ghg_emissions')
        .select('emissions_intensity, total_emissions, pcaf_financed_emissions, pcaf_data_quality_score')
        .in('project_id', projectIds);
    
    const intensities = ghgData.map(g => g.emissions_intensity).filter(i => i != null);
    const totalEmissions = ghgData.map(g => g.total_emissions).filter(e => e != null);
    const pcafScores = ghgData.map(g => g.pcaf_data_quality_score).filter(s => s != null);
    
    // Calculate percentiles
    const benchmarks = [];
    
    if (impactScores.length > 0) {
        benchmarks.push({
            sector,
            metric_name: 'Average Impact Score',
            metric_value: calculateMean(impactScores),
            sample_size: impactScores.length,
            percentile_25: calculatePercentile(impactScores, 25),
            percentile_50: calculatePercentile(impactScores, 50),
            percentile_75: calculatePercentile(impactScores, 75)
        });
    }
    
    if (financialScores.length > 0) {
        benchmarks.push({
            sector,
            metric_name: 'Average Financial Score',
            metric_value: calculateMean(financialScores),
            sample_size: financialScores.length,
            percentile_25: calculatePercentile(financialScores, 25),
            percentile_50: calculatePercentile(financialScores, 50),
            percentile_75: calculatePercentile(financialScores, 75)
        });
    }
    
    if (intensities.length > 0) {
        benchmarks.push({
            sector,
            metric_name: 'GHG Emissions Intensity',
            metric_value: calculateMean(intensities),
            sample_size: intensities.length,
            percentile_25: calculatePercentile(intensities, 25),
            percentile_50: calculatePercentile(intensities, 50),
            percentile_75: calculatePercentile(intensities, 75)
        });
    }
    
    if (totalEmissions.length > 0) {
        benchmarks.push({
            sector,
            metric_name: 'Total GHG Emissions',
            metric_value: calculateMean(totalEmissions),
            sample_size: totalEmissions.length,
            percentile_25: calculatePercentile(totalEmissions, 25),
            percentile_50: calculatePercentile(totalEmissions, 50),
            percentile_75: calculatePercentile(totalEmissions, 75)
        });
    }
    
    if (pcafScores.length > 0) {
        benchmarks.push({
            sector,
            metric_name: 'PCAF Data Quality Score',
            metric_value: calculateMean(pcafScores),
            sample_size: pcafScores.length,
            percentile_25: calculatePercentile(pcafScores, 25),
            percentile_50: calculatePercentile(pcafScores, 50),
            percentile_75: calculatePercentile(pcafScores, 75)
        });
    }
    
    return benchmarks;
}

function calculatePeerComparison(assessments, ghg, benchmarks) {
    const comparison = [];
    
    // Material topics count
    const materialCount = assessments ? assessments.filter(a => a.is_material).length : 0;
    const materialBenchmark = benchmarks.find(b => b.metric_name === 'Material Topics Count');
    
    if (materialBenchmark) {
        comparison.push({
            metric: 'Material Topics',
            value: materialCount,
            sector_average: materialBenchmark.metric_value,
            percentile: calculateRank(materialCount, [
                materialBenchmark.percentile_25,
                materialBenchmark.percentile_50,
                materialBenchmark.percentile_75
            ]),
            status: materialCount > materialBenchmark.metric_value ? 'Above Average' : 'Below Average'
        });
    }
    
    // GHG Intensity
    if (ghg && ghg.emissions_intensity) {
        const intensityBenchmark = benchmarks.find(b => b.metric_name === 'GHG Emissions Intensity');
        if (intensityBenchmark) {
            comparison.push({
                metric: 'GHG Emissions Intensity',
                value: ghg.emissions_intensity,
                sector_average: intensityBenchmark.metric_value,
                percentile: calculateRank(ghg.emissions_intensity, [
                    intensityBenchmark.percentile_25,
                    intensityBenchmark.percentile_50,
                    intensityBenchmark.percentile_75
                ]),
                status: ghg.emissions_intensity < intensityBenchmark.metric_value ? 'Better than Average' : 'Worse than Average'
            });
        }
    }
    
    return comparison;
}

function calculateMean(arr) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function calculatePercentile(arr, percentile) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    
    if (lower === upper) {
        return sorted[lower];
    }
    
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function calculateRank(value, percentiles) {
    const [p25, p50, p75] = percentiles;
    
    if (value <= p25) return 'Bottom 25%';
    if (value <= p50) return 'Bottom 50%';
    if (value <= p75) return 'Top 50%';
    return 'Top 25%';
}

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Sustainability Intelligence API running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
