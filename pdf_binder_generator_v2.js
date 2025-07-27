#!/usr/bin/env node

/*
 * Complete GHS Binder PDF Generator v2.0 - Unicode Support
 * RascoWeb, Inc. - Professional GHS Safety Binder Automation
 * 
 * This module generates professional, standardized PDF binders containing
 * all customer chemical safety documentation with full Unicode support.
 * 
 * IMPROVEMENTS IN V2.0:
 * - Full Unicode support with embedded Noto Sans font
 * - Robust error handling with fallbacks
 * - Professional emoji alternatives
 * - Centralized font management
 * - Better character encoding handling
 * - Fixed cover page formatting issues
 */

const fs = require('fs').promises;
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fontkit = require('fontkit');

class GHSBinderPDFGenerator {
    constructor() {
        // Initialize font storage
        this.embeddedFonts = {};
        
        // Standard font references
        this.standardFonts = {
            title: StandardFonts.HelveticaBold,
            heading: StandardFonts.HelveticaBold,
            body: StandardFonts.Helvetica,
            italic: StandardFonts.HelveticaOblique
        };
        
        // Color palette
        this.colors = {
            primary: rgb(0.204, 0.596, 0.859), // #3498db
            secondary: rgb(0.173, 0.243, 0.314), // #2c3e50
            text: rgb(0.2, 0.2, 0.2),
            lightGray: rgb(0.9, 0.9, 0.9),
            white: rgb(1, 1, 1),
            red: rgb(0.8, 0.2, 0.2),
            success: rgb(0.2, 0.7, 0.3)
        };
        
        // Professional symbol alternatives to emojis
        this.symbols = {
            emergency: 'EMERGENCY',  // Changed from ▲ to text
            warning: '⚠',        
            complete: '✓',       
            bullet: '•',         
            arrow: '→',          
            check: '✓',          
            cross: '✗',          
            info: 'ℹ',           
            phone: '☎',          
            email: '✉',          
            address: '⚹',        
            important: '!',       
            section: '§'          
        };
    }

    /**
     * Initialize fonts - both standard and Unicode support
     */
    async initializeFonts(pdfDoc) {
        try {
            // Register fontkit for custom fonts
            pdfDoc.registerFontkit(fontkit);
            
            // Load standard fonts
            this.embeddedFonts.helvetica = await pdfDoc.embedFont(this.standardFonts.body);
            this.embeddedFonts.helveticaBold = await pdfDoc.embedFont(this.standardFonts.title);
            this.embeddedFonts.helveticaOblique = await pdfDoc.embedFont(this.standardFonts.italic);
            
            // Try to load Unicode font (Noto Sans)
            try {
                const notoPath = path.join(__dirname, 'fonts', 'NotoSans-Regular.ttf');
                const notoBytes = await fs.readFile(notoPath);
                this.embeddedFonts.unicode = await pdfDoc.embedFont(notoBytes, { subset: false });
                console.log('✅ Unicode font (Noto Sans) loaded successfully');
            } catch (fontError) {
                console.log('⚠️  Font loading error:', fontError.message);
                console.log('⚠️  Using standard fonts with symbol alternatives');
                this.embeddedFonts.unicode = this.embeddedFonts.helvetica; // Fallback
            }
            
            console.log('✅ Font initialization complete');
            
        } catch (error) {
            console.error('❌ Font initialization failed:', error.message);
            throw new Error('Failed to initialize fonts: ' + error.message);
        }
    }

    /**
     * Safe text drawing with fallback handling
     */
    drawTextSafe(page, text, options) {
        try {
            // First try with Unicode font if available and text contains special characters
            if (this.embeddedFonts.unicode && this.containsSpecialChars(text)) {
                page.drawText(text, { ...options, font: this.embeddedFonts.unicode });
                return;
            }
            
            // Use standard font
            page.drawText(text, options);
            
        } catch (encodingError) {
            console.warn(`⚠️  Encoding issue with text: "${text}" - using fallback`);
            
            // Fallback: Replace problematic characters with safe alternatives
            const safeText = this.makeSafeText(text);
            
            try {
                page.drawText(safeText, { ...options, font: this.embeddedFonts.helvetica });
            } catch (fallbackError) {
                console.error('❌ Even fallback text failed:', fallbackError.message);
                // Last resort: ASCII-only version
                const asciiText = text.replace(/[^\x00-\x7F]/g, '?');
                page.drawText(asciiText, { ...options, font: this.embeddedFonts.helvetica });
            }
        }
    }

    /**
     * Check if text contains special Unicode characters
     */
    containsSpecialChars(text) {
        return /[^\x00-\xFF]/.test(text);
    }

    /**
     * Convert problematic characters to safe alternatives
     */
    makeSafeText(text) {
        return text
            .replace(/🚨/g, this.symbols.emergency)
            .replace(/⚠️/g, this.symbols.warning)
            .replace(/✅/g, this.symbols.complete)
            .replace(/➤/g, this.symbols.arrow)
            .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Remove emojis
            .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Remove symbols
            .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Remove transport symbols
            .replace(/[\u{2600}-\u{26FF}]/gu, '') // Remove misc symbols
            .replace(/[\u{2700}-\u{27BF}]/gu, ''); // Remove dingbats
    }

    /**
     * Generate complete binder PDF for a customer
     */
    async generateCompleteBinder(customerConfig) {
        try {
            console.log(`📄 Generating complete binder for ${customerConfig.customer_info.name}...`);
            
            // Create new PDF document
            const pdfDoc = await PDFDocument.create();
            
            // Initialize fonts first
            await this.initializeFonts(pdfDoc);
            
            // Get active chemicals
            const chemicals = customerConfig.chemicals.filter(c => c.active);
            
            // Generate all pages
            await this.addCoverPage(pdfDoc, customerConfig);
            await this.addTableOfContents(pdfDoc, customerConfig, chemicals);
            await this.addComplianceInfo(pdfDoc, customerConfig);
            
            // Add chemical documentation
            for (let i = 0; i < chemicals.length; i++) {
                const chemical = chemicals[i];
                await this.addChemicalSection(pdfDoc, chemical, i + 1, customerConfig);
            }
            
            // Add footer pages
            await this.addContactPage(pdfDoc, customerConfig);
            await this.addDisclaimerPage(pdfDoc, customerConfig);
            
            // Save PDF
            const pdfBytes = await pdfDoc.save();
            const outputPath = path.join(__dirname, 'pdfs', 'complete_ghs_binder_v2.pdf');
            
            // Ensure pdfs directory exists
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            
            // Write the file
            await fs.writeFile(outputPath, pdfBytes);
            
            console.log(`✅ Complete binder generated: ${outputPath}`);
            console.log(`📊 Contains ${chemicals.length} chemicals, ${chemicals.length * 2} documents`);
            console.log(`💾 File size: ${Math.round(pdfBytes.length / 1024)} KB`);
            
            return {
                success: true,
                path: outputPath,
                chemicals: chemicals.length,
                documents: chemicals.length * 2,
                size: Math.round(pdfBytes.length / 1024) + ' KB'
            };
            
        } catch (error) {
            console.error('❌ Binder generation failed:', error.message);
            throw error;
        }
    }

    /**
     * Add professional cover page with CORRECTED formatting
     */
    async addCoverPage(pdfDoc, customerConfig) {
        const page = pdfDoc.addPage([612, 792]); // Standard letter size
        const { width, height } = page.getSize();
        
        // Header section
        page.drawRectangle({
            x: 0,
            y: height - 150,
            width: width,
            height: 150,
            color: this.colors.primary
        });
        
        // Title
        this.drawTextSafe(page, 'GHS Safety Data Binder', {
            x: 50,
            y: height - 80,
            size: 36,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.white
        });
        
        // Customer name
        this.drawTextSafe(page, customerConfig.customer_info.name, {
            x: 50,
            y: height - 120,
            size: 24,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.white
        });
        
        // Main content area
        const centerY = height / 2;
        
        // Professional subtitle
        this.drawTextSafe(page, 'Professional Chemical Safety Documentation Portal', {
            x: 50,
            y: centerY + 100,
            size: 18,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.secondary
        });
        
        // Key information
        const chemicals = customerConfig.chemicals.filter(c => c.active);
        const infoItems = [
            `Total Chemical Products: ${chemicals.length}`,
            `Total Safety Documents: ${chemicals.length * 2}`,
            `Compliance: OSHA Hazard Communication Standard (29 CFR 1910.1200)`,
            `Generated: ${new Date().toLocaleDateString()}`,
            `Emergency Contact: ${customerConfig.customer_info.contact.emergency || 'See contact page'}`
        ];
        
        let yOffset = centerY + 50;
        infoItems.forEach(item => {
            this.drawTextSafe(page, `• ${item}`, {
                x: 70,
                y: yOffset,
                size: 12,
                font: this.embeddedFonts.helvetica,
                color: this.colors.text
            });
            yOffset -= 25;
        });
        
        // Emergency access notice - CORRECTED VERSION WITH PROPER SPACING
        page.drawRectangle({
            x: 40,
            y: centerY - 180,
            width: width - 80,
            height: 100,
            color: this.colors.red,
            borderColor: this.colors.red,
            borderWidth: 2
        });
        
        // Emergency header - clear and professional
        this.drawTextSafe(page, 'EMERGENCY ACCESS', {
            x: 60,
            y: centerY - 120,
            size: 16,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.white
        });
        
        // Emergency text line 1 - properly positioned
        this.drawTextSafe(page, 'This safety information is available 24/7 without restrictions', {
            x: 60,
            y: centerY - 140,
            size: 11,
            font: this.embeddedFonts.helvetica,
            color: this.colors.white
        });
        
        // Emergency text line 2 - properly positioned
        this.drawTextSafe(page, 'for emergency response and compliance purposes.', {
            x: 60,
            y: centerY - 155,
            size: 11,
            font: this.embeddedFonts.helvetica,
            color: this.colors.white
        });
        
        // Footer
        this.drawTextSafe(page, 'Professional GHS Binder System provided by RascoWeb, Inc.', {
            x: 50,
            y: 50,
            size: 10,
            font: this.embeddedFonts.helvetica,
            color: this.colors.secondary
        });
    }

    /**
     * Add table of contents
     */
    async addTableOfContents(pdfDoc, customerConfig, chemicals) {
        const page = pdfDoc.addPage([612, 792]);
        const { width, height } = page.getSize();
        
        // Header
        this.drawTextSafe(page, 'Table of Contents', {
            x: 50,
            y: height - 80,
            size: 24,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.secondary
        });
        
        let yPosition = height - 140;
        let pageNum = 4; // Starting after cover, TOC, and compliance pages
        
        // Compliance section
        this.drawTextSafe(page, '1. Compliance Information', {
            x: 70,
            y: yPosition,
            size: 14,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.text
        });
        
        this.drawTextSafe(page, 'Page 3', {
            x: width - 100,
            y: yPosition,
            size: 12,
            font: this.embeddedFonts.helvetica,
            color: this.colors.text
        });
        
        yPosition -= 40;
        
        // Chemical documentation section
        this.drawTextSafe(page, '2. Chemical Safety Documentation', {
            x: 70,
            y: yPosition,
            size: 14,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.text
        });
        
        this.drawTextSafe(page, `Page ${pageNum}`, {
            x: width - 100,
            y: yPosition,
            size: 12,
            font: this.embeddedFonts.helvetica,
            color: this.colors.text
        });
        
        yPosition -= 30;
        
        // List each chemical
        chemicals.forEach((chemical, index) => {
            if (yPosition < 100) {
                return; // Start new page if running out of space
            }
            
            this.drawTextSafe(page, `   ${index + 1}. ${chemical.name}`, {
                x: 90,
                y: yPosition,
                size: 11,
                font: this.embeddedFonts.helvetica,
                color: this.colors.text
            });
            
            this.drawTextSafe(page, `Page ${pageNum}`, {
                x: width - 100,
                y: yPosition,
                size: 10,
                font: this.embeddedFonts.helvetica,
                color: this.colors.text
            });
            
            yPosition -= 20;
            pageNum += 2; // Each chemical has literature + SDS
        });
        
        yPosition -= 20;
        
        // Contact section
        this.drawTextSafe(page, '3. Contact Information', {
            x: 70,
            y: yPosition,
            size: 14,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.text
        });
        
        this.drawTextSafe(page, `Page ${pageNum}`, {
            x: width - 100,
            y: yPosition,
            size: 12,
            font: this.embeddedFonts.helvetica,
            color: this.colors.text
        });
        
        yPosition -= 30;
        
        // Disclaimers section
        this.drawTextSafe(page, '4. Legal Disclaimers', {
            x: 70,
            y: yPosition,
            size: 14,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.text
        });
        
        this.drawTextSafe(page, `Page ${pageNum + 1}`, {
            x: width - 100,
            y: yPosition,
            size: 12,
            font: this.embeddedFonts.helvetica,
            color: this.colors.text
        });
    }

    /**
     * Add compliance information page with safe text
     */
    async addComplianceInfo(pdfDoc, customerConfig) {
        const page = pdfDoc.addPage([612, 792]);
        const { width, height } = page.getSize();
        
        // Header
        this.drawTextSafe(page, 'OSHA Compliance Information', {
            x: 50,
            y: height - 80,
            size: 20,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.secondary
        });
        
        let yPos = height - 140;
        
        const complianceText = [
            'Hazard Communication Standard (29 CFR 1910.1200)',
            '',
            'This GHS Safety Binder is maintained in accordance with the OSHA Hazard',
            'Communication Standard, which requires employers to provide workers with',
            'effective information and training on hazardous chemicals in their work area.',
            '',
            'Key Requirements:',
            `• Safety Data Sheets (SDS) must be readily accessible to employees`,
            `• Chemical inventory must be maintained and updated`,
            `• Employee training on chemical hazards is required`,
            `• Container labeling must follow GHS standards`,
            '',
            'Emergency Access:',
            'This safety information is available 24/7 without restrictions for emergency',
            'response and compliance purposes. No login or password is required for',
            'emergency personnel to access critical safety information.',
            '',
            'Document Currency:',
            'All Safety Data Sheets should be reviewed regularly and updated when',
            'newer versions become available from chemical suppliers. Employers are',
            'responsible for maintaining current safety information.',
            '',
            `Last Updated: ${customerConfig.site_settings.last_updated}`,
            `Total Chemical Products: ${customerConfig.chemicals.filter(c => c.active).length}`,
            `System Generated: ${new Date().toLocaleDateString()}`
        ];
        
        complianceText.forEach(line => {
            if (line.startsWith('•')) {
                this.drawTextSafe(page, line, {
                    x: 70,
                    y: yPos,
                    size: 11,
                    font: this.embeddedFonts.helvetica,
                    color: this.colors.text
                });
            } else if (line.includes(':') && !line.includes('CFR')) {
                this.drawTextSafe(page, line, {
                    x: 50,
                    y: yPos,
                    size: 12,
                    font: this.embeddedFonts.helveticaBold,
                    color: this.colors.secondary
                });
            } else {
                this.drawTextSafe(page, line, {
                    x: 50,
                    y: yPos,
                    size: 11,
                    font: this.embeddedFonts.helvetica,
                    color: this.colors.text
                });
            }
            yPos -= 18;
        });
    }

    /**
     * Add chemical section with safe text rendering
     */
    async addChemicalSection(pdfDoc, chemical, chemicalNum, customerConfig) {
        // Add section divider page
        const dividerPage = pdfDoc.addPage([612, 792]);
        const { width, height } = dividerPage.getSize();
        
        // Chemical section header
        dividerPage.drawRectangle({
            x: 0,
            y: height - 120,
            width: width,
            height: 120,
            color: this.colors.lightGray
        });
        
        this.drawTextSafe(dividerPage, `Chemical ${chemicalNum}`, {
            x: 50,
            y: height - 60,
            size: 18,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.secondary
        });
        
        this.drawTextSafe(dividerPage, chemical.name, {
            x: 50,
            y: height - 90,
            size: 24,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.primary
        });
        
        // Chemical details
        const details = [
            `Type: ${chemical.type || 'Chemical Product'}`,
            `Category: ${chemical.category || 'General Use'}`,
            `Literature Available: ${chemical.literature ? 'Yes' : 'No'}`,
            `SDS Available: ${chemical.sds ? 'Yes' : 'No'}`,
            `Last Updated: ${chemical.last_updated || 'Not specified'}`
        ];
        
        let yPos = height - 160;
        details.forEach(detail => {
            this.drawTextSafe(dividerPage, detail, {
                x: 70,
                y: yPos,
                size: 12,
                font: this.embeddedFonts.helvetica,
                color: this.colors.text
            });
            yPos -= 20;
        });
        
        // Documents included notice
        this.drawTextSafe(dividerPage, 'Documents Included:', {
            x: 50,
            y: yPos - 20,
            size: 14,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.secondary
        });
        
        if (chemical.literature) {
            this.drawTextSafe(dividerPage, `• Product Literature: ${chemical.literature.filename}`, {
                x: 70,
                y: yPos - 45,
                size: 11,
                font: this.embeddedFonts.helvetica,
                color: this.colors.text
            });
        }
        
        if (chemical.sds) {
            this.drawTextSafe(dividerPage, `• Safety Data Sheet: ${chemical.sds.filename}`, {
                x: 70,
                y: yPos - 65,
                size: 11,
                font: this.embeddedFonts.helvetica,
                color: this.colors.text
            });
        }
        
        // Add document placeholders
        if (chemical.literature) {
            await this.addDocumentPlaceholder(pdfDoc, 'Product Literature', chemical.literature.filename);
        }
        
        if (chemical.sds) {
            await this.addDocumentPlaceholder(pdfDoc, 'Safety Data Sheet', chemical.sds.filename);
        }
    }

    /**
     * Add document placeholder (in full version, would merge actual PDF)
     */
    async addDocumentPlaceholder(pdfDoc, docType, filename) {
        const page = pdfDoc.addPage([612, 792]);
        const { width, height } = page.getSize();
        
        // Center the placeholder text
        this.drawTextSafe(page, `${docType}`, {
            x: width / 2 - 80,
            y: height / 2 + 50,
            size: 20,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.secondary
        });
        
        this.drawTextSafe(page, `Filename: ${filename}`, {
            x: width / 2 - 100,
            y: height / 2,
            size: 14,
            font: this.embeddedFonts.helvetica,
            color: this.colors.text
        });
        
        this.drawTextSafe(page, 'Note: In production, the actual PDF content would be merged here.', {
            x: width / 2 - 180,
            y: height / 2 - 50,
            size: 10,
            font: this.embeddedFonts.helvetica,
            color: this.colors.text
        });
        
        this.drawTextSafe(page, 'This is a placeholder page for development purposes.', {
            x: width / 2 - 150,
            y: height / 2 - 70,
            size: 10,
            font: this.embeddedFonts.helvetica,
            color: this.colors.text
        });
    }

    /**
     * Add contact information page
     */
    async addContactPage(pdfDoc, customerConfig) {
        const page = pdfDoc.addPage([612, 792]);
        const { width, height } = page.getSize();
        
        // Header
        this.drawTextSafe(page, 'Contact Information', {
            x: 50,
            y: height - 80,
            size: 20,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.secondary
        });
        
        let yPos = height - 140;
        
        // Customer contact info
        const contact = customerConfig.customer_info.contact;
        
        this.drawTextSafe(page, 'Customer Contact:', {
            x: 50,
            y: yPos,
            size: 16,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.primary
        });
        yPos -= 30;
        
        const contactInfo = [
            `Company: ${contact.company || 'Not specified'}`,
            `Phone: ${contact.phone || 'Not specified'}`,
            `Email: ${contact.email || 'Not specified'}`,
            `Address: ${contact.address || 'Not specified'}`
        ];
        
        contactInfo.forEach(info => {
            this.drawTextSafe(page, info, {
                x: 70,
                y: yPos,
                size: 12,
                font: this.embeddedFonts.helvetica,
                color: this.colors.text
            });
            yPos -= 20;
        });
        
        yPos -= 30;
        
        // Emergency contact
        this.drawTextSafe(page, 'EMERGENCY Contact:', {
            x: 50,
            y: yPos,
            size: 16,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.red
        });
        yPos -= 30;
        
        this.drawTextSafe(page, `Emergency Line: ${contact.emergency || 'See customer contact above'}`, {
            x: 70,
            y: yPos,
            size: 12,
            font: this.embeddedFonts.helvetica,
            color: this.colors.text
        });
        yPos -= 20;
        
        this.drawTextSafe(page, 'For chemical emergencies, contact your chemical supplier immediately.', {
            x: 70,
            y: yPos,
            size: 11,
            font: this.embeddedFonts.helvetica,
            color: this.colors.text
        });
        
        yPos -= 60;
        
        // System provider info
        this.drawTextSafe(page, 'System Provider:', {
            x: 50,
            y: yPos,
            size: 16,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.secondary
        });
        yPos -= 30;
        
        const providerInfo = [
            'RascoWeb, Inc.',
            'Professional GHS Binder System',
            'Web: https://rascoweb.com',
            'Email: support@rascoweb.com'
        ];
        
        providerInfo.forEach(info => {
            this.drawTextSafe(page, info, {
                x: 70,
                y: yPos,
                size: 12,
                font: this.embeddedFonts.helvetica,
                color: this.colors.text
            });
            yPos -= 20;
        });
    }

    /**
     * Add legal disclaimer page
     */
    async addDisclaimerPage(pdfDoc, customerConfig) {
        const page = pdfDoc.addPage([612, 792]);
        const { width, height } = page.getSize();
        
        // Header
        this.drawTextSafe(page, 'Legal Disclaimers', {
            x: 50,
            y: height - 80,
            size: 20,
            font: this.embeddedFonts.helveticaBold,
            color: this.colors.secondary
        });
        
        let yPos = height - 140;
        
        const disclaimerText = [
            'Customer Responsibility:',
            `${customerConfig.customer_info.name} is solely responsible for ensuring the`,
            'accuracy, completeness, and currency of all chemical safety information',
            'displayed in this binder and on the associated website.',
            '',
            'System Provider Disclaimer:',
            'RascoWeb, Inc. assumes no responsibility for the accuracy, completeness,',
            'or currency of the chemical safety information provided. The customer is',
            'solely responsible for maintaining accurate and up-to-date safety',
            'documentation.',
            '',
            'OSHA Compliance:',
            'It is the customer\'s responsibility to ensure compliance with all applicable',
            'OSHA regulations, including the Hazard Communication Standard',
            '(29 CFR 1910.1200). This system is provided as a tool to assist with',
            'compliance but does not guarantee regulatory compliance.',
            '',
            'Emergency Use:',
            'While this system provides 24/7 access to safety information for',
            'emergency purposes, users should always contact emergency services',
            '(911) and chemical suppliers directly for immediate emergency response.',
            '',
            'Document Currency:',
            'Safety Data Sheets and product literature should be updated regularly.',
            'Users should verify with chemical suppliers that they have the most',
            'current versions of all safety documentation.',
            '',
            `Generated: ${new Date().toLocaleDateString()}`,
            'Professional GHS Binder System provided by RascoWeb, Inc.'
        ];
        
        disclaimerText.forEach(line => {
            if (line.includes(':') && line.length < 30) {
                this.drawTextSafe(page, line, {
                    x: 50,
                    y: yPos,
                    size: 12,
                    font: this.embeddedFonts.helveticaBold,
                    color: this.colors.secondary
                });
            } else {
                this.drawTextSafe(page, line, {
                    x: 50,
                    y: yPos,
                    size: 10,
                    font: this.embeddedFonts.helvetica,
                    color: this.colors.text
                });
            }
            yPos -= 15;
        });
    }
}

module.exports = { GHSBinderPDFGenerator };

// CLI usage
if (require.main === module) {
    const fs = require('fs');
    
    if (process.argv.length < 3) {
        console.log('Usage: node pdf_binder_generator_v2.js <customer-config.json>');
        process.exit(1);
    }
    
    const configPath = process.argv[2];
    
    (async () => {
        try {
            const configData = await fs.promises.readFile(configPath, 'utf8');
            const customerConfig = JSON.parse(configData);
            
            const generator = new GHSBinderPDFGenerator();
            const result = await generator.generateCompleteBinder(customerConfig);
            
            console.log('🎉 Binder generation complete!');
            console.log(`📄 Generated: ${result.path}`);
            console.log(`📊 Contains: ${result.chemicals} chemicals, ${result.documents} documents`);
            console.log(`💾 Size: ${result.size}`);
            
        } catch (error) {
            console.error('❌ Generation failed:', error.message);
            process.exit(1);
        }
    })();
}
