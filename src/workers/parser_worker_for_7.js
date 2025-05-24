import { handleInput, determineIntentWithML } from '../utils/compromiseDateParser7'; // parser
function serializeFunction(obj) {
    if (obj && typeof obj.value === 'function') {
        return {
            ...obj,
            value: {
                isFunction: true,
                name: obj.value.name || 'anonymous',
                params: obj.value.toString().match(/\((.*?)\)/)?.[1] || '',
                description: `${obj.original}(${obj.value.toString().match(/\((.*?)\)/)?.[1] || ''})`,
            }
        };
    }
    return obj;
}

/* All new to test with parser 7 ML */
let debounceTimer = null;
const DEBOUNCE_DELAY = 750; // milliseconds - Adjust this value (500-1000ms is common)
let lastProcessedLineNumber = -1; // Optional: Track line number if needed for context

// Function to send results back to the main thread
function postResult(result) {
    if (result) {
        postMessage({ type: 'result', payload: result });
    }
}

// Function to send errors back to the main thread
function postError(errorDetails) {
    postMessage({ type: 'error', payload: errorDetails });
}
 // --- 1. Perform Quick Checks Immediately ---
addEventListener("message", async (message) => {
    const { lineNumber, lineText, timezone } = message.data;
    
 
    try {
        const quickResult = await handleInput(lineText, lineNumber, timezone);
        console.log(quickResult)
        if (quickResult) {

            // If a quick check found something definitive, post it.
            // We might still want the ML check later, OR we might want to cancel it.
            // For now, let's post the quick result and *cancel* any pending ML check
            // for this line, as the quick rule took precedence.
            clearTimeout(debounceTimer);
            debounceTimer = null;
      //      postResult(quickResult);
            // If the quick result is an error, post it as an error type
            if (quickResult.type === 'error') {
                postError(quickResult);
            } else {
             //   postResult(quickResult);
            }
            return; // Stop processing this input further for now
        }
        // If quickResult is null, no quick check matched, proceed to ML debouncing.
    } catch (error) {
        console.error("Error during quick checks:", error);
   //     postError({ message: 'Error in quick checks', details: error.message, lineNumber });
        // Decide if you want to continue to ML check even if quick checks failed internally
        // For safety, let's return here.
        return;
    }
 /*
    try {
        // Get initial result
        let result = await handleInput(lineText, lineNumber, timezone);
        if(result) {
             // If a quick check found something definitive, post it.
            // We might still want the ML check later, OR we might want to cancel it.
            // For now, let's post the quick result and *cancel* any pending ML check
            // for this line, as the quick rule took precedence.
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        // Extract variable information
        const variables = {
            defines: [],  // Variable names defined on this line
            uses: []      // Variable names used on this line
        };
        // Detect variable definitions (simple example)
        const defMatch = lineText.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
        if (defMatch) {
            variables.defines.push(defMatch[1]); // Variable name
        }
        
        // Detect variable usage (simple example)
        // This regex finds all possible variable references
        const usedVars = lineText.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g) || [];
        // Filter out the one being defined (if any)
        variables.uses = usedVars.filter(v => !variables.defines.includes(v));
        

        // Handle null/undefined results
        if (result === null || result === undefined) {
            result = { value: "" };
        }
        
        // Handle formula types
        if (result?.type === 'formula') {
            // Check if result.value exists and is a number
            if (typeof result?.value === "number") {
                result = { value: result.value };
            } else {
                const serializedResult = serializeFunction(result);
                result = {
                    value: serializedResult?.value?.description || result.original
                };
            }
        }
        
        // Always send back the result
      //  postMessage({ lineNumber, result, variables });
    } catch (error) {
        console.error('Error processing line:', error);
//        postMessage({ lineNumber, result: { value: "" } });
    }

*/
    // --- 2. Debounce the ML Check ---
    // Clear any existing timer scheduled by previous keystrokes for this line (or globally)
    clearTimeout(debounceTimer);

    // Start a new timer. If the user types again before DEBOUNCE_DELAY,
    // this timer will be cleared and a new one started.
    debounceTimer = setTimeout(async () => {
        try {
             // Check again if input text is valid before ML call (user might have deleted text)
            if (!lineText || lineText.trim() === "") {
                console.log("Skipping debounced ML check for empty input.");
                 // Optional: Post a message to clear previous ML results for this line
          //      postMessage({ type: 'clear_ml_result', payload: { lineNumber } });
                return;
            }

            const mlResult = await determineIntentWithML(lineText, lineNumber, timezone);
            if (mlResult) {
                // Post the ML result or ML error
                if (mlResult.type === 'error') {
                    postError(mlResult);
                } else {
                    postResult(mlResult);
                }
            } else {
                // Optional: Handle cases where ML returns null (e.g., input too short)
                // Maybe clear any previous ML results shown for this line.
          //      postMessage({ type: 'clear_ml_result', payload: { lineNumber } });
            }
        } catch (error) {
            // Catch errors from the ML call itself (e.g., network issues, model errors)
            console.error("Error during debounced ML intent determination:", error);
            postError({ message: 'Error in ML processing', details: error.message, original: lineText, lineNumber });
        } finally {
             debounceTimer = null; // Reset timer state after execution or error
        }
    }, DEBOUNCE_DELAY);

    // Update tracking (optional)
    lastProcessedLineNumber = lineNumber;
});

// Old, working version
/*
addEventListener("message", async (message) => {
    const { lineNumber, lineText, timezone } = message.data;
    
    try {
        // Get initial result
        let result = await handleInput(lineText, lineNumber, timezone);

        // Extract variable information
        const variables = {
            defines: [],  // Variable names defined on this line
            uses: []      // Variable names used on this line
        };
        // Detect variable definitions (simple example)
        const defMatch = lineText.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
        if (defMatch) {
            variables.defines.push(defMatch[1]); // Variable name
        }
        
        // Detect variable usage (simple example)
        // This regex finds all possible variable references
        const usedVars = lineText.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g) || [];
        // Filter out the one being defined (if any)
        variables.uses = usedVars.filter(v => !variables.defines.includes(v));
        

        // Handle null/undefined results
        if (result === null || result === undefined) {
            result = { value: "" };
        }
        
        // Handle formula types
        if (result?.type === 'formula') {
            // Check if result.value exists and is a number
            if (typeof result?.value === "number") {
                result = { value: result.value };
            } else {
                const serializedResult = serializeFunction(result);
                result = {
                    value: serializedResult?.value?.description || result.original
                };
            }
        }
        
        // Always send back the result
        postMessage({ lineNumber, result, variables });
    } catch (error) {
        console.error('Error processing line:', error);
        postMessage({ lineNumber, result: { value: "" } });
    }
});
*/

export {};