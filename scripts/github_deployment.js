#!/usr/bin/env node

/*
 * GitHub Pages GHS Binder Deployment System
 * RascoWeb, Inc. - Professional GHS Safety Binder Automation
 * 
 * This script handles the complete automation of customer GHS binder deployments
 * to GitHub Pages with full customer management capabilities.
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { Octokit } = require('@octokit/rest');
const mustache = require('mustache');
const fetch = require('node-fetch'); // node-fetch is needed for the verifyPDFsOnPages method

// Detect GitHub Pages branch
async function detectPagesBranch(owner, repo, octokit) {
  try {
    const { data } = await octokit.rest.repos.getPages({ owner, repo });
    return data?.source?.branch || 'main';
  } catch (error) {
    console.warn(`⚠️ Pages branch detection failed: ${error.message}`);
    return 'main';
  }
}

class GHSBinderDeployer {
    constructor(githubToken) {
        this.octokit = new Octokit({
            auth: githubToken,
            userAgent: 'RascoWeb-GHS-Binder-v1.0.0'
        });
        this.owner = 'rascoused';
        this.templatePath = path.join(__dirname, '../templates/ghs_binder_template.html');
        this.configsPath = path.join(__dirname, '../customer_configs');
    }

    /**
     * Safely upload binary files (PDFs, images, etc.)
     */
    async safeUploadBinary(owner, repo, branch, filePath, fileBuffer, commitMessage) {
        const content = fileBuffer.toString('base64');
        let sha;
        try {
            const { data: existingFile } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: filePath,
                ref: branch
            });
            sha = existingFile.sha;
        } catch (error) {
            // Only ignore 404 errors (file doesn't exist)
            if (error.status !== 404) {
                throw error;
            }
        }
        await this.octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: filePath,
            message: commitMessage,
            content,
            branch,
            sha
        });
    }

    /**
     * Upload customer-specific assets (logos, images, etc.)
     */
    async uploadCustomerAssets(repoName, customerSlug, branch = 'main') {
        const customerAssetsPath = path.join(__dirname, '..', 'assets', customerSlug);
        
        // Check if customer assets folder exists
        if (!fs.existsSync(customerAssetsPath)) {
            console.log(`📁 No assets folder found for customer ${customerSlug}, skipping asset upload`);
            return;
        }

        console.log(`🖼️ Uploading assets for customer: ${customerSlug}...`);
        
        try {
            const files = await fsp.readdir(customerAssetsPath);
            
            for (const filename of files) {
                const localPath = path.join(customerAssetsPath, filename);
                const stat = await fsp.stat(localPath);
                
                // Skip directories and system files
                if (stat.isDirectory() || filename.startsWith('.')) {
                    continue;
                }
                
                console.log(`⬆️  Uploading ${customerSlug} asset: ${filename}`);
                
                // Read file as buffer
                const buffer = await fsp.readFile(localPath);
                
                // Upload to GitHub
                await this.safeUploadBinary(
                    this.owner,
                    repoName,
                    branch,
                    `assets/${filename}`,
                    buffer,
                    `Upload ${customerSlug} asset: ${filename}`
                );
                
                console.log(`✅ Uploaded ${customerSlug} asset: ${filename}`);
            }
            
            console.log(`🎉 Customer ${customerSlug} assets upload complete`);
            
        } catch (error) {
            console.error(`❌ Customer ${customerSlug} assets upload failed:`, error.message);
            throw error;
        }
    }

    /**
     * Verify that PDFs uploaded to GitHub Pages are accessible and valid.
     * Uses HTTP HEAD to confirm status 200, and basic size/content-type checks.
     */
    async verifyPDFsOnPages(repoName, chemicals) {
        const baseUrl = `https://${this.owner}.github.io/${repoName}`;
        
        console.log('🔍 Verifying uploaded PDFs on GitHub Pages...');
        
        for (const chemical of chemicals) {
            const pdfs = [chemical.literature?.filename, chemical.sds?.filename].filter(Boolean);
            
            for (const filename of pdfs) {
                const url = `${baseUrl}/pdfs/${filename}`;
                console.log(`  ➜ Checking ${url}`);
                
                try {
                    const res = await fetch(url, { method: 'HEAD' });
                    
                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}`);
                    }
                    
                    const contentType = res.headers.get('content-type') || '';
                    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
                    
                    if (!contentType.includes('pdf') || contentLength < 1024) { // Basic check: content-type must include 'pdf' and size > 1KB
                        throw new Error(`Unexpected type/size: ${contentType}, ${contentLength} bytes`);
                    }
                    
                    console.log(`  ✅ Verified ${filename}`);
                } catch (err) {
                    throw new Error(`Verification failed for ${url}: ${err.message}`);
                }
            }
        }
        
        console.log('🎉 All PDFs verified successfully.');
    }

    /**
     * Deploy a new customer GHS binder site
     */
    async deployCustomerSite(customerConfig) {
        try {
            console.log(`🚀 Deploying GHS binder for ${customerConfig.customer_info.name}...`);
            
            // Step 1: Create GitHub repository
            const repo = await this.createRepository(customerConfig);
            const repoName = repo.name;
            
            // Step 2: Use repo's actual default branch
            const branch = repo.default_branch || 'main';
            console.log(`📂 Using repository branch: ${branch}`);
            
            // Step 3: Generate HTML from template
            const html = await this.generateHTML(customerConfig);
            
            // Step 4: Create directory structure and disable Jekyll
            await this.createDirectoryStructure(repoName, branch);
            
            // Step 5: Upload HTML and README (text files use uploadFile)
            await this.uploadFile(repoName, 'index.html', html, 'Deploy GHS safety binder website', branch);
            const readme = this.generateReadme(customerConfig);
            await this.uploadFile(repoName, 'README.md', readme, 'Add repository documentation', branch);
            
            // Step 6: Upload Customer-Specific Assets (FIXED for multi-customer)
            const customerSlug = customerConfig.customer_info.slug;
            await this.uploadCustomerAssets(repoName, customerSlug, branch);
            
            // Step 7: Upload PDFs
            const chemicals = customerConfig.chemicals || [];
            console.log(`📄 Uploading PDFs for ${chemicals.length} chemicals...`);
            
            for (const chemical of chemicals) {
                const files = [
                    { type: 'Literature', data: chemical.literature },
                    { type: 'SDS', data: chemical.sds }
                ];

                for (const file of files) {
                    if (!file.data?.filename) continue;
                    
                    const filename = file.data.filename;
                    const pdfPath = path.join(__dirname, '..', 'pdfs', filename);

                    console.log(`🔍 Looking for: ${pdfPath}`);
                    if (!fs.existsSync(pdfPath)) {
                        console.warn(`⚠️  ${file.type} PDF not found: ${pdfPath}`);
                        continue;
                    }

                    // Read as RAW buffer
                    const buffer = fs.readFileSync(pdfPath);
                    console.log(`⬆️  Uploading ${file.type}: ${filename} to branch ${branch}`);

                    // Use safeUploadBinary for proper single encoding
                    await this.safeUploadBinary(
                        this.owner,
                        repoName,
                        branch,
                        `pdfs/${filename}`,
                        buffer,
                        `Upload ${file.type} PDF for ${chemical.name}`
                    );

                    console.log(`✅ Uploaded ${file.type}: ${filename}`);
                }
            }
            
            // Step 8: Enable GitHub Pages - uses detected branch
            await this.enablePages(repoName, branch);
            
            // Give GitHub Pages time to refresh files
            console.log("⏳ Waiting 10 seconds for GitHub Pages to refresh...");
            await new Promise(r => setTimeout(r, 10000));

            // Verify PDFs on Pages
            await this.verifyPDFsOnPages(repoName, chemicals);
            
            // Step 9: Generate QR codes
            const qrCodes = await this.generateQRCodes(customerConfig);
            
            console.log(`✅ Successfully deployed: ${repo.html_url}`);
            
            return {
                success: true,
                repository: repo,
                url: `https://${this.owner}.github.io/${repo.name}`,
                qr_codes: qrCodes,
                deployment_info: {
                    deployed_at: new Date().toISOString(),
                    version: '1.0.0',
                    total_chemicals: customerConfig.chemicals.length
                }
            };
            
        } catch (error) {
            console.error('❌ Deployment failed:', error.message);
            throw error;
        }
    }

    /**
     * Create GitHub repository for customer - FIXED for personal account
     */
    async createRepository(customerConfig) {
        const repoName = customerConfig.customer_info.github_repo.name;
        const customerName = customerConfig.customer_info.name;
        
        try {
            // FIXED: Use createForAuthenticatedUser for personal account
            const { data: repo } = await this.octokit.rest.repos.createForAuthenticatedUser({
                name: repoName,
                description: `GHS Safety Binder for ${customerName} - Professional chemical safety documentation portal`,
                private: false, // Public for GitHub Pages
                homepage: customerConfig.customer_info.github_repo.url,
                topics: ['ghs', 'safety', 'chemical-safety', 'osha-compliance', 'sds'],
                has_issues: false,
                has_projects: false,
                has_wiki: false,
                auto_init: true,
                license_template: 'mit'
            });
            
            console.log(`📁 Created repository: ${repo.name} (default branch: ${repo.default_branch})`);
            return repo;
            
        } catch (error) {
            if (error.status === 422) {
                // Repository already exists, get it
                const { data: repo } = await this.octokit.rest.repos.get({
                    owner: this.owner,
                    repo: repoName
                });
                console.log(`📁 Using existing repository: ${repo.name} (default branch: ${repo.default_branch})`);
                return repo;
            }
            throw error;
        }
    }

    /**
     * Generate HTML from template with customer data
     */
    async generateHTML(customerConfig) {
        try {
            const template = await fsp.readFile(this.templatePath, 'utf8');
            const customerInfo = customerConfig.customer_info;
            const chemicals = customerConfig.chemicals.filter(c => c.active);
            
            // Prepare template data
            const templateData = {
                CUSTOMER_NAME: customerInfo.name,
                CUSTOMER_LOGO: customerInfo.branding.logo_url,
                CUSTOMER_CONTACT: customerInfo.contact.phone,
                CUSTOMER_EMERGENCY: customerInfo.contact.emergency,
                LAST_UPDATED: customerConfig.site_settings.last_updated,
                GENERATION_DATE: new Date().toLocaleDateString(),
                TOTAL_PRODUCTS: chemicals.length,
                TOTAL_DOCUMENTS: chemicals.length * 2, // Literature + SDS per chemical
                
                // Complete binder info
                COMPLETE_BINDER_URL: customerConfig.site_settings.complete_binder?.url,
                
                // JavaScript data
                PRODUCTS_JSON: JSON.stringify(chemicals),
                CUSTOMER_INFO_JSON: JSON.stringify({
                    name: customerInfo.name,
                    contact: customerInfo.contact,
                    branding: customerInfo.branding
                })
            };
            
            // Handle conditional sections using Mustache
            const html = mustache.render(template, templateData);
            
            console.log(`📄 Generated HTML for ${chemicals.length} chemicals`);
            return html;
            
        } catch (error) {
            console.error('❌ HTML generation failed:', error.message);
            throw error;
        }
    }

    /**
     * Upload text files (HTML, README, etc.)
     */
    async uploadFile(repoName, filePath, content, commitMessage, branch = 'main') {
        const contentEncoded = Buffer.from(content).toString('base64');
        
        try {
            // Check if file exists
            let sha;
            try {
                const { data: existingFile } = await this.octokit.rest.repos.getContent({
                    owner: this.owner,
                    repo: repoName,
                    path: filePath,
                    ref: branch
                });
                sha = existingFile.sha;
            } catch (error) {
                // Only ignore 404 errors
                if (error.status !== 404) {
                    throw error;
                }
            }

            await this.octokit.rest.repos.createOrUpdateFileContents({
                owner: this.owner,
                repo: repoName,
                path: filePath,
                message: commitMessage,
                content: contentEncoded,
                sha: sha,
                branch: branch
            });
            
        } catch (error) {
            console.error(`❌ Failed to upload ${filePath}:`, error.message);
            throw error;
        }
    }

    /**
     * Enable GitHub Pages for repository - FIXED to use detected branch
     */
    async enablePages(repoName, branch = 'main') {
        try {
            await this.octokit.rest.repos.createPagesSite({
                owner: this.owner,
                repo: repoName,
                source: {
                    branch: branch, // FIXED: Use the detected branch instead of hard-coding 'main'
                    path: '/'
                }
            });
            
            console.log(`🌐 Enabled GitHub Pages for ${repoName} on branch: ${branch}`);
            
        } catch (error) {
            if (error.status === 409) {
                console.log(`🌐 GitHub Pages already enabled for ${repoName}`);
            } else {
                console.error('❌ Failed to enable GitHub Pages:', error.message);
                throw error;
            }
        }
    }

    /**
     * Generate README for repository
     */
    generateReadme(customerConfig) {
        const customerName = customerConfig.customer_info.name;
        const totalChemicals = customerConfig.chemicals.filter(c => c.active).length;
        
        return `# ${customerName} - GHS Safety Binder

Professional chemical safety documentation portal providing 24/7 access to GHS-compliant Safety Data Sheets and product literature.

## 🧪 Chemical Safety Information

- **Total Products**: ${totalChemicals}
- **Total Documents**: ${totalChemicals * 2} (Literature + SDS per product)
- **Compliance**: OSHA Hazard Communication Standard (29 CFR 1910.1200)
- **Access**: 24/7 emergency access without barriers

## 🚨 Emergency Access

This safety information is available 24/7 without restrictions for emergency response and compliance purposes. No login or password required.

## 📱 Mobile Access

All documents are optimized for mobile viewing and can be accessed via QR codes posted at chemical storage locations.

## 🛡️ Customer Responsibility

**${customerName}** is solely responsible for ensuring the accuracy, completeness, and
currency of all chemical safety information displayed on this site.

## 🏢 System Provider

Professional GHS Binder System provided by **RascoWeb, Inc.**

*Generated on ${new Date().toLocaleDateString()}*
`;
    }

    /**
     * Create directory structure in repository + Disable Jekyll (FIXED)
     */
    async createDirectoryStructure(repoName, branch = 'main') {
        // FIRST: Disable Jekyll to prevent PDF mangling
        await this.uploadFile(repoName, '.nojekyll', '', 'Disable Jekyll processing for GitHub Pages', branch);
        
        // THEN: Create directory structure
        const directories = [
            'pdfs/.gitkeep',
            'assets/.gitkeep',
            'qr-codes/.gitkeep'
        ];
        
        for (const dir of directories) {
            await this.uploadFile(repoName, dir, '', `Create ${dir.split('/')[0]} directory`, branch);
        }
    }

    /**
     * Generate QR codes for customer access
     */
    async generateQRCodes(customerConfig) {
        const baseUrl = `https://${this.owner}.github.io/${customerConfig.customer_info.github_repo.name}`;
        
        // QR codes for different access points
        const qrCodes = {
            main_site: `${baseUrl}`,
            mobile_optimized: `${baseUrl}?mobile=1`,
            emergency_access: `${baseUrl}?emergency=1`
        };
        
        // Generate actual QR code images (placeholder for now)
        console.log(`📱 QR codes generated for ${customerConfig.customer_info.name}`);
        
        return qrCodes;
    }

    /**
     * Update existing customer site
     */
    async updateCustomerSite(customerSlug, updates) {
        try {
            // Load customer configuration
            const configPath = path.join(this.configsPath, `${customerSlug}.json`);
            const configData = await fsp.readFile(configPath, 'utf8');
            const customerConfig = JSON.parse(configData);
            
            // Apply updates
            Object.assign(customerConfig, updates);
            customerConfig.site_settings.last_updated = new Date().toISOString().split('T')[0];
            
            // Save updated configuration
            await fsp.writeFile(configPath, JSON.stringify(customerConfig, null, 2));
            
            // Redeploy site
            return await this.deployCustomerSite(customerConfig);
            
        } catch (error) {
            console.error('❌ Update failed:', error.message);
            throw error;
        }
    }

    /**
     * Delete customer site
     */
    async deleteCustomerSite(customerSlug) {
        try {
            // Load customer configuration
            const configPath = path.join(this.configsPath, `${customerSlug}.json`);
            const configData = await fsp.readFile(configPath, 'utf8');
            const customerConfig = JSON.parse(configData);
            
            const repoName = customerConfig.customer_info.github_repo.name;
            
            // Delete GitHub repository
            await this.octokit.rest.repos.delete({
                owner: this.owner,
                repo: repoName
            });
            
            // Delete local configuration
            await fsp.unlink(configPath);
            
            console.log(`🗑️ Deleted customer site: ${customerSlug}`);
            
            return { success: true, message: `Customer site ${customerSlug} deleted successfully` };
            
        } catch (error) {
            console.error('❌ Deletion failed:', error.message);
            throw error;
        }
    }

    /**
     * List all customer sites
     */
    async listCustomerSites() {
        try {
            const configFiles = await fsp.readdir(this.configsPath);
            const customers = [];
            
            for (const configFile of configFiles) {
                if (configFile.endsWith('.json') && configFile !== 'customer_template.json') {
                    const configPath = path.join(this.configsPath, configFile);
                    const configData = await fsp.readFile(configPath, 'utf8');
                    const customerConfig = JSON.parse(configData);
                    
                    customers.push({
                        name: customerConfig.customer_info.name,
                        slug: customerConfig.customer_info.slug,
                        url: `https://${this.owner}.github.io/${customerConfig.customer_info.github_repo.name}`,
                        chemicals: customerConfig.chemicals.filter(c => c.active).length,
                        last_updated: customerConfig.site_settings.last_updated
                    });
                }
            }
            
            return customers;
            
        } catch (error) {
            console.error('❌ Failed to list customers:', error.message);
            throw error;
        }
    }
}

module.exports = { GHSBinderDeployer };

// CLI Interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const action = args[0];
    
    if (!process.env.GITHUB_TOKEN) {
        console.error('❌ Please set GITHUB_TOKEN environment variable');
        process.exit(1);
    }
    
    const deployer = new GHSBinderDeployer(process.env.GITHUB_TOKEN);
    
    (async () => {
        try {
            switch (action) {
                case 'deploy':
                    const configFile = args[1];
                    if (!configFile) {
                        console.error('❌ Please provide config file path');
                        process.exit(1);
                    }
                    
                    const configData = await fsp.readFile(configFile, 'utf8');
                    const customerConfig = JSON.parse(configData);
                    
                    const result = await deployer.deployCustomerSite(customerConfig);
                    console.log('🎉 Deployment successful!');
                    console.log(`🌐 Site URL: ${result.url}`);
                    break;
                    
                case 'list':
                    const customers = await deployer.listCustomerSites();
                    console.log('📋 Customer Sites:');
                    customers.forEach(customer => {
                        console.log(`  • ${customer.name} (${customer.chemicals} chemicals) - ${customer.url}`);
                    });
                    break;
                    
                case 'delete':
                    const customerSlug = args[1];
                    if (!customerSlug) {
                        console.error('❌ Please provide customer slug');
                        process.exit(1);
                    }
                    
                    await deployer.deleteCustomerSite(customerSlug);
                    console.log('🗑️ Customer site deleted successfully');
                    break;
                    
                default:
                    console.log(`
🎛️ GHS Binder Deployment System

Usage:
  node github_deployment.js deploy <config-file>     Deploy new customer site
  node github_deployment.js list                     List all customer sites  
  node github_deployment.js delete <customer-slug>   Delete customer site

Environment Variables:
  GITHUB_TOKEN    Your GitHub Personal Access Token

Examples:
  node github_deployment.js deploy customer_configs/acme-corp.json
  node github_deployment.js list
  node github_deployment.js delete acme-corp
                    `);
            }
        } catch (error) {
            console.error('❌ Operation failed:', error.message);
            process.exit(1);
        }
    })();
}