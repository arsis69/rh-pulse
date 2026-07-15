export interface Token {
  id: string;
  address: string;
  ticker: string;
  name: string;
  launchpad: 'flap' | 'virtuals' | 'bankr' | 'nock' | 'pons' | 'klik' | 'other';
  liquidity: number;
  mcap: number;
  ageMinutes: number;
  volume24h: number;
  llmScore: number; // 0-100
  hasX: boolean;
  logo?: string;
}
