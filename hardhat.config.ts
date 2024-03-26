import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import { myDotenvConfig } from "./scripts/envUtils";
import "@openzeppelin/hardhat-upgrades";

myDotenvConfig();

const chainIds = {
  hardhat: 31337,
  polygonTestnet: 80002,
  polygonMainnet: 137,
};

const mnemonic = process.env.MNEMONIC!;
const polygonscanApiKey = process.env.POLYGONSCAN_API_KEY!;
const alchemyApiKey = process.env.ALCHEMY_API_KEY!;

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.6",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.19",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.8.24",
        settings: {
          viaIR: true,
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic: mnemonic,
        accountsBalance: "90000000000000000000000",
        count: 20,
      },
      chainId: chainIds.hardhat,
      gas: 950000000,
      blockGasLimit: 950000000,
      allowUnlimitedContractSize: true,
    },
    polygonTestnet: {
      url: `https://polygon-amoy.g.alchemy.com/v2/${alchemyApiKey}`,
      chainId: chainIds.polygonTestnet,
      accounts: { mnemonic: mnemonic },
    },
    polygonMainnet: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
      chainId: chainIds.polygonMainnet,
      accounts: { mnemonic: mnemonic },
    },
  },
  etherscan: {
    apiKey: {
      polygon: polygonscanApiKey,
      polygonAmoy: polygonscanApiKey,
    },
    customChains: [
      {
        network: "polygonAmoy",
        chainId: 80002,
        urls: {
          apiURL: "https://api-amoy.polygonscan.com/api",
          browserURL: "https://amoy.polygonscan.com/",
        },
      },
    ],
  },
};

export default config;
