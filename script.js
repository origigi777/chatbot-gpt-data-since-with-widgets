
const OPENAI_API_KEY = "your_api_key"; // Should start with "sk-"

let csvFileInput, statusDisplay, chatbox, userMessageInput, sendButton,
    apiKeyStatus, apiKeyLoadingBar, fileLoadingBar;


let csvData = [];
let headers = [];
let fullCsvText = '';
let isModelReady = false; // Still useful to track if key *seems* okay
let isDataLoaded = false;
const MAX_CONTEXT_CHARS = 15000; // Keep context limit
const MAX_ROWS_IN_CONTEXT = 150; // Keep row limit

// --- OpenAI Configuration ---
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini"; // Or "gpt-4", "gpt-4o-mini", etc. (check pricing/availability)

// --- Wait for the DOM to be fully loaded ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed.");

    // --- Get DOM Elements ---
    csvFileInput = document.getElementById('csvFile');
    statusDisplay = document.getElementById('status');
    chatbox = document.getElementById('chatbox');
    userMessageInput = document.getElementById('userMessage');
    sendButton = document.getElementById('sendButton');
    apiKeyStatus = document.getElementById('apiKeyStatus');
    apiKeyLoadingBar = document.getElementById('apiKeyLoadingBar');
    fileLoadingBar = document.getElementById('fileLoadingBar');

    if (!apiKeyStatus || !apiKeyLoadingBar) {
        console.error("CRITICAL ERROR: Could not find API status/loading elements.");
        document.body.innerHTML = "<h1>Error: HTML structure broken. Could not find status elements.</h1>";
        return;
    }

    // --- Initial Setup & Event Listeners ---
    console.warn(">>> SECURITY WARNING: OpenAI API Key is hardcoded in the script. This is NOT secure for production! <<<");

    if (csvFileInput) { csvFileInput.addEventListener('change', handleFileUpload); }
    else { console.error("Could not find csvFileInput element."); }

    if (sendButton && userMessageInput) {
        sendButton.addEventListener('click', handleSendMessage);
        userMessageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !sendButton.disabled) { handleSendMessage(); } });
    } else { console.error("Could not find sendButton or userMessageInput elements."); }

    // --- Automatically Initialize/Check API Key ---
    console.log("Automatically calling initializeOpenAI...");
    initializeOpenAI(); // Call check function

    checkEnableSend();
});

// --- Functions ---

function updateStatusText(element, message, type = 'info') { if (element) { element.textContent = message; element.className = `status-${type}`; } }
function showLoadingBar(barElement) { if (barElement) barElement.style.display = 'block'; }
function hideLoadingBar(barElement) { if (barElement) barElement.style.display = 'none'; }

function checkEnableSend() {
    const enabled = isModelReady && isDataLoaded; // Depends on key *appearing* valid AND data loaded
    if (userMessageInput) userMessageInput.disabled = !enabled;
    if (sendButton) sendButton.disabled = !enabled;
    if (userMessageInput) {
        if (enabled) { userMessageInput.placeholder = "שאל אותי על נתוני ה-CSV..."; }
        else if (!isModelReady) { userMessageInput.placeholder = "בעיה בתצורת מפתח OpenAI..."; } // Updated placeholder
        else { userMessageInput.placeholder = "אנא טען קובץ CSV..."; }
    }
}

// Renamed and simplified - just checks if key exists for now
// A true check would involve an actual (potentially costly) API call
function initializeOpenAI() {
    console.log("initializeOpenAI function called (using hardcoded key).");

    if (!OPENAI_API_KEY || OPENAI_API_KEY === "YOUR_OPENAI_API_KEY_HERE" || !OPENAI_API_KEY.startsWith("sk-")) {
        console.error("CRITICAL: Hardcoded OPENAI_API_KEY is missing, placeholder, or invalid format!");
        updateStatusText(apiKeyStatus, "שגיאה: יש להזין מפתח OpenAI API תקין (מתחיל ב-'sk-') בקוד המקור.", "error");
        isModelReady = false;
        hideLoadingBar(apiKeyLoadingBar); // Hide loading bar immediately
    } else {
        console.log("OpenAI API Key seems present and in correct format.");
        updateStatusText(apiKeyStatus, "מפתח OpenAI API קיים.", "success"); // Note: Doesn't guarantee validity yet
        isModelReady = true;
        hideLoadingBar(apiKeyLoadingBar); // Hide loading bar as check is instant
    }
    checkEnableSend(); // Update UI based on key presence check
}

// --- Paste handleFileUpload, parseCSV, detectDelimiter here (no changes needed) ---
function handleFileUpload(event) {
    const file = event.target.files[0];
    console.log("Attempting to load file:", file ? file.name : "No file selected");
    isDataLoaded = false; checkEnableSend();
    if (!file) { updateStatusText(statusDisplay, "לא נבחר קובץ.", "error"); return; }
    if (!file.name.toLowerCase().endsWith('.csv')) { updateStatusText(statusDisplay, "אנא טען קובץ CSV בלבד.", "error"); if(csvFileInput) csvFileInput.value = ''; return; }
    updateStatusText(statusDisplay, `טוען את הקובץ: ${file.name}...`, "loading");
    showLoadingBar(fileLoadingBar); if(csvFileInput) csvFileInput.disabled = true;
    csvData = []; headers = []; fullCsvText = ''; if(chatbox) chatbox.innerHTML = '';
    const reader = new FileReader();
    reader.onload = function(e) {
        console.log("FileReader onload event triggered.");
        try {
            const text = e.target.result; fullCsvText = text;
            updateStatusText(statusDisplay, `מעבד נתונים מקובץ: ${file.name}...`, "loading");
            let potentialEncodingIssue = text.substring(0, 200).includes('�'); if (potentialEncodingIssue) console.warn("Potential encoding issue detected.");
            parseCSV(text);
            let finalStatus = ''; let finalStatusType = 'info';
            if (csvData.length > 0) {
                finalStatus = `טעינת "${file.name}" הושלמה (${csvData.length} שורות). מוכן לשאלות!`; finalStatusType = "success"; isDataLoaded = true;
                if (potentialEncodingIssue) { finalStatus += " (ייתכן שיש בעיית קידוד)"; finalStatusType = "warning"; }
                addMessage({ textResponse: `היי! טענתי ${csvData.length} שורות נתונים עם הכותרות: ${headers.join(', ')}. שאל אותי על הנתונים!` });
            } else if (headers.length > 0) {
                finalStatus = `טעינת "${file.name}" הסתיימה. נמצאו כותרות אך לא שורות נתונים.`; finalStatusType = "warning"; isDataLoaded = false;
                addMessage({ textResponse: "היי! טענתי את הכותרות מהקובץ אך לא מצאתי שורות נתונים." });
            } else { finalStatus = `הקובץ "${file.name}" ריק או בפורמט לא נתמך.`; finalStatusType = "error"; isDataLoaded = false; }
            updateStatusText(statusDisplay, finalStatus, finalStatusType);
        } catch (error) {
            console.error("שגיאה במהלך עיבוד תוכן הקובץ:", error); updateStatusText(statusDisplay, `שגיאה בעיבוד הקובץ "${file.name}": ${error.message}.`, "error");
            csvData = []; headers = []; fullCsvText = ''; isDataLoaded = false;
        } finally { hideLoadingBar(fileLoadingBar); if(csvFileInput) csvFileInput.disabled = false; checkEnableSend(); }
    };
    reader.onerror = function(e) { console.error("FileReader error occurred:", reader.error); updateStatusText(statusDisplay, `שגיאה בקריאת הקובץ "${file.name}".`, "error"); hideLoadingBar(fileLoadingBar); if(csvFileInput) csvFileInput.disabled = false; csvData = []; headers = []; fullCsvText = ''; isDataLoaded = false; checkEnableSend(); };
    reader.readAsText(file, 'UTF-8');
}
function parseCSV(text) {
    console.log("[parseCSV] Starting parsing..."); const standardizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'); const lines = standardizedText.trim().split('\n');
    if (lines.length === 0) { console.warn("[parseCSV] File appears empty."); headers = []; csvData = []; return; } const DELIMITER = detectDelimiter(lines[0]);
    console.log(`[parseCSV] Using delimiter: "${DELIMITER}"`); headers = lines[0].split(DELIMITER).map(header => header.trim().replace(/^"|"$/g, ''));
    console.log("[parseCSV] Parsed headers:", headers); if (headers.some(h => h.includes('�'))) console.warn("[parseCSV] WARNING: Replacement character '�' detected."); csvData = []; let skippedRowCount = 0;
    for (let i = 1; i < lines.length; i++) { const lineContent = lines[i].trim(); if (lineContent === '') continue; const values = lineContent.split(DELIMITER).map(value => value.trim().replace(/^"|"$/g, '')); if (values.length !== headers.length) { skippedRowCount++; continue; } const rowObject = {}; headers.forEach((header, j) => { rowObject[header] = values[j]; }); csvData.push(rowObject); }
    console.log(`[parseCSV] Finished. ${csvData.length} rows added, ${skippedRowCount} rows skipped.`);
}
function detectDelimiter(headerLine) { const commonDelimiters = [',', ';', '\t', '|']; let bestDelimiter = ','; let maxCount = 0; commonDelimiters.forEach(delimiter => { const count = headerLine.split(delimiter).length - 1; if (count > maxCount) { maxCount = count; bestDelimiter = delimiter; } }); if(maxCount === 0 && !headerLine.includes(',')) return ','; return bestDelimiter; }
// --- End of unchanged functions ---

// Updated function to call OpenAI API
async function handleSendMessage() {
    if (!userMessageInput || !sendButton) return;
    const messageText = userMessageInput.value.trim();
    if (!messageText || !isModelReady || !isDataLoaded) return; // Check isModelReady

    addMessage({ textResponse: messageText }, 'user');
    userMessageInput.value = ''; userMessageInput.disabled = true; sendButton.disabled = true;
    const thinkingMessage = addMessage({ textResponse: "מעבד בקשה, ממתין לתשובה מ-OpenAI..." }, 'bot'); // Updated text
    if(thinkingMessage) thinkingMessage.classList.add('thinking');

    try {
        // *** CALL THE NEW OpenAI FUNCTION ***
        const botResponse = await getOpenAIResponse(messageText);
        if (thinkingMessage && chatbox && chatbox.contains(thinkingMessage)) chatbox.removeChild(thinkingMessage);
        addMessage(botResponse, 'bot'); // Add the parsed { textResponse, chartConfig }
    } catch (error) {
        // Catch errors from getOpenAIResponse (network, API errors, parsing errors)
        console.error("Error getting OpenAI response:", error);
        if (thinkingMessage && chatbox && chatbox.contains(thinkingMessage)) chatbox.removeChild(thinkingMessage);
        // Display the error message thrown by getOpenAIResponse
        addMessage({ textResponse: `מצטער, אירעה שגיאה בתקשורת עם OpenAI: ${error.message}` }, 'bot');
    } finally {
        checkEnableSend();
    }
}

// --- Paste getCSVContextForPrompt here (no changes needed) ---
function getCSVContextForPrompt() {
    let context = `כותרות ה-CSV הן: ${headers.join(', ')}\nסה"כ שורות נתונים: ${csvData.length}\n\n`;
    const sampleSize = Math.min(csvData.length, MAX_ROWS_IN_CONTEXT);
    if (sampleSize > 0) {
        context += `להלן ${sampleSize} השורות הראשונות כדוגמה (בפורמט JSON lines):\n`; // Clarified format for GPT
        for (let i = 0; i < sampleSize; i++) {
            const rowString = headers.map(h => `"${h}":"${csvData[i] && csvData[i][h] !== undefined ? String(csvData[i][h]).replace(/"/g, '""') : ''}"`).join(', ');
            const line = `{${rowString}}\n`;
            if (context.length + line.length < MAX_CONTEXT_CHARS) context += line;
            else { context += `... (עוד ${csvData.length - i} שורות לא הוצגו עקב מגבלת אורך)\n`; break; }
        }
    } return context;
}

/**
 * Calls the OpenAI API using fetch.
 * @param {string} query - The user's question.
 * @returns {Promise<object>} - A promise resolving to { textResponse: string, chartConfig?: object }
 */
async function getOpenAIResponse(query) {
    console.log("Calling getOpenAIResponse...");
    if (!isModelReady) { // Check if key seemed okay initially
        throw new Error("מפתח OpenAI API לא הוגדר כראוי.");
    }

    const csvContext = getCSVContextForPrompt();

    // --- Construct the prompt for OpenAI Chat Completions API ---
    const messages = [
        {
            role: "system",
            content: `אתה עוזר AI בשם ג'ארוויס, המתמחה בניתוח נתוני CSV שהמשתמש טען.
עליך לענות על שאלות המשתמש אך ורק בהתבסס על נתוני ה-CSV שסופקו לך בהקשר.
אל תמציא מידע שאינו קיים בנתונים. אם אינך יכול לענות מהנתונים, אמור זאת בבירור.
הפלט שלך חייב להיות אובייקט JSON תקין לחלוטין (valid JSON) עם שני שדות בלבד: "textResponse" (מחרוזת עם התשובה הטקסטואלית בעברית) ו-"chartConfig" (אובייקט עם הגדרות תרשים עבור Chart.js).
ודא שה-JSON תקין, כולל מרכאות כפולות סביב כל המפתחות והמחרוזות.

הנחיות לתרשים (בתוך chartConfig):
1. צור תמיד תרשים Chart.js שרלוונטי לשאלה ככל האפשר.
2. אם השאלה לא מאפשרת תרשים משמעותי, צור תרשים פשוט (bar, pie) שמציג נתון מרכזי מהתשובה או נתון כללי קשור מה-CSV.
3. השתמש בסוגי תרשים כמו 'bar', 'line', 'pie', 'doughnut'.
4. ספק תוויות (labels), נתונים (data), כותרת (options.plugins.title.text) ותוויות צירים (options.scales.x/y.title.text) משמעותיות בעברית.
5. הגדר "maintainAspectRatio": false בתוך options.`
        },
        {
            role: "user",
            content: `הקשר נתוני ה-CSV:
--- START CSV CONTEXT ---
${csvContext}
--- END CSV CONTEXT ---

שאלת המשתמש: "${query}"

אנא ספק את התשובה בפורמט ה-JSON המבוקש ({ "textResponse": "...", "chartConfig": { ... } }).`
        }
    ];

    const payload = {
        model: OPENAI_MODEL,
        messages: messages,
        // temperature: 0.7, // Adjust creativity (optional)
        // max_tokens: 1000, // Limit response length (optional)
        response_format: { type: "json_object" } // Crucial for reliable JSON output
    };

    console.log("Sending payload to OpenAI (excluding messages content length):", { model: payload.model, response_format: payload.response_format });

    try {
        const response = await fetch(OPENAI_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}` // Correct authentication header
            },
            body: JSON.stringify(payload)
        });

        console.log("OpenAI API Response Status:", response.status);

        // Check for non-OK HTTP status codes (like 401 Unauthorized, 429 Rate Limit, 400 Bad Request)
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({})); // Try to parse error details
            console.error("OpenAI API Error:", errorData);
            throw new Error(`שגיאה משרת OpenAI: ${response.status} ${response.statusText}. ${errorData?.error?.message || ''}`);
        }

        const data = await response.json();
        console.log("OpenAI API Raw Success Response:", data);

        // Extract the response content
        if (!data.choices || data.choices.length === 0 || !data.choices[0].message || !data.choices[0].message.content) {
            console.error("Invalid response structure from OpenAI:", data);
            throw new Error("תשובה לא צפויה או ריקה מ-OpenAI.");
        }

        const messageContent = data.choices[0].message.content;
        console.log("Message content received:", messageContent);

        // Parse the JSON string provided *within* the message content
        try {
            const parsedJson = JSON.parse(messageContent);

            // Validate the structure we asked for
            if (!parsedJson.textResponse || typeof parsedJson.textResponse !== 'string' ||
                !parsedJson.chartConfig || typeof parsedJson.chartConfig !== 'object') {
                console.error("AI response missing required JSON fields (textResponse, chartConfig) or has incorrect types.", parsedJson);
                throw new Error("תשובת ה-AI אינה מכילה את שדות ה-JSON הנדרשים (textResponse, chartConfig).");
            }

            console.log("Parsed AI JSON successfully:", parsedJson);
            return parsedJson; // Return { textResponse, chartConfig }

        } catch (parseError) {
            console.error("Error parsing JSON content from AI message:", parseError);
            console.error("Original message content string:", messageContent); // Log the string that failed
            throw new Error(`שגיאה בעיבוד מבנה ה-JSON שהתקבל מה-AI: ${parseError.message}`);
        }

    } catch (error) {
        console.error("Error in getOpenAIResponse fetch/processing:", error);
        // Re-throw the error so handleSendMessage can catch it and display a message
        // Make sure error message is user-friendly if possible
        throw new Error(error.message || "שגיאת רשת או שגיאה לא ידועה בתקשורת עם OpenAI.");
    }
}

// --- Paste addMessage here (no changes needed) ---
function addMessage(response, sender = 'bot') {
    if (!chatbox) { console.error("Chatbox element not found, cannot add message."); return null; }
    const messageDiv = document.createElement('div'); messageDiv.classList.add('message', `${sender}-message`);
    if (response.textResponse) { const textElement = document.createElement('div'); textElement.textContent = response.textResponse; messageDiv.appendChild(textElement); }
    if (sender === 'bot' && response.chartConfig && typeof response.chartConfig === 'object') {
        const chartId = `chart-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`; const chartWrapper = document.createElement('div'); chartWrapper.classList.add('chart-wrapper'); const canvas = document.createElement('canvas'); canvas.id = chartId; chartWrapper.appendChild(canvas); messageDiv.appendChild(chartWrapper);
        setTimeout(() => {
            const ctx = document.getElementById(chartId); if (ctx) {
                try {
                    response.chartConfig.options = response.chartConfig.options || {}; response.chartConfig.options.responsive = true; response.chartConfig.options.maintainAspectRatio = false;
                    const validChartTypes = ['bar', 'line', 'pie', 'doughnut', 'polarArea', 'radar', 'scatter', 'bubble']; if (!validChartTypes.includes(response.chartConfig.type)) { throw new Error(`סוג תרשים לא חוקי (${response.chartConfig.type}) התקבל מה-AI.`); }
                    new Chart(ctx, response.chartConfig);
                } catch (chartError) {
                    console.error(`Error rendering chart ${chartId}:`, chartError); console.error("Chart Config:", response.chartConfig); const errorMsg = document.createElement('p'); errorMsg.textContent = `שגיאה ביצירת התרשים: ${chartError.message}`; errorMsg.style.color = 'red'; errorMsg.style.fontSize = '0.8em'; chartWrapper.innerHTML = ''; chartWrapper.appendChild(errorMsg);
                }
            } else { console.error(`Canvas element with id ${chartId} not found in DOM after timeout.`); }
        }, 100);
    }
    chatbox.appendChild(messageDiv); const isScrolledToBottom = chatbox.scrollHeight - chatbox.clientHeight <= chatbox.scrollTop + 50; if (isScrolledToBottom) chatbox.scrollTop = chatbox.scrollHeight;
    return messageDiv;
}
// --- End of script ---