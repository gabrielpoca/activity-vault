import * as hre from "hardhat";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { Wallet, Provider, utils, types } from "zksync-web3";
import { expect } from "chai";
import { parseEther } from "ethers/lib/utils";
import { time } from "@openzeppelin/test-helpers";

import { ActivtyVault } from "../typechain";
import { RICH_WALLET_PK } from "./constants";
import {
  buildTx,
  deployActivtyVault,
  getProvider,
  randomWallet,
  sendTx,
  signTx,
} from "./helpers";
import { TransactionRequest } from "zksync-web3/build/src/types";

describe("AA", function () {
  let provider: Provider;
  let mainDeployer: Deployer;

  beforeEach(async () => {
    provider = getProvider();
    mainDeployer = new Deployer(
      hre,
      new Wallet(RICH_WALLET_PK).connect(provider)
    );
  });

  it("allows the owner to move funds", async () => {
    const { activtyVault, owner } = await deployActivtyVault(mainDeployer, 1);

    const destinationWallet = randomWallet();

    let tx = await buildTx(activtyVault, {
      to: destinationWallet.address,
      value: parseEther("1"),
    });

    tx = signTx(tx, [owner.zkWallet]);

    expect(await destinationWallet.getBalance()).to.eq(parseEther("0"));

    await sendTx(tx);

    expect(await destinationWallet.getBalance()).to.eq(parseEther("1"));
  });

  it("updates the lastActivityTimestamp", async () => {
    const { activtyVault, owner } = await deployActivtyVault(mainDeployer, 1);

    const destinationWallet = randomWallet();

    let tx = await buildTx(activtyVault, {
      to: destinationWallet.address,
      value: parseEther("1"),
    });

    tx = signTx(tx, [owner.zkWallet]);

    const lastActivityTimestamp = (
      await activtyVault.lastActivityTimestamp()
    ).toNumber();

    await sendTx(tx);

    expect((await activtyVault.lastActivityTimestamp()).toNumber()).to.be.gt(
      lastActivityTimestamp
    );
  });

  it("allows members to move funds", async () => {
    const { activtyVault } = await deployActivtyVault(
      mainDeployer,
      time.duration.days(0).toNumber()
    );

    const user1 = randomWallet();
    const user2 = randomWallet();
    const destinationWallet = randomWallet();

    await (await activtyVault.addMember(user1.address)).wait();
    await (await activtyVault.addMember(user2.address)).wait();

    let tx = await buildTx(activtyVault, {
      to: destinationWallet.address,
      value: parseEther("1"),
    });

    tx = signTx(tx, [user1, user2]);

    expect(await destinationWallet.getBalance()).to.eq(parseEther("0"));

    await sendTx(tx);

    expect(await destinationWallet.getBalance()).to.eq(parseEther("1"));
  });

  it("doesn't allow members to move the funds", async () => {
    const { activtyVault, owner } = await deployActivtyVault(
      mainDeployer,
      time.duration.days(1).toNumber()
    );

    const user1 = randomWallet();
    const user2 = randomWallet();
    const destinationWallet = randomWallet();

    await addMember(activtyVault, owner, user1);
    await addMember(activtyVault, owner, user2);

    let tx = await buildTx(activtyVault, {
      to: destinationWallet.address,
      value: parseEther("1"),
    });

    tx = signTx(tx, [user1, user2]);

    expect(sendTx(tx)).to.be.rejected;
  });

  async function addMember(
    activtyVault: ActivtyVault,
    owner: Deployer,
    user: Wallet
  ) {
    let tx: TransactionRequest =
      await activtyVault.populateTransaction.addMember(user.address);

    tx = await buildTx(activtyVault, {
      ...tx,
      from: activtyVault.address,
      nonce: await provider.getTransactionCount(activtyVault.address),
      value: parseEther("0"),
    });

    tx = signTx(tx, [owner.zkWallet]);

    await sendTx(tx);
  }
});
