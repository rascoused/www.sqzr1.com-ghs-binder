#!/usr/bin/env node

require("dotenv").config();
/*
 * GHS Binder Management Dashboard
 * Rasco, Inc. - Professional GHS Safety Binder Automation
 * 
 * Easy-to-use web interface for managing customer GHS binder sites
 * Provides GUI for all deployment and management operations
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { GHSBinderDeployer } = require('./github_deployment.js');
const { ChemicalManager } = require('./chemical_manager.js');

class GHSManagementDashboard {
    constructor(githubToken, port = 3000) {
        this.app = express();
        this.port = port;
        this.deployer = new GHSBinderDeployer(githubToken);
        this.chemicalManager = new ChemicalManager(githubToken);
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Body parsing
        this.app.use(express.json({ limit: '50mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
        
        // File upload handling
        const upload = multer({
            dest: 'uploads/',
            limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
        });
        this.upload = upload;
        
        // Static files
        this.app.use('/static', express.static(path.join(__dirname, '../dashboard_assets')));
        
        // CORS for development
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });
    }

    setupRoutes() {
        // Dashboard home page
        this.app.get('/', (req, res) => {
            res.send(this.generateDashboardHTML());
        });

        // API Routes
        this.app.get('/api/customers', this.handleListCustomers.bind(this));
        this.app.post('/api/customers', this.handleCreateCustomer.bind(this));
        this.app.delete('/api/customers/:slug', this.handleDeleteCustomer.bind(this));
        
        this.app.get('/api/customers/:slug/chemicals', this.handleListChemicals.bind(this));
        this.app.post('/api/customers/:slug/chemicals', this.handleAddChemical.bind(this));
        this.app.delete('/api/customers/:slug/chemicals/:id', this.handleRemoveChemical.bind(this));
        
        this.app.post('/api/customers/:slug/deploy', this.handleDeployCustomer.bind(this));
        this.app.get('/api/customers/:slug/checklist', this.handleGenerateChecklist.bind(this));
        
        // PDF upload handling
        this.app.post('/api/upload-pdfs', this.upload.array('pdfs'), this.handlePDFUpload.bind(this));
        
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy', timestamp: new Date().toISOString() });
        });
    }

    // API Handlers
    async handleListCustomers(req, res) {
        try {
            const customers = await this.deployer.listCustomerSites();
            res.json({ success: true, customers });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async handleCreateCustomer(req, res) {
        try {
            const customerData = req.body;
            
            // Validate required fields
            if (!customerData.name || !customerData.slug) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Customer name and slug are required' 
                });
            }
            
            // Create customer configuration
            const customerConfig = this.createCustomerConfig(customerData);
            
            // Save configuration
            const configPath = path.join(__dirname, '../customer_configs', `${customerData.slug}.json`);
            await fs.writeFile(configPath, JSON.stringify(customerConfig, null, 2));
            
            res.json({ 
                success: true, 
                message: 'Customer created successfully',
                customer: customerConfig.customer_info
            });
            
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async handleDeleteCustomer(req, res) {
        try {
            const { slug } = req.params;
            const result = await this.deployer.deleteCustomerSite(slug);
            res.json({ success: true, result });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async handleListChemicals(req, res) {
        try {
            const { slug } = req.params;
            const includeInactive = req.query.include_inactive === 'true';
            
            const result = await this.chemicalManager.listChemicals(slug, includeInactive);
            res.json({ success: true, ...result });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async handleAddChemical(req, res) {
        try {
            const { slug } = req.params;
            const chemicalData = req.body;
            
            const result = await this.chemicalManager.addChemical(slug, chemicalData);
            res.json({ success: true, result });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async handleRemoveChemical(req, res) {
        try {
            const { slug, id } = req.params;
            const result = await this.chemicalManager.removeChemical(slug, id);
            res.json({ success: true, result });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async handleDeployCustomer(req, res) {
        try {
            const { slug } = req.params;
            
            // Load customer configuration
            const configPath = path.join(__dirname, '../customer_configs', `${slug}.json`);
            const configData = await fs.readFile(configPath, 'utf8');
            const customerConfig = JSON.parse(configData);
            
            const result = await this.deployer.deployCustomerSite(customerConfig);
            res.json({ success: true, result });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async handleGenerateChecklist(req, res) {
        try {
            const { slug } = req.params;
            const checklist = await this.chemicalManager.generateUploadChecklist(slug);
            
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Content-Disposition', `attachment; filename="${slug}-checklist.md"`);
            res.send(checklist);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    async handlePDFUpload(req, res) {
        try {
            const files = req.files;
            const customerSlug = req.body.customer_slug;
            
            if (!files || files.length === 0) {
                return res.status(400).json({ success: false, error: 'No files uploaded' });
            }
            
            if (!customerSlug) {
                return res.status(400).json({ success: false, error: 'Customer slug required' });
            }
            
            // Process uploaded files
            const uploadResults = [];
            
            for (const file of files) {
                try {
                    // Move file to proper location
                    const targetPath = path.join(__dirname, '../uploads', customerSlug, file.originalname);
                    await fs.mkdir(path.dirname(targetPath), { recursive: true });
                    await fs.rename(file.path, targetPath);
                    
                    uploadResults.push({
                        filename: file.originalname,
                        success: true,
                        path: targetPath
                    });
                } catch (error) {
                    uploadResults.push({
                        filename: file.originalname,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            res.json({ 
                success: true, 
                uploaded: uploadResults.filter(r => r.success).length,
                failed: uploadResults.filter(r => !r.success).length,
                results: uploadResults
            });
            
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    createCustomerConfig(customerData) {
        return {
            customer_info: {
                name: customerData.name,
                slug: customerData.slug,
                contact: {
                    company: customerData.name,
                    phone: customerData.phone || '',
                    email: customerData.email || '',
                    emergency: customerData.emergency || '',
                    address: customerData.address || ''
                },
                branding: {
                    logo_url: customerData.logo_url || 'assets/customer_logo.png',
                    primary_color: customerData.primary_color || '#3498db',
                    secondary_color: customerData.secondary_color || '#2c3e50'
                },
                github_repo: {
                    name: `${customerData.slug}-ghs-binder`,
                    url: `https://rasco-inc.github.io/${customerData.slug}-ghs-binder`,
                    custom_domain: customerData.custom_domain || ''
                }
            },
            chemicals: [],
            site_settings: {
                last_updated: new Date().toISOString().split('T')[0],
                generation_date: new Date().toISOString(),
                complete_binder: {
                    filename: 'complete_ghs_binder.pdf',
                    url: 'pdfs/complete_ghs_binder.pdf',
                    title: 'Complete GHS Safety Binder'
                },
                analytics: {
                    google_analytics_id: '',
                    track_downloads: true,
                    track_views: true
                },
                seo: {
                    meta_description: `Professional chemical safety documentation portal for ${customerData.name} providing 24/7 access to GHS-compliant Safety Data Sheets and product literature.`,
                    meta_keywords: 'GHS, safety data sheet, SDS, chemical safety, OSHA compliance',
                    robots: 'index, follow'
                }
            },
            deployment: {
                status: 'created',
                created: new Date().toISOString(),
                last_deployed: null,
                version: '1.0.0',
                auto_update: true
            }
        };
    }

    generateDashboardHTML() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GHS Binder Management Dashboard - Rasco, Inc.</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #2c3e50, #3498db);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        
        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }
        
        .dashboard-content {
            padding: 30px;
        }
        
        .section {
            margin-bottom: 40px;
            padding: 25px;
            border-radius: 10px;
            background: #f8f9fa;
            border-left: 5px solid #3498db;
        }
        
        .section h2 {
            color: #2c3e50;
            margin-bottom: 20px;
            font-size: 1.8rem;
        }
        
        .btn-group {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            margin-bottom: 20px;
        }
        
        .btn {
            padding: 12px 24px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 500;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
        }
        
        .btn:hover {
            background: #2980b9;
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3);
        }
        
        .btn-success { background: #27ae60; }
        .btn-success:hover { background: #229954; }
        
        .btn-danger { background: #e74c3c; }
        .btn-danger:hover { background: #c0392b; }
        
        .btn-warning { background: #f39c12; }
        .btn-warning:hover { background: #e67e22; }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
            color: #2c3e50;
        }
        
        .form-group input,
        .form-group textarea,
        .form-group select {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s ease;
        }
        
        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
            outline: none;
            border-color: #3498db;
            box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-left: 4px solid #3498db;
        }
        
        .card h3 {
            color: #2c3e50;
            margin-bottom: 15px;
        }
        
        .status-indicator {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: 600;
        }
        
        .status-active {
            background: #d4edda;
            color: #155724;
        }
        
        .status-inactive {
            background: #f8d7da;
            color: #721c24;
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
        }
        
        .modal-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 30px;
            border-radius: 15px;
            min-width: 500px;
            max-width: 90vw;
            max-height: 90vh;
            overflow-y: auto;
        }
        
        .close {
            position: absolute;
            top: 10px;
            right: 15px;
            font-size: 24px;
            cursor: pointer;
            color: #999;
        }
        
        .close:hover {
            color: #333;
        }
        
        .loading {
            display: inline-block;
            margin-left: 10px;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        
        .loading.show {
            opacity: 1;
        }
        
        @media (max-width: 768px) {
            .dashboard-content {
                padding: 20px;
            }
            
            .btn-group {
                flex-direction: column;
            }
            
            .btn {
                text-align: center;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 GHS Binder Management Dashboard</h1>
            <p>Professional Chemical Safety Documentation System</p>
            <p><strong>Rasco, Inc.</strong> - Secure Backend Management</p>
        </div>
        
        <div class="dashboard-content">
            <!-- Customer Management Section -->
            <div class="section">
                <h2>👥 Customer Management</h2>
                <div class="btn-group">
                    <button class="btn btn-success" onclick="showCreateCustomerModal()">➕ Add New Customer</button>
                    <button class="btn" onclick="refreshCustomers()">🔄 Refresh List</button>
                    <button class="btn btn-warning" onclick="exportCustomers()">📊 Export Data</button>
                </div>
                
                <div id="customers-list" class="grid">
                    <!-- Customer cards will be populated here -->
                </div>
            </div>
            
            <!-- Chemical Management Section -->
            <div class="section">
                <h2>🧪 Chemical Management</h2>
                <div class="btn-group">
                    <button class="btn btn-success" onclick="showAddChemicalModal()">➕ Add Chemical</button>
                    <button class="btn" onclick="showBulkUploadModal()">📦 Bulk Upload</button>
                    <button class="btn btn-warning" onclick="generateChecklists()">📋 Generate Checklists</button>
                </div>
                
                <div class="form-group">
                    <label for="customer-select">Select Customer:</label>
                    <select id="customer-select" onchange="loadCustomerChemicals()">
                        <option value="">-- Select Customer --</option>
                    </select>
                </div>
                
                <div id="chemicals-list" class="grid">
                    <!-- Chemical cards will be populated here -->
                </div>
            </div>
            
            <!-- Deployment Section -->
            <div class="section">
                <h2>🚀 Deployment Management</h2>
                <div class="btn-group">
                    <button class="btn btn-success" onclick="deployAllCustomers()">🌐 Deploy All Sites</button>
                    <button class="btn" onclick="checkDeploymentStatus()">📊 Check Status</button>
                    <button class="btn btn-warning" onclick="generateQRCodes()">📱 Generate QR Codes</button>
                </div>
                
                <div id="deployment-status">
                    <!-- Deployment status will be shown here -->
                </div>
            </div>
        </div>
    </div>
    
    <!-- Create Customer Modal -->
    <div id="create-customer-modal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('create-customer-modal')">&times;</span>
            <h2>➕ Add New Customer</h2>
            <form id="create-customer-form">
                <div class="form-group">
                    <label for="customer-name">Company Name *</label>
                    <input type="text" id="customer-name" required>
                </div>
                
                <div class="form-group">
                    <label for="customer-slug">URL Slug *</label>
                    <input type="text" id="customer-slug" placeholder="abc-cleaning-services" required>
                    <small>Used for website URL (letters, numbers, hyphens only)</small>
                </div>
                
                <div class="form-group">
                    <label for="customer-phone">Phone Number</label>
                    <input type="tel" id="customer-phone">
                </div>
                
                <div class="form-group">
                    <label for="customer-email">Email Address</label>
                    <input type="email" id="customer-email">
                </div>
                
                <div class="form-group">
                    <label for="customer-emergency">Emergency Contact</label>
                    <input type="tel" id="customer-emergency">
                </div>
                
                <div class="form-group">
                    <label for="customer-address">Address</label>
                    <textarea id="customer-address" rows="3"></textarea>
                </div>
                
                <div class="btn-group">
                    <button type="submit" class="btn btn-success">Create Customer</button>
                    <button type="button" class="btn" onclick="closeModal('create-customer-modal')">Cancel</button>
                </div>
            </form>
        </div>
    </div>
    
    <!-- Add Chemical Modal -->
    <div id="add-chemical-modal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('add-chemical-modal')">&times;</span>
            <h2>🧪 Add Chemical Product</h2>
            <form id="add-chemical-form">
                <div class="form-group">
                    <label for="chemical-customer">Customer *</label>
                    <select id="chemical-customer" required>
                        <option value="">-- Select Customer --</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="chemical-name">Chemical Name *</label>
                    <input type="text" id="chemical-name" required>
                </div>
                
                <div class="form-group">
                    <label for="chemical-description">Description</label>
                    <textarea id="chemical-description" rows="2" placeholder="Brief description of the chemical product"></textarea>
                </div>
                
                <div class="form-group">
                    <label for="chemical-hazards">Key Hazards</label>
                    <textarea id="chemical-hazards" rows="2" placeholder="Main safety hazards and warnings"></textarea>
                </div>
                
                <div class="form-group">
                    <label for="chemical-supplier">Supplier</label>
                    <input type="text" id="chemical-supplier">
                </div>
                
                <div class="form-group">
                    <label for="literature-filename">Literature PDF Filename *</label>
                    <input type="text" id="literature-filename" placeholder="product_literature.pdf" required>
                </div>
                
                <div class="form-group">
                    <label for="sds-filename">SDS PDF Filename *</label>
                    <input type="text" id="sds-filename" placeholder="product_sds.pdf" required>
                </div>
                
                <div class="btn-group">
                    <button type="submit" class="btn btn-success">Add Chemical</button>
                    <button type="button" class="btn" onclick="closeModal('add-chemical-modal')">Cancel</button>
                </div>
            </form>
        </div>
    </div>
    
    <script>
        // Dashboard JavaScript functionality
        let customers = [];
        let selectedCustomer = null;
        
        // Initialize dashboard
        document.addEventListener('DOMContentLoaded', function() {
            loadCustomers();
            setupFormHandlers();
        });
        
        // Load customers from API
        async function loadCustomers() {
            try {
                showLoading('Loading customers...');
                const response = await fetch('/api/customers');
                const data = await response.json();
                
                if (data.success) {
                    customers = data.customers;
                    renderCustomers();
                    populateCustomerSelects();
                }
                hideLoading();
            } catch (error) {
                console.error('Failed to load customers:', error);
                hideLoading();
            }
        }
        
        // Render customer cards
        function renderCustomers() {
            const container = document.getElementById('customers-list');
            
            if (customers.length === 0) {
                container.innerHTML = '<p>No customers found. Add your first customer to get started.</p>';
                return;
            }
            
            container.innerHTML = customers.map(customer => {
                const statusClass = customer.status === 'active' ? 'status-active' : 'status-inactive';
                return \`
                    <div class="card">
                        <h3>\${customer.name}</h3>
                        <p><strong>URL:</strong> <a href="\${customer.url}" target="_blank">\${customer.url}</a></p>
                        <p><strong>Chemicals:</strong> \${customer.chemicals}</p>
                        <p><strong>Last Updated:</strong> \${customer.last_updated}</p>
                        <p><span class="status-indicator \${statusClass}">\${customer.status}</span></p>
                        
                        <div class="btn-group" style="margin-top: 15px;">
                            <button class="btn" onclick="deployCustomer('\${customer.slug}')">🚀 Deploy</button>
                            <button class="btn btn-warning" onclick="viewCustomer('\${customer.slug}')">👁️ View</button>
                            <button class="btn btn-danger" onclick="deleteCustomer('\${customer.slug}')">🗑️ Delete</button>
                        </div>
                    </div>
                \`;
            }).join('');
        }
        
        // Populate customer select dropdowns
        function populateCustomerSelects() {
            const selects = document.querySelectorAll('#customer-select, #chemical-customer');
            const options = customers.map(c => \`<option value="\${c.slug}">\${c.name}</option>\`).join('');
            
            selects.forEach(select => {
                const currentValue = select.value;
                select.innerHTML = '<option value="">-- Select Customer --</option>' + options;
                if (currentValue) select.value = currentValue;
            });
        }
        
        // Setup form handlers
        function setupFormHandlers() {
            // Create customer form
            document.getElementById('create-customer-form').addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const formData = {
                    name: document.getElementById('customer-name').value,
                    slug: document.getElementById('customer-slug').value,
                    phone: document.getElementById('customer-phone').value,
                    email: document.getElementById('customer-email').value,
                    emergency: document.getElementById('customer-emergency').value,
                    address: document.getElementById('customer-address').value
                };
                
                try {
                    showLoading('Creating customer...');
                    const response = await fetch('/api/customers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData)
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        closeModal('create-customer-modal');
                        loadCustomers();
                        alert('Customer created successfully!');
                    } else {
                        alert('Error: ' + result.error);
                    }
                    hideLoading();
                } catch (error) {
                    console.error('Error creating customer:', error);
                    alert('Failed to create customer');
                    hideLoading();
                }
            });
            
            // Add chemical form
            document.getElementById('add-chemical-form').addEventListener('submit', async function(e) {
                e.preventDefault();
                
                const customerSlug = document.getElementById('chemical-customer').value;
                const chemicalData = {
                    name: document.getElementById('chemical-name').value,
                    description: document.getElementById('chemical-description').value,
                    hazards: document.getElementById('chemical-hazards').value,
                    supplier: document.getElementById('chemical-supplier').value,
                    literature: {
                        filename: document.getElementById('literature-filename').value,
                        title: document.getElementById('chemical-name').value + ' Product Literature'
                    },
                    sds: {
                        filename: document.getElementById('sds-filename').value,
                        title: document.getElementById('chemical-name').value + ' Safety Data Sheet'
                    }
                };
                
                try {
                    showLoading('Adding chemical...');
                    const response = await fetch(\`/api/customers/\${customerSlug}/chemicals\`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(chemicalData)
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        closeModal('add-chemical-modal');
                        if (selectedCustomer === customerSlug) {
                            loadCustomerChemicals();
                        }
                        alert('Chemical added successfully!');
                    } else {
                        alert('Error: ' + result.error);
                    }
                    hideLoading();
                } catch (error) {
                    console.error('Error adding chemical:', error);
                    alert('Failed to add chemical');
                    hideLoading();
                }
            });
        }
        
        // Modal functions
        function showCreateCustomerModal() {
            document.getElementById('create-customer-modal').style.display = 'block';
        }
        
        function showAddChemicalModal() {
            populateCustomerSelects();
            document.getElementById('add-chemical-modal').style.display = 'block';
        }
        
        function showBulkUploadModal() {
            alert('Bulk upload feature coming soon!');
        }
        
        function closeModal(modalId) {
            document.getElementById(modalId).style.display = 'none';
        }
        
        // Utility functions
        function showLoading(message) {
            console.log('Loading:', message);
        }
        
        function hideLoading() {
            console.log('Loading complete');
        }
        
        function refreshCustomers() {
            loadCustomers();
        }
        
        async function deployCustomer(slug) {
            try {
                showLoading('Deploying customer site...');
                const response = await fetch(\`/api/customers/\${slug}/deploy\`, { method: 'POST' });
                const result = await response.json();
                
                if (result.success) {
                    alert('Customer site deployed successfully!');
                    loadCustomers();
                } else {
                    alert('Deployment failed: ' + result.error);
                }
                hideLoading();
            } catch (error) {
                console.error('Deployment error:', error);
                alert('Deployment failed');
                hideLoading();
            }
        }
        
        function viewCustomer(slug) {
            const customer = customers.find(c => c.slug === slug);
            if (customer) {
                window.open(customer.url, '_blank');
            }
        }
        
        async function deleteCustomer(slug) {
            if (!confirm('Are you sure you want to delete this customer site? This action cannot be undone.')) {
                return;
            }
            
            try {
                showLoading('Deleting customer...');
                const response = await fetch(\`/api/customers/\${slug}\`, { method: 'DELETE' });
                const result = await response.json();
                
                if (result.success) {
                    alert('Customer deleted successfully');
                    loadCustomers();
                } else {
                    alert('Deletion failed: ' + result.error);
                }
                hideLoading();
            } catch (error) {
                console.error('Deletion error:', error);
                alert('Deletion failed');
                hideLoading();
            }
        }
        
        async function loadCustomerChemicals() {
            const customerSlug = document.getElementById('customer-select').value;
            if (!customerSlug) {
                document.getElementById('chemicals-list').innerHTML = '<p>Select a customer to view chemicals.</p>';
                return;
            }
            
            selectedCustomer = customerSlug;
            
            try {
                showLoading('Loading chemicals...');
                const response = await fetch(\`/api/customers/\${customerSlug}/chemicals\`);
                const data = await response.json();
                
                if (data.success) {
                    renderChemicals(data.chemicals);
                }
                hideLoading();
            } catch (error) {
                console.error('Failed to load chemicals:', error);
                hideLoading();
            }
        }
        
        function renderChemicals(chemicals) {
            const container = document.getElementById('chemicals-list');
            
            if (chemicals.length === 0) {
                container.innerHTML = '<p>No chemicals found for this customer.</p>';
                return;
            }
            
            container.innerHTML = chemicals.map(chemical => \`
                <div class="card">
                    <h3>\${chemical.name}</h3>
                    <p><strong>Description:</strong> \${chemical.description || 'N/A'}</p>
                    <p><strong>Hazards:</strong> \${chemical.hazards || 'N/A'}</p>
                    <p><strong>Supplier:</strong> \${chemical.supplier || 'N/A'}</p>
                    <p><strong>Last Updated:</strong> \${chemical.last_updated}</p>
                    
                    <div class="btn-group" style="margin-top: 15px;">
                        <button class="btn btn-danger" onclick="removeChemical('\${selectedCustomer}', '\${chemical.id}')">🗑️ Remove</button>
                    </div>
                </div>
            \`).join('');
        }
        
        async function removeChemical(customerSlug, chemicalId) {
            if (!confirm('Are you sure you want to remove this chemical?')) {
                return;
            }
            
            try {
                showLoading('Removing chemical...');
                const response = await fetch(\`/api/customers/\${customerSlug}/chemicals/\${chemicalId}\`, { 
                    method: 'DELETE' 
                });
                const result = await response.json();
                
                if (result.success) {
                    alert('Chemical removed successfully');
                    loadCustomerChemicals();
                } else {
                    alert('Removal failed: ' + result.error);
                }
                hideLoading();
            } catch (error) {
                console.error('Removal error:', error);
                alert('Removal failed');
                hideLoading();
            }
        }
        
        // Close modals when clicking outside
        window.onclick = function(event) {
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }
        
        // Additional utility functions
        function exportCustomers() {
            alert('Export feature coming soon!');
        }
        
        function generateChecklists() {
            alert('Checklist generator coming soon!');
        }
        
        function deployAllCustomers() {
            alert('Bulk deployment feature coming soon!');
        }
        
        function checkDeploymentStatus() {
            alert('Status checker coming soon!');
        }
        
        function generateQRCodes() {
            alert('QR code generator coming soon!');
        }
    </script>
</body>
</html>
        `;
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🎛️ GHS Management Dashboard started on http://localhost:${this.port}`);
            console.log(`🔐 Secure backend interface for Rasco, Inc.`);
            console.log(`📊 Ready to manage customer GHS binder sites`);
        });
    }
}

// Export for use in other scripts
module.exports = { GHSManagementDashboard };

// CLI usage
if (require.main === module) {
    if (!process.env.GITHUB_TOKEN) {
        console.error('❌ Please set GITHUB_TOKEN environment variable');
        process.exit(1);
    }
    
    const port = process.env.PORT || 3000;
    const dashboard = new GHSManagementDashboard(process.env.GITHUB_TOKEN, port);
    dashboard.start();
}