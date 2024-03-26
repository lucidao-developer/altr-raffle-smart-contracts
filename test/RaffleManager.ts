import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
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
  maxCap,
  maxNumWords,
  minCap,
  openSalePeriod,
  personalMaxCap,
  stalenessSeconds,
  ticketPrice,
  wrapperGasOverhead,
} from "../config/config";
import { expect } from "chai";
import { MaxUint256, parseEther, parseUnits, ZeroAddress } from "ethers";
import { buyAllTickets, errors, exampleParticipants, expectedVRFLinkCost, makeParticipantsProof, maxVRFLinkCostDraft } from "../scripts/utils";
import { PurchaseToken, RaffleManager, RaffleManagerV2 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("RaffleManager", function () {
  async function deployRaffleManagerFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, ...otherAccounts] = await hre.ethers.getSigners();

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

    const purchaseToken = await hre.ethers.deployContract("PurchaseToken");

    const contractArgs = [await vrfV2Wrapper.getAddress()];
    const RaffleManager = await hre.ethers.getContractFactory("RaffleManager");
    const raffleManager = (await hre.upgrades.deployProxy(RaffleManager, contractArgs, {
      initializer: "initialize",
    })) as unknown as RaffleManager;

    return { raffleManager, purchaseToken, nftPrize, linkToken, vrfV2Wrapper, vrfCoordinator, prize, owner, otherAccounts };
  }

  describe("Deployment", function () {
    it("Deployment should set the correct initial parameters", async function () {
      const { raffleManager, vrfV2Wrapper, owner } = await loadFixture(deployRaffleManagerFixture);
      expect(await raffleManager.vrfV2Wrapper()).to.equal(await vrfV2Wrapper.getAddress());
      expect(await raffleManager.owner()).to.equal(await owner.getAddress());
    });

    it("Initial state should have lastRaffleId set to zero", async function () {
      const { raffleManager } = await loadFixture(deployRaffleManagerFixture);
      expect(await raffleManager.lastRaffleId()).to.equal(0);
    });

    it("Should disable initializer", async function () {
      const { raffleManager } = await loadFixture(deployRaffleManagerFixture);
      await expect(raffleManager.initialize(ZeroAddress)).to.be.revertedWithCustomError(raffleManager, errors.invalidInitialization);
    });
  });

  describe("Raffle Creation", function () {
    it("should create a raffle successfully and store correct values", async function () {
      const { raffleManager, purchaseToken } = await loadFixture(deployRaffleManagerFixture);

      const tokenAddress = await purchaseToken.getAddress();
      const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 1;
      await expect(raffleManager.createNewRaffle(tokenAddress, ticketPrice, now, now + openSalePeriod, minCap, maxCap, personalMaxCap)).to.emit(
        raffleManager,
        "RaffleCreated"
      );

      const raffle = await raffleManager.raffles(0);
      expect(raffle.purchaseToken).to.equal(tokenAddress);
      expect(raffle.ticketPrice).to.equal(ticketPrice);
      expect(raffle.startTimestamp).to.equal(now);
      expect(raffle.finishTimestamp).to.equal(now + openSalePeriod);
      expect(raffle.minCap).to.equal(minCap);
      expect(raffle.maxCap).to.equal(maxCap);
      expect(raffle.personalMaxCap).to.equal(personalMaxCap);
    });

    it("should revert on creation with invalid parameters", async function () {
      const { raffleManager, purchaseToken } = await loadFixture(deployRaffleManagerFixture);
      const _purchaseToken = ZeroAddress;
      const _startTimestamp = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 3600;
      const _finishTimestamp = _startTimestamp - 3600; // Invalid: finish before start
      const _minTickets = 0; // Invalid: zero minimum
      const _maxTickets = 500;
      const _personalMaxTickets = 5;

      const RaffleTicketPurchase = await hre.ethers.getContractFactory("RaffleTicketPurchase");

      await expect(
        raffleManager.createNewRaffle(
          await purchaseToken.getAddress(),
          ticketPrice,
          _startTimestamp,
          _finishTimestamp,
          _minTickets,
          _maxTickets,
          _personalMaxTickets
        )
      ).to.be.revertedWithCustomError(RaffleTicketPurchase, errors.invalidTimestamps);

      await expect(
        raffleManager.createNewRaffle(_purchaseToken, ticketPrice, _startTimestamp, _startTimestamp + 86400, _minTickets, _maxTickets, _personalMaxTickets)
      ).to.be.revertedWithCustomError(RaffleTicketPurchase, errors.invalidTokenAddress);
    });

    it("Event Emission on Raffle Creation", async function () {
      const { raffleManager, purchaseToken } = await loadFixture(deployRaffleManagerFixture);
      const _startTimestamp = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 3600;
      const _finishTimestamp = _startTimestamp + 86400;
      const _minTickets = 50;
      const _maxTickets = 500;
      const _personalMaxTickets = 5;

      await expect(
        raffleManager.createNewRaffle(
          await purchaseToken.getAddress(),
          ticketPrice,
          _startTimestamp,
          _finishTimestamp,
          _minTickets,
          _maxTickets,
          _personalMaxTickets
        )
      ).to.emit(raffleManager, "RaffleCreated");
    });
  });

  describe("Raffle Management", function () {
    let raffleManager: RaffleManager;
    let purchaseToken: PurchaseToken;
    let owner: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let tokenAddress: string;
    let prize: any;

    beforeEach(async function () {
      ({ raffleManager, purchaseToken, owner, prize, otherAccounts } = await loadFixture(deployRaffleManagerFixture));
      tokenAddress = await purchaseToken.getAddress();
      const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 1;
      await raffleManager.createNewRaffle(tokenAddress, ticketPrice, now, now + openSalePeriod, minCap, maxCap, personalMaxCap);
    });

    it("should successfully start rewarding for a valid raffle", async function () {
      // Setup a raffle that can successfully start rewarding
      let raffle = await raffleManager.raffles(0);
      const raffleTicketPurchase = await hre.ethers.getContractAt("RaffleTicketPurchase", raffle[0]);

      await buyAllTickets(maxCap, personalMaxCap, ticketPrice, purchaseToken, raffleTicketPurchase, otherAccounts);
      await expect(raffleManager.startRewarding(0, prize, makeParticipantsProof([]))).to.emit(raffleManager, "RewardingStarted");
    });

    it("should revert when starting rewarding for a non-existent raffle", async function () {
      const nonExistentRaffleId = 999; // Assuming this ID hasn't been created
      await expect(raffleManager.connect(owner).startRewarding(nonExistentRaffleId, prize, makeParticipantsProof([]))).to.be.revertedWithCustomError(
        raffleManager,
        errors.invalidId
      );
    });

    it("should fail to start rewarding on an unsuccessful raffle", async function () {
      // Assume the raffle at index 0 was not successful
      // Mock the isSuccessful() to return false or check the conditions that would make it unsuccessful
      await expect(raffleManager.connect(owner).startRewarding(0, prize, makeParticipantsProof([]))).to.be.revertedWithCustomError(
        raffleManager,
        errors.raffleNotSuccessful
      );
    });
  });

  describe("RaffleManager Upgrade to V2", function () {
    let raffleManager: RaffleManager;
    let raffleManagerV2: RaffleManagerV2;
    let purchaseToken: PurchaseToken;

    beforeEach(async function () {
      ({ raffleManager, purchaseToken } = await loadFixture(deployRaffleManagerFixture));
    });

    it("should deploy and upgrade RaffleManager to V2", async function () {
      const vrfV2Wrapper = await raffleManager.vrfV2Wrapper();

      const RaffleManagerV2 = await hre.ethers.getContractFactory("RaffleManagerV2");
      raffleManagerV2 = (await hre.upgrades.upgradeProxy(await raffleManager.getAddress(), RaffleManagerV2, { call: { fn: "upgradeToV2", args: [] } })) as unknown as RaffleManagerV2;

      expect(await raffleManagerV2.vrfV2Wrapper()).to.equal(vrfV2Wrapper);
      expect(await raffleManagerV2.version()).to.equal("0x32");
    });

    it("should allow cancellation of a pending raffle", async function () {
      const RaffleManagerV2 = await hre.ethers.getContractFactory("RaffleManagerV2");
      await hre.upgrades.validateUpgrade(await raffleManager.getAddress(), RaffleManagerV2);

      raffleManagerV2 = (await hre.upgrades.upgradeProxy(await raffleManager.getAddress(), RaffleManagerV2)) as unknown as RaffleManagerV2;

      const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 1;

      await raffleManagerV2.createNewRaffle(await purchaseToken.getAddress(), 100, now, now + openSalePeriod, 10, 100, 1);
      await raffleManagerV2.cancelRaffle(0);

      expect(await raffleManagerV2.isCanceled(0)).to.be.true;
    });

    it("should revert when trying to cancel a non-pending raffle", async function () {
      const RaffleManagerV2 = await hre.ethers.getContractFactory("RaffleManagerV2");
      raffleManagerV2 = (await hre.upgrades.upgradeProxy(await raffleManager.getAddress(), RaffleManagerV2)) as unknown as RaffleManagerV2;

      const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 1;

      await raffleManagerV2.createNewRaffle(await purchaseToken.getAddress(), 100, now, now + openSalePeriod, 10, 100, 1);
      await raffleManagerV2.cancelRaffle(0); // Cancel once

      await expect(raffleManagerV2.cancelRaffle(0)).to.be.revertedWith("Raffle already canceled");
    });
  });

  describe("IsAKnownRaffle", function () {
    it("Should return true if the address is of a known raffle", async function () {
      const { raffleManager, purchaseToken, otherAccounts, prize } = await loadFixture(deployRaffleManagerFixture);

      const tokenAddress = await purchaseToken.getAddress();
      const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 1;
      await raffleManager.createNewRaffle(tokenAddress, ticketPrice, now, now + openSalePeriod, minCap, maxCap, personalMaxCap);

      const { raffleTicketPurchase: raffleTicketPurchaseAddress } = await raffleManager.raffles(0);
      const raffleTicketPurchase = await hre.ethers.getContractAt("RaffleTicketPurchase", raffleTicketPurchaseAddress);

      await buyAllTickets(maxCap, personalMaxCap, ticketPrice, purchaseToken, raffleTicketPurchase, otherAccounts);

      await raffleManager.startRewarding(0, prize, makeParticipantsProof([]));

      const raffle = await raffleManager.raffles(0);

      expect(await raffleManager.knownRaffles(raffle.raffleTicketPurchase)).to.be.true;
      expect(await raffleManager.knownRaffles(raffle.raffleRewarder)).to.be.true;
    });
    it("Should return false if the address is NOT of a known raffle", async function () {
      const { raffleManager, otherAccounts } = await loadFixture(deployRaffleManagerFixture);

      expect(await raffleManager.knownRaffles(ZeroAddress)).to.be.false;
      await Promise.all(
        otherAccounts.map(async (account) => {
          expect(await raffleManager.knownRaffles(account)).to.be.false;
        })
      );
    });
  });

  describe("WithdrawExcessToken", function () {
    it("Should recover non-operational tokens sent by mistake", async function () {
      const { raffleManager, purchaseToken, owner } = await loadFixture(deployRaffleManagerFixture);
      const tokenAddress = await purchaseToken.getAddress();
      const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 1;
      await raffleManager.createNewRaffle(tokenAddress, ticketPrice, now, now + openSalePeriod, minCap, maxCap, personalMaxCap);

      const { raffleTicketPurchase: raffleTicketPurchaseAddress } = await raffleManager.raffles(0);
      const raffleTicketPurchase = await hre.ethers.getContractAt("RaffleTicketPurchase", raffleTicketPurchaseAddress);
      let amount = parseUnits("100", await purchaseToken.decimals());
      await purchaseToken.approve(await raffleTicketPurchase.getAddress(), 5n * amount);

      await raffleTicketPurchase.purchaseTickets(5n, "refCode");
      await expect(raffleManager.withdrawExcessTokens(0, await purchaseToken.getAddress(), amount)).to.be.revertedWithCustomError(
        raffleTicketPurchase,
        errors.noExcessPurchaseToken
      );
      purchaseToken.transfer(await raffleTicketPurchase.getAddress(), amount);
      await expect(raffleManager.withdrawExcessTokens(0, await purchaseToken.getAddress(), amount + 1n)).to.be.revertedWithCustomError(
        raffleTicketPurchase,
        errors.withdrawAmountExceedsLimit
      );

      await expect(raffleManager.withdrawExcessTokens(0, await purchaseToken.getAddress(), amount)).to.changeTokenBalances(
        purchaseToken,
        [await owner.getAddress(), raffleTicketPurchase],
        [amount, -amount]
      );

      const otherToken = await hre.ethers.deployContract("PurchaseToken");
      amount = parseUnits("100", await otherToken.decimals());
      await otherToken.transfer(await raffleTicketPurchase.getAddress(), amount);

      // Ensure the contract has received the tokens
      expect(await otherToken.balanceOf(await raffleTicketPurchase.getAddress())).to.equal(amount);

      // Recover the tokens
      await expect(raffleManager.withdrawExcessTokens(0, await otherToken.getAddress(), amount)).to.changeTokenBalances(
        otherToken,
        [await owner.getAddress(), raffleTicketPurchase],
        [amount, -amount]
      );

      await expect(raffleManager.withdrawExcessTokens(100, await otherToken.getAddress(), amount)).to.revertedWithCustomError(raffleManager, errors.invalidId);
    });
  });

  describe("Only Owner Functions", function () {
    it("Should revert if a non-owner user tries to call only owner functions", async function () {
      const { raffleManager, otherAccounts } = await loadFixture(deployRaffleManagerFixture);

      await expect(raffleManager.connect(otherAccounts[0]).createNewRaffle(ZeroAddress, 0, 0, 0, 0, 0, 0)).to.be.revertedWithCustomError(raffleManager, errors.callerNotOwner);
      await expect(raffleManager.connect(otherAccounts[0]).startRewarding(0, { contractAddress: ZeroAddress, tokenId: 0 }, makeParticipantsProof([]))).to.be.revertedWithCustomError(raffleManager, errors.callerNotOwner);
      await expect(raffleManager.connect(otherAccounts[0]).withdrawExcessTokens(0, ZeroAddress, 0)).to.be.revertedWithCustomError(raffleManager, errors.callerNotOwner);
      await expect(raffleManager.connect(otherAccounts[0]).setWrapper(ZeroAddress)).to.be.revertedWithCustomError(raffleManager, errors.callerNotOwner);
    });
  });

  describe("setWrapper", function () {
    it("Should update the vrf wrapper address and emit an event", async function () {
      const { raffleManager } = await loadFixture(deployRaffleManagerFixture);
      await expect(raffleManager.setWrapper(ZeroAddress)).to.emit(raffleManager, "WrapperSet");
      expect(await raffleManager.vrfV2Wrapper()).to.equal(ZeroAddress);
    });
  });

  describe("Simulate a full raffle behavior", function () {
    it("Should handle all the raffle until the winner claims the prize", async function () {
      const { raffleManager, purchaseToken, owner, prize, otherAccounts, linkToken, vrfCoordinator, vrfV2Wrapper, nftPrize } = await loadFixture(
        deployRaffleManagerFixture
      );
      const tokenAddress = await purchaseToken.getAddress();

      const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 1;
      await raffleManager.createNewRaffle(tokenAddress, ticketPrice, now, now + openSalePeriod, minCap, maxCap, personalMaxCap);

      let raffle = await raffleManager.raffles(0);
      const raffleTicketPurchase = await hre.ethers.getContractAt("RaffleTicketPurchase", raffle[0]);

      await buyAllTickets(maxCap, personalMaxCap, ticketPrice, purchaseToken, raffleTicketPurchase, otherAccounts);

      await expect(raffleManager.startRewarding(0, prize, makeParticipantsProof(exampleParticipants(owner.address)))).to.emit(
        raffleManager,
        "RewardingStarted"
      );
      await expect(raffleManager.startRewarding(0, prize, makeParticipantsProof(exampleParticipants(owner.address)))).to.be.revertedWithCustomError(
        raffleManager,
        errors.rewardingAlreadyStarted
      );
      raffle = await raffleManager.raffles(0);

      await linkToken.approve(raffle.raffleRewarder, MaxUint256 - 1n);
      const payerStartingBalance = await linkToken.balanceOf(owner.address);

      await raffleManager.askForRandomness(0);

      expect(payerStartingBalance - (await linkToken.balanceOf(owner.address))).to.approximately(expectedVRFLinkCost, maxVRFLinkCostDraft);

      const raffleRewarder = await hre.ethers.getContractAt("RaffleRewarder", raffle.raffleRewarder);
      let request = await raffleRewarder.request();

      expect(request.requestId).not.to.equal(0n);
      expect(request.fulfilled).to.be.false;
      expect(request.paid).to.approximately(expectedVRFLinkCost, maxVRFLinkCostDraft);

      const tx = await vrfCoordinator.fulfillRandomWords(request.requestId, await vrfV2Wrapper.getAddress());

      request = await raffleRewarder.request();

      expect(request.fulfilled).to.be.true;

      await raffleManager.determineWinner(0, exampleParticipants(owner.address));
      const blockTimestamp = (await tx.getBlock())?.timestamp;

      expect(await raffleRewarder.winner()).to.equal(owner.address);
      expect(await raffleRewarder.startClaimTime()).to.equal(blockTimestamp);

      await nftPrize.approve(await raffleRewarder.getAddress(), 1);

      await expect(raffleRewarder.claimPrize()).to.emit(nftPrize, "Transfer").withArgs(owner.address, owner.address, 1n);

      expect(await nftPrize.ownerOf(1)).to.equal(owner.address);
    });
  });
});
