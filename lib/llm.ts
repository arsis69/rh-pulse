const BASE_URL = 'https://madjames.bond/v1';
const API_KEY = 'sk-mj-jdVH-Sxslob5ClK0dsTg_dtfXE6yJcoF';
const MODEL = 'mj/grok-4.5';

export interface LLMAnalysis {
  score: number;
  risk: 'Low' | 'Medium' | 'High';
  pros: string[];
  cons: string[];
  summary: string;
}

export async function analyzeToken(token: any): Promise<LLMAnalysis> {
  const prompt = `
Analyze this new memecoin on Robinhood Chain.

Token: $${token.ticker}
Launchpad: ${token.launchpad.toUpperCase()}
Liquidity: $${(token.liquidity / 1000).toFixed(0)}K
Age: ${token.ageMinutes} minutes
MCAP: $${(token.mcap / 1000000).toFixed(2)}M

Give a structured JSON response with:
{
  "score": number between 1-100,
  "risk": "Low" | "Medium" | "High",
  "pros": ["short point 1", "short point 2", "short point 3"],
  "cons": ["short point 1", "short point 2", "short point 3"],
  "summary": "max 2 sentences"
}
`;

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: 'You are a professional memecoin analyst. Be direct, honest, and structured.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      }),
    });

    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error('LLM Analysis failed:', error);
    // Fallback mock
    return {
      score: 65 + Math.floor(Math.random() * 30),
      risk: 'Medium',
      pros: ['Strong community potential', 'New launchpad momentum', 'Good initial liquidity'],
      cons: ['High volatility', 'Early stage risks', 'Competition from other tokens'],
      summary: 'Solid early play with good upside if community builds fast.'
    };
  }
}
