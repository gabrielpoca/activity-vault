import { expect } from "chai";
import { Wallet, Provider } from "zksync-web3";
import * as hre from "hardhat";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { TransactionRequest } from "zksync-web3/build/src/types";

import {
  deployActivtyVault,
  randomWallet,
  buildTx,
  signTx,
  sendTx,
} from "./helpers";
import { RICH_WALLET_2_PK, RICH_WALLET_PK } from "./constants";
import { ActivtyVault } from "../typechain";
import { parseEther } from "ethers/lib/utils";

describe("ActivtyVault", function () {
  let provider: Provider;
  let deployer: Deployer;
  let alice: Deployer;
  let bob: Wallet;

  let activtyVault: ActivtyVault;
  let owner: Deployer;

  beforeEach(async () => {
    provider = Provider.getDefaultProvider();
    deployer = new Deployer(hre, new Wallet(RICH_WALLET_PK).connect(provider));
    alice = new Deployer(hre, new Wallet(RICH_WALLET_2_PK).connect(provider));
    bob = randomWallet();

    const res = await deployActivtyVault(deployer, 0);
    activtyVault = res.activtyVault;
    owner = res.owner;
  });

  describe("addMember", () => {
    it("allows the owner to add a member", async () => {
      await (await activtyVault.addMember(bob.address)).wait();

      expect(await activtyVault.members(bob.address)).to.be.true;
    });

    it("updates the lastActivityTimestamp", async () => {
      const lastActivityTimestamp = await activtyVault.lastActivityTimestamp();

      // make sure enough time is passed so the new transaction goes into a different block
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await (await activtyVault.addMember(bob.address)).wait();

      expect(
        (await activtyVault.lastActivityTimestamp()).gt(lastActivityTimestamp)
      ).to.be.true;
    });

    it("allows the owner to add a member through AA", async () => {
      let tx: TransactionRequest =
        await activtyVault.populateTransaction.addMember(bob.address);

      tx = await buildTx(activtyVault, {
        ...tx,
        from: activtyVault.address,
        nonce: await provider.getTransactionCount(activtyVault.address),
        value: parseEther("0"),
      });

      tx = signTx(tx, [owner.zkWallet]);

      await sendTx(tx);

      expect(await activtyVault.members(bob.address)).to.be.true;
    });

    it("allows the members to add a member through AA", async () => {
      const user1 = randomWallet();
      const user2 = randomWallet();

      await (await activtyVault.addMember(user1.address)).wait();
      await (await activtyVault.addMember(user2.address)).wait();

      let tx: TransactionRequest =
        await activtyVault.populateTransaction.addMember(bob.address);

      tx = await buildTx(activtyVault, {
        ...tx,
        from: activtyVault.address,
        nonce: await provider.getTransactionCount(activtyVault.address),
        value: parseEther("0"),
      });

      tx = signTx(tx, [user1, user2]);

      await sendTx(tx);

      expect(await activtyVault.members(bob.address)).to.be.true;
    });

    it("fails if not authorized", async () => {
      const tx = activtyVault.connect(alice.zkWallet).addMember(bob.address);

      expect(tx).to.be.rejected;
    });
  });

  describe("removeMember", () => {
    it("removes a member", async () => {
      await (await activtyVault.addMember(bob.address)).wait();

      await (await activtyVault.removeMember(bob.address)).wait();

      expect(await activtyVault.members(bob.address)).to.be.false;
    });

    it("updates the lastActivityTimestamp", async () => {
      await (await activtyVault.addMember(bob.address)).wait();

      const lastActivityTimestamp = await activtyVault.lastActivityTimestamp();

      // make sure enough time is passed so the new transaction goes into a different block
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await (await activtyVault.removeMember(bob.address)).wait();

      expect(
        (await activtyVault.lastActivityTimestamp()).gt(lastActivityTimestamp)
      ).to.be.true;
    });

    it("allows the owner to remove a member through AA", async () => {
      await (await activtyVault.addMember(bob.address)).wait();

      let tx: TransactionRequest =
        await activtyVault.populateTransaction.removeMember(bob.address);

      tx = await buildTx(activtyVault, {
        ...tx,
        from: activtyVault.address,
        nonce: await provider.getTransactionCount(activtyVault.address),
        value: parseEther("0"),
      });

      tx = signTx(tx, [owner.zkWallet]);

      await sendTx(tx);

      expect(await activtyVault.members(bob.address)).to.be.false;
    });

    it("allows the members to remove a member through AA", async () => {
      const user1 = randomWallet();
      const user2 = randomWallet();

      await (await activtyVault.addMember(user1.address)).wait();
      await (await activtyVault.addMember(user2.address)).wait();

      let tx: TransactionRequest =
        await activtyVault.populateTransaction.removeMember(user1.address);

      tx = await buildTx(activtyVault, {
        ...tx,
        from: activtyVault.address,
        nonce: await provider.getTransactionCount(activtyVault.address),
        value: parseEther("0"),
      });

      tx = signTx(tx, [user1, user2]);

      await sendTx(tx);

      expect(await activtyVault.members(bob.address)).to.be.false;
    });

    it("fails if not authorized", async () => {
      await (await activtyVault.addMember(bob.address)).wait();

      const tx = activtyVault
        .connect(alice.zkWallet.address)
        .removeMember(bob.address);

      expect(tx).to.be.rejected;
    });
  });
});
