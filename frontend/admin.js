const API_BASE = '/api';

// AI Suggestions storage
let aiSuggestions = {};

// AI API Configuration
const AI_PROVIDERS = {
    groq: {
        name: 'Groq',
        apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
        model: 'llama-3.3-70b-versatile',
        keyUrl: 'https://console.groq.com/keys',
        info: 'Groq offers free API access with fast inference. Get your key at console.groq.com'
    },
    gemini: {
        name: 'Google Gemini',
        apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
        model: 'gemini-1.5-flash',
        keyUrl: 'https://aistudio.google.com/app/apikey',
        info: 'Google Gemini offers 60 free requests per minute. Get your key at AI Studio.'
    }
};

// Load saved API key from localStorage
function loadSavedAIConfig() {
    const savedProvider = localStorage.getItem('aiProvider') || 'groq';
    const savedApiKey = localStorage.getItem('aiApiKey') || '';
    
    const providerSelect = document.getElementById('aiProvider');
    const apiKeyInput = document.getElementById('aiApiKey');
    
    if (providerSelect) providerSelect.value = savedProvider;
    if (apiKeyInput) apiKeyInput.value = savedApiKey;
    
    updateAIProviderInfo();
}

// Update AI provider information
function updateAIProviderInfo() {
    const provider = document.getElementById('aiProvider').value;
    const providerInfo = AI_PROVIDERS[provider];
    
    document.getElementById('aiProviderInfo').textContent = providerInfo.info;
    document.getElementById('getApiKeyLink').href = providerInfo.keyUrl;
    
    // Save preference
    localStorage.setItem('aiProvider', provider);
}

// Toggle API key visibility
function toggleApiKeyVisibility() {
    const input = document.getElementById('aiApiKey');
    input.type = input.type === 'password' ? 'text' : 'password';
}

// Show AI Upload Modal
function showAIUploadModal() {
    const modal = document.getElementById('aiUploadModal');
    modal.style.display = 'block';
    loadSavedAIConfig();
    
    // Clear previous state
    document.getElementById('aiInputText').value = '';
    document.getElementById('aiError').style.display = 'none';
    document.getElementById('aiProcessingStatus').style.display = 'none';
}

// Handle file upload
function handleAIFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('aiInputText').value = e.target.result;
    };
    reader.onerror = function() {
        showAIError('Failed to read file. Please try again.');
    };
    reader.readAsText(file);
}

// Show AI error
function showAIError(message) {
    const errorDiv = document.getElementById('aiError');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Process text with AI
async function processWithAI() {
    const inputText = document.getElementById('aiInputText').value.trim();
    const apiKey = document.getElementById('aiApiKey').value.trim();
    const provider = document.getElementById('aiProvider').value;
    
    // Validation
    if (!inputText) {
        showAIError('Please paste some incident details or upload a file.');
        return;
    }
    
    if (!apiKey) {
        showAIError('Please enter your API key. Click "Get free key" to get one.');
        return;
    }
    
    // Save API key for future use
    localStorage.setItem('aiApiKey', apiKey);
    
    // Show processing status
    document.getElementById('aiError').style.display = 'none';
    document.getElementById('aiProcessingStatus').style.display = 'flex';
    document.getElementById('aiProcessBtn').disabled = true;
    
    try {
        let result;
        if (provider === 'groq') {
            result = await callGroqAPI(apiKey, inputText);
        } else if (provider === 'gemini') {
            result = await callGeminiAPI(apiKey, inputText);
        }
        
        // Fill the form with AI results
        fillIncidentForm(result);
        
        // Close modal
        closeModal('aiUploadModal');
        
    } catch (error) {
        console.error('AI processing error:', error);
        showAIError(error.message || 'Failed to process with AI. Please check your API key and try again.');
    } finally {
        document.getElementById('aiProcessingStatus').style.display = 'none';
        document.getElementById('aiProcessBtn').disabled = false;
    }
}

// Call Groq API
async function callGroqAPI(apiKey, inputText) {
    const prompt = buildAIPrompt(inputText);
    
    const response = await fetch(AI_PROVIDERS.groq.apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: AI_PROVIDERS.groq.model,
            messages: [
                {
                    role: 'system',
                    content: 'You are an incident management assistant. Analyze incident details and extract structured information. Always respond with valid JSON only, no markdown formatting.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 2000
        })
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `API error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    return parseAIResponse(content);
}

// Call Gemini API
async function callGeminiAPI(apiKey, inputText) {
    const prompt = buildAIPrompt(inputText);
    
    const response = await fetch(`${AI_PROVIDERS.gemini.apiUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{
                    text: `You are an incident management assistant. Analyze incident details and extract structured information. Always respond with valid JSON only, no markdown formatting.\n\n${prompt}`
                }]
            }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 2000
            }
        })
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `API error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    return parseAIResponse(content);
}

// Build AI prompt
function buildAIPrompt(inputText) {
    return `Analyze the following incident details and extract structured information. Return ONLY a valid JSON object (no markdown, no code blocks) with these fields:

{
    "incident_number": "Ticket ID or incident number (e.g., INC123456, PRB000123)",
    "title": "Brief incident title (max 100 chars)",
    "impact": "P1 or P2 based on severity (P1 = critical/widespread, P2 = significant but limited)",
    "status": "identified, monitoring, or resolved",
    "domain_distribution": "Internal, External, or Non-Sport based on who was affected",
    "started_at": "Incident start time in ISO 8601 format (YYYY-MM-DDTHH:MM) if found, or empty string",
    "resolved_at": "Incident end/resolution time in ISO 8601 format (YYYY-MM-DDTHH:MM) if found, or empty string",
    "summary": "2-3 sentence summary of what happened",
    "affected_services": "Description of which services/systems were affected",
    "root_cause": "What caused the incident (if known)",
    "resolution_notes": "How the incident was resolved (if known)"
}

IMPORTANT for dates/times:
- Extract any dates and times mentioned (look for patterns like "2024-01-15 14:30", "Jan 15, 2024 2:30 PM", etc.)
- Convert to ISO 8601 format: YYYY-MM-DDTHH:MM
- If only date is given, use 00:00 as time
- If timezone is mentioned, convert to UTC
- Look for phrases like "started at", "began at", "first detected", "incident start" for start time
- Look for phrases like "resolved at", "ended at", "service restored", "incident end" for end time

If any field cannot be determined from the text, use an empty string for that field.

INCIDENT DETAILS:
${inputText}`;
}

// Parse AI response
function parseAIResponse(content) {
    if (!content) {
        throw new Error('Empty response from AI');
    }
    
    // Try to extract JSON from the response
    let jsonStr = content.trim();
    
    // Remove markdown code blocks if present
    jsonStr = jsonStr.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    
    // Find JSON object in the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        jsonStr = jsonMatch[0];
    }
    
    try {
        const parsed = JSON.parse(jsonStr);
        return {
            incident_number: parsed.incident_number || '',
            title: parsed.title || '',
            impact: parsed.impact || '',
            status: parsed.status || '',
            domain_distribution: parsed.domain_distribution || '',
            started_at: parsed.started_at || '',
            resolved_at: parsed.resolved_at || '',
            summary: parsed.summary || '',
            affected_services: parsed.affected_services || '',
            root_cause: parsed.root_cause || '',
            resolution_notes: parsed.resolution_notes || ''
        };
    } catch (e) {
        console.error('Failed to parse AI response:', content);
        throw new Error('Failed to parse AI response. Please try again.');
    }
}

// All field mappings for AI suggestions
const ALL_FIELD_MAPPINGS = {
    // Basic Information
    incident_number: { elementId: 'incidentNumber', suggestionId: 'aiSuggestionIncidentNumber', acceptBtn: 'acceptIncidentNumberBtn', rejectBtn: 'rejectIncidentNumberBtn', type: 'text' },
    title: { elementId: 'incidentTitle', suggestionId: 'aiSuggestionTitle', acceptBtn: 'acceptTitleBtn', rejectBtn: 'rejectTitleBtn', type: 'text' },
    impact: { elementId: 'incidentImpact', suggestionId: 'aiSuggestionImpact', acceptBtn: 'acceptImpactBtn', rejectBtn: 'rejectImpactBtn', type: 'select', validValues: ['P1', 'P2'] },
    status: { elementId: 'incidentStatus', suggestionId: 'aiSuggestionStatus', acceptBtn: 'acceptStatusBtn', rejectBtn: 'rejectStatusBtn', type: 'select', validValues: ['identified', 'monitoring', 'resolved'] },
    domain_distribution: { elementId: 'incidentDomainDistribution', suggestionId: 'aiSuggestionDomainDistribution', acceptBtn: 'acceptDomainDistributionBtn', rejectBtn: 'rejectDomainDistributionBtn', type: 'select', validValues: ['Internal', 'External', 'Non-Sport'] },
    // Timeline
    started_at: { elementId: 'incidentStartedAt', suggestionId: 'aiSuggestionStartedAt', acceptBtn: 'acceptStartedAtBtn', rejectBtn: 'rejectStartedAtBtn', type: 'datetime' },
    resolved_at: { elementId: 'incidentResolvedAt', suggestionId: 'aiSuggestionResolvedAt', acceptBtn: 'acceptResolvedAtBtn', rejectBtn: 'rejectResolvedAtBtn', type: 'datetime' },
    // Incident Details
    summary: { elementId: 'incidentSummary', suggestionId: 'aiSuggestionSummary', acceptBtn: 'acceptSummaryBtn', rejectBtn: 'rejectSummaryBtn', type: 'textarea' },
    affected_services: { elementId: 'incidentAffectedServices', suggestionId: 'aiSuggestionAffectedServices', acceptBtn: 'acceptAffectedServicesBtn', rejectBtn: 'rejectAffectedServicesBtn', type: 'textarea' },
    root_cause: { elementId: 'incidentRootCause', suggestionId: 'aiSuggestionRootCause', acceptBtn: 'acceptRootCauseBtn', rejectBtn: 'rejectRootCauseBtn', type: 'textarea' },
    resolution_notes: { elementId: 'incidentResolutionNotes', suggestionId: 'aiSuggestionResolutionNotes', acceptBtn: 'acceptResolutionNotesBtn', rejectBtn: 'rejectResolutionNotesBtn', type: 'textarea' }
};

// Fill incident form with AI results
function fillIncidentForm(result) {
    // Clear previous suggestions
    aiSuggestions = {};
    clearAllAISuggestions();
    
    // Process each field
    Object.keys(ALL_FIELD_MAPPINGS).forEach(fieldName => {
        const mapping = ALL_FIELD_MAPPINGS[fieldName];
        let fieldValue = result[fieldName];
        const element = document.getElementById(mapping.elementId);
        
        if (!element || !fieldValue) return;
        
        // Clean up the value
        fieldValue = String(fieldValue).trim();
        if (!fieldValue) return;
        
        // Validate select field values
        if (mapping.type === 'select' && mapping.validValues) {
            if (!mapping.validValues.includes(fieldValue)) {
                return; // Skip invalid select values
            }
        }
        
        // Format datetime values
        if (mapping.type === 'datetime') {
            fieldValue = formatDateTimeForInput(fieldValue);
            if (!fieldValue) return;
        }
        
        // Get existing value
        let existingValue = element.value;
        if (mapping.type === 'datetime') {
            existingValue = element.value; // datetime-local value
        } else {
            existingValue = existingValue.trim();
        }
        
        // Check if values are different
        const valuesAreDifferent = existingValue && existingValue !== fieldValue;
        const fieldIsEmpty = !existingValue;
        
        if (valuesAreDifferent) {
            // Field has existing different value - show as suggestion
            aiSuggestions[fieldName] = fieldValue;
            showAISuggestionPreview(fieldName, mapping);
        } else if (fieldIsEmpty) {
            // Field is empty - fill directly
            element.value = fieldValue;
            if (mapping.type === 'textarea') {
                showSaveButton(fieldName);
            }
        }
        // If values are the same, do nothing
    });
    
    // Update Accept All button visibility
    updateAcceptAllButton();
}

// Format datetime string for input element
function formatDateTimeForInput(dateStr) {
    if (!dateStr) return '';
    
    try {
        // Try to parse the date string
        let date;
        
        // Check if it's already in ISO format (YYYY-MM-DDTHH:MM)
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateStr)) {
            return dateStr.substring(0, 16); // Return YYYY-MM-DDTHH:MM
        }
        
        // Try parsing various formats
        date = new Date(dateStr);
        
        if (isNaN(date.getTime())) {
            return '';
        }
        
        // Format as YYYY-MM-DDTHH:MM
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (e) {
        return '';
    }
}

// Format datetime for display in suggestion preview
function formatDateTimeForDisplay(dateStr) {
    if (!dateStr) return '';
    
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    } catch (e) {
        return dateStr;
    }
}

// Show AI suggestion preview for a field
function showAISuggestionPreview(fieldName, mapping) {
    const suggestionDiv = document.getElementById(mapping.suggestionId);
    const acceptBtn = document.getElementById(mapping.acceptBtn);
    const rejectBtn = document.getElementById(mapping.rejectBtn);
    const element = document.getElementById(mapping.elementId);
    
    if (suggestionDiv && aiSuggestions[fieldName]) {
        // Format display value based on type
        let displayValue = aiSuggestions[fieldName];
        if (mapping.type === 'datetime') {
            displayValue = formatDateTimeForDisplay(aiSuggestions[fieldName]);
        }
        
        // Show suggestion preview
        suggestionDiv.innerHTML = `<div class="suggestion-text">${escapeHtml(displayValue)}</div>`;
        suggestionDiv.style.display = 'block';
        
        // Show accept/reject buttons
        if (acceptBtn) acceptBtn.style.display = 'inline-flex';
        if (rejectBtn) rejectBtn.style.display = 'inline-flex';
        
        // Highlight the field
        if (element) element.classList.add('has-ai-suggestion');
    }
}

// Accept AI suggestion for a field
function acceptAISuggestion(fieldName) {
    const mapping = ALL_FIELD_MAPPINGS[fieldName];
    if (!mapping || !aiSuggestions[fieldName]) return;
    
    const element = document.getElementById(mapping.elementId);
    const suggestionDiv = document.getElementById(mapping.suggestionId);
    const acceptBtn = document.getElementById(mapping.acceptBtn);
    const rejectBtn = document.getElementById(mapping.rejectBtn);
    
    // Apply the suggestion
    if (element) {
        element.value = aiSuggestions[fieldName];
        element.classList.remove('has-ai-suggestion');
        
        // Show save button for textarea fields
        if (mapping.type === 'textarea') {
            showSaveButton(fieldName);
        }
    }
    
    // Hide suggestion preview and buttons
    if (suggestionDiv) suggestionDiv.style.display = 'none';
    if (acceptBtn) acceptBtn.style.display = 'none';
    if (rejectBtn) rejectBtn.style.display = 'none';
    
    // Clear the suggestion
    delete aiSuggestions[fieldName];
    
    // Update Accept All button visibility
    updateAcceptAllButton();
}

// Reject AI suggestion for a field
function rejectAISuggestion(fieldName) {
    const mapping = ALL_FIELD_MAPPINGS[fieldName];
    if (!mapping) return;
    
    const element = document.getElementById(mapping.elementId);
    const suggestionDiv = document.getElementById(mapping.suggestionId);
    const acceptBtn = document.getElementById(mapping.acceptBtn);
    const rejectBtn = document.getElementById(mapping.rejectBtn);
    
    // Remove highlight
    if (element) element.classList.remove('has-ai-suggestion');
    
    // Hide suggestion preview and buttons
    if (suggestionDiv) suggestionDiv.style.display = 'none';
    if (acceptBtn) acceptBtn.style.display = 'none';
    if (rejectBtn) rejectBtn.style.display = 'none';
    
    // Clear the suggestion
    delete aiSuggestions[fieldName];
    
    // Update Accept All button visibility
    updateAcceptAllButton();
}

// Clear all AI suggestions
function clearAllAISuggestions() {
    Object.keys(ALL_FIELD_MAPPINGS).forEach(fieldName => {
        rejectAISuggestion(fieldName);
    });
    aiSuggestions = {};
    updateAcceptAllButton();
}

// Update Accept All & Save button visibility
function updateAcceptAllButton() {
    const acceptAllBtn = document.getElementById('acceptAllSaveBtn');
    if (acceptAllBtn) {
        const hasPendingSuggestions = Object.keys(aiSuggestions).length > 0;
        acceptAllBtn.style.display = hasPendingSuggestions ? 'inline-flex' : 'none';
    }
}

// Accept all AI suggestions and save the incident
async function acceptAllAndSave() {
    const acceptAllBtn = document.getElementById('acceptAllSaveBtn');
    
    // Disable button and show loading state
    if (acceptAllBtn) {
        acceptAllBtn.disabled = true;
        acceptAllBtn.innerHTML = '<span>⏳</span> Saving...';
    }
    
    try {
        // Accept all pending suggestions
        const pendingSuggestions = Object.keys(aiSuggestions);
        pendingSuggestions.forEach(fieldName => {
            acceptAISuggestion(fieldName);
        });
        
        // Trigger form submission
        const form = document.getElementById('incidentForm');
        if (form) {
            // Create and dispatch submit event
            const submitEvent = new Event('submit', { cancelable: true, bubbles: true });
            form.dispatchEvent(submitEvent);
        }
        
    } catch (error) {
        console.error('Error in acceptAllAndSave:', error);
        alert('Failed to save. Please try again.');
        
        // Re-enable button
        if (acceptAllBtn) {
            acceptAllBtn.disabled = false;
            acceptAllBtn.innerHTML = '<span>✓</span> Accept All & Save';
        }
    }
}

// Preview incident PDF (generates preview without saving)
async function previewIncidentPDF() {
    const incidentId = document.getElementById('incidentId').value;
    
    // If this is an existing incident, export its PDF
    if (incidentId) {
        exportIncidentPDF(parseInt(incidentId));
        return;
    }
    
    // For new incidents, generate a preview PDF from current form data
    try {
        const formData = getIncidentFormData();
        generatePreviewPDF(formData);
    } catch (error) {
        console.error('Error generating preview PDF:', error);
        alert('Failed to generate PDF preview: ' + error.message);
    }
}

// Get current form data for preview
function getIncidentFormData() {
    return {
        id: document.getElementById('incidentId').value || 'NEW',
        incident_number: document.getElementById('incidentNumber').value || 'Not assigned',
        title: document.getElementById('incidentTitle').value || 'Untitled Incident',
        impact: document.getElementById('incidentImpact').value || 'P2',
        current_status: document.getElementById('incidentStatus').value || 'identified',
        visibility: document.getElementById('incidentVisibility').value || 'public',
        domain_distribution: document.getElementById('incidentDomainDistribution').value || '',
        started_at: document.getElementById('incidentStartedAt').value ? new Date(document.getElementById('incidentStartedAt').value).toISOString() : new Date().toISOString(),
        resolved_at: document.getElementById('incidentResolvedAt').value ? new Date(document.getElementById('incidentResolvedAt').value).toISOString() : null,
        summary: document.getElementById('incidentSummary').value || '',
        affected_services: document.getElementById('incidentAffectedServices').value || '',
        root_cause: document.getElementById('incidentRootCause').value || '',
        resolution_notes: document.getElementById('incidentResolutionNotes').value || '',
        updates: []
    };
}

// Generate preview PDF from form data
function generatePreviewPDF(incident) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Calculate duration
    const startDate = parseUTCDate(incident.started_at);
    let duration = 'Ongoing';
    if (incident.resolved_at) {
        const endDate = parseUTCDate(incident.resolved_at);
        const durationMs = endDate - startDate;
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        duration = `${hours} Hours ${minutes} Minutes`;
    }
    
    // Format dates
    const formatDateForPDF = (date) => {
        if (!date) return 'N/A';
        const d = parseUTCDate(date);
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        const hours = String(d.getUTCHours()).padStart(2, '0');
        const mins = String(d.getUTCMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${mins}`;
    };
    
    // Set font
    doc.setFont('helvetica');
    
    // PREVIEW watermark
    doc.setFontSize(60);
    doc.setTextColor(230, 230, 230);
    doc.text('PREVIEW', 105, 150, { align: 'center', angle: 45 });
    doc.setTextColor(0, 0, 0);
    
    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(incident.title, 14, 20);
    
    // Incident Details Table
    let yPos = 35;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Incident Details', 14, yPos);
    
    yPos += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    
    const details = [
        ['Incident number:', incident.incident_number],
        ['Incident Start Date & Time (GMT):', formatDateForPDF(incident.started_at)],
        ['Incident End Date & Time (GMT):', incident.resolved_at ? formatDateForPDF(incident.resolved_at) : 'Ongoing'],
        ['Overall Duration:', duration],
        ['Interim Domain Distribution:', incident.domain_distribution || 'Not specified']
    ];
    
    details.forEach(([label, value]) => {
        doc.setFont('helvetica', 'bold');
        doc.text(label, 14, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(value, 80, yPos);
        yPos += 6;
    });
    
    // Important Note
    yPos += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(200, 0, 0);
    doc.text('IMPORTANT NOTE:', 14, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    yPos += 6;
    doc.setFontSize(8);
    const noteText = 'This report is for Playtech internal use only and should be revised accordingly before exposing its contents to any external parties.';
    doc.text(noteText, 14, yPos, { maxWidth: 180 });
    
    // Affected services
    yPos += 12;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Affected services:', 14, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const affectedServicesText = incident.affected_services || 'No affected services specified.';
    const affectedServicesLines = doc.splitTextToSize(affectedServicesText, 180);
    doc.text(affectedServicesLines, 14, yPos);
    yPos += affectedServicesLines.length * 5 + 8;
    
    // Incident summary
    if (yPos > 250) {
        doc.addPage();
        yPos = 20;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Incident summary:', 14, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    
    if (incident.summary) {
        const summaryLines = doc.splitTextToSize(incident.summary, 180);
        doc.text(summaryLines, 14, yPos);
        yPos += summaryLines.length * 5 + 5;
    } else {
        doc.text('No summary provided.', 14, yPos);
        yPos += 5;
    }
    
    // Root Cause
    if (incident.root_cause) {
        if (yPos > 250) {
            doc.addPage();
            yPos = 20;
        }
        yPos += 5;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Root Cause:', 14, yPos);
        yPos += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const rootCauseLines = doc.splitTextToSize(incident.root_cause, 180);
        doc.text(rootCauseLines, 14, yPos);
        yPos += rootCauseLines.length * 5 + 5;
    }
    
    // Resolution Notes
    if (incident.resolution_notes) {
        if (yPos > 250) {
            doc.addPage();
            yPos = 20;
        }
        yPos += 5;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Resolution:', 14, yPos);
        yPos += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const resolutionLines = doc.splitTextToSize(incident.resolution_notes, 180);
        doc.text(resolutionLines, 14, yPos);
    }
    
    // Add metadata footer
    const pageCount = doc.internal.pages.length - 1;
    doc.setPage(pageCount);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    const footerText = `PREVIEW - Generated: ${formatDateForPDF(new Date().toISOString())} GMT | Impact: ${incident.impact} | Status: ${incident.current_status}`;
    doc.text(footerText, 14, doc.internal.pageSize.height - 10);
    
    // Open in new window for preview
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');
}

// Helper function to parse date as UTC
function parseUTCDate(dateString) {
    if (!dateString) return null;
    // If date string doesn't end with Z or have timezone, treat it as UTC
    if (!dateString.includes('Z') && !dateString.includes('+') && !dateString.includes('-', 10)) {
        // SQLite datetime format: YYYY-MM-DD HH:MM:SS - treat as UTC
        return new Date(dateString + 'Z');
    }
    return new Date(dateString);
}

let authToken = localStorage.getItem('authToken');
let components = [];
let originalIncidentValues = {}; // Store original values to detect changes

// Helper function to handle API calls with token expiration
async function apiCall(url, options = {}) {
    const defaultHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
    };
    
    const response = await fetch(url, {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    });
    
    // If token expired, log out and show login screen
    if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.error && errorData.error.includes('token')) {
            alert('Your session has expired. Please log in again.');
            logout();
            throw new Error('Token expired');
        }
    }
    
    return response;
}

// Check if logged in - wait for DOM to be ready
function checkAuthStatus() {
    if (authToken) {
        showAdminPanel();
    } else {
        showLoginScreen();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAuthStatus);
} else {
    // DOM is already ready
    checkAuthStatus();
}

// Make sure components are loaded when admin panel is shown
function ensureComponentsLoaded() {
    if (components.length === 0) {
        return loadComponents();
    }
    return Promise.resolve();
}

// Login form - wait for DOM to be ready
function initLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) {
        console.error('Login form not found!');
        return;
    }
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('loginError');

        if (!username || !password) {
            if (errorDiv) errorDiv.textContent = 'Please enter both username and password';
            return;
        }

        if (errorDiv) errorDiv.textContent = ''; // Clear previous errors

        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                authToken = data.token;
                localStorage.setItem('authToken', authToken);
                showAdminPanel();
            } else {
                if (errorDiv) errorDiv.textContent = data.error || 'Login failed';
            }
        } catch (error) {
            console.error('Login error:', error);
            if (errorDiv) errorDiv.textContent = 'Network error. Please try again.';
        }
    });
}

// Initialize login form when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoginForm);
} else {
    // DOM is already ready
    initLoginForm();
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminPanel').style.display = 'none';
}

function showAdminPanel() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    loadAllData();
}

function logout() {
    authToken = null;
    localStorage.removeItem('authToken');
    showLoginScreen();
}

async function restartService() {
    if (!confirm('Are you sure you want to restart the service? This will temporarily disconnect all users.')) {
        return;
    }
    
    try {
        console.log('Attempting to restart service...');
        console.log('API URL:', `${API_BASE}/auth/restart`);
        console.log('Auth token exists:', !!authToken);
        
        const response = await fetch(`${API_BASE}/auth/restart`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        if (response.ok) {
            const data = await response.json();
            console.log('Restart response:', data);
            alert('Service restart initiated. The service will restart in a few seconds. Please wait and refresh the page.');
            
            // Wait a bit and then try to reload
            setTimeout(() => {
                window.location.reload();
            }, 3000);
        } else {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { error: errorText || `HTTP ${response.status}` };
            }
            console.error('Restart failed:', errorData);
            alert(`Failed to restart service: ${errorData.error || `HTTP ${response.status}`}\n\nMake sure the server has been restarted with the latest code.`);
        }
    } catch (error) {
        console.error('Error restarting service:', error);
        alert(`Network error: ${error.message || 'Please try again.'}\n\nMake sure the server is running and has been restarted with the latest code.`);
    }
}

function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(`${tabName}Tab`).classList.add('active');
    event.target.classList.add('active');

    // Load data for the tab
    if (tabName === 'components') {
        loadComponents();
    } else if (tabName === 'incidents') {
        ensureComponentsLoaded().then(() => loadIncidents());
    } else if (tabName === 'maintenances') {
        ensureComponentsLoaded().then(() => loadMaintenances());
    } else if (tabName === 'users') {
        loadUsers();
    }
}

async function loadAllData() {
    await loadComponents();
    await loadIncidents();
    await loadMaintenances();
}

// Components
async function loadComponents() {
    try {
        const response = await fetch(`${API_BASE}/components`);
        components = await response.json();
        renderComponents();
        populateComponentSelects();
    } catch (error) {
        console.error('Failed to load components:', error);
    }
}

function renderComponents() {
    const tbody = document.getElementById('componentsTableBody');
    tbody.innerHTML = components.map(comp => {
        const isVisible = comp.visible !== 0 && comp.visible !== false;
        // Production version: prefer detected_version, fall back to manual version
        const prodVersion = comp.detected_version || comp.version || '-';
        const prodVersionSource = comp.detected_version ? 'auto' : (comp.version ? 'manual' : 'none');
        // Shadow version
        const shadowVersion = comp.shadow_detected_version || '-';
        const shadowVersionSource = comp.shadow_detected_version ? 'auto' : 'none';
        
        return `
        <tr style="${!isVisible ? 'opacity: 0.5;' : ''}">
            <td>
                ${escapeHtml(comp.name)}
                ${!isVisible ? '<span style="color: #a0aec0; font-size: 11px; margin-left: 8px;">(hidden)</span>' : ''}
            </td>
            <td>${escapeHtml(comp.group_name || '-')}</td>
            <td><span class="status-badge ${comp.status}">${comp.status.replace('_', ' ')}</span></td>
            <td>
                ${comp.namespace ? `<span class="namespace-badge namespace-${comp.namespace.toLowerCase()}">${escapeHtml(comp.namespace)}</span>` : '<span style="color: #a0aec0;">-</span>'}
            </td>
            <td>
                <span style="font-family: monospace; font-size: 12px; ${prodVersionSource === 'auto' ? 'color: #2f855a;' : ''}">${escapeHtml(prodVersion)}</span>
                ${prodVersionSource === 'auto' ? '<span style="color: #68d391; font-size: 10px; margin-left: 4px;">●</span>' : ''}
            </td>
            <td>
                ${comp.shadow_namespace ? `<span class="namespace-badge namespace-${comp.shadow_namespace.toLowerCase()}">${escapeHtml(comp.shadow_namespace)}</span>` : '<span style="color: #a0aec0;">-</span>'}
            </td>
            <td>
                <span style="font-family: monospace; font-size: 12px; ${shadowVersionSource === 'auto' ? 'color: #6b46c1;' : ''}">${escapeHtml(shadowVersion)}</span>
                ${shadowVersionSource === 'auto' ? '<span style="color: #9f7aea; font-size: 10px; margin-left: 4px;">●</span>' : ''}
            </td>
            <td>
                <button onclick="editComponent(${comp.id})" class="btn btn-sm btn-secondary">Edit</button>
                <button onclick="deleteComponent(${comp.id})" class="btn btn-sm btn-danger">Delete</button>
            </td>
        </tr>
    `}).join('');
}

function populateComponentSelects() {
    // Populate incident components as checkboxes
    const incidentComponentsDiv = document.getElementById('incidentComponents');
    if (incidentComponentsDiv) {
        if (components.length === 0) {
            incidentComponentsDiv.innerHTML = '<p style="color: #718096; font-size: 14px;">No components available</p>';
        } else {
            // Group components by group_name
            const grouped = {};
            components.forEach(comp => {
                const group = comp.group_name || 'Other';
                if (!grouped[group]) {
                    grouped[group] = [];
                }
                grouped[group].push(comp);
            });
            
            let html = '';
            Object.keys(grouped).sort().forEach(group => {
                if (group !== 'Other') {
                    html += `<div style="font-weight: 600; color: #4a5568; margin: 10px 0 5px 0; font-size: 12px; text-transform: uppercase;">${escapeHtml(group)}</div>`;
                }
                grouped[group].forEach(comp => {
                    html += `
                        <div class="component-checkbox-item">
                            <input type="checkbox" id="incident-comp-${comp.id}" value="${comp.id}">
                            <label for="incident-comp-${comp.id}">
                                ${escapeHtml(comp.name)}
                                ${comp.group_name ? `<span class="component-group-label">(${escapeHtml(comp.group_name)})</span>` : ''}
                            </label>
                        </div>
                    `;
                });
            });
            incidentComponentsDiv.innerHTML = html;
        }
    }
    
    // Populate maintenance components as checkboxes
    const maintenanceComponentsDiv = document.getElementById('maintenanceComponents');
    if (maintenanceComponentsDiv) {
        if (components.length === 0) {
            maintenanceComponentsDiv.innerHTML = '<p style="color: #718096; font-size: 14px;">No components available</p>';
        } else {
            // Group components by group_name
            const grouped = {};
            components.forEach(comp => {
                const group = comp.group_name || 'Other';
                if (!grouped[group]) {
                    grouped[group] = [];
                }
                grouped[group].push(comp);
            });
            
            let html = '';
            Object.keys(grouped).sort().forEach(group => {
                if (group !== 'Other') {
                    html += `<div style="font-weight: 600; color: #4a5568; margin: 10px 0 5px 0; font-size: 12px; text-transform: uppercase;">${escapeHtml(group)}</div>`;
                }
                grouped[group].forEach(comp => {
                    html += `
                        <div class="component-checkbox-item">
                            <input type="checkbox" id="maintenance-comp-${comp.id}" value="${comp.id}">
                            <label for="maintenance-comp-${comp.id}">
                                ${escapeHtml(comp.name)}
                                ${comp.group_name ? `<span class="component-group-label">(${escapeHtml(comp.group_name)})</span>` : ''}
                            </label>
                        </div>
                    `;
                });
            });
            maintenanceComponentsDiv.innerHTML = html;
        }
    }
}

function showComponentModal(componentId = null) {
    const modal = document.getElementById('componentModal');
    const form = document.getElementById('componentForm');
    const title = document.getElementById('componentModalTitle');

    // Reset version previews
    document.getElementById('versionPreviewResult').style.display = 'none';
    document.getElementById('versionLastChecked').style.display = 'none';
    document.getElementById('shadowVersionPreviewResult').style.display = 'none';
    document.getElementById('shadowVersionLastChecked').style.display = 'none';

    if (componentId) {
        const comp = components.find(c => c.id === componentId);
        title.textContent = 'Edit Component';
        document.getElementById('componentId').value = comp.id;
        document.getElementById('componentName').value = comp.name;
        document.getElementById('componentGroup').value = comp.group_name || '';
        document.getElementById('componentStatus').value = comp.status;
        document.getElementById('componentSortOrder').value = comp.sort_order;
        document.getElementById('componentVersion').value = comp.version || '';
        document.getElementById('componentVisible').checked = comp.visible !== 0 && comp.visible !== false;
        
        // Production version URL fields
        document.getElementById('componentVersionUrl').value = comp.version_url || '';
        document.getElementById('componentNamespace').value = comp.namespace || '';
        document.getElementById('componentDetectedVersion').value = comp.detected_version || '';
        
        // Shadow version URL fields
        document.getElementById('componentShadowVersionUrl').value = comp.shadow_version_url || '';
        document.getElementById('componentShadowNamespace').value = comp.shadow_namespace || '';
        document.getElementById('componentShadowDetectedVersion').value = comp.shadow_detected_version || '';
        
        // Show last checked time for production if available
        if (comp.version_last_checked) {
            document.getElementById('versionLastChecked').style.display = 'block';
            document.getElementById('versionLastCheckedTime').textContent = formatDate(new Date(comp.version_last_checked));
        }
        
        // Show last checked time for shadow if available
        if (comp.shadow_version_last_checked) {
            document.getElementById('shadowVersionLastChecked').style.display = 'block';
            document.getElementById('shadowVersionLastCheckedTime').textContent = formatDate(new Date(comp.shadow_version_last_checked));
        }
    } else {
        title.textContent = 'Add Component';
        form.reset();
        document.getElementById('componentId').value = '';
        document.getElementById('componentVersion').value = '';
        document.getElementById('componentVisible').checked = true;
        
        // Reset production version URL fields
        document.getElementById('componentVersionUrl').value = '';
        document.getElementById('componentNamespace').value = '';
        document.getElementById('componentDetectedVersion').value = '';
        
        // Reset shadow version URL fields
        document.getElementById('componentShadowVersionUrl').value = '';
        document.getElementById('componentShadowNamespace').value = '';
        document.getElementById('componentShadowDetectedVersion').value = '';
    }

    modal.style.display = 'block';
}

document.getElementById('componentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('componentId').value;
    const data = {
        name: document.getElementById('componentName').value,
        group_name: document.getElementById('componentGroup').value || null,
        status: document.getElementById('componentStatus').value,
        sort_order: parseInt(document.getElementById('componentSortOrder').value) || 0,
        version: document.getElementById('componentVersion').value || null,
        visible: document.getElementById('componentVisible').checked,
        version_url: document.getElementById('componentVersionUrl').value || null,
        shadow_version_url: document.getElementById('componentShadowVersionUrl').value || null
    };

    try {
        const url = id 
            ? `${API_BASE}/components/${id}`
            : `${API_BASE}/components`;
        const method = id ? 'PATCH' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeModal('componentModal');
            await loadComponents();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to save component');
        }
    } catch (error) {
        alert('Network error. Please try again.');
    }
});

async function deleteComponent(id) {
    if (!confirm('Are you sure you want to delete this component?')) return;

    try {
        const response = await fetch(`${API_BASE}/components/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            await loadComponents();
        } else {
            alert('Failed to delete component');
        }
    } catch (error) {
        alert('Network error. Please try again.');
    }
}

function editComponent(id) {
    showComponentModal(id);
}

// Preview version URL without saving (production or shadow)
async function previewVersionUrl(type = 'production') {
    const isProduction = type === 'production';
    const urlInput = isProduction ? 'componentVersionUrl' : 'componentShadowVersionUrl';
    const resultDiv = isProduction ? 'versionPreviewResult' : 'shadowVersionPreviewResult';
    const contentDiv = isProduction ? 'versionPreviewContent' : 'shadowVersionPreviewContent';
    const namespaceField = isProduction ? 'componentNamespace' : 'componentShadowNamespace';
    const versionField = isProduction ? 'componentDetectedVersion' : 'componentShadowDetectedVersion';
    
    const url = document.getElementById(urlInput).value.trim();
    const resultElement = document.getElementById(resultDiv);
    const contentElement = document.getElementById(contentDiv);
    
    if (!url) {
        alert(`Please enter a ${isProduction ? 'Production' : 'Shadow'} URL first`);
        return;
    }
    
    resultElement.style.display = 'block';
    contentElement.innerHTML = '<span style="color: #718096;">Testing URL...</span>';
    
    try {
        const response = await fetch(`${API_BASE}/components/preview-version-url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ url })
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            const data = result.data;
            const bgColor = isProduction ? '#f0fff4' : '#faf5ff';
            const textColor = isProduction ? '#276749' : '#553c9a';
            
            contentElement.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <strong style="color: ${textColor};">Namespace:</strong>
                        <span class="namespace-badge namespace-${(data.namespace || '').toLowerCase()}" style="margin-left: 5px;">${data.namespace || 'N/A'}</span>
                    </div>
                    <div>
                        <strong style="color: ${textColor};">Version:</strong>
                        <span style="color: #2d3748; background: ${bgColor}; padding: 2px 8px; border-radius: 4px; margin-left: 5px;">${data.detected_version || 'N/A'}</span>
                    </div>
                </div>
                <div style="margin-top: 10px; font-size: 11px; color: #718096;">
                    Full namespace: ${data.full_namespace || 'N/A'}<br>
                    Full version tag: ${data.full_version_tag || 'N/A'}
                </div>
            `;
            
            // Auto-populate the readonly fields for preview
            document.getElementById(namespaceField).value = data.namespace || '';
            document.getElementById(versionField).value = data.detected_version || '';
        } else {
            contentElement.innerHTML = `<span style="color: #e53e3e;">❌ ${result.error || 'Failed to fetch version info'}</span>`;
        }
    } catch (error) {
        contentElement.innerHTML = `<span style="color: #e53e3e;">❌ Network error: ${error.message}</span>`;
    }
}

// Refresh version for an existing component (production or shadow)
async function refreshComponentVersion(type = 'production') {
    const componentId = document.getElementById('componentId').value;
    const isProduction = type === 'production';
    
    if (!componentId) {
        alert('Please save the component first before refreshing version');
        return;
    }
    
    const lastCheckedSpan = document.getElementById(isProduction ? 'versionLastCheckedTime' : 'shadowVersionLastCheckedTime');
    const namespaceField = isProduction ? 'componentNamespace' : 'componentShadowNamespace';
    const versionField = isProduction ? 'componentDetectedVersion' : 'componentShadowDetectedVersion';
    const endpoint = isProduction ? 'check-version' : 'check-shadow-version';
    
    lastCheckedSpan.textContent = 'Refreshing...';
    
    try {
        const response = await fetch(`${API_BASE}/components/${componentId}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // Update the fields with new values
            if (isProduction) {
                document.getElementById(namespaceField).value = result.component.namespace || '';
                document.getElementById(versionField).value = result.component.detected_version || '';
            } else {
                document.getElementById(namespaceField).value = result.component.shadow_namespace || '';
                document.getElementById(versionField).value = result.component.shadow_detected_version || '';
            }
            lastCheckedSpan.textContent = formatDate(new Date());
            
            // Reload components to update the list
            await loadComponents();
            
            alert(`${isProduction ? 'Production' : 'Shadow'} version refreshed successfully!`);
        } else {
            lastCheckedSpan.textContent = 'Refresh failed';
            alert(result.error || `Failed to refresh ${isProduction ? 'production' : 'shadow'} version`);
        }
    } catch (error) {
        lastCheckedSpan.textContent = 'Refresh failed';
        alert('Network error. Please try again.');
    }
}

// Incidents
async function loadIncidents() {
    try {
        // Load all incidents - fetch both public and internal, then combine
        const [internalResponse, publicResponse] = await Promise.all([
            fetch(`${API_BASE}/incidents?visibility=internal&limit=1000`),
            fetch(`${API_BASE}/incidents?visibility=public&limit=1000`)
        ]);
        
        const internalIncidents = await internalResponse.json();
        const publicIncidents = await publicResponse.json();
        
        // Combine and remove duplicates by ID
        const allIncidentsMap = new Map();
        [...internalIncidents, ...publicIncidents].forEach(inc => {
            if (!allIncidentsMap.has(inc.id)) {
                allIncidentsMap.set(inc.id, inc);
            }
        });
        
        const allIncidents = Array.from(allIncidentsMap.values());
        // Sort by started_at descending
        allIncidents.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
        
        renderIncidents(allIncidents);
    } catch (error) {
        console.error('Failed to load incidents:', error);
    }
}

function renderIncidents(incidents) {
    const tbody = document.getElementById('incidentsTableBody');
    
    if (!incidents || incidents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #718096;">No incidents found</td></tr>';
        return;
    }
    
        tbody.innerHTML = incidents.map(inc => {
        const started = parseUTCDate(inc.started_at);
        // If resolved_at is null but status is resolved, try to get it from the last update
        let resolved = parseUTCDate(inc.resolved_at);
        if (!resolved && inc.current_status === 'resolved') {
            // If no resolved_at but status is resolved, use last update timestamp as fallback
            const updates = inc.updates || [];
            if (updates.length > 0) {
                const sortedUpdates = [...updates].sort((a, b) => parseUTCDate(a.timestamp) - parseUTCDate(b.timestamp));
                const lastUpdate = sortedUpdates[sortedUpdates.length - 1];
                resolved = parseUTCDate(lastUpdate.timestamp);
            }
        }
        const visibility = inc.visibility || 'public';
        return `
            <tr>
                <td>${escapeHtml(inc.title)}</td>
                <td><span class="status-badge ${inc.impact}">${inc.impact}</span></td>
                <td><span class="status-badge ${inc.current_status}">${inc.current_status}</span></td>
                <td>${formatDate(started)}</td>
                <td>${resolved ? formatDate(resolved) : '-'}</td>
                <td><span style="font-size: 12px; color: #718096; text-transform: capitalize;">${visibility}</span></td>
                <td>
                    <button onclick="editIncident(${inc.id})" class="btn btn-sm btn-secondary">Edit</button>
                    <button onclick="exportIncidentPDF(${inc.id})" class="btn btn-sm" style="background-color: #48bb78; color: white;">Export PDF</button>
                    <button onclick="deleteIncident(${inc.id})" class="btn btn-sm btn-danger">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

function showIncidentModal(incidentId = null) {
    const modal = document.getElementById('incidentModal');
    const form = document.getElementById('incidentForm');
    const title = document.getElementById('incidentModalTitle');
    const updatesSection = document.getElementById('incidentUpdatesSection');

    // Make sure components are loaded and populated before showing modal
    ensureComponentsLoaded().then(() => {
        showIncidentModalInternal(incidentId);
    });
}

function showIncidentModalInternal(incidentId = null) {
    const modal = document.getElementById('incidentModal');
    const form = document.getElementById('incidentForm');
    const title = document.getElementById('incidentModalTitle');
    const updatesSection = document.getElementById('incidentUpdatesSection');

    // Clear any previous AI suggestions
    clearAllAISuggestions();

    if (incidentId) {
        fetch(`${API_BASE}/incidents/${incidentId}`)
            .then(res => res.json())
            .then(incident => {
                title.textContent = 'Edit Incident';
                document.getElementById('incidentId').value = incident.id;
                document.getElementById('incidentNumber').value = incident.incident_number || '';
                document.getElementById('incidentTitle').value = incident.title;
                document.getElementById('incidentSummary').value = incident.summary || '';
                document.getElementById('incidentAffectedServices').value = incident.affected_services || '';
                document.getElementById('incidentRootCause').value = incident.root_cause || '';
                document.getElementById('incidentResolutionNotes').value = incident.resolution_notes || '';
                document.getElementById('incidentImpact').value = incident.impact;
                document.getElementById('incidentStatus').value = incident.current_status;
                document.getElementById('incidentVisibility').value = incident.visibility;
                document.getElementById('incidentDomainDistribution').value = incident.domain_distribution || '';
                
                // Set timeline fields
                if (incident.started_at) {
                    document.getElementById('incidentStartedAt').value = formatDateTimeForInput(incident.started_at);
                } else {
                    document.getElementById('incidentStartedAt').value = '';
                }
                if (incident.resolved_at) {
                    document.getElementById('incidentResolvedAt').value = formatDateTimeForInput(incident.resolved_at);
                } else {
                    document.getElementById('incidentResolvedAt').value = '';
                }
                
                // Store original values for change detection
                originalIncidentValues = {
                    summary: incident.summary || '',
                    affected_services: incident.affected_services || '',
                    root_cause: incident.root_cause || '',
                    resolution_notes: incident.resolution_notes || ''
                };
                
                // Hide all save buttons initially
                hideAllSaveButtons();
                
                // Set affected components (checkboxes)
                const componentDiv = document.getElementById('incidentComponents');
                if (componentDiv) {
                    componentDiv.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                        checkbox.checked = incident.affected_component_ids && incident.affected_component_ids.includes(parseInt(checkbox.value));
                    });
                }

                // Show updates
                if (incident.updates && incident.updates.length > 0) {
                    updatesSection.style.display = 'block';
                    renderIncidentUpdates(incident.updates);
                } else {
                    updatesSection.style.display = 'block';
                    document.getElementById('incidentUpdatesList').innerHTML = '<p>No updates yet</p>';
                }

                modal.style.display = 'block';
            })
            .catch(error => {
                console.error('Error loading incident:', error);
                alert('Failed to load incident details');
            });
    } else {
        title.textContent = 'Create Incident';
        form.reset();
        document.getElementById('incidentId').value = '';
        document.getElementById('incidentNumber').value = '';
        document.getElementById('incidentSummary').value = '';
        document.getElementById('incidentAffectedServices').value = '';
        document.getElementById('incidentRootCause').value = '';
        document.getElementById('incidentResolutionNotes').value = '';
        document.getElementById('incidentDomainDistribution').value = '';
        document.getElementById('incidentStartedAt').value = '';
        document.getElementById('incidentResolvedAt').value = '';
        updatesSection.style.display = 'none';
        
        // Clear original values and hide save buttons for new incidents
        originalIncidentValues = {};
        hideAllSaveButtons();
        
        // Clear component selections (checkboxes)
        const componentDiv = document.getElementById('incidentComponents');
        if (componentDiv) {
            componentDiv.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = false;
            });
        }
        
        modal.style.display = 'block';
    }
}

function renderIncidentUpdates(updates) {
    const list = document.getElementById('incidentUpdatesList');
    const incidentId = document.getElementById('incidentId').value;
    
    list.innerHTML = updates.map(update => {
        const updateId = update.id;
        const isEditing = list.getAttribute('data-editing') === updateId.toString();
        
        if (isEditing) {
            // Show edit form
            return `
                <div id="update-${updateId}" style="padding: 10px; margin: 10px 0; background: #edf2f7; border-radius: 6px; border: 2px solid #4299e1;">
                    <div style="font-size: 12px; color: #718096; margin-bottom: 8px;">${formatDate(parseUTCDate(update.timestamp))}</div>
                    <textarea id="update-message-${updateId}" rows="3" style="width: 100%; padding: 8px; border: 1px solid #cbd5e0; border-radius: 4px; font-family: inherit; font-size: 14px; margin-bottom: 8px;">${escapeHtml(update.message)}</textarea>
                    <select id="update-status-${updateId}" style="padding: 6px; border: 1px solid #cbd5e0; border-radius: 4px; margin-bottom: 8px; margin-right: 8px;">
                        <option value="identified" ${update.status === 'identified' ? 'selected' : ''}>Identified</option>
                        <option value="monitoring" ${update.status === 'monitoring' ? 'selected' : ''}>Monitoring</option>
                        <option value="resolved" ${update.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                    </select>
                    <button type="button" data-action="save-update" data-incident-id="${incidentId}" data-update-id="${updateId}" class="btn btn-sm" style="background-color: #48bb78; color: white; margin-right: 5px;">Save</button>
                    <button type="button" data-action="cancel-edit-update" data-incident-id="${incidentId}" class="btn btn-sm btn-secondary">Cancel</button>
                </div>
            `;
        } else {
            // Show read-only view with edit button
            return `
                <div id="update-${updateId}" style="padding: 10px; margin: 10px 0; background: #f7fafc; border-radius: 6px; position: relative;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 5px;">
                        <div style="font-size: 12px; color: #718096;">${formatDate(parseUTCDate(update.timestamp))}</div>
                        <button type="button" data-action="edit-update" data-incident-id="${incidentId}" data-update-id="${updateId}" class="btn btn-sm" style="background-color: #4299e1; color: white; padding: 4px 8px; font-size: 11px;">Edit</button>
                    </div>
                    <div style="margin: 5px 0;">${escapeHtml(update.message)}</div>
                    <span class="status-badge ${update.status}">${update.status}</span>
                </div>
            `;
        }
    }).join('');
    
    // Attach event listeners to the buttons
    list.querySelectorAll('[data-action="edit-update"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const incidentId = btn.getAttribute('data-incident-id');
            const updateId = btn.getAttribute('data-update-id');
            editUpdate(parseInt(incidentId), parseInt(updateId));
        });
    });
    
    list.querySelectorAll('[data-action="save-update"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const incidentId = btn.getAttribute('data-incident-id');
            const updateId = btn.getAttribute('data-update-id');
            saveUpdate(parseInt(incidentId), parseInt(updateId));
        });
    });
    
    list.querySelectorAll('[data-action="cancel-edit-update"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const incidentId = btn.getAttribute('data-incident-id');
            cancelEditUpdate(parseInt(incidentId));
        });
    });
}

function addIncidentUpdate() {
    const message = document.getElementById('incidentUpdateMessage').value;
    const status = document.getElementById('incidentUpdateStatus').value;
    const incidentId = document.getElementById('incidentId').value;

    if (!message) {
        alert('Please enter an update message');
        return;
    }

    if (!incidentId) {
        alert('Please save the incident first');
        return;
    }

    fetch(`${API_BASE}/incidents/${incidentId}/updates`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ message, status })
    })
    .then(res => res.json())
    .then(() => {
        document.getElementById('incidentUpdateMessage').value = '';
        showIncidentModal(parseInt(incidentId));
    })
    .catch(error => {
        alert('Failed to add update');
    });
}

function editUpdate(incidentId, updateId) {
    const list = document.getElementById('incidentUpdatesList');
    list.setAttribute('data-editing', updateId.toString());
    
    // Reload the incident to get fresh update data
    fetch(`${API_BASE}/incidents/${incidentId}`)
        .then(res => res.json())
        .then(incident => {
            if (incident.updates) {
                renderIncidentUpdates(incident.updates);
            }
        })
        .catch(error => {
            console.error('Error loading incident:', error);
        });
}

function cancelEditUpdate(incidentId) {
    const list = document.getElementById('incidentUpdatesList');
    list.removeAttribute('data-editing');
    
    // Reload the incident to get fresh update data
    fetch(`${API_BASE}/incidents/${incidentId}`)
        .then(res => res.json())
        .then(incident => {
            if (incident.updates) {
                renderIncidentUpdates(incident.updates);
            }
        })
        .catch(error => {
            console.error('Error loading incident:', error);
        });
}

async function saveUpdate(incidentId, updateId) {
    const message = document.getElementById(`update-message-${updateId}`).value.trim();
    const status = document.getElementById(`update-status-${updateId}`).value;

    if (!message) {
        alert('Please enter an update message');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/incidents/${incidentId}/updates/${updateId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ message, status })
        });

        if (response.ok) {
            // Reload the incident to show updated data
            showIncidentModal(parseInt(incidentId));
            // Trigger status page refresh if it's open
            localStorage.setItem('statusPageRefresh', Date.now().toString());
        } else {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            alert(`Failed to update: ${errorData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Error updating:', error);
        alert('Network error. Please try again.');
    }
}

document.getElementById('incidentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('=== FORM SUBMIT TRIGGERED ===');
    
    const id = document.getElementById('incidentId').value;
    console.log('Incident ID:', id || 'NEW INCIDENT');
    
    const componentDiv = document.getElementById('incidentComponents');
    const affectedComponentIds = Array.from(componentDiv.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => parseInt(checkbox.value));

    // Collect all form values - always send all fields when editing to ensure they're saved
    const titleEl = document.getElementById('incidentTitle');
    const summaryEl = document.getElementById('incidentSummary');
    const affectedServicesEl = document.getElementById('incidentAffectedServices');
    const rootCauseEl = document.getElementById('incidentRootCause');
    const resolutionNotesEl = document.getElementById('incidentResolutionNotes');
    const incidentNumberEl = document.getElementById('incidentNumber');
    
    // Check if elements exist
    if (!titleEl || !summaryEl || !affectedServicesEl || !rootCauseEl || !resolutionNotesEl) {
        console.error('Form elements not found!', {
            title: !!titleEl,
            summary: !!summaryEl,
            affectedServices: !!affectedServicesEl,
            rootCause: !!rootCauseEl,
            resolutionNotes: !!resolutionNotesEl
        });
        alert('Error: Form fields not found. Please refresh the page.');
        return;
    }
    
    const data = {
        title: titleEl.value.trim(),
        impact: document.getElementById('incidentImpact').value,
        current_status: document.getElementById('incidentStatus').value,
        visibility: document.getElementById('incidentVisibility').value,
        affected_component_ids: affectedComponentIds
    };
    
    // Always include optional fields - send empty string or null so backend can save/clear them
    const incidentNumberValue = incidentNumberEl ? incidentNumberEl.value.trim() : '';
    const summaryValue = summaryEl.value.trim();
    const affectedServicesValue = affectedServicesEl.value.trim();
    const rootCauseValue = rootCauseEl.value.trim();
    const resolutionNotesValue = resolutionNotesEl.value.trim();
    const domainDistributionValue = document.getElementById('incidentDomainDistribution').value;
    
    // Get timeline values
    const startedAtValue = document.getElementById('incidentStartedAt').value;
    const resolvedAtValue = document.getElementById('incidentResolvedAt').value;
    
    console.log('Form values collected:', {
        summary: summaryValue,
        affectedServices: affectedServicesValue,
        rootCause: rootCauseValue,
        resolutionNotes: resolutionNotesValue,
        domainDistribution: domainDistributionValue,
        startedAt: startedAtValue,
        resolvedAt: resolvedAtValue
    });
    
    // When editing, always send all fields (even if empty) so they can be updated
    // When creating, only send if they have values
    if (id) {
        // Editing: send all fields to allow updates
        // Convert empty strings to null explicitly
        data.incident_number = incidentNumberValue === '' ? null : (incidentNumberValue || null);
        data.summary = summaryValue === '' ? null : (summaryValue || null);
        data.affected_services = affectedServicesValue === '' ? null : (affectedServicesValue || null);
        data.root_cause = rootCauseValue === '' ? null : (rootCauseValue || null);
        data.resolution_notes = resolutionNotesValue === '' ? null : (resolutionNotesValue || null);
        data.domain_distribution = domainDistributionValue === '' ? null : (domainDistributionValue || null);
        
        // Timeline fields - convert to ISO string if present
        if (startedAtValue) {
            data.started_at = new Date(startedAtValue).toISOString();
        }
        if (resolvedAtValue) {
            data.resolved_at = new Date(resolvedAtValue).toISOString();
        } else {
            data.resolved_at = null;
        }
    } else {
        // Creating: only send if they have values
        if (incidentNumberValue) data.incident_number = incidentNumberValue;
        if (summaryValue) data.summary = summaryValue;
        if (affectedServicesValue) data.affected_services = affectedServicesValue;
        if (rootCauseValue) data.root_cause = rootCauseValue;
        if (resolutionNotesValue) data.resolution_notes = resolutionNotesValue;
        if (domainDistributionValue) data.domain_distribution = domainDistributionValue;
        
        // Timeline for new incidents
        if (startedAtValue) {
            data.started_at = new Date(startedAtValue).toISOString();
        }
        if (resolvedAtValue) {
            data.resolved_at = new Date(resolvedAtValue).toISOString();
        }
    }

    // Default started_at to now if not provided for new incidents
    if (!id && !data.started_at) {
        data.started_at = new Date().toISOString();
    }

    console.log('Data being sent to server:', JSON.stringify(data, null, 2));

    // Disable submit button to prevent double submission
    const submitButton = document.querySelector('#incidentForm button[type="submit"]');
    const originalButtonText = submitButton ? submitButton.textContent : '';
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Saving...';
    }

    try {
        const url = id 
            ? `${API_BASE}/incidents/${id}`
            : `${API_BASE}/incidents`;
        const method = id ? 'PATCH' : 'POST';

        console.log('Making', method, 'request to:', url);

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(data)
        });

        // Re-enable submit button
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }

        if (response.ok) {
            const savedIncident = await response.json().catch(() => null);
            console.log('=== INCIDENT SAVED SUCCESSFULLY ===');
            console.log('Saved incident data:', {
                id: savedIncident?.id,
                title: savedIncident?.title,
                summary: savedIncident?.summary,
                affected_services: savedIncident?.affected_services,
                root_cause: savedIncident?.root_cause,
                resolution_notes: savedIncident?.resolution_notes,
                incident_number: savedIncident?.incident_number
            });
            
            // Verify the data was actually saved
            if (savedIncident && id) {
                // When editing, verify the fields we sent were saved
                const mismatches = [];
                if (data.summary !== undefined && savedIncident.summary !== data.summary) {
                    mismatches.push(`Summary: sent "${data.summary}" but got "${savedIncident.summary}"`);
                }
                if (data.affected_services !== undefined && savedIncident.affected_services !== data.affected_services) {
                    mismatches.push(`Affected Services: sent "${data.affected_services}" but got "${savedIncident.affected_services}"`);
                }
                if (data.root_cause !== undefined && savedIncident.root_cause !== data.root_cause) {
                    mismatches.push(`Root Cause: sent "${data.root_cause}" but got "${savedIncident.root_cause}"`);
                }
                if (data.resolution_notes !== undefined && savedIncident.resolution_notes !== data.resolution_notes) {
                    mismatches.push(`Resolution Notes: sent "${data.resolution_notes}" but got "${savedIncident.resolution_notes}"`);
                }
                if (mismatches.length > 0) {
                    console.warn('⚠️ Data mismatch detected:', mismatches);
                } else {
                    console.log('✅ All fields saved correctly!');
                }
            }
            
            closeModal('incidentModal');
            await loadIncidents();
            // Trigger status page refresh if it's open
            localStorage.setItem('statusPageRefresh', Date.now().toString());
            
            // If incident was resolved, refresh the status page if it's open
            if (data.current_status === 'resolved' || (id && document.getElementById('incidentStatus').value === 'resolved')) {
                console.log('Incident resolved - status page will update on next refresh');
            }
        } else {
            // Re-enable submit button on error
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalButtonText;
            }
            
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { error: errorText || 'Unknown error' };
            }
            console.error('=== ERROR SAVING INCIDENT ===');
            console.error('Status:', response.status);
            console.error('Error response:', errorData);
            console.error('Request data that failed:', JSON.stringify(data, null, 2));
            alert(`Failed to save incident: ${errorData.error || `Status ${response.status}`}\n\nCheck the browser console (F12) for details.`);
        }
    } catch (error) {
        // Re-enable submit button on error
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalButtonText;
        }
        
        console.error('=== NETWORK ERROR ===');
        console.error('Error details:', error);
        console.error('Data being sent:', JSON.stringify(data, null, 2));
        alert(`Network error: ${error.message || 'Please try again.'}\n\nCheck the browser console (F12) for details.`);
    }
});

async function deleteIncident(id) {
    if (!confirm('Are you sure you want to delete this incident? This action cannot be undone.')) return;

    try {
        const response = await apiCall(`${API_BASE}/incidents/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadIncidents();
            // Trigger status page refresh if it's open
            localStorage.setItem('statusPageRefresh', Date.now().toString());
        } else {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            alert(errorData.error || 'Failed to delete incident');
        }
    } catch (error) {
        if (error.message === 'Token expired') {
            // Already handled by apiCall
            return;
        }
        console.error('Delete error:', error);
        alert(`Network error: ${error.message || 'Please try again.'}`);
    }
}

function editIncident(id) {
    showIncidentModal(id);
}

// Maintenances
async function loadMaintenances() {
    try {
        const response = await fetch(`${API_BASE}/maintenances`);
        const maintenances = await response.json();
        renderMaintenances(maintenances);
    } catch (error) {
        console.error('Failed to load maintenances:', error);
    }
}

function renderMaintenances(maintenances) {
    const tbody = document.getElementById('maintenancesTableBody');
    tbody.innerHTML = maintenances.map(m => {
        const start = parseUTCDate(m.window_start);
        const end = parseUTCDate(m.window_end);
        return `
            <tr>
                <td>${escapeHtml(m.title)}</td>
                <td>${formatDate(start)}</td>
                <td>${formatDate(end)}</td>
                <td><span class="status-badge ${m.status}">${m.status.replace('_', ' ')}</span></td>
                <td>
                    <button onclick="editMaintenance(${m.id})" class="btn btn-sm btn-secondary">Edit</button>
                    <button onclick="deleteMaintenance(${m.id})" class="btn btn-sm btn-danger">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

function showMaintenanceModal(maintenanceId = null) {
    const modal = document.getElementById('maintenanceModal');
    const form = document.getElementById('maintenanceForm');
    const title = document.getElementById('maintenanceModalTitle');

    if (maintenanceId) {
        fetch(`${API_BASE}/maintenances/${maintenanceId}`)
            .then(res => res.json())
            .then(maintenance => {
                title.textContent = 'Edit Maintenance';
                document.getElementById('maintenanceId').value = maintenance.id;
                document.getElementById('maintenanceTitle').value = maintenance.title;
                document.getElementById('maintenanceStart').value = new Date(maintenance.window_start).toISOString().slice(0, 16);
                document.getElementById('maintenanceEnd').value = new Date(maintenance.window_end).toISOString().slice(0, 16);
                document.getElementById('maintenanceStatus').value = maintenance.status;

                // Set affected components (checkboxes)
                const componentDiv = document.getElementById('maintenanceComponents');
                if (componentDiv) {
                    componentDiv.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                        checkbox.checked = maintenance.affected_component_ids && maintenance.affected_component_ids.includes(parseInt(checkbox.value));
                    });
                }

                modal.style.display = 'block';
            });
    } else {
        title.textContent = 'Schedule Maintenance';
        form.reset();
        document.getElementById('maintenanceId').value = '';
        modal.style.display = 'block';
    }
}

document.getElementById('maintenanceForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('maintenanceId').value;
    const componentDiv = document.getElementById('maintenanceComponents');
    const affectedComponentIds = Array.from(componentDiv.querySelectorAll('input[type="checkbox"]:checked'))
        .map(checkbox => parseInt(checkbox.value));

    const start = new Date(document.getElementById('maintenanceStart').value);
    const end = new Date(document.getElementById('maintenanceEnd').value);

    const data = {
        title: document.getElementById('maintenanceTitle').value,
        window_start: start.toISOString(),
        window_end: end.toISOString(),
        status: document.getElementById('maintenanceStatus').value,
        affected_component_ids: affectedComponentIds
    };

    try {
        const url = id 
            ? `${API_BASE}/maintenances/${id}`
            : `${API_BASE}/maintenances`;
        const method = id ? 'PATCH' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            closeModal('maintenanceModal');
            await loadMaintenances();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to save maintenance');
        }
    } catch (error) {
        alert('Network error. Please try again.');
    }
});

async function deleteMaintenance(id) {
    if (!confirm('Are you sure you want to delete this maintenance?')) return;

    try {
        const response = await fetch(`${API_BASE}/maintenances/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            await loadMaintenances();
        } else {
            alert('Failed to delete maintenance');
        }
    } catch (error) {
        alert('Network error. Please try again.');
    }
}

function editMaintenance(id) {
    showMaintenanceModal(id);
}

// Utility functions
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function formatDate(date) {
    // Format as UTC
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
    }) + ' UTC';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

async function exportIncidentPDF(incidentId) {
    try {
        // Fetch full incident data
        const response = await fetch(`${API_BASE}/incidents/${incidentId}`);
        if (!response.ok) {
            alert('Failed to load incident data');
            return;
        }
        
        const incident = await response.json();
        
        // Fetch affected components
        const componentNames = [];
        if (incident.affected_component_ids && incident.affected_component_ids.length > 0) {
            for (const compId of incident.affected_component_ids) {
                const comp = components.find(c => c.id === compId);
                if (comp) {
                    componentNames.push(comp.name);
                }
            }
        }
        
        // Calculate duration - only if incident is resolved
        const startDate = parseUTCDate(incident.started_at);
        let duration = 'Ongoing';
        if (incident.resolved_at) {
            const endDate = parseUTCDate(incident.resolved_at);
            const durationMs = endDate - startDate;
            const hours = Math.floor(durationMs / (1000 * 60 * 60));
            const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
            duration = `${hours} Hours ${minutes} Minutes`;
        }
        
        // Format dates
        const formatDateForPDF = (date) => {
            if (!date) return 'N/A';
            const d = parseUTCDate(date);
            const year = d.getUTCFullYear();
            const month = String(d.getUTCMonth() + 1).padStart(2, '0');
            const day = String(d.getUTCDate()).padStart(2, '0');
            const hours = String(d.getUTCHours()).padStart(2, '0');
            const mins = String(d.getUTCMinutes()).padStart(2, '0');
            return `${year}-${month}-${day} ${hours}:${mins}`;
        };
        
        // Generate PDF using jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Set font
        doc.setFont('helvetica');
        
        // Title
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(incident.title, 14, 20);
        
        // Incident Details Table
        let yPos = 35;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Incident Details', 14, yPos);
        
        yPos += 8;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        
        const details = [
            ['Incident number:', incident.incident_number || `PRB${incident.id.toString().padStart(6, '0')}`],
            ['Incident Start Date & Time (GMT):', formatDateForPDF(incident.started_at)],
            ['Incident End Date & Time (GMT):', incident.resolved_at ? formatDateForPDF(incident.resolved_at) : 'Ongoing'],
            ['Overall Duration:', duration],
            ['Interim Domain Distribution:', incident.domain_distribution || 'Not specified']
        ];
        
        // Note: End date is always the resolution time (resolved_at), or "Ongoing" if not resolved
        
        details.forEach(([label, value]) => {
            doc.setFont('helvetica', 'bold');
            doc.text(label, 14, yPos);
            doc.setFont('helvetica', 'normal');
            doc.text(value, 80, yPos);
            yPos += 6;
        });
        
        // Important Note
        yPos += 5;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(200, 0, 0);
        doc.text('IMPORTANT NOTE:', 14, yPos);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        yPos += 6;
        doc.setFontSize(8);
        const noteText = 'This report is for Playtech internal use only and should be revised accordingly before exposing its contents to any external parties.';
        doc.text(noteText, 14, yPos, { maxWidth: 180 });
        
        // Affected services
        yPos += 12;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Affected services:', 14, yPos);
        yPos += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        let affectedServicesText = '';
        if (incident.affected_services) {
            affectedServicesText = incident.affected_services;
        } else if (componentNames.length > 0) {
            affectedServicesText = componentNames.join(', ');
        } else {
            affectedServicesText = 'No affected services specified.';
        }
        const affectedServicesLines = doc.splitTextToSize(affectedServicesText, 180);
        doc.text(affectedServicesLines, 14, yPos);
        yPos += affectedServicesLines.length * 5 + 8;
        
        // Affected Components (if different from services or additional detail)
        if (componentNames.length > 0 && (!incident.affected_services || componentNames.length > 0)) {
            if (yPos > 250) {
                doc.addPage();
                yPos = 20;
            }
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Affected Components:', 14, yPos);
            yPos += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const componentsText = componentNames.join(', ');
            const componentsLines = doc.splitTextToSize(componentsText, 180);
            doc.text(componentsLines, 14, yPos);
            yPos += componentsLines.length * 5 + 8;
        }
        
        // Incident summary
        if (yPos > 250) {
            doc.addPage();
            yPos = 20;
        }
        yPos += 5;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Incident summary:', 14, yPos);
        yPos += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        
        if (incident.summary) {
            const summaryLines = doc.splitTextToSize(incident.summary, 180);
            doc.text(summaryLines, 14, yPos);
            yPos += summaryLines.length * 5 + 5;
        } else {
            doc.text('No summary provided.', 14, yPos);
            yPos += 5;
        }
        
        // Root Cause (separate section if available)
        if (incident.root_cause) {
            if (yPos > 250) {
                doc.addPage();
                yPos = 20;
            }
            yPos += 5;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Root Cause:', 14, yPos);
            yPos += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const rootCauseLines = doc.splitTextToSize(incident.root_cause, 180);
            doc.text(rootCauseLines, 14, yPos);
            yPos += rootCauseLines.length * 5 + 5;
        }
        
        // Resolution Notes (separate section if available)
        if (incident.resolution_notes) {
            if (yPos > 250) {
                doc.addPage();
                yPos = 20;
            }
            yPos += 5;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Resolution:', 14, yPos);
            yPos += 6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const resolutionLines = doc.splitTextToSize(incident.resolution_notes, 180);
            doc.text(resolutionLines, 14, yPos);
            yPos += resolutionLines.length * 5 + 8;
        } else {
            yPos += 5;
        }
        
        // Check if we need a new page
        if (yPos > 250) {
            doc.addPage();
            yPos = 20;
        }
        
        // Incident timeline
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Incident timeline (GMT):', 14, yPos);
        yPos += 8;
        
        if (incident.updates && incident.updates.length > 0) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            
            const sortedUpdates = [...incident.updates].sort((a, b) => {
                const dateA = parseUTCDate(a.timestamp);
                const dateB = parseUTCDate(b.timestamp);
                return dateA - dateB;
            });
            
            sortedUpdates.forEach((update, index) => {
                const updateDate = parseUTCDate(update.timestamp);
                const year = updateDate.getUTCFullYear();
                const month = String(updateDate.getUTCMonth() + 1).padStart(2, '0');
                const day = String(updateDate.getUTCDate()).padStart(2, '0');
                const hours = String(updateDate.getUTCHours()).padStart(2, '0');
                const mins = String(updateDate.getUTCMinutes()).padStart(2, '0');
                const timeStr = `${hours}:${mins}`;
                const dateStr = `${year}-${month}-${day}`;
                
                // Check if we need a new page
                if (yPos > 250) {
                    doc.addPage();
                    yPos = 20;
                }
                
                // Show date if it's a new day or first update
                const prevUpdate = index > 0 ? sortedUpdates[index - 1] : null;
                const showDate = !prevUpdate || 
                    formatDateForPDF(prevUpdate.timestamp).split(' ')[0] !== dateStr;
                
                if (showDate && index > 0) {
                    yPos += 3;
                    doc.setFontSize(8);
                    doc.setTextColor(100, 100, 100);
                    doc.text(dateStr, 14, yPos);
                    doc.setTextColor(0, 0, 0);
                    yPos += 5;
                    doc.setFontSize(9);
                } else if (index === 0) {
                    // Show date for first update
                    doc.setFontSize(8);
                    doc.setTextColor(100, 100, 100);
                    doc.text(dateStr, 14, yPos);
                    doc.setTextColor(0, 0, 0);
                    yPos += 5;
                    doc.setFontSize(9);
                }
                
                doc.setFont('helvetica', 'bold');
                doc.text(`${timeStr}:`, 14, yPos);
                doc.setFont('helvetica', 'normal');
                const messageLines = doc.splitTextToSize(update.message, 160);
                doc.text(messageLines, 30, yPos);
                
                // Show status if different from default
                if (update.status && update.status !== 'monitoring') {
                    const statusY = yPos + (messageLines.length - 1) * 5;
                    doc.setFontSize(8);
                    doc.setTextColor(100, 100, 100);
                    doc.text(`[Status: ${update.status}]`, 30, statusY + 5);
                    doc.setTextColor(0, 0, 0);
                    doc.setFontSize(9);
                    yPos += 5;
                }
                
                yPos += messageLines.length * 5 + 5;
            });
        } else {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.text('No timeline updates available.', 14, yPos);
        }
        
        // Add metadata footer on last page
        const pageCount = doc.internal.pages.length - 1;
        doc.setPage(pageCount);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        const footerText = `Generated: ${formatDateForPDF(new Date().toISOString())} GMT | Impact: ${incident.impact} | Status: ${incident.current_status}`;
        doc.text(footerText, 14, doc.internal.pageSize.height - 10);
        
        // Save PDF
        const fileName = `Incident_${incident.incident_number || incident.id}_${formatDateForPDF(incident.started_at).replace(/[: ]/g, '_')}.pdf`;
        doc.save(fileName);
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        alert('Failed to generate PDF: ' + error.message);
    }
}

// Function to show save button when field is changed
function showSaveButton(fieldName) {
    const incidentId = document.getElementById('incidentId').value;
    if (!incidentId) {
        // Don't show save buttons for new incidents
        return;
    }
    
    const fieldMap = {
        'summary': { element: 'incidentSummary', button: 'saveSummaryBtn' },
        'affected_services': { element: 'incidentAffectedServices', button: 'saveAffectedServicesBtn' },
        'root_cause': { element: 'incidentRootCause', button: 'saveRootCauseBtn' },
        'resolution_notes': { element: 'incidentResolutionNotes', button: 'saveResolutionNotesBtn' }
    };
    
    const fieldInfo = fieldMap[fieldName];
    if (!fieldInfo) return;
    
    const element = document.getElementById(fieldInfo.element);
    const button = document.getElementById(fieldInfo.button);
    
    if (!element || !button) return;
    
    const currentValue = element.value.trim();
    const originalValue = originalIncidentValues[fieldName] || '';
    
    // Show button if value has changed
    if (currentValue !== originalValue) {
        button.style.display = 'inline-flex';
    } else {
        button.style.display = 'none';
    }
}

// Function to hide all save buttons
function hideAllSaveButtons() {
    const buttons = ['saveSummaryBtn', 'saveAffectedServicesBtn', 'saveRootCauseBtn', 'saveResolutionNotesBtn'];
    buttons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.style.display = 'none';
    });
}

// Function to save individual field
async function saveField(fieldName) {
    const incidentId = document.getElementById('incidentId').value;
    if (!incidentId) {
        alert('Please save the incident first before saving individual fields.');
        return;
    }
    
    const fieldMap = {
        'summary': { element: 'incidentSummary', button: 'saveSummaryBtn' },
        'affected_services': { element: 'incidentAffectedServices', button: 'saveAffectedServicesBtn' },
        'root_cause': { element: 'incidentRootCause', button: 'saveRootCauseBtn' },
        'resolution_notes': { element: 'incidentResolutionNotes', button: 'saveResolutionNotesBtn' }
    };
    
    const fieldInfo = fieldMap[fieldName];
    if (!fieldInfo) {
        console.error('Unknown field:', fieldName);
        return;
    }
    
    const element = document.getElementById(fieldInfo.element);
    const button = document.getElementById(fieldInfo.button);
    
    if (!element || !button) {
        console.error('Field element or button not found');
        return;
    }
    
    const value = element.value.trim();
    // Always send the field, even if empty (send null for empty strings)
    const data = {};
    // Ensure we send the value as a string (or null if empty)
    // Use bracket notation to ensure the exact field name is used
    data[fieldName] = value === '' ? null : String(value);
    
    console.log('=== SAVING FIELD ===');
    console.log('Field name:', fieldName);
    console.log('Field value (raw):', element.value);
    console.log('Field value (trimmed):', value);
    console.log('Data object before stringify:', data);
    console.log('Data object keys:', Object.keys(data));
    console.log('Has fieldName in data?', fieldName in data);
    console.log('Stringified data:', JSON.stringify(data));
    console.log('Incident ID:', incidentId);
    console.log('API URL:', `${API_BASE}/incidents/${incidentId}`);
    
    // Disable button and show saving state
    button.disabled = true;
    const originalButtonText = button.innerHTML;
    button.innerHTML = '<span class="save-icon">⏳</span> Saving...';
    
    try {
        
        // Use fetch directly to ensure body is sent correctly
        const response = await fetch(`${API_BASE}/incidents/${incidentId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(data)
        });
        
        // Handle token expiration
        if (response.status === 403) {
            const errorData = await response.json().catch(() => ({}));
            if (errorData.error && errorData.error.includes('token')) {
                alert('Your session has expired. Please log in again.');
                logout();
                throw new Error('Token expired');
            }
        }
        
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        if (response.ok) {
            const savedIncident = await response.json().catch(() => null);
            console.log(`Field "${fieldName}" saved successfully`);
            
            // Update original value to reflect saved state
            originalIncidentValues[fieldName] = value;
            
            // Hide the save button since value is now saved
            button.style.display = 'none';
            
            // Show success feedback
            button.innerHTML = '<span class="save-icon">✅</span> Saved!';
            button.style.backgroundColor = '#48bb78';
            
            setTimeout(() => {
                button.disabled = false;
                button.innerHTML = originalButtonText;
                button.style.backgroundColor = '#48bb78';
            }, 1500);
            
            // Trigger status page refresh if it's open
            localStorage.setItem('statusPageRefresh', Date.now().toString());
        } else {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { error: errorText || 'Unknown error' };
            }
            console.error('=== ERROR SAVING FIELD ===');
            console.error('Status:', response.status);
            console.error('Error response:', errorData);
            console.error('Field name:', fieldName);
            console.error('Data sent:', JSON.stringify(data, null, 2));
            console.error('Request URL:', `${API_BASE}/incidents/${incidentId}`);
            alert(`Failed to save ${fieldName}: ${errorData.error || `Status ${response.status}`}\n\nCheck the browser console (F12) for details.`);
            
            // Re-enable button
            button.disabled = false;
            button.innerHTML = originalButtonText;
        }
    } catch (error) {
        console.error('Network error saving field:', error);
        alert(`Network error: ${error.message || 'Please try again.'}`);
        
        // Re-enable button
        button.disabled = false;
        button.innerHTML = originalButtonText;
    }
}

// ============================================
// USER MANAGEMENT FUNCTIONS
// ============================================

let users = [];
let currentUser = null;

// Load users from API
async function loadUsers() {
    try {
        const response = await apiCall(`${API_BASE}/users`);
        if (response.ok) {
            users = await response.json();
            renderUsers();
            updateSessionInfo();
        } else {
            console.error('Failed to load users');
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Render users table
function renderUsers() {
    const tbody = document.getElementById('usersTableBody');
    if (!tbody) return;
    
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #718096;">No users found</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => {
        const createdDate = user.created_at ? formatDate(parseUTCDate(user.created_at)) : '-';
        const lastLogin = user.last_login ? formatDate(parseUTCDate(user.last_login)) : 'Never';
        const isCurrentUser = currentUser && currentUser.id === user.id;
        
        return `
            <tr ${isCurrentUser ? 'style="background-color: #ebf8ff;"' : ''}>
                <td>
                    ${escapeHtml(user.username)}
                    ${isCurrentUser ? '<span style="color: #4299e1; font-size: 11px; margin-left: 5px;">(You)</span>' : ''}
                </td>
                <td><span class="user-role-badge ${user.role}">${user.role}</span></td>
                <td><span class="user-status ${user.status || 'active'}">${user.status || 'active'}</span></td>
                <td>${createdDate}</td>
                <td>${lastLogin}</td>
                <td>
                    <button onclick="editUser(${user.id})" class="btn btn-sm btn-secondary">Edit</button>
                    <button onclick="showChangePasswordModal(${user.id})" class="btn btn-sm" style="background-color: #ed8936; color: white;">Password</button>
                    ${!isCurrentUser ? `<button onclick="deleteUser(${user.id})" class="btn btn-sm btn-danger">Delete</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

// Show user modal for create/edit
function showUserModal(userId = null) {
    const modal = document.getElementById('userModal');
    const form = document.getElementById('userForm');
    const title = document.getElementById('userModalTitle');
    const passwordHint = document.getElementById('passwordHint');
    const passwordInput = document.getElementById('userPassword');
    
    if (userId) {
        const user = users.find(u => u.id === userId);
        if (user) {
            title.textContent = 'Edit User';
            document.getElementById('userId').value = user.id;
            document.getElementById('userUsername').value = user.username;
            document.getElementById('userPassword').value = '';
            document.getElementById('userPasswordConfirm').value = '';
            document.getElementById('userRole').value = user.role || 'editor';
            document.getElementById('userStatus').value = user.status || 'active';
            document.getElementById('userEmail').value = user.email || '';
            
            // Password is optional when editing
            passwordInput.required = false;
            passwordHint.style.display = 'block';
        }
    } else {
        title.textContent = 'Add User';
        form.reset();
        document.getElementById('userId').value = '';
        
        // Password is required when creating
        passwordInput.required = true;
        passwordHint.style.display = 'none';
    }
    
    modal.style.display = 'block';
}

// Edit user
function editUser(id) {
    showUserModal(id);
}

// User form submission
document.getElementById('userForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('userId').value;
    const password = document.getElementById('userPassword').value;
    const passwordConfirm = document.getElementById('userPasswordConfirm').value;
    
    // Validate passwords match if provided
    if (password && password !== passwordConfirm) {
        alert('Passwords do not match');
        return;
    }
    
    // Validate password length if provided
    if (password && password.length < 6) {
        alert('Password must be at least 6 characters');
        return;
    }
    
    const data = {
        username: document.getElementById('userUsername').value.trim(),
        role: document.getElementById('userRole').value,
        status: document.getElementById('userStatus').value,
        email: document.getElementById('userEmail').value.trim() || null
    };
    
    // Only include password if provided
    if (password) {
        data.password = password;
    }
    
    try {
        const url = id ? `${API_BASE}/users/${id}` : `${API_BASE}/users`;
        const method = id ? 'PATCH' : 'POST';
        
        const response = await apiCall(url, {
            method,
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            closeModal('userModal');
            await loadUsers();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to save user');
        }
    } catch (error) {
        console.error('Error saving user:', error);
        alert('Network error. Please try again.');
    }
});

// Delete user
async function deleteUser(id) {
    const user = users.find(u => u.id === id);
    if (!user) return;
    
    if (!confirm(`Are you sure you want to delete user "${user.username}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await apiCall(`${API_BASE}/users/${id}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            await loadUsers();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to delete user');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Network error. Please try again.');
    }
}

// Show change password modal
function showChangePasswordModal(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    
    document.getElementById('changePasswordUserId').value = user.id;
    document.getElementById('changePasswordUsername').value = user.username;
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
    
    document.getElementById('changePasswordModal').style.display = 'block';
}

// Change password form submission
document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const userId = document.getElementById('changePasswordUserId').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
    if (newPassword !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }
    
    if (newPassword.length < 6) {
        alert('Password must be at least 6 characters');
        return;
    }
    
    try {
        const response = await apiCall(`${API_BASE}/users/${userId}/password`, {
            method: 'PATCH',
            body: JSON.stringify({ password: newPassword })
        });
        
        if (response.ok) {
            closeModal('changePasswordModal');
            alert('Password changed successfully');
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to change password');
        }
    } catch (error) {
        console.error('Error changing password:', error);
        alert('Network error. Please try again.');
    }
});

// Update session info display
function updateSessionInfo() {
    // Decode JWT token to get user info
    if (authToken) {
        try {
            const payload = JSON.parse(atob(authToken.split('.')[1]));
            currentUser = {
                id: payload.userId,
                username: payload.username,
                role: payload.role
            };
            
            document.getElementById('currentUsername').textContent = currentUser.username;
            document.getElementById('currentUserRole').textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
            
            // Calculate session expiry
            if (payload.exp) {
                const expiryDate = new Date(payload.exp * 1000);
                const now = new Date();
                const diffMs = expiryDate - now;
                
                if (diffMs > 0) {
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    document.getElementById('sessionExpiry').textContent = `${hours}h ${minutes}m remaining`;
                } else {
                    document.getElementById('sessionExpiry').textContent = 'Expired';
                }
            }
        } catch (error) {
            console.error('Error decoding token:', error);
        }
    }
}

