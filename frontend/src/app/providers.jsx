"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

// Kite Testnet chain definition
const kiteTestnet = {
  id: 2368,
  name: "Kite Testnet",
  nativeCurrency: { name: "KITE", symbol: "KITE", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc-testnet.gokite.ai"] },
    public: { http: ["https://rpc-testnet.gokite.ai"] },
  },
  blockExplorers: {
    default: { name: "KiteScan", url: "https://testnet.kitescan.ai" },
  },
  testnet: true,
};

const config = getDefaultConfig({
  appName: "Vigil Security Dashboard",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "vigil-hackathon-demo",
  chains: [kiteTestnet, sepolia, mainnet],
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#adc6ff",
            accentColorForeground: "#002e69",
            borderRadius: "medium",
            overlayBlur: "small",
          })}
          coolMode
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
