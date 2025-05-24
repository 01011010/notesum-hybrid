// date-parser.js (or similar file)
import nlp from 'compromise';
import plg from 'compromise-dates';
import { create, all } from 'mathjs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { DateTime } from 'luxon';
dayjs.extend(utc);
dayjs.extend(timezone);

// Constants and configurations
const CONFIG = {
    CACHE_SIZE_LIMIT: 1000,
    DEFAULT_TIMEZONE: 'UTC',
    TIME_UNITS: {
        DAYS: 1000 * 3600 * 24,
        WEEKS: 1000 * 3600 * 24 * 7
    }
};

// Initialize dependencies
const math = create(all, {});
nlp.plugin(plg);

// Utility functions
const isEmptyObject = (obj) => Object.keys(obj).length === 0 && obj.constructor === Object;
const createCacheKey = (input, context) => `${input}_${context.today.getTime()}`;

// Pattern definitions
const PATTERNS = {
    PURE_MATH: /^[0-9+\-*/().\s]+$/,
    VARIABLE_ASSIGNMENT: /^(\w+)\s*[:=]\s*(.+)$/,
    PERCENTAGE: /(\d+)%/g,
    PERCENTAGE_OF: /% of /g,
    UNIT_CONVERSION: /(?:convert\s+)?(-?\d+\.?\d*)\s*([a-zA-Z°/²³]+(?:\s*[a-zA-Z°/²³]+)*)\s+(?:to|in|into)\s+([a-zA-Z°/²³]+(?:\s*[a-zA-Z°/²³]+)*)/i,
    SI_NOTATION: /(-?\d+\.?\d*)[eE][-+]?\d+/,
    TEMPERATURE: /(-?\d+\.?\d*)\s*?([FCK])\s+(?:to|in|into)\s+?([FCK])/i,
    PROPORTION: /if\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s+requires\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s+than\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s+requires\s*\?\?/i,
    DATE: /^(?:\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|\d{1,2}[-/.]\d{1,2}[-/.]\d{1,4}|\d{1,2}[-/.]\d{1,4})$/,
    WEEK: /week\s*(\d+)/i,
};

// Add to predefined functions
const unitConversionFunctions = {
    // Temperature conversion helpers
    celsiusToFahrenheit: (c) => (c * 9/5) + 32,
    fahrenheitToCelsius: (f) => (f - 32) * 5/9,
    celsiusToKelvin: (c) => c + 273.15,
    kelvinToCelsius: (k) => k - 273.15,
    fahrenheitToKelvin: (f) => (f - 32) * 5/9 + 273.15,
    kelvinToFahrenheit: (k) => (k - 273.15) * 9/5 + 32,
    
    // SI prefix conversions
    siPrefix: (value, fromPrefix, toPrefix) => {
        const prefixes = {
        'y': -24, 'z': -21, 'a': -18, 'f': -15, 'p': -12, 'n': -9, 
        'μ': -6, 'm': -3, 'c': -2, 'd': -1,
        '': 0,
        'da': 1, 'h': 2, 'k': 3, 'M': 6, 'G': 9, 'T': 12, 'P': 15, 
        'E': 18, 'Z': 21, 'Y': 24
        };
        const scale = prefixes[toPrefix] - prefixes[fromPrefix];
        return value * Math.pow(10, scale);
    }
};

// Time unit using dayjs
const timeUnitCalculators = {
    days: (startDate, endDate) => {
        const start = dayjs(startDate);
        const end = dayjs(endDate);
        return end.diff(start, 'day');
    },
    workdays: (startDate, endDate) => {
        let count = 0;
        let curDate = dayjs(startDate);

        while (curDate.isBefore(endDate, 'day') || curDate.isSame(endDate, 'day')) {
            const dayOfWeek = curDate.day(); // 0 = Sunday, 6 = Saturday
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                count++;
            }
            curDate = curDate.add(1, 'day');
        }
        return count;
    },
    weeks: (startDate, endDate) => {
        const start = dayjs(startDate);
        const end = dayjs(endDate);
        return end.diff(start, 'week');
    },
    months: (startDate, endDate) => {
        const start = dayjs(startDate);
        const end = dayjs(endDate);
        return end.diff(start, 'month');
    },
    years: (startDate, endDate) => {
        const start = dayjs(startDate);
        const end = dayjs(endDate);
        return end.diff(start, 'year');
    }
};

// Function to add workdays, skipping weekends
function addWorkdays(start, amount, tz) {
    let date = dayjs.utc(start);
    let count = 0;

    while (count < Math.abs(amount)) {
        date = amount > 0 ? date.add(1, 'day') : date.subtract(1, 'day'); // Move forward or backward
        const dayOfWeek = date.day(); // 0 = Sunday, 6 = Saturday
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            count++; // Only count non-weekend days
        }
    }

    return date.tz(tz).toDate();
}

const timeUnitCalculatorsWithAmount = {
    day: (start, amount, tz) => start.add(amount, 'day').tz(tz).toDate(),
    week: (start, amount, tz) => start.add(amount, 'week').tz(tz).toDate(),
    month: (start, amount, tz) => start.add(amount, 'month').tz(tz).toDate(),
    year: (start, amount, tz) => start.add(amount, 'year').tz(tz).toDate(),
    workday: (start, amount, tz) => addWorkdays(start, amount, tz), // New workday handler
};

// Predefined mathematical functions
const predefinedFunctions = {
    sum: (...args) => math.sum(args),
    avg: (...args) => math.mean(args),
    median: math.median,
    stddev: math.std,
    factorial: math.factorial,
    percentage: (value, total) => (value / total) * 100,
    roi: (gain, cost) => ((gain - cost) / cost) * 100,
    compound_interest: (principal, rate, time) => principal * Math.pow(1 + rate, time),
    break_even: (fixedCosts, price, variableCosts) => fixedCosts / (price - variableCosts),
    velocity: (distance, time) => distance / time,
    burn_rate: (startBalance, endBalance, months) => (startBalance - endBalance) / months,
    pert: (optimistic, mostLikely, pessimistic) => (optimistic + 4 * mostLikely + pessimistic) / 6,
    cycle_time: (completedTasks, timeElapsed) => timeElapsed / completedTasks,
    lead_time: (taskStartDate, taskCompletionDate) => taskCompletionDate - taskStartDate,
    communication_channels: (numberOfStakeholders) => numberOfStakeholders * (numberOfStakeholders - 1) / 2,
    resource_utilization: (actualHours, plannedHours) => (actualHours / plannedHours) * 100,
    resource_overallocation: (resource_usage, resource_capacity) => resource_usage - resource_capacity,
    variance: (actual, planned) => ((actual - planned) / planned) * 100,
};

// Natural language patterns mapping
const nlPatterns = {
    sum: ['sum of', 'total of', 'add'],
    avg: ['average of', 'mean of', 'avg of'],
    median: ['median of'],
    stddev: ['standard deviation of', 'std dev of'],
    factorial: ['factorial of'],
    percentage: ['percentage of', 'percent of'],
    roi: ['return on investment of', 'roi of'],
    compound_interest: ['compound interest of', 'interest on'],
    break_even: ['break even point of', 'break-even of'],
    velocity: ['velocity of', 'speed of'],
    burn_rate: ['burn rate of', 'burning rate of'],
    pert: ['pert of'],
    cycle_time: ['cycle time of'],
    lead_time: ['lead time of'],
    communication_channels: ['comms channels of', 'communication channels of'],
    resource_utilization: ['resource utilization of'],
    resource_overallocation: ['resource allocation of'],
    variance: ['variance of']
};

// Enhanced error handling
class ParserError extends Error {
    constructor(message, type) {
        super(message);
        this.name = 'ParserError';
        this.type = type;
    }
}

// Variable storage with proxy
const variables = new Proxy({}, {
    set(target, property, value) {
        target[property] = value;
        return true;
    }
});

// Cache implementation
const DATE_PARSE_CACHE = new Map();

// Parser router class
export class ParserRouter {
    constructor() {
        this.patterns = new Map([
            ['math', /^[\d\s+\-*/().]+$/],
            ['unit', /(?:convert\s+)?\d+\.?\d*\s*[a-zA-Z°]+\s+(?:to|in|into)\s+[a-zA-Z°]+/i],
            ['language', /\b(next|last|ago|from|later|in)\b|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i],
        ]);
    }

    decideParser(inputText) {
        if (!inputText?.trim()) {
            throw new ParserError('Empty input', 'VALIDATION_ERROR');
        }
        for (const [type, pattern] of this.patterns) {
            if (pattern.test(inputText)) {
                return type;
            }
        }
        return 'language';
    }
}

// Math parser implementation
export class MathParser {
    parse(input,lineNumber = null) {
        try {
        // First try to replace variables
        let modifiedInput = this.replaceVariables(input);
        if (PATTERNS.PURE_MATH.test(modifiedInput)) {
            return { value: math.evaluate(modifiedInput) };
        }
            return null;
        } catch {
            return null;
        }
    }

    replaceVariables(input) {
        if (!isEmptyObject(variables)) {
            const variableNames = Object.keys(variables);
            if (variableNames.length > 0) {
                // Sort variable names by length (longest first) to avoid substring issues
                variableNames.sort((a, b) => b.length - a.length);
                let modifiedInput = input;
                for (const varName of variableNames) {
                    const regex = new RegExp(`\\b${varName}\\b`, 'g');
                    modifiedInput = modifiedInput.replace(regex, variables[varName]);
                }
                return modifiedInput;
            }
        }
        return input;
    }
}

// Language parser implementation
export class LanguageParser {
    constructor(timezone = CONFIG.DEFAULT_TIMEZONE) {
        this.timezone = timezone;
        // Initialize dayjs with the timezone
        this.dayjs = dayjs;
    }

    replaceVariables(input) {
        if (!isEmptyObject(variables)) {
            const variableNames = Object.keys(variables);
            if (variableNames.length > 0) {
                variableNames.sort((a, b) => b.length - a.length);
                let modifiedInput = input;
                for (const varName of variableNames) {
                    const regex = new RegExp(`\\b${varName}\\b`, 'g');
                    modifiedInput = modifiedInput.replace(regex, variables[varName]);
                }
                // If after replacement it's a pure math expression, evaluate it
                if (PATTERNS.PURE_MATH.test(modifiedInput)) {
                    try {
                        return math.evaluate(modifiedInput).toString();
                    } catch {
                        return modifiedInput;
                    }
                }
                return modifiedInput;
            }
        }
        return input;
    }

    handleVariableAssignment(input) {
        const match = input.match(PATTERNS.VARIABLE_ASSIGNMENT);
        if (match) {
            const [, varName, expression] = match;
            const resolvedValue = handleInput(expression.trim());
            if (resolvedValue !== null) {
                variables[varName.trim()] = resolvedValue.value;
            }
            return resolvedValue;
        }
        return null;
    }

    handleDateProcessing(doc, input, context) {
        const dates = doc.dates(context);
        if (dates.length === 0) return null;
        const lastTerm = doc.terms().last().json(0);
        const units = Object.keys(timeUnitCalculators);
        
        if (units.includes(lastTerm.text)) {
            const dateRange = dates.get()[0];

            // const startDate = new Date(dateRange.start);
            // const endDate = new Date(dateRange.end);

            // Convert dates using dayjs with the proper timezone
            const startDate = dayjs.tz(dateRange.start, this.timezone).toDate();
            const endDate = dayjs.tz(dateRange.end, this.timezone).toDate();
            

            const calculator = timeUnitCalculators[lastTerm.text];
            const result = calculator(startDate, endDate);

            if (DATE_PARSE_CACHE.size >= CONFIG.CACHE_SIZE_LIMIT) {
                DATE_PARSE_CACHE.delete(DATE_PARSE_CACHE.keys().next().value);
            }
            
            const cacheKey = createCacheKey(input, context);
            DATE_PARSE_CACHE.set(cacheKey, result);
            return { value: result };
        }
        dates.format('{day} {date-ordinal}, {month} {year}');
        return { value: doc.text() };
    }

    handleDateArithmetic(input, timezone = 'UTC') {
      // Regex to extract the date part and arithmetic part separately
      const match = input.match(/^(.*?)(\s*[\+\-]\s*\d+\s*(days?|workdays?|weeks?|months?|years?))?$/i);
      if (!match) return null;
  
      const datePart = match[1]?.trim(); // Extracts "first day of next month"
      const arithmeticPart = match[2]?.trim(); // Extracts "+ 2 days"
  
      if (!datePart) return null; // No date, return null
  
      const doc = nlp(datePart);
      const dates = doc.dates().json();
  
      if (dates.length === 0) return null; // No valid date found
  
      const dateRange = dates[0];
      //let parsedDate = dayjs.utc(dateRange.dates.start);
      let parsedDate = dayjs.tz(dateRange.dates.start, CONFIG.DEFAULT_TIMEZONE);
      // If there's no arithmetic part, return the parsed date as is
      //if (!arithmeticPart) return { value: new Date(parsedDate) };
      if (!arithmeticPart) return null;
  
      // Extract arithmetic details
      const arithmeticMatch = arithmeticPart.match(/([\+\-])\s*(\d+)\s*(days?|workdays?|weeks?|months?|years?)/i);
      //if (!arithmeticMatch) return { value: new Date(parsedDate) };
      if (!arithmeticMatch) return null;
  
      const operator = arithmeticMatch[1];
      const amount = parseInt(arithmeticMatch[2]);
      const timeUnit = arithmeticMatch[3].toLowerCase().replace(/s$/, ''); // Normalize to singular
  
      if (!timeUnitCalculatorsWithAmount[timeUnit]) return null; // Invalid unit
  
      // Apply arithmetic
      const adjustment = operator === '+' ? amount : -amount;
      //console.log(CONFIG.DEFAULT_TIMEZONE)
      //const result = timeUnitCalculatorsWithAmount[timeUnit](parsedDate, adjustment, this.timezone);
      const result = dayjs(timeUnitCalculatorsWithAmount[timeUnit](parsedDate, adjustment, CONFIG.DEFAULT_TIMEZONE))
    .tz(CONFIG.DEFAULT_TIMEZONE) // Ensure correct timezone
    .format('YYYY-MM-DD HH:mm:ss [GMT]Z'); // Example format
  
      return { value: result };
    }

    handleNumbersAndPercentages(doc, input) {
        // Try to handle mixed text and calculations first
        let modifiedInput = this.replaceVariables(input);
        // Check if it's a pure math expression after variable replacement
        if (PATTERNS.PURE_MATH.test(modifiedInput)) {
            try {
                return { value: math.evaluate(modifiedInput) };
            } catch {
                // Continue with other parsing if math evaluation fails
            }
        }
        const numbers = doc.numbers().json();
        const percentages = doc.match('#Percent').json();

        if (numbers.length === 0 && percentages.length === 0) return null;

        // **Basic check before running expensive regex operations**
        if (modifiedInput.includes('%') && (modifiedInput.includes('+') || modifiedInput.includes('-') || modifiedInput.includes('*') || modifiedInput.includes('/'))) {
                // Normalize "X + Y%" to "X + (X * Y/100)"
            modifiedInput = modifiedInput.replace(/(\d+(\.\d+)?)\s*\+\s*(\d+(\.\d+)?)%/g, (match, base, _, percent) => {
                return `${base} + (${base} * ${percent} / 100)`;
            });

            // Normalize "X - Y%" to "X - (X * Y/100)"
            modifiedInput = modifiedInput.replace(/(\d+(\.\d+)?)\s*-\s*(\d+(\.\d+)?)%/g, (match, base, _, percent) => {
                return `${base} - (${base} * ${percent} / 100)`;
            });

            // Normalize "X * Y%" to "X * (Y / 100)"
            modifiedInput = modifiedInput.replace(/(\d+(\.\d+)?)\s*\*\s*(\d+(\.\d+)?)%/g, (match, base, _, percent) => {
                return `${base} * (${percent} / 100)`;
            });

            // Normalize "X / Y%" to "X / (Y / 100)"
            modifiedInput = modifiedInput.replace(/(\d+(\.\d+)?)\s*\/\s*(\d+(\.\d+)?)%/g, (match, base, _, percent) => {
                return `${base} / (${percent} / 100)`;
            });
        }

        let expression = modifiedInput
            .replace(PATTERNS.PERCENTAGE_OF, '% * ')
            .replace(PATTERNS.PERCENTAGE, (_, num) => `${parseFloat(num.replace(/\s/g, '')) / 100}`);

        if (PATTERNS.PURE_MATH.test(expression)) {
            try {
                return { value: math.evaluate(expression) };
            } catch {
                return null;
            }
        }

        // Process natural language patterns
        const cleanText = modifiedInput.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
        for (const [func, patterns] of Object.entries(nlPatterns)) {
            for (const pattern of patterns) {
                if (cleanText.includes(pattern)) {
                    const numbers = cleanText.match(/\d+(\.\d+)?/g);
                    if (numbers) {
                    try {
                        return { 
                        value: math.evaluate(`${func}(${numbers.join(',')})`, predefinedFunctions) 
                        };
                    } catch {
                        return null;
                    }
                    }
                }
            }
        }
        return null;
    }

    handleProportions(input) {
        if (PATTERNS.PROPORTION.test(input)) {      
            const match = input.match(PATTERNS.PROPORTION);
            if(match) {
                const [, x1, unit1, y1, unit2, x2, unit3] = match;
                try {
                    const numX1 = parseFloat(x1);
                    const numY1 = parseFloat(y1);
                    const numX2 = parseFloat(x2);
                
                    const y2 = (numY1 * numX2) / numX1;
                    return { value: `${numX2} ${unit3} requires ${y2.toFixed(2)} ${unit2}` };

                } catch (error) {
                    return null;
                }
            }
        }
    }
    
    handleExtractEvent(doc, input, lineNumber = null) {
        // Generate unique ID
        const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    
        // Extract dates first - this is crucial
        const dates = doc.dates().get();
        
        // No dates means likely not an event
        if (!dates || dates.length === 0) {
            return null;
        }
    
        // Status extraction
        let status = 'new';
        if (doc.has('completed') || doc.has('done') || doc.has('finished') || doc.has('complete') || doc.has('OK') || doc.has('[x]')) {
            status = 'completed';
        } else if (doc.has('cancelled') || doc.has('canceled') || doc.has('postponed') || doc.has('rescheduled')) {
            status = 'cancelled';
        } else if (doc.has('tentative') || doc.has('maybe') || doc.has('possibly') || doc.has('tbc') || doc.has('to be confirmed')) {
            status = 'tentative';
        }
    
        // First, get the raw text and clean it (remove date references)
        const cleanText = input.replace(/\b(tomorrow|today|next week|next month|next friday|next monday|on friday)\b/gi, '').trim();
        
        // Extract semantic understanding with simplified patterns
        const semanticParsing = {
            // Parse the raw input for better extraction
            parseInput: (text) => {
                // Split into words and analyze pattern
                const words = text.split(/\s+/);
                
                if (words.length === 0) return { action: "Event", remainder: "" };
                
                // Get the first word as the action
                const action = words[0];
                
                // The remainder is everything after the first word, excluding "with" if present
                let remainder = "";
                if (words.length > 1) {
                    // Get everything after the first word
                    remainder = words.slice(1).join(' ');
                    
                    // If remainder starts with "with", remove it
                    remainder = remainder.replace(/^with\s+/i, '');
                }
                
                return {
                    action: action,
                    remainder: remainder
                };
            },
    
            // Determine if a name is likely a person
            isProbablyPerson: (name) => {
                // Check if it starts with a capital letter and isn't a common place or thing
                const nonPersonWords = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'home', 'office', 'school', 'work', 'hospital', 'proposal', 'report', 'meeting', 'presentation'];
                
                return /^[A-Z][a-z]+$/.test(name) && 
                       !nonPersonWords.includes(name.toLowerCase());
            },
    
            // Get title and description based on parsing results
            getTitleAndDescription: (text) => {
                const parsed = semanticParsing.parseInput(cleanText);
                
                // Capitalize the action to use as title
                const title = parsed.action.charAt(0).toUpperCase() + parsed.action.slice(1);
                
                // Keep description simple - just the remainder without 'with'
                const description = parsed.remainder;
                
                return {
                    title,
                    description
                };
            },
    
            // Extract potential location
            getLocation: () => {
                const locationPatterns = [
                    'at #Place', 
                    'in #Place', 
                    'at the #Noun', 
                    'in the #Noun'
                ];
                
                for (const pattern of locationPatterns) {
                    const matches = doc.match(pattern).out('array');
                    if (matches.length > 0) return matches[0];
                }
                
                const places = doc.places().out('array');
                return places.length > 0 ? places[0] : '';
            }
        };
    
        // Extract title and description
        const { title, description } = semanticParsing.getTitleAndDescription(cleanText);
        
        // Extract people - use NLP for this rather than simple parsing
        const people = doc.people().out('array');
        
        // Determine if there's a person in the description
        let attendees = [];
        const words = description.split(/\s+/);
        for (const word of words) {
            if (semanticParsing.isProbablyPerson(word)) {
                attendees.push(word);
            }
        }
        
        // Add any people identified by NLP that aren't already in attendees
        for (const person of people) {
            if (!attendees.includes(person)) {
                attendees.push(person);
            }
        }
        
        // Get location
        const location = semanticParsing.getLocation();
    
        // Extract first date
        const start = new Date(dates[0].start);
        const end = dates[0].end ? new Date(dates[0].end) : new Date(start);
        const isRange = dates[0].end && dates[0].end !== dates[0].start;
    
        // Determine if business or personal
        const businessTerms = ['meeting', 'presentation', 'training', 'session', 'pitch', 'review', 'call', 'submit', 'create', 'proposal'];
        const isBusiness = businessTerms.some(term => 
            title.toLowerCase().includes(term) || 
            (description && description.toLowerCase().includes(term))
        );
    
        // Compose event
        const event = {
            id: uniqueId,
            title,
            start,
            end,
            category: isBusiness ? 'business' : 'personal',
            description,
            status,
            isRange,
            location,
            priority: 'medium',
            attendees,
            lineNumber: lineNumber,
            text: input
        };
        
        // Format dates for display
        const formattedStartDateTime = start.toLocaleString("en-GB", {
            weekday: "short", month: "short", day: "2-digit", year: "numeric"
        });
        
        const formattedEndDateTime = end.toLocaleString("en-GB", {
            weekday: "short", month: "short", day: "2-digit", year: "numeric"
        });
    
        return {
            value: `${status} Event: ${formattedStartDateTime}${isRange ? ` to ${formattedEndDateTime}` : ''}`,
            type: 'event',
            original: event
        };
    } 
    
    handleGetWeekRange(input) {
        if (!PATTERNS.WEEK.test(input)) return null;
    
        const match = input.match(PATTERNS.WEEK);
        if (!match) return null; // No match, return null
    
        try {
            const weekNumber = parseInt(match[1], 10);
            if (isNaN(weekNumber) || weekNumber < 1 || weekNumber > 53) {
                return null;
            }
    
            const timeZone = CONFIG.DEFAULT_TIMEZONE || 'UTC'; // Fallback to UTC if not set
            const now = DateTime.now().setZone(timeZone);

            // Set the first day of the week to Monday (1)
            const firstDayOfWeek = 1; // 1 represents Monday in Luxon
    
            // Calculate the start of the week
            let startOfWeek = DateTime.fromObject(
                { weekNumber, weekYear: now.weekYear, weekday: firstDayOfWeek },
                { zone: timeZone, numberingSystem: 'iso' }
            );
    
            // Adjust for week 1 if necessary
            if (weekNumber === 1 && startOfWeek.month === 12) {
                startOfWeek = startOfWeek.set({ weekYear: now.weekYear + 1 });
            }
    
            const endOfWeek = startOfWeek.plus({ days: 6 }).endOf('day');
    
            // Convert to Day.js for formatting & ensure time zone
            const start = dayjs(startOfWeek.toISO()).tz(timeZone);
            const end = dayjs(endOfWeek.toISO()).tz(timeZone);
    
            return { value: `${start.format('YYYY-MM-DD')} - ${end.format('YYYY-MM-DD')}` };
        } catch (error) {
            // console.error("Error in handleGetWeekRange:", error);
            return null;
        }
    }

    parse(input,lineNumber = null) {
        // 1. Check for direct math and variable assignments first
        let modifiedInput = this.replaceVariables(input);
        if (PATTERNS.PURE_MATH.test(modifiedInput)) {
            try {
                return { value: math.evaluate(modifiedInput) };
            } catch {
                // Continue with other parsing if math evaluation fails
            }
        }

        // 2. Try variable assignment
        const varResult = this.handleVariableAssignment(input);
        if (varResult) return varResult;

        const context = { today: new Date() };
        const cacheKey = createCacheKey(input, context);
        
        if (DATE_PARSE_CACHE.has(cacheKey)) {
            return DATE_PARSE_CACHE.get(cacheKey);
        }

        try {
            const doc = nlp(input);
            const datePatterns = [
                // Date ranges with optional "in days/workdays"
                'from #Date+ (to|until) #Date+ (in days|in workdays)?',
                '#Date+ (to|until) #Date+ (in days|in workdays)?',
                
                // Week-based patterns
                'week #Value',
                '(first|second|third|fourth|last) (week|weekend) of #Month',
                
                // Quarter patterns
                'q[1-4]( to q[1-4])?( in days)?',
                
                // Date followed by unit specification
                '#Date+ in (days|workdays)',

                '(#Date+) (#Noun+) (#Value+) (#Duration+)'
            ];

            // Tag all these patterns as StandaloneDateReference
            datePatterns.forEach(pattern => {
                doc.match(pattern).tag('StandaloneDateReference');
            });

            // Now identify true events - action verbs or event nouns with dates
            const events = doc.match('(#Verb|#Noun) .* #Date+')
                .not('#StandaloneDateReference')
                .found;

            
            // Ensure input contains a date-like phrase, an arithmetic operator, and a unit
            const hasDateAndArithmetic = doc.match('(#Date+) (#Noun+) (#Value+) (#Duration|#Plural+)').found;
            if (hasDateAndArithmetic) {
                const arithmetic = this.handleDateArithmetic(input);
                if(arithmetic) return arithmetic;
            }          

            if(events) {
                const eventResult = this.handleExtractEvent(doc, input, lineNumber);
                if (eventResult) return eventResult;
            }

            const weeksResult = this.handleGetWeekRange(input);
            if (weeksResult) return weeksResult;

            // Try date processing
            const dateResult = this.handleDateProcessing(doc, input, context);
            if (dateResult) return dateResult;
        
            // Try numbers and percentages
            const percentResult = this.handleNumbersAndPercentages(doc, input);
            if (percentResult) return percentResult;
            
            // Try proportions
            const proportionResult = this.handleProportions(input);
            if (proportionResult) return proportionResult;

        } catch (error) {
            // console.error('Error parsing:', error);
            return null;
        }
    }
}

// Unit Conversion Parser
export class UnitConversionParser {
    constructor() {
      this.mathjs = math; // Use the existing mathjs instance
    }

    parse(input, lineNumber = null) {
        // Try temperature conversion first
        const tempMatch = input.match(PATTERNS.TEMPERATURE);
        if (tempMatch) {
            const [, value, fromUnit, toUnit] = tempMatch;
            return this.convertTemperature(parseFloat(value), fromUnit, toUnit);
        }
        // Try general unit conversion
        const unitMatch = input.match(PATTERNS.UNIT_CONVERSION);
        if (unitMatch) {
            const [, value, fromUnit, toUnit] = unitMatch;
            return this.convertUnit(parseFloat(value), fromUnit.trim(), toUnit.trim());
        }
        // Try SI notation
        const siMatch = input.match(PATTERNS.SI_NOTATION);
        if (siMatch) {
            return this.formatSI(input);
        }
        return null;
    }

    convertTemperature(value, fromUnit, toUnit) {
        try {
            let result;
            if (fromUnit === toUnit) return { value };
            const conversions = {
                'F': {
                'C': unitConversionFunctions.fahrenheitToCelsius,
                'K': unitConversionFunctions.fahrenheitToKelvin
                },
                'C': {
                'F': unitConversionFunctions.celsiusToFahrenheit,
                'K': unitConversionFunctions.celsiusToKelvin
                },
                'K': {
                'F': unitConversionFunctions.kelvinToFahrenheit,
                'C': unitConversionFunctions.kelvinToCelsius
                }
            };

            result = conversions[fromUnit][toUnit](value);

            return {
                value: result,
                unit: toUnit,
                formatted: `${result.toFixed(2)}°${toUnit}`
            };
        } catch (error) {
            return null;
        }
    }

    convertUnit(value, fromUnit, toUnit) {
        try {
            // Handle common unit aliases
            const unitAliases = {
                'meters': 'm',
                'meter': 'm',
                'kilometer': 'km',
                'kilometers': 'km',
                'centimeter': 'cm',
                'centimeters': 'cm',
                'millimeter': 'mm',
                'millimeters': 'mm',
                'mile': 'mi',
                'miles': 'mi',
                'foot': 'ft',
                'feet': 'ft',
                'inch': 'in',
                'inches': 'in',
                'pound': 'lbs',
                'pounds': 'lbs',
                'kilogram': 'kg',
                'kilograms': 'kg',
                'gram': 'g',
                'grams': 'g',
                'second': 's',
                'seconds': 's',
                'minute': 'min',
                'minutes': 'min',
                'hour': 'h',
                'hours': 'h',
                'liter': 'L',
                'liters': 'L',
                'milliliter': 'mL',
                'milliliters': 'mL',
                'gallon': 'gal',
                'gallons': 'gal'
            };
            // Normalize units
            const normalizedFromUnit = unitAliases[fromUnit.toLowerCase()] || fromUnit;
            const normalizedToUnit = unitAliases[toUnit.toLowerCase()] || toUnit;

            // Create mathjs unit objects
            const fromValue = this.mathjs.unit(value, normalizedFromUnit);
            const result = fromValue.toNumber(normalizedToUnit);

            return {
                value: result,
                unit: normalizedToUnit,
                formatted: `${result.toFixed(4)} ${normalizedToUnit}`
            };
        } catch (error) {
            // If direct conversion fails, try SI prefix conversion
            try {
                const siResult = this.convertSIPrefix(value, fromUnit, toUnit);
                if (siResult !== null) {
                    return siResult;
                }
            } catch {
                return null;
            }
            return null;
        }
    }

    convertSIPrefix(value, fromUnit, toUnit) {
        // Extract SI prefixes and base unit
        const prefixRegex = /^([yzafpnμmcdhkMGTPEZY])?([a-zA-Z]+)$/;
        const fromMatch = fromUnit.match(prefixRegex);
        const toMatch = toUnit.match(prefixRegex);

        if (fromMatch && toMatch && fromMatch[2] === toMatch[2]) {
            const [, fromPrefix = '', baseUnit] = fromMatch;
            const [, toPrefix = ''] = toMatch;

            const result = unitConversionFunctions.siPrefix(value, fromPrefix, toPrefix);
            
            return {
                value: result,
                unit: toUnit,
                formatted: `${result.toFixed(4)} ${toUnit}`
            };
        }
        return null;
    }

    formatSI(input) {
        try {
            const value = parseFloat(input);
            const scientific = value.toExponential();
            const [coefficient, exponent] = scientific.split('e');
            const exp = parseInt(exponent);

            // Format with SI prefixes
            const siPrefixes = {
                '24': 'Y', '21': 'Z', '18': 'E', '15': 'P', '12': 'T', '9': 'G', '6': 'M',
                '3': 'k', '2': 'h', '1': 'da', '0': '',
                '-1': 'd', '-2': 'c', '-3': 'm', '-6': 'μ', '-9': 'n',
                '-12': 'p', '-15': 'f', '-18': 'a', '-21': 'z', '-24': 'y'
            };

            // Find the closest SI prefix
            const exponents = Object.keys(siPrefixes).map(Number);
            const closestExp = exponents.reduce((prev, curr) => 
                Math.abs(curr - exp) < Math.abs(prev - exp) ? curr : prev
            );

            const adjustedValue = value * Math.pow(10, -closestExp);
            const prefix = siPrefixes[closestExp.toString()];

            return {
                value: value,
                scientific: scientific,
                formatted: `${adjustedValue.toFixed(2)} ${prefix}`
            };
        } catch {
            return null;
        }
    }
}

// Initialize parsers
const parsers = {
    mathParser: new MathParser(),
    unitParser: new UnitConversionParser(),
    languageParser: new LanguageParser(),
};

// Main input handler
export function handleInput(inputText, lineNumber = null, timezone = 'UTC') {
    try {
        if (inputText.startsWith('=')) {
            const formula = inputText.slice(1).trim();
            if (!formula) return null;
            
            try {
                const modifiedFormula = parsers.mathParser.replaceVariables(formula);
                return {
                    value: math.evaluate(modifiedFormula, predefinedFunctions),
                    type: 'formula',
                    original: inputText
                };
            } catch {
                return null;
            }
        }

        /* Disabled this as it interfeers with math and some other stuff.
        const dateMatch = inputText.match(PATTERNS.DATE);
        if(dateMatch) {
            try {
                const date = new Date(inputText);
                if (!isNaN(date.getTime())) {
                    return {value: date};
                }
            } catch {
                return null;
            }
        }
        */

        const router = new ParserRouter();
        const parserType = router.decideParser(inputText);
        const parser = parsers[`${parserType}Parser`];
        
        CONFIG.DEFAULT_TIMEZONE = timezone;
        
        if (parser) {
            return parser.parse(inputText, lineNumber) || { 
                success: false, 
                error: 'Could not parse input' 
            };
        }
        return {
            success: false,
            error: 'Unknown input format'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            type: error instanceof ParserError ? error.type : 'UNKNOWN_ERROR'
        };
    }
}