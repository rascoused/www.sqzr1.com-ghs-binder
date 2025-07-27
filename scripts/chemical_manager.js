#!/usr/bin/env node

/*
 * Chemical Management System for GHS Binders
 * Rasco, Inc. - Professional GHS Safety Binder Automation
 * 
 * This script handles adding, removing, and updating chemical products
 * in customer GHS binder sites with automatic redeployment.
 */

const fs = require('fs').promises;
const path = require('path');
const { GHSBinderDeployer } = require('./github_deployment.js');

class ChemicalManager {
    constructor(githubToken) {
        this.deployer = new GHSBinderDeployer(githubToken);
        this.configsPath = path.join(__dirname, '../customer_configs');
    }

    /**
     * Add a new chemical to customer's site
     */
    async addChemical(customerSlug, chemicalData) {
        try {
            console.log(`🧪 Adding chemical "${chemicalData.name}" to ${customerSlug}...`);
            
            // Load customer configuration
            const customerConfig = await this.loadCustomerConfig(customerSlug);
            
            // Validate chemical data
            this.validateChemicalData(chemicalData);
            
            // Generate chemical ID
            const chemicalId = this.generateChemicalId(chemicalData.name);
            
            // Check if chemical already exists
            const existingIndex = customerConfig.chemicals.findIndex(c => c.id === chemicalId);
            if (existingIndex !== -1) {
                console.log(`⚠️ Chemical "${chemicalData.name}" already exists. Updating...`);
                return await this.updateChemical(customerSlug, chemicalId, chemicalData);
            }
            
            // Add chemical to configuration
            const newChemical = {
                id: chemicalId,
                name: chemicalData.name,
                description: chemicalData.description || 'Professional chemical product',
                hazards: chemicalData.hazards || 'See Safety Data Sheet for complete hazard information',
                literature: {
                    filename: chemicalData.literature.filename,
                    url: `pdfs/${chemicalData.literature.filename}`,
                    title: chemicalData.literature.title || `${chemicalData.name} Product Literature`
                },
                sds: {
                    filename: chemicalData.sds.filename,
                    url: `pdfs/${chemicalData.sds.filename}`,
                    title: chemicalData.sds.title || `${chemicalData.name} Safety Data Sheet`
                },
                supplier: chemicalData.supplier || 'Unknown Supplier',
                last_updated: new Date().toISOString().split('T')[0],
                active: true
            };
            
            customerConfig.chemicals.push(newChemical);
            
            // Update site settings
            customerConfig.site_settings.last_updated = new Date().toISOString().split('T')[0];
            
            // Save configuration
            await this.saveCustomerConfig(customerSlug, customerConfig);
            
            // Redeploy site
            const deployResult = await this.deployer.deployCustomerSite(customerConfig);
            
            console.log(`✅ Chemical "${chemicalData.name}" added successfully`);
            
            return {
                success: true,
                chemical: newChemical,
                deployment: deployResult,
                total_chemicals: customerConfig.chemicals.filter(c => c.active).length
            };
            
        } catch (error) {
            console.error('❌ Failed to add chemical:', error.message);
            throw error;
        }
    }

    /**
     * Remove a chemical from customer's site
     */
    async removeChemical(customerSlug, chemicalId) {
        try {
            console.log(`🗑️ Removing chemical "${chemicalId}" from ${customerSlug}...`);
            
            // Load customer configuration
            const customerConfig = await this.loadCustomerConfig(customerSlug);
            
            // Find chemical
            const chemicalIndex = customerConfig.chemicals.findIndex(c => c.id === chemicalId);
            if (chemicalIndex === -1) {
                throw new Error(`Chemical "${chemicalId}" not found`);
            }
            
            const chemical = customerConfig.chemicals[chemicalIndex];
            
            // Mark as inactive instead of deleting (for audit trail)
            customerConfig.chemicals[chemicalIndex].active = false;
            customerConfig.chemicals[chemicalIndex].deactivated_date = new Date().toISOString().split('T')[0];
            
            // Update site settings
            customerConfig.site_settings.last_updated = new Date().toISOString().split('T')[0];
            
            // Save configuration
            await this.saveCustomerConfig(customerSlug, customerConfig);
            
            // Redeploy site
            const deployResult = await this.deployer.deployCustomerSite(customerConfig);
            
            console.log(`✅ Chemical "${chemical.name}" removed successfully`);
            
            return {
                success: true,
                removed_chemical: chemical,
                deployment: deployResult,
                total_chemicals: customerConfig.chemicals.filter(c => c.active).length
            };
            
        } catch (error) {
            console.error('❌ Failed to remove chemical:', error.message);
            throw error;
        }
    }

    /**
     * Update existing chemical information
     */
    async updateChemical(customerSlug, chemicalId, updates) {
        try {
            console.log(`📝 Updating chemical "${chemicalId}" for ${customerSlug}...`);
            
            // Load customer configuration
            const customerConfig = await this.loadCustomerConfig(customerSlug);
            
            // Find chemical
            const chemicalIndex = customerConfig.chemicals.findIndex(c => c.id === chemicalId);
            if (chemicalIndex === -1) {
                throw new Error(`Chemical "${chemicalId}" not found`);
            }
            
            // Update chemical data
            const chemical = customerConfig.chemicals[chemicalIndex];
            Object.assign(chemical, updates);
            chemical.last_updated = new Date().toISOString().split('T')[0];
            
            // Update site settings
            customerConfig.site_settings.last_updated = new Date().toISOString().split('T')[0];
            
            // Save configuration
            await this.saveCustomerConfig(customerSlug, customerConfig);
            
            // Redeploy site
            const deployResult = await this.deployer.deployCustomerSite(customerConfig);
            
            console.log(`✅ Chemical "${chemical.name}" updated successfully`);
            
            return {
                success: true,
                updated_chemical: chemical,
                deployment: deployResult
            };
            
        } catch (error) {
            console.error('❌ Failed to update chemical:', error.message);
            throw error;
        }
    }

    /**
     * Bulk update chemicals for a customer
     */
    async bulkUpdateChemicals(customerSlug, chemicalsData) {
        try {
            console.log(`📦 Bulk updating ${chemicalsData.length} chemicals for ${customerSlug}...`);
            
            const results = [];
            
            for (const chemicalData of chemicalsData) {
                try {
                    const result = await this.addChemical(customerSlug, chemicalData);
                    results.push({ success: true, chemical: chemicalData.name, result });
                } catch (error) {
                    results.push({ success: false, chemical: chemicalData.name, error: error.message });
                }
            }
            
            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;
            
            console.log(`✅ Bulk update complete: ${successCount} success, ${failCount} failed`);
            
            return {
                success: failCount === 0,
                results,
                summary: {
                    total: chemicalsData.length,
                    success: successCount,
                    failed: failCount
                }
            };
            
        } catch (error) {
            console.error('❌ Bulk update failed:', error.message);
            throw error;
        }
    }

    /**
     * List all chemicals for a customer
     */
    async listChemicals(customerSlug, includeInactive = false) {
        try {
            const customerConfig = await this.loadCustomerConfig(customerSlug);
            
            let chemicals = customerConfig.chemicals;
            if (!includeInactive) {
                chemicals = chemicals.filter(c => c.active);
            }
            
            return {
                customer: customerConfig.customer_info.name,
                total: chemicals.length,
                active: customerConfig.chemicals.filter(c => c.active).length,
                inactive: customerConfig.chemicals.filter(c => !c.active).length,
                chemicals
            };
            
        } catch (error) {
            console.error('❌ Failed to list chemicals:', error.message);
            throw error;
        }
    }

    /**
     * Generate PDF upload checklist for customer
     */
    async generateUploadChecklist(customerSlug) {
        try {
            const customerConfig = await this.loadCustomerConfig(customerSlug);
            const chemicals = customerConfig.chemicals.filter(c => c.active);
            
            let checklist = `# PDF Upload Checklist for ${customerConfig.customer_info.name}\n\n`;
            checklist += `Generated on: ${new Date().toLocaleDateString()}\n\n`;
            checklist += `## Required Files (${chemicals.length * 2} total)\n\n`;
            
            chemicals.forEach((chemical, index) => {
                checklist += `### ${index + 1}. ${chemical.name}\n`;
                checklist += `- [ ] Literature: \`${chemical.literature.filename}\`\n`;
                checklist += `- [ ] SDS: \`${chemical.sds.filename}\`\n\n`;
            });
            
            checklist += `## Upload Instructions\n\n`;
            checklist += `1. Upload all PDF files to the \`pdfs/\` directory in the GitHub repository\n`;
            checklist += `2. Ensure filenames match exactly as listed above\n`;
            checklist += `3. Verify all PDFs are readable and up-to-date\n`;
            checklist += `4. Run deployment script to update the website\n\n`;
            checklist += `## Repository Information\n\n`;
            checklist += `- **Repository**: ${customerConfig.customer_info.github_repo.name}\n`;
            checklist += `- **Website**: ${customerConfig.customer_info.github_repo.url}\n`;
            checklist += `- **Last Updated**: ${customerConfig.site_settings.last_updated}\n`;
            
            return checklist;
            
        } catch (error) {
            console.error('❌ Failed to generate checklist:', error.message);
            throw error;
        }
    }

    /**
     * Validate chemical data structure
     */
    validateChemicalData(chemicalData) {
        const required = ['name', 'literature', 'sds'];
        const missing = required.filter(field => !chemicalData[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
        
        if (!chemicalData.literature.filename || !chemicalData.sds.filename) {
            throw new Error('Literature and SDS filenames are required');
        }
        
        // Validate filename formats
        if (!chemicalData.literature.filename.endsWith('.pdf')) {
            throw new Error('Literature file must be a PDF');
        }
        
        if (!chemicalData.sds.filename.endsWith('.pdf')) {
            throw new Error('SDS file must be a PDF');
        }
    }

    /**
     * Generate chemical ID from name
     */
    generateChemicalId(name) {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 50);
    }

    /**
     * Load customer configuration
     */
    async loadCustomerConfig(customerSlug) {
        const configPath = path.join(this.configsPath, `${customerSlug}.json`);
        const configData = await fs.readFile(configPath, 'utf8');
        return JSON.parse(configData);
    }

    /**
     * Save customer configuration
     */
    async saveCustomerConfig(customerSlug, config) {
        const configPath = path.join(this.configsPath, `${customerSlug}.json`);
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    }
}

// Export for use in other scripts
module.exports = { ChemicalManager };

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!process.env.GITHUB_TOKEN) {
        console.error('❌ Please set GITHUB_TOKEN environment variable');
        process.exit(1);
    }
    
    const manager = new ChemicalManager(process.env.GITHUB_TOKEN);
    
    (async () => {
        try {
            switch (command) {
                case 'add':
                    const customerSlug = args[1];
                    const chemicalFile = args[2];
                    
                    if (!customerSlug || !chemicalFile) {
                        console.error('❌ Usage: add <customer-slug> <chemical-data.json>');
                        process.exit(1);
                    }
                    
                    const chemicalData = JSON.parse(await fs.readFile(chemicalFile, 'utf8'));
                    const result = await manager.addChemical(customerSlug, chemicalData);
                    
                    console.log('🎉 Chemical added successfully!');
                    console.log(`🧪 Total chemicals: ${result.total_chemicals}`);
                    break;
                    
                case 'remove':
                    const slug = args[1];
                    const chemicalId = args[2];
                    
                    if (!slug || !chemicalId) {
                        console.error('❌ Usage: remove <customer-slug> <chemical-id>');
                        process.exit(1);
                    }
                    
                    await manager.removeChemical(slug, chemicalId);
                    console.log('🗑️ Chemical removed successfully');
                    break;
                    
                case 'list':
                    const custSlug = args[1];
                    const includeInactive = args[2] === '--include-inactive';
                    
                    if (!custSlug) {
                        console.error('❌ Usage: list <customer-slug> [--include-inactive]');
                        process.exit(1);
                    }
                    
                    const chemicals = await manager.listChemicals(custSlug, includeInactive);
                    console.log(`📋 Chemicals for ${chemicals.customer}:`);
                    console.log(`   Active: ${chemicals.active}, Inactive: ${chemicals.inactive}`);
                    
                    chemicals.chemicals.forEach(chemical => {
                        const status = chemical.active ? '✅' : '❌';
                        console.log(`   ${status} ${chemical.name} (${chemical.id})`);
                    });
                    break;
                    
                case 'checklist':
                    const cSlug = args[1];
                    
                    if (!cSlug) {
                        console.error('❌ Usage: checklist <customer-slug>');
                        process.exit(1);
                    }
                    
                    const checklist = await manager.generateUploadChecklist(cSlug);
                    console.log(checklist);
                    break;
                    
                default:
                    console.log('Usage: node chemical_manager.js <command> [args]');
                    console.log('Commands:');
                    console.log('  add <customer-slug> <chemical-data.json>  - Add chemical');
                    console.log('  remove <customer-slug> <chemical-id>      - Remove chemical');
                    console.log('  list <customer-slug> [--include-inactive] - List chemicals');
                    console.log('  checklist <customer-slug>                 - Generate upload checklist');
            }
        } catch (error) {
            console.error('❌ Command failed:', error.message);
            process.exit(1);
        }
    })();
}