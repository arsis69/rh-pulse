'use client';

import React from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, getDefaultConfig } from '@rainbow-me/rainbowkit';
import { robinhoodChain } from '@/lib/chain';

import '@rainbow-me/rainbowkit/styles.css';

const config = getDefaultConfig({
  appName: 'RH Pulse',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID', // Get free one at cloud.walletconnect.com
  chains: [robinhoodChain],
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
