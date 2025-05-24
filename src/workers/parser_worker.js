import { handleInput } from '../utils/compromiseDateParser6'; // parser

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

addEventListener("message", async (message) => {
    const { lineNumber, lineText, timezone } = message.data;
    
    try {
        // Get initial result
        let result = handleInput(lineText, lineNumber, timezone);

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
export {};