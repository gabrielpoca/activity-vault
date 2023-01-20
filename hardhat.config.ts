import "@matterlabs/hardhat-zksync-toolbox";
import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-solc";
import "@typechain/hardhat";

const zkSyncTestnet =
  process.env.NODE_ENV === "test"
    ? {
        url: "http://localhost:3050",
        ethNetwork: "http://localhost:8545",
        zksync: true,
      }
    : {
        url: "https://zksync2-testnet.zksync.dev",
        ethNetwork: "goerli",
        zksync: true,
      };

module.exports = {
  zksolc: {
    version: "1.2.3",
    compilerSource: "binary",
    settings: {
      optimizer: {
        enabled: true,
      },
      experimental: {
        //   dockerImage: "matterlabs/zksolc",
        //   tag: "latest",
      },
      libraries: {},
    },
  },
  defaultNetwork: "zkSyncTestnet",
  networks: {
    zkSyncTestnet,
    // hardhat: {
    //   zksync: true,
    // },
    // zkSyncTestnet: {
    //   url: "https://zksync2-testnet.zksync.dev",
    //   ethNetwork: "goerli", // Can also be the RPC URL of the network (e.g. `https://goerli.infura.io/v3/<API_KEY>`)
    //   zksync: true,
    // },
  },
  typechain: {
    outDir: "typechain",
  },
  solidity: {
    version: "0.8.16",
  },
};
