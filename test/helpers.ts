import * as hre from "hardhat";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { EIP712Signer, Provider, types, utils, Wallet } from "zksync-web3";
import { TransactionRequest } from "zksync-web3/build/src/types";
import { ethers } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { ActivtyVault__factory } from "../typechain";

let provider: Provider;

export const getProvider = () => {
  if (!provider) provider = Provider.getDefaultProvider();

  return provider;
};

export const randomWallet = () => {
  return Wallet.createRandom().connect(getProvider());
};

export const buildTx = async (
  from: {
    address: string;
  },
  overrides: Partial<TransactionRequest>
): Promise<TransactionRequest> => {
  const provider = getProvider();

  const tx = {
    from: from.address,
    gasPrice: await provider.getGasPrice(),
    chainId: (await provider.getNetwork()).chainId,
    nonce: await provider.getTransactionCount(from.address),
    data: "0x",
    type: 113,
    customData: {
      ergsPerPubdata: utils.DEFAULT_ERGS_PER_PUBDATA_LIMIT,
    } as types.Eip712Meta,
    ...overrides,
  };

  const dynamicLimits = await provider.estimateGas(tx);
  tx.gasLimit = dynamicLimits;

  return tx;
};

export const signTx = (
  tx: ethers.providers.TransactionRequest,
  signers: Wallet[]
) => {
  const signedTxHash = EIP712Signer.getSignedDigest(tx);
  let signature: string | Uint8Array;

  if (signers.length === 1) {
    signature = ethers.utils.joinSignature(
      signers[0]._signingKey().signDigest(signedTxHash)
    );
  } else {
    signature = ethers.utils.concat(
      signers.map((signer) =>
        ethers.utils.joinSignature(
          signer._signingKey().signDigest(signedTxHash)
        )
      )
    );
  }

  return {
    ...tx,
    customData: {
      ...tx.customData,
      customSignature: signature,
    },
  };
};

export const sendTx = async (tx: ethers.providers.TransactionRequest) => {
  return (await getProvider().sendTransaction(utils.serialize(tx))).wait();
};

export async function deployActivtyVault(
  mainDeployer: Deployer,
  activitySpan: number
) {
  const owner = new Deployer(hre, randomWallet());

  await (
    await mainDeployer.zkWallet.sendTransaction({
      to: owner.zkWallet.address,
      value: parseEther("1000"),
    })
  ).wait();

  const factory = await deployAAFactory(owner);

  const salt = ethers.constants.HashZero;

  await (
    await factory.deployAccount(salt, owner.zkWallet.address, activitySpan)
  ).wait();

  const abiCoder = new ethers.utils.AbiCoder();

  const activtyVaultAddress = utils.create2Address(
    factory.address,
    await factory.aaBytecodeHash(),
    salt,
    abiCoder.encode(["address", "uint"], [owner.zkWallet.address, activitySpan])
  );

  await (
    await mainDeployer.zkWallet.sendTransaction({
      to: activtyVaultAddress,
      value: parseEther("1000"),
    })
  ).wait();

  return {
    activtyVault: ActivtyVault__factory.connect(
      activtyVaultAddress,
      owner.zkWallet
    ),
    owner,
  };
}

async function deployAAFactory(deployer: Deployer) {
  const factoryArtifact = await deployer.loadArtifact("WFactory");
  const artifact = await deployer.loadArtifact("ActivtyVault");
  const bytecodeHash = utils.hashBytecode(artifact.bytecode);

  return deployer.deploy(factoryArtifact, [bytecodeHash], undefined, [
    artifact.bytecode,
  ]);
}
