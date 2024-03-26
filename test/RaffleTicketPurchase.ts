import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";
import { maxCap, minCap, openSalePeriod, personalMaxCap, ticketPrice } from "../config/config";
import { MaxUint256, parseUnits, ZeroAddress } from "ethers";
import { buyAllTickets, errors } from "../scripts/utils";
import { PurchaseToken, RaffleTicketPurchase } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("RaffleTicketPurchase", function () {
  async function deployRaffleTicketPurchaseFixture() {
    const [owner, ...otherAccounts] = await hre.ethers.getSigners();

    const purchaseToken = await hre.ethers.deployContract("PurchaseToken");

    const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 1;

    const raffleTicketPurchase = await hre.ethers.deployContract("RaffleTicketPurchase", [
      0,
      await purchaseToken.getAddress(),
      ticketPrice,
      now,
      now + openSalePeriod,
      minCap,
      maxCap,
      personalMaxCap,
      "0x31",
    ]);

    return { raffleTicketPurchase, purchaseToken, owner, otherAccounts };
  }

  describe("Deployment", function () {
    it("Should set the right constructor params", async function () {
      const { raffleTicketPurchase, purchaseToken } = await loadFixture(deployRaffleTicketPurchaseFixture);

      const purchaseTokenAddress = await purchaseToken.getAddress();
      expect(await raffleTicketPurchase.purchaseToken()).to.equal(purchaseTokenAddress);
      expect(await raffleTicketPurchase.ticketPrice()).to.equal(parseUnits(ticketPrice.toString(), await purchaseToken.decimals()));

      const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 1;
      expect(await raffleTicketPurchase.startTimestamp()).to.be.closeTo(now, 2); // Allow 2 seconds drift
      expect(await raffleTicketPurchase.finishTimestamp()).to.be.closeTo(now + openSalePeriod, 2);
      expect(await raffleTicketPurchase.minTickets()).to.equal(minCap);
      expect(await raffleTicketPurchase.maxTickets()).to.equal(maxCap);
      expect(await raffleTicketPurchase.personalMaxTickets()).to.equal(personalMaxCap);
    });

    it("Should fail deployment with Zero Token Address", async function () {
      const { raffleTicketPurchase } = await loadFixture(deployRaffleTicketPurchaseFixture);

      const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 1;
      await expect(
        hre.ethers
          .getContractFactory("RaffleTicketPurchase")
          .then((f) => f.deploy(0, ZeroAddress, ticketPrice, now, now + openSalePeriod, minCap, maxCap, personalMaxCap, "0x31"))
      ).to.be.revertedWithCustomError(raffleTicketPurchase, errors.invalidTokenAddress);
    });

    it("Should fail deployment with invalid timestamps", async function () {
      const { raffleTicketPurchase, purchaseToken } = await loadFixture(deployRaffleTicketPurchaseFixture);

      const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 1;
      const tokenAddress = await purchaseToken.getAddress();
      await expect(
        hre.ethers.getContractFactory("RaffleTicketPurchase").then((f) =>
          f.deploy(
            0,
            tokenAddress,
            ticketPrice,
            now - 1, // Start timestamp in the past
            now + openSalePeriod,
            minCap,
            maxCap,
            personalMaxCap,
            "0x31"
          )
        )
      ).to.be.revertedWithCustomError(raffleTicketPurchase, errors.invalidTimestamps);

      await expect(
        hre.ethers.getContractFactory("RaffleTicketPurchase").then((f) =>
          f.deploy(
            0,
            tokenAddress,
            ticketPrice,
            now || 0,
            (now || 0) - 1, // Finish timestamp before start timestamp
            minCap,
            maxCap,
            personalMaxCap,
            "0x31"
          )
        )
      ).to.be.revertedWithCustomError(raffleTicketPurchase, errors.invalidTimestamps);
    });

    it("Should fail deployment with invalid ticket caps", async function () {
      const { raffleTicketPurchase, purchaseToken } = await loadFixture(deployRaffleTicketPurchaseFixture);

      const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 10;
      const tokenAddress = await purchaseToken.getAddress();

      // Zero minimum cap
      await expect(
        hre.ethers
          .getContractFactory("RaffleTicketPurchase")
          .then((f) => f.deploy(0, tokenAddress, ticketPrice, now, now + openSalePeriod, 0, maxCap, personalMaxCap, "0x31"))
      ).to.be.revertedWithCustomError(raffleTicketPurchase, errors.invalidCaps);

      // maxCap less than minCap
      await expect(
        hre.ethers.getContractFactory("RaffleTicketPurchase").then((f) =>
          f.deploy(
            0,
            tokenAddress,
            ticketPrice,
            now,
            now + openSalePeriod,
            minCap,
            minCap - 1, // maxCap less than minCap
            personalMaxCap,
            "0x31"
          )
        )
      ).to.be.revertedWithCustomError(raffleTicketPurchase, errors.invalidCaps);

      // personalMaxCap greater than maxCap
      await expect(
        hre.ethers.getContractFactory("RaffleTicketPurchase").then((f) =>
          f.deploy(
            0,
            tokenAddress,
            ticketPrice,
            now,
            now + openSalePeriod,
            minCap,
            maxCap,
            maxCap + 1, // personalMaxCap greater than maxCap
            "0x31"
          )
        )
      ).to.be.revertedWithCustomError(raffleTicketPurchase, errors.invalidCaps);
    });
  });

  describe("Ticket Purchase Functionality", function () {
    let raffleTicketPurchase: RaffleTicketPurchase;
    let purchaseToken: PurchaseToken;
    let owner: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];

    beforeEach(async function () {
      ({ raffleTicketPurchase, purchaseToken, owner, otherAccounts } = await loadFixture(deployRaffleTicketPurchaseFixture));
      // Assuming each test needs the owner to have enough tokens to buy tickets
      await purchaseToken.connect(owner).approve(await raffleTicketPurchase.getAddress(), MaxUint256);
    });

    it("Should allow normal ticket purchase and transfer funds correctly", async function () {
      const ticketAmount = 5n;
      await expect(raffleTicketPurchase.connect(owner).purchaseTickets(ticketAmount, "refCode"))
        .to.emit(raffleTicketPurchase, "TicketPurchased")
        .withArgs(0n, await owner.getAddress(), "refCode", ticketAmount);

      const ownerTickets = await raffleTicketPurchase.ticketsPurchased(owner.address);
      expect(ownerTickets).to.equal(ticketAmount);
      const totalTicketsSold = await raffleTicketPurchase.totalTicketsSold();
      expect(totalTicketsSold).to.equal(ticketAmount);
      expect(await purchaseToken.balanceOf(await raffleTicketPurchase.getAddress())).to.equal(ticketAmount * parseUnits(ticketPrice.toString(), await purchaseToken.decimals()));
    });

    it("Should revert if ticket amount requested is zero", async function () {
      await expect(raffleTicketPurchase.connect(owner).purchaseTickets(0, ZeroAddress)).to.be.revertedWithCustomError(
        raffleTicketPurchase,
        errors.invalidTicketAmount
      );
    });

    it("Should revert if ticket purchase exceeds personal cap", async function () {
      const ticketAmount = personalMaxCap + 1; // More than the personal cap
      await expect(raffleTicketPurchase.connect(owner).purchaseTickets(ticketAmount, ZeroAddress)).to.be.revertedWithCustomError(
        raffleTicketPurchase,
        errors.personalMaxCapReached
      );
    });

    it("Should revert if ticket purchase exceeds overall max cap", async function () {
      // Filling up to the max cap first
      await buyAllTickets(maxCap, personalMaxCap, ticketPrice, purchaseToken, raffleTicketPurchase, otherAccounts);
      // Trying to exceed the max cap
      await expect(raffleTicketPurchase.connect(owner).purchaseTickets(2, ZeroAddress)) // Attempting to buy 2 tickets, which would exceed maxCap by 1
        .to.be.revertedWithCustomError(raffleTicketPurchase, errors.maxCapReached);
    });

    it("Should revert if trying to purchase tickets before the start or after the finish of the raffle", async function () {
      const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 10;
      raffleTicketPurchase = await hre.ethers.deployContract("RaffleTicketPurchase", [
        0,
        await purchaseToken.getAddress(),
        ticketPrice,
        now,
        now + openSalePeriod,
        minCap,
        maxCap,
        personalMaxCap,
        "0x31",
      ]);
      await purchaseToken.connect(owner).approve(await raffleTicketPurchase.getAddress(), MaxUint256);
      // Purchasing before the raffle starts
      await expect(raffleTicketPurchase.connect(owner).purchaseTickets(1, ZeroAddress)).to.be.revertedWithCustomError(
        raffleTicketPurchase,
        errors.raffleNotActive
      );

      // Purchasing after the raffle ends
      await time.increase(openSalePeriod + 10);
      await expect(raffleTicketPurchase.connect(owner).purchaseTickets(1, ZeroAddress)).to.be.revertedWithCustomError(
        raffleTicketPurchase,
        errors.raffleNotActive
      );
    });

    it("Should allow multiple users to purchase tickets concurrently without exceeding the cap and reject purchases that exceed the cap", async function () {
      // Resetting raffle for a fresh cap
      ({ raffleTicketPurchase, purchaseToken, owner, otherAccounts } = await deployRaffleTicketPurchaseFixture());
      await purchaseToken.connect(owner).approve(await raffleTicketPurchase.getAddress(), MaxUint256);

      // Multiple users buying within cap limits
      await buyAllTickets(maxCap, personalMaxCap, ticketPrice, purchaseToken, raffleTicketPurchase, otherAccounts);

      const totalTicketsSold = await raffleTicketPurchase.totalTicketsSold();
      expect(totalTicketsSold).to.equal(maxCap);

      await expect(raffleTicketPurchase.connect(owner).purchaseTickets(1, ZeroAddress)).to.be.revertedWithCustomError(
        raffleTicketPurchase,
        errors.maxCapReached
      );
    });
  });

  describe("Fund Management and Withdrawal", function () {
    let raffleTicketPurchase: RaffleTicketPurchase;
    let purchaseToken: PurchaseToken;
    let owner: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];

    beforeEach(async function () {
      ({ raffleTicketPurchase, purchaseToken, owner, otherAccounts } = await loadFixture(deployRaffleTicketPurchaseFixture));
      await purchaseToken.connect(owner).approve(await raffleTicketPurchase.getAddress(), MaxUint256);
    });

    it("Should revert withdrawal attempt before the sale ends", async function () {
      // Attempt withdrawal before the sale period is over
      await expect(raffleTicketPurchase.withdrawFunds(ZeroAddress)).to.be.revertedWithCustomError(raffleTicketPurchase, errors.raffleNotSuccessful);
    });

    it("Should revert withdrawal attempt with insufficient ticket sales", async function () {
      // Move time past the raffle end
      await time.increase(openSalePeriod + 100);

      // Trying to withdraw when sales are below minTickets
      await expect(raffleTicketPurchase.connect(owner).withdrawFunds(ZeroAddress)).to.be.revertedWithCustomError(
        raffleTicketPurchase,
        errors.raffleNotSuccessful
      );
    });

    it("Should allow successful withdrawal by the owner when conditions are met", async function () {
      // First purchase enough tickets to meet minTickets
      await buyAllTickets(maxCap, personalMaxCap, ticketPrice, purchaseToken, raffleTicketPurchase, otherAccounts);

      // Move time past the raffle end
      await time.increase(openSalePeriod + 100);

      // Successful withdrawal
      const initialOwnerBalance = await purchaseToken.balanceOf(owner.address);
      const contractBalance = await purchaseToken.balanceOf(await raffleTicketPurchase.getAddress());
      await expect(await raffleTicketPurchase.connect(owner).withdrawFunds(owner.address)).to.changeTokenBalances(
        purchaseToken,
        [owner, raffleTicketPurchase],
        [contractBalance, -contractBalance]
      );

      const finalOwnerBalance = await purchaseToken.balanceOf(owner.address);
      expect(finalOwnerBalance - initialOwnerBalance).to.equal(contractBalance);
    });
  });

  describe("Refund Scenarios", function () {
    let raffleTicketPurchase: RaffleTicketPurchase;
    let purchaseToken: PurchaseToken;
    let owner: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];

    beforeEach(async function () {
      ({ raffleTicketPurchase, purchaseToken, owner, otherAccounts } = await loadFixture(deployRaffleTicketPurchaseFixture));
      await purchaseToken.connect(owner).approve(await raffleTicketPurchase.getAddress(), MaxUint256);
    });

    it("Should reject refund claims before the raffle finishes", async function () {
      // Owner buys some tickets
      await raffleTicketPurchase.connect(owner).purchaseTickets(10, ZeroAddress);

      // Attempt to claim refund before the raffle ends
      await expect(raffleTicketPurchase.connect(owner).claimRefund()).to.be.revertedWithCustomError(raffleTicketPurchase, "RaffleNotFailed");
    });

    it("Should reject refund claims when minTickets threshold is met or exceeded", async function () {
      // Owner buys enough tickets to meet the minTickets threshold
      await raffleTicketPurchase.connect(owner).purchaseTickets(personalMaxCap, ZeroAddress);
      await purchaseToken.transfer(otherAccounts[0], parseUnits((BigInt(personalMaxCap) * ticketPrice).toString()));
      await purchaseToken.connect(otherAccounts[0]).approve(await raffleTicketPurchase.getAddress(), MaxUint256);
      await raffleTicketPurchase.connect(otherAccounts[0]).purchaseTickets(minCap - personalMaxCap, ZeroAddress);

      // Move time past the raffle end
      await time.increase(openSalePeriod + 100);

      // Attempt to claim refund after the raffle ends but with minTickets sold
      await expect(raffleTicketPurchase.connect(owner).claimRefund()).to.be.revertedWithCustomError(raffleTicketPurchase, "RaffleNotFailed");
    });

    it("Should process refunds correctly if the raffle ends and minTickets sales are not met", async function () {
      // Owner buys some tickets but not enough to meet the minTickets threshold
      await raffleTicketPurchase.connect(owner).purchaseTickets(personalMaxCap, ZeroAddress);

      // Move time past the raffle end
      await time.increase(openSalePeriod + 100);

      // Attempt to claim a refund after the raffle ends and minTickets not sold
      const ticketCost = parseUnits(ticketPrice.toString(), await purchaseToken.decimals()) * BigInt(personalMaxCap);
      await expect(raffleTicketPurchase.connect(owner).claimRefund()).to.changeTokenBalances(
        purchaseToken,
        [owner, raffleTicketPurchase],
        [ticketCost, -ticketCost]
      );
      await expect(raffleTicketPurchase.connect(owner).claimRefund()).to.be.revertedWithCustomError(raffleTicketPurchase, "RefundNotAvailable");
    });

    it("Should reject refund claims from users who did not purchase any tickets", async function () {
      // Move time past the raffle end
      await time.increase(openSalePeriod + 100);

      // User who did not buy any tickets attempts to claim a refund
      await expect(raffleTicketPurchase.connect(otherAccounts[0]).claimRefund()).to.be.revertedWithCustomError(raffleTicketPurchase, "RefundNotAvailable");
    });
  });

  describe("Token Recovery and Management", function () {
    let raffleTicketPurchase: RaffleTicketPurchase;
    let owner: HardhatEthersSigner;
    let otherToken: any;

    beforeEach(async function () {
      ({ raffleTicketPurchase, owner } = await loadFixture(deployRaffleTicketPurchaseFixture));
      // Deploy a mock token
      otherToken = await hre.ethers.deployContract("PurchaseToken");
    });

    it("Should recover non-operational tokens sent by mistake", async function () {
      // Simulate sending other tokens to the contract
      const amount = parseUnits("100", await otherToken.decimals());
      await otherToken.transfer(await raffleTicketPurchase.getAddress(), amount);

      // Ensure the contract has received the tokens
      expect(await otherToken.balanceOf(await raffleTicketPurchase.getAddress())).to.equal(amount);

      // Recover the tokens
      await expect(raffleTicketPurchase.connect(owner).withdrawExcessTokens(await otherToken.getAddress(), amount, owner.address)).to.changeTokenBalances(
        otherToken,
        [owner, raffleTicketPurchase],
        [amount, -amount]
      );
    });
    it("Should revert if invalid amount or tokenAddress", async function () {
      await expect(raffleTicketPurchase.connect(owner).withdrawExcessTokens(ZeroAddress, 10, owner.address)).to.be.revertedWithCustomError(
        raffleTicketPurchase,
        errors.invalidTokenAddress
      );
      await expect(raffleTicketPurchase.connect(owner).withdrawExcessTokens(await otherToken.getAddress(), 0, owner.address)).to.be.revertedWithCustomError(
        raffleTicketPurchase,
        errors.invalidAmount
      );
    });
  });

  describe("Handling Edge Cases", function () {
    let raffleTicketPurchase: RaffleTicketPurchase;
    let purchaseToken: PurchaseToken;
    let owner: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];

    beforeEach(async function () {
      ({ raffleTicketPurchase, purchaseToken, owner, otherAccounts } = await deployRaffleTicketPurchaseFixture());
      await purchaseToken.connect(owner).approve(await raffleTicketPurchase.getAddress(), MaxUint256);
    });

    it("Should handle simultaneous cap reaches and purchases correctly", async function () {
      // Multiple users buying up to the cap
      await buyAllTickets(maxCap, personalMaxCap, ticketPrice, purchaseToken, raffleTicketPurchase, otherAccounts);

      // Verify the total tickets do not exceed maxCap
      const totalTicketsSold = await raffleTicketPurchase.totalTicketsSold();
      expect(totalTicketsSold).to.equal(maxCap);
    });

    it("Should handle rapid succession of purchases and refunds", async function () {
      // Simulate purchases followed immediately by refund requests
      await raffleTicketPurchase.connect(owner).purchaseTickets(5, ZeroAddress);

      await time.increase(openSalePeriod + 100);

      const refundAmount = parseUnits((ticketPrice * 5n).toString(), await purchaseToken.decimals());

      // Rapid refund after end
      await expect(raffleTicketPurchase.connect(owner).claimRefund()).to.changeTokenBalances(
        purchaseToken,
        [owner, raffleTicketPurchase],
        [refundAmount, -refundAmount]
      );
    });

    it("Should handle correctly a raffle without soft cap", async function () {
      const now = ((await hre.ethers.provider.getBlock("latest"))?.timestamp || 0) + 1;
      const _finishTimestamp = now + 86400;
      const _ticketPrice = 50;
      const _minTickets = 1000;
      const _maxTickets = 1000;
      const _personalMaxTickets = 50;


      const raffleTicketPurchase = await hre.ethers.deployContract("RaffleTicketPurchase", [
        0,
        await purchaseToken.getAddress(),
        _ticketPrice,
        now,
        _finishTimestamp,
        _minTickets,
        _maxTickets,
        _personalMaxTickets,
        "0x31"
      ]);

      await buyAllTickets(_maxTickets - 1, _personalMaxTickets, BigInt(_ticketPrice), purchaseToken, raffleTicketPurchase, otherAccounts);
      expect(await raffleTicketPurchase.isSuccessful()).to.be.false;

      await purchaseToken.approve(await raffleTicketPurchase.getAddress(), MaxUint256);

      await raffleTicketPurchase.purchaseTickets(_personalMaxTickets - 1, "refCode");
      expect(await raffleTicketPurchase.isSuccessful()).to.be.false;
      await raffleTicketPurchase.purchaseTickets(1, "refCode");
      expect(await raffleTicketPurchase.isSuccessful()).to.be.true;
    })
  });
});
