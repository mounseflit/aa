/**
 * Q&A Matching Agent
 * Analyzes user speech and matches it to the best question from qst.json
 * Returns a question number (1-35 for matches, 36 for out_of_context, 37 for gibberish)
 */

class GuardrailAgent {
    constructor() {
        this.apiKey = null;
        this.questions = [];
        this.questionsForPrompt = '';
        this.loadApiKey();
        this.loadQuestions();
    }

    rot13(str) {
        return str.replace(/[a-zA-Z]/g, (c) => {
            const base = c <= 'Z' ? 65 : 97;
            return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
        });
    }

    loadApiKey() {
        try {
            this.apiKey = this.rot13("fx-cebw-QxIrppx89_pRuQx6ViYUlosCgEFexkBEzg3JkqeXxO3RyvhTWSeMaupT2UpCVMVsEf-N8M7LNDG3OyoxSWY5SHefp26VIJMQhGwiHycq4yl9YoDp_A_hrDrSlv2cwAp3QcurPu2e8UH3c6_QqI5s0tRpxARN");
            console.log('[Agent] API key loaded');
        } catch (e) {
            console.error('[Agent] API key error:', e);
        }
    }

    async loadQuestions() {
        try {
            const response = await fetch('./assets/qst.json');
            const data = await response.json();
            this.questions = data.questions;

            // Build formatted question list for AI prompt (only real Q&A, Q1-Q35)
            this.questionsForPrompt = this.questions
                .filter(q => q.number <= 35)
                .map(q => `${q.number}. "${q.text}"`)
                .join('\n');

            console.log('[Agent] Loaded', this.questions.length, 'questions');
        } catch (e) {
            console.error('[Agent] Failed to load questions:', e);
        }
    }

    /**
     * Fast local gibberish detection (no API call needed)
     * Conservative: only catch truly obvious non-speech. Let AI handle ambiguous cases.
     */
    isGibberish(text) {
        if (!text || text.trim().length === 0) return true;

        const trimmed = text.trim();

        // Only block very short input (1-2 chars like "a", "ab")
        if (trimmed.length < 2) return true;

        // Check for repeated characters like "aaaa", "xxxxx"
        if (/^(.)\1{2,}$/.test(trimmed)) return true;

        // Check for no actual letters (just symbols/numbers)
        if (/^[^a-zA-Z\u0600-\u06FF\u0750-\u077F]+$/.test(trimmed)) return true;

        return false;
    }

    /**
     * Main entry point: match user speech to a question number
     * Returns: number 1-37
     *   1-35 = matched question
     *   36 = out of context
     *   37 = gibberish
     */
    async matchQuestion(text) {
        const trimmed = (text || '').trim();
        console.log('[Agent] Matching:', trimmed);

        // Fast path: only block truly empty/unreadable gibberish
        if (this.isGibberish(trimmed)) {
            console.log('[Agent] Gibberish detected locally');
            return 37;
        }

        // Send everything else to AI for semantic matching
        // (single words like "hello", "bye", "thanks" are valid and should match Q1/Q3/Q4)
        try {
            const result = await this.matchWithAI(trimmed);
            console.log('[Agent] AI match result:', result);
            return result;
        } catch (e) {
            console.error('[Agent] AI matching error:', e);
            return 36; // Fail-safe: out of context
        }
    }

    /**
     * Call OpenAI to semantically match user speech to the best question
     */
    async matchWithAI(text) {
        if (!this.apiKey) {
            console.warn('[Agent] No API key');
            return 36;
        }

        // Guard: if questions haven't loaded yet, wait briefly then check again
        if (!this.questionsForPrompt) {
            console.warn('[Agent] Questions not loaded yet, retrying...');
            await new Promise(r => setTimeout(r, 1000));
            if (!this.questionsForPrompt) {
                console.error('[Agent] Questions still not loaded');
                return 36;
            }
        }

        const systemPrompt = `You are a question matcher for an interactive avatar. The user speaks to the avatar and you must determine which pre-defined question their speech best matches.

Here are all the questions the avatar can answer:
${this.questionsForPrompt}

RULES:
- Compare the user's speech to ALL questions above
- Return the NUMBER of the best matching question (1-35)
- The match does NOT need to be exact - find the closest semantic match
- If the user says a greeting like "hi", "hello", "hey", "marhaba" → return 1
- If the user asks who the avatar is → return 2
- If the user says "thank you", "thanks", "shukran" → return 3
- If the user says "bye", "goodbye", "ma3a salama" → return 4
- For all other topics, find the closest match among questions 5-35
- If the speech is completely unrelated to any question (off-topic) → return 36
- If the speech is unclear, garbled, or nonsensical → return 37
- Be generous with matching - if there is a reasonable connection, pick the closest question
- The user may speak in Arabic, English, French, or a mix - handle all languages

Respond with ONLY a single number (1-37). Nothing else.`;

        try {
            console.log('[Agent] Calling OpenAI API with text:', text);
            console.log('[Agent] API key present:', !!this.apiKey, '| Key prefix:', this.apiKey ? this.apiKey.substring(0, 10) + '...' : 'NONE');
            console.log('[Agent] Questions loaded:', !!this.questionsForPrompt, '| Length:', this.questionsForPrompt.length);

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: text }
                    ],
                    temperature: 0,
                    max_tokens: 10
                })
            });

            console.log('[Agent] API response status:', response.status, response.statusText);

            if (!response.ok) {
                // Read the error body for detailed diagnosis
                let errorBody = '';
                try {
                    errorBody = await response.text();
                } catch (_) {}
                console.error('[Agent] API error response:', response.status, errorBody);
                throw new Error(`API error: ${response.status} - ${errorBody}`);
            }

            const data = await response.json();
            const answer = data.choices[0].message.content.trim();
            console.log('[Agent] AI raw answer:', answer);

            const num = parseInt(answer, 10);
            if (isNaN(num) || num < 1 || num > 37) {
                console.warn('[Agent] Invalid response:', answer, '- defaulting to 36');
                return 36;
            }

            return num;
        } catch (e) {
            console.error('[Agent] API call failed:', e.message || e);
            console.error('[Agent] Full error:', e);
            return 36;
        }
    }
}

// Create global instance
window.guardrailAgent = new GuardrailAgent();
