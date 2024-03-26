import hre from "hardhat";
import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  baseFee,
  coordinatorGasOverheadLink,
  coordinatorGasOverheadNative,
  coordinatorGasOverheadPerWord,
  coordinatorLinkPremiumPercentage,
  coordinatorNativePremiumPercentage,
  fallbackWeiPerUnitLink,
  fulfillmentFlatFeeLinkDiscountPPM,
  fulfillmentFlatFeeNativePPM,
  gasPriceLink,
  initialAnswer,
  keyHash,
  linkDecimals,
  maxNumWords,
  stalenessSeconds,
  verificationTime,
  wrapperGasOverhead,
} from "../config/config";
import { errors, exampleAddress, exampleParticipants, expectedVRFLinkCost, makeParticipantsProof, maxVRFLinkCostDraft } from "../scripts/utils";
import { MaxUint256, ZeroAddress } from "ethers";

describe("RaffleRewarder", function () {
  async function deployRaffleRewarderFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await hre.ethers.getSigners();

    const vrfCoordinator = await hre.ethers.deployContract("MockVRFCoordinatorV2Mock", [baseFee, gasPriceLink]);

    const v3Aggregator = await hre.ethers.deployContract("MockMockV3Aggregator", [linkDecimals, initialAnswer]);

    const linkToken = await hre.ethers.deployContract("MockLinkToken");

    const transactionResponse = await vrfCoordinator.createSubscription();
    const log = (await transactionResponse.wait())?.logs.find((log: any) => vrfCoordinator.interface.parseLog(log)?.name === "SubscriptionCreated");
    if (!log) throw new Error("Missing subscription created event");
    const subId = vrfCoordinator.interface.parseLog(log)?.args[0];
    const maxSupply = await linkToken.maxSupply();
    await linkToken.mint(owner.address, maxSupply);
    await vrfCoordinator.fundSubscription(subId, 1000000000000000000000n);

    const vrfV2Wrapper = await hre.ethers.deployContract("MockVRFV2Wrapper", [
      await linkToken.getAddress(),
      await v3Aggregator.getAddress(),
      await vrfCoordinator.getAddress(),
      subId,
    ]);
    await vrfCoordinator.addConsumer(subId, await vrfV2Wrapper.getAddress());
    await vrfV2Wrapper.setConfig(
      wrapperGasOverhead,
      coordinatorGasOverheadNative,
      coordinatorGasOverheadLink,
      coordinatorGasOverheadPerWord,
      coordinatorNativePremiumPercentage,
      coordinatorLinkPremiumPercentage,
      keyHash,
      maxNumWords,
      stalenessSeconds,
      fallbackWeiPerUnitLink,
      fulfillmentFlatFeeNativePPM,
      fulfillmentFlatFeeLinkDiscountPPM
    );

    const NftPrize = await hre.ethers.getContractFactory("NftPrize");
    const nftPrize = await NftPrize.deploy();
    const prize = { contractAddress: await nftPrize.getAddress(), tokenId: 1n };

    const RaffleRewarder = await hre.ethers.getContractFactory("RaffleRewarder");
    const raffleRewarder = await RaffleRewarder.deploy(0, prize, makeParticipantsProof(exampleParticipants()), await vrfV2Wrapper.getAddress(), "0x31");

    return { raffleRewarder, nftPrize, linkToken, vrfV2Wrapper, vrfCoordinator, prize, owner, otherAccount };
  }

  async function deployRaffleRewarderFixtureWithOwnerWinner() {
    const [owner, otherAccount] = await hre.ethers.getSigners();

    const vrfCoordinator = await hre.ethers.deployContract("MockVRFCoordinatorV2Mock", [baseFee, gasPriceLink]);

    const v3Aggregator = await hre.ethers.deployContract("MockMockV3Aggregator", [linkDecimals, initialAnswer]);

    const linkToken = await hre.ethers.deployContract("MockLinkToken");
    const transactionResponse = await vrfCoordinator.createSubscription();
    const log = (await transactionResponse.wait())?.logs.find((log: any) => vrfCoordinator.interface.parseLog(log)?.name === "SubscriptionCreated");
    if (!log) throw new Error("Missing subscription created event");
    const subId = vrfCoordinator.interface.parseLog(log)?.args[0];
    const maxSupply = await linkToken.maxSupply();
    await linkToken.mint(owner.address, maxSupply);
    await vrfCoordinator.fundSubscription(subId, 1000000000000000000000n);

    const vrfV2Wrapper = await hre.ethers.deployContract("MockVRFV2Wrapper", [
      await linkToken.getAddress(),
      await v3Aggregator.getAddress(),
      await vrfCoordinator.getAddress(),
      subId,
    ]);
    await vrfCoordinator.addConsumer(subId, await vrfV2Wrapper.getAddress());
    await vrfV2Wrapper.setConfig(
      wrapperGasOverhead,
      coordinatorGasOverheadNative,
      coordinatorGasOverheadLink,
      coordinatorGasOverheadPerWord,
      coordinatorNativePremiumPercentage,
      coordinatorLinkPremiumPercentage,
      keyHash,
      maxNumWords,
      stalenessSeconds,
      fallbackWeiPerUnitLink,
      fulfillmentFlatFeeNativePPM,
      fulfillmentFlatFeeLinkDiscountPPM
    );

    const NftPrize = await hre.ethers.getContractFactory("NftPrize");
    const nftPrize = await NftPrize.deploy();
    const prize = { contractAddress: await nftPrize.getAddress(), tokenId: 1n };

    const RaffleRewarder = await hre.ethers.getContractFactory("RaffleRewarder");
    const raffleRewarder = await RaffleRewarder.deploy(
      0,
      prize,
      makeParticipantsProof(exampleParticipants(owner.address)),
      await vrfV2Wrapper.getAddress(),
      "0x31"
    );

    return { raffleRewarder, nftPrize, linkToken, vrfV2Wrapper, vrfCoordinator, prize, owner, otherAccount };
  }

  describe("Deployment", function () {
    it("Should set the right participantsProof", async function () {
      const { raffleRewarder } = await loadFixture(deployRaffleRewarderFixture);

      expect(await raffleRewarder.verifyParticipants(exampleParticipants())).to.be.true;
    });
    it("Should set the right prize", async function () {
      const { raffleRewarder, prize } = await loadFixture(deployRaffleRewarderFixture);

      const contractPrize = await raffleRewarder.prize();

      expect(contractPrize.contractAddress).to.equal(prize.contractAddress);
      expect(contractPrize.tokenId).to.equal(prize.tokenId);
    });
  });

  describe("askForRandomness", function () {
    it("Should revert if payer has no LINK token to pay for randomness", async function () {
      const { raffleRewarder, linkToken, otherAccount } = await loadFixture(deployRaffleRewarderFixture);

      await linkToken.connect(otherAccount).approve(await raffleRewarder.getAddress(), MaxUint256);

      await expect(raffleRewarder.askForRandomness(otherAccount.address)).to.be.revertedWith(errors.insufficientBalance);
    });
    it("Should revert if randomness already asked an prize claim period not elapsed", async function () {
      const { raffleRewarder, owner, linkToken, vrfCoordinator, vrfV2Wrapper } = await loadFixture(deployRaffleRewarderFixture);

      await linkToken.approve(await raffleRewarder.getAddress(), MaxUint256 - 1n);
      const payerStartingBalance = await linkToken.balanceOf(owner.address);

      await raffleRewarder.askForRandomness(owner.address);

      expect(payerStartingBalance - (await linkToken.balanceOf(owner.address))).to.approximately(expectedVRFLinkCost, maxVRFLinkCostDraft);

      let request = await raffleRewarder.request();

      expect(request.requestId).not.to.equal(0n);
      expect(request.fulfilled).to.be.false;
      expect(request.paid).to.approximately(expectedVRFLinkCost, maxVRFLinkCostDraft);

      await vrfCoordinator.fulfillRandomWords(request.requestId, await vrfV2Wrapper.getAddress());

      request = await raffleRewarder.request();

      expect(request.fulfilled).to.be.true;

      await expect(raffleRewarder.askForRandomness(owner.address)).to.be.revertedWithCustomError(raffleRewarder, errors.cannotAskNewRandomness);
    });
    it("Should request randomness and handle the chainlink callback", async function () {
      const { raffleRewarder, owner, linkToken, vrfCoordinator, vrfV2Wrapper } = await loadFixture(deployRaffleRewarderFixture);

      await linkToken.approve(await raffleRewarder.getAddress(), MaxUint256 - 1n);
      const payerStartingBalance = await linkToken.balanceOf(owner.address);

      await raffleRewarder.askForRandomness(owner.address);
      expect(payerStartingBalance - (await linkToken.balanceOf(owner.address))).to.approximately(expectedVRFLinkCost, maxVRFLinkCostDraft);

      let request = await raffleRewarder.request();

      await vrfCoordinator.fulfillRandomWords(request.requestId, await vrfV2Wrapper.getAddress());

      request = await raffleRewarder.request();

      expect(request.fulfilled).to.be.true;
    });
  });

  describe("determineWinner", function () {
    it("Should revert if randomness request is not fulfilled", async function () {
      const { raffleRewarder, owner, linkToken } = await loadFixture(deployRaffleRewarderFixture);

      await linkToken.approve(await raffleRewarder.getAddress(), MaxUint256 - 1n);

      await raffleRewarder.askForRandomness(owner.address);

      await expect(raffleRewarder.determineWinner(exampleParticipants())).to.be.revertedWithCustomError(raffleRewarder, errors.noRandomWords);
    });
    it("Should revert if participants array differ from original", async function () {
      const { raffleRewarder, owner, linkToken, vrfCoordinator, vrfV2Wrapper } = await loadFixture(deployRaffleRewarderFixture);

      await linkToken.approve(await raffleRewarder.getAddress(), MaxUint256 - 1n);

      await raffleRewarder.askForRandomness(owner.address);

      let request = await raffleRewarder.request();

      await vrfCoordinator.fulfillRandomWords(request.requestId, await vrfV2Wrapper.getAddress());

      request = await raffleRewarder.request();

      expect(request.fulfilled).to.be.true;

      const participants = exampleParticipants();
      participants.push({ addr: ZeroAddress, ticketCount: 0n, cumulativeCount: 0n });

      await expect(raffleRewarder.determineWinner(participants)).to.be.revertedWithCustomError(raffleRewarder, errors.wrongParticipants);
    });
    it("Should reward the winner", async function () {
      const { raffleRewarder, owner, linkToken, vrfCoordinator, vrfV2Wrapper } = await loadFixture(deployRaffleRewarderFixture);

      await linkToken.approve(await raffleRewarder.getAddress(), MaxUint256 - 1n);

      await raffleRewarder.askForRandomness(owner.address);

      const request = await raffleRewarder.request();

      const tx = await vrfCoordinator.fulfillRandomWords(request.requestId, await vrfV2Wrapper.getAddress());

      await raffleRewarder.determineWinner(exampleParticipants());
      const blockTimestamp = (await tx.getBlock())?.timestamp;

      expect(await raffleRewarder.winner()).to.equal(exampleAddress);
      expect(await raffleRewarder.startClaimTime()).to.equal(blockTimestamp);
    });
  });

  describe("claimPrize", function () {
    it("Should revert if winner not set", async function () {
      const { raffleRewarder } = await loadFixture(deployRaffleRewarderFixture);

      await expect(raffleRewarder.claimPrize()).to.be.revertedWithCustomError(raffleRewarder, errors.winnerNotSet);
    });
    it("Should revert if not called by winner", async function () {
      const { raffleRewarder, owner, linkToken, vrfCoordinator, vrfV2Wrapper } = await loadFixture(deployRaffleRewarderFixture);

      await linkToken.approve(await raffleRewarder.getAddress(), MaxUint256 - 1n);

      await raffleRewarder.askForRandomness(owner.address);

      let request = await raffleRewarder.request();

      const tx = await vrfCoordinator.fulfillRandomWords(request.requestId, await vrfV2Wrapper.getAddress());

      request = await raffleRewarder.request();

      await raffleRewarder.determineWinner(exampleParticipants());
      const blockTimestamp = (await tx.getBlock())?.timestamp;

      expect(await raffleRewarder.winner()).to.equal(exampleAddress);
      expect(await raffleRewarder.startClaimTime()).to.equal(blockTimestamp);

      await expect(raffleRewarder.claimPrize()).to.be.revertedWithCustomError(raffleRewarder, errors.callerNotWinner);
    });
    it("Should revert if claim period is elapsed", async function () {
      const { raffleRewarder, owner, linkToken, vrfCoordinator, vrfV2Wrapper } = await loadFixture(deployRaffleRewarderFixture);

      await linkToken.approve(await raffleRewarder.getAddress(), MaxUint256 - 1n);

      await raffleRewarder.askForRandomness(owner.address);

      const request = await raffleRewarder.request();

      const tx = await vrfCoordinator.fulfillRandomWords(request.requestId, await vrfV2Wrapper.getAddress());

      await raffleRewarder.determineWinner(exampleParticipants());

      await time.increase(await raffleRewarder.PRIZE_CLAIM_PERIOD());

      await expect(raffleRewarder.claimPrize()).to.be.revertedWithCustomError(raffleRewarder, errors.claimPeriodElapsed);
    });
    it("Should let winner claim the prize", async function () {
      const { raffleRewarder, nftPrize, owner, linkToken, vrfCoordinator, vrfV2Wrapper, prize } = await loadFixture(deployRaffleRewarderFixtureWithOwnerWinner);

      await nftPrize.approve(await raffleRewarder.getAddress(), prize.tokenId);

      await linkToken.approve(await raffleRewarder.getAddress(), MaxUint256 - 1n);

      await raffleRewarder.askForRandomness(owner.address);

      const request = await raffleRewarder.request();

      const tx = await vrfCoordinator.fulfillRandomWords(request.requestId, await vrfV2Wrapper.getAddress());

      await raffleRewarder.determineWinner(exampleParticipants(owner.address));
      const blockTimestamp = (await tx.getBlock())?.timestamp;

      expect(await raffleRewarder.winner()).to.equal(owner.address);
      expect(await raffleRewarder.startClaimTime()).to.equal(blockTimestamp);

      await expect(raffleRewarder.claimPrize()).to.emit(nftPrize, "Transfer").withArgs(owner.address, owner.address, BigInt(prize.tokenId));

      expect(await nftPrize.ownerOf(prize.tokenId)).to.equal(owner.address);
    });
    it("Should allow another winner to be elected if the first doesn't claim the prize", async function () {
      const { raffleRewarder, nftPrize, owner, linkToken, vrfCoordinator, vrfV2Wrapper, prize } = await loadFixture(deployRaffleRewarderFixtureWithOwnerWinner);

      await nftPrize.approve(await raffleRewarder.getAddress(), prize.tokenId);

      await linkToken.approve(await raffleRewarder.getAddress(), MaxUint256 - 1n);

      await raffleRewarder.askForRandomness(owner.address);

      let request = await raffleRewarder.request();

      const tx = await vrfCoordinator.fulfillRandomWords(request.requestId, await vrfV2Wrapper.getAddress());

      await raffleRewarder.determineWinner(exampleParticipants(owner.address));

      await time.increase(await raffleRewarder.PRIZE_CLAIM_PERIOD());

      await expect(raffleRewarder.claimPrize()).to.be.revertedWithCustomError(raffleRewarder, errors.claimPeriodElapsed);

      await raffleRewarder.askForRandomness(owner.address);
      request = await raffleRewarder.request();
      expect(request.requestId).not.to.equal(0n);
      expect(request.fulfilled).to.be.false;
      expect(request.paid).to.lt(expectedVRFLinkCost);

      await vrfCoordinator.fulfillRandomWords(request.requestId, await vrfV2Wrapper.getAddress());

      await raffleRewarder.determineWinner(exampleParticipants(owner.address));

      await expect(raffleRewarder.claimPrize()).to.emit(nftPrize, "Transfer").withArgs(owner.address, owner.address, BigInt(prize.tokenId));

      expect(await nftPrize.ownerOf(prize.tokenId)).to.equal(owner.address);
    });
  });
});
