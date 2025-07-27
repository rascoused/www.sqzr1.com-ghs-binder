#!/usr/bin/env node

/*
 * GHS Binder System Setup Script
 * Rasco, Inc. - Professional GHS Safety Binder Automation
 * 
 * Initial setup and configuration for the GHS binder automation system
 */

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

class GHSSystemSetup {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async setup() {
        console.log('🚀 GHS Binder Automation System Setup');
        console.log('=====================================');
        console.log('Welcome to the Rasco, Inc. GHS Safety Binder System!');
        console.log('');

        try {
            // Step 1: Verify requirements
            await this.verifyRequirements();
            
            // Step 2: GitHub configuration
            await this.setupGitHub();
            
            // Step 3: Create environment file
            await this.createEnvironmentFile();
            
            // Step 4: Create directory structure
            await this.createDirectories();
            
            // Step 5: Create initial customer from current GHS data
            await this.createInitialCustomer();
            
            // Step 6: Final instructions
            await this.showFinalInstructions();
            
            console.log('✅ Setup completed successfully!');
            
        } catch (error) {
            console.error('❌ Setup failed:', error.message);
        } finally {
            this.rl.close();
        }
    }

    async verifyRequirements() {
        console.log('🔍 Verifying system requirements...');
        
        // Check Node version
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
        
        if (majorVersion < 18) {
            throw new Error(`Node.js 18+ required, you have ${nodeVersion}`);
        }
        
        console.log(`✅ Node.js ${nodeVersion} - OK`);
        
        // Check npm
        try {
            const { execSync } = require('child_process');
            const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
            console.log(`✅ npm ${npmVersion} - OK`);
        } catch (error) {
            throw new Error('npm not found - please install Node.js with npm');
        }
        
        // Check git
        try {
            const { execSync } = require('child_process');
            const gitVersion = execSync('git --version', { encoding: 'utf8' }).trim();
            console.log(`✅ ${gitVersion} - OK`);
        } catch (error) {
            throw new Error('git not found - please install git');
        }
        
        console.log('');
    }

    async setupGitHub() {
        console.log('🐙 GitHub Configuration');
        console.log('You need a GitHub Personal Access Token with the following permissions:');
        console.log('  • repo (Full control of private repositories)');
        console.log('  • admin:org (if using organization)');
        console.log('');
        console.log('Create token at: https://github.com/settings/tokens');
        console.log('');
        
        this.githubToken = await this.question('Enter your GitHub Personal Access Token: ');
        
        if (!this.githubToken || this.githubToken.length < 20) {
            throw new Error('Invalid GitHub token');
        }
        
        this.githubOrg = await this.question('Enter your GitHub organization name (default: rasco-inc): ') || 'rasco-inc';
        
        console.log('✅ GitHub configuration saved');
        console.log('');
    }

    async createEnvironmentFile() {
        console.log('📝 Creating environment configuration...');
        
        const envContent = `# GHS Binder Automation System Environment Configuration
# Rasco, Inc. - Professional GHS Safety Binder System

# GitHub Configuration
GITHUB_TOKEN=${this.githubToken}
GITHUB_ORG=${this.githubOrg}

# Dashboard Configuration
PORT=3000
NODE_ENV=production

# System Configuration
SYSTEM_NAME="Rasco GHS Binder System"
COMPANY_NAME="Rasco, Inc."
CONTACT_EMAIL="support@rasco-inc.com"

# Security
SESSION_SECRET=${this.generateSecret()}
API_KEY=${this.generateApiKey()}

# Paths
TEMPLATES_PATH="./templates"
CONFIGS_PATH="./customer_configs"
UPLOADS_PATH="./uploads"

# Features
ENABLE_ANALYTICS=true
ENABLE_QR_CODES=true
ENABLE_NOTIFICATIONS=true
`;

        await fs.writeFile('.env', envContent);
        console.log('✅ Environment file created (.env)');
        console.log('');
    }

    async createDirectories() {
        console.log('📁 Creating directory structure...');
        
        const directories = [
            'uploads',
            'logs',
            'backups',
            'qr-codes',
            'dashboard_assets',
            'customer_configs/templates',
            'templates/assets'
        ];
        
        for (const dir of directories) {
            await fs.mkdir(dir, { recursive: true });
            console.log(`   ✅ Created: ${dir}/`);
        }
        
        // Create .gitignore
        const gitignoreContent = `# Dependencies
node_modules/
npm-debug.log*

# Environment
.env
.env.local
.env.production

# Uploads and temporary files
uploads/
temp/

# Logs
logs/
*.log

# Customer data (sensitive)
customer_configs/*.json
!customer_configs/customer_template.json

# System files
.DS_Store
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo

# Backups
backups/
*.backup
`;
        
        await fs.writeFile('.gitignore', gitignoreContent);
        console.log('✅ Created .gitignore');
        console.log('');
    }

    async createInitialCustomer() {
        console.log('👤 Creating initial customer from your current GHS data...');
        
        const customerName = await this.question('Enter customer name for your current GHS binder (e.g., "SQZR Demo"): ');
        const customerSlug = customerName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
        
        const customerConfig = {
            customer_info: {
                name: customerName,
                slug: customerSlug,
                contact: {
                    company: customerName,
                    phone: await this.question('Customer phone (optional): ') || '',
                    email: await this.question('Customer email (optional): ') || '',
                    emergency: await this.question('Emergency contact (optional): ') || '',
                    address: await this.question('Customer address (optional): ') || ''
                },
                branding: {
                    logo_url: 'assets/customer_logo.png',
                    primary_color: '#3498db',
                    secondary_color: '#2c3e50'
                },
                github_repo: {
                    name: `${customerSlug}-ghs-binder`,
                    url: `https://${this.githubOrg}.github.io/${customerSlug}-ghs-binder`,
                    custom_domain: ''
                }
            },
            chemicals: [
                {
                    id: "302-dt-bowl-cleaner",
                    name: "302 D/T Bowl Cleaner",
                    description: "Detergent-thickened 9.5% hydrochloric acid toilet bowl cleaner",
                    hazards: "Severe skin burns, eye damage, corrosive to metals",
                    literature: {
                        filename: "302_dt_bowl_cleaner_literature.pdf",
                        url: "pdfs/302_dt_bowl_cleaner_literature.pdf",
                        title: "HUSKY® 302 D/T BOWL CLEANER Product Literature"
                    },
                    sds: {
                        filename: "302_dt_bowl_cleaner_sds.pdf",
                        url: "pdfs/302_dt_bowl_cleaner_sds.pdf",
                        title: "HUSKY® 302 D/T BOWL CLEANER Safety Data Sheet"
                    },
                    supplier: "Canberra Corporation",
                    last_updated: new Date().toISOString().split('T')[0],
                    active: true
                }
                // Additional chemicals would be added here based on your existing data
            ],
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
                    meta_description: `Professional chemical safety documentation portal for ${customerName} providing 24/7 access to GHS-compliant Safety Data Sheets and product literature.`,
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
        
        const configPath = path.join('customer_configs', `${customerSlug}.json`);
        await fs.writeFile(configPath, JSON.stringify(customerConfig, null, 2));
        
        console.log(`✅ Created initial customer: ${customerName}`);
        console.log(`   Configuration saved to: ${configPath}`);
        console.log('');
    }

    async showFinalInstructions() {
        console.log('🎉 Setup Complete! Next Steps:');
        console.log('==============================');
        console.log('');
        console.log('1. Install dependencies:');
        console.log('   npm install');
        console.log('');
        console.log('2. Start the management dashboard:');
        console.log('   npm start');
        console.log('   Then open: http://localhost:3000');
        console.log('');
        console.log('3. Command line tools available:');
        console.log('   npm run deploy <customer-config.json>  # Deploy customer site');
        console.log('   npm run chemical add <slug> <data>     # Add chemical');
        console.log('   npm run chemical list <slug>           # List chemicals');
        console.log('');
        console.log('4. Import your existing GHS data:');
        console.log('   - Upload PDF files to the uploads/ directory');
        console.log('   - Use the dashboard to add chemicals');
        console.log('   - Deploy customer sites');
        console.log('');
        console.log('5. Security Notes:');
        console.log('   - Keep your .env file secure (contains GitHub token)');
        console.log('   - Customer configs contain sensitive data');
        console.log('   - All sites are PUBLIC (no passwords for safety compliance)');
        console.log('');
        console.log('📧 Support: support@rasco-inc.com');
        console.log('🌐 Documentation: Available in documentation/ folder');
        console.log('');
    }

    generateSecret() {
        return require('crypto').randomBytes(32).toString('hex');
    }

    generateApiKey() {
        return 'rasco_' + require('crypto').randomBytes(16).toString('hex');
    }

    question(query) {
        return new Promise(resolve => {
            this.rl.question(query, resolve);
        });
    }
}

// CLI usage
if (require.main === module) {
    const setup = new GHSSystemSetup();
    setup.setup();
}

module.exports = { GHSSystemSetup };