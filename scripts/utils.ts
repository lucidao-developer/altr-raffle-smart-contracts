import { ethers } from "hardhat";
import { MaxUint256, parseEther, parseUnits, ZeroAddress } from "ethers";
import { PurchaseToken, RaffleTicketPurchase } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export type Participant = { addr: string; ticketCount: bigint; cumulativeCount: bigint };

export type Prize = { contractAddress: string; tokenId: bigint };

export type RequestStatus = {
  requestId: bigint;
  paid: bigint;
  fulfilled: boolean;
  randomWords: bigint[];
};

export const buyAllTickets = async (maxCap: number, personalMaxCap: number, ticketPrice: bigint, purchaseToken: PurchaseToken, raffleTicketPurchase: RaffleTicketPurchase, otherAccounts: HardhatEthersSigner[]) => {
  await Promise.all(
    Array.from(Array(parseInt((maxCap / personalMaxCap).toString())).keys()).map(async (i) => {
      await purchaseToken.transfer(
        await otherAccounts[i].getAddress(),
        parseUnits((BigInt(personalMaxCap) * ticketPrice).toString(), await purchaseToken.decimals())
      );
      await purchaseToken.connect(otherAccounts[i]).approve(await raffleTicketPurchase.getAddress(), MaxUint256);
      await raffleTicketPurchase.connect(otherAccounts[i]).purchaseTickets(personalMaxCap, ZeroAddress);
    })
  );
}

export const makeParticipantsProof = (participants: Participant[]) => {
  const abi = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(abi.encode(["(address addr, uint256 ticketCount, uint256 cumulativeCount)[]"], [participants]));
};

export const exampleAddress = "0x0000000000000000000000000000000000000001";

export const exampleParticipants = (address: string = exampleAddress): Participant[] => [
  { addr: address, ticketCount: 1n, cumulativeCount: 1n },
  { addr: address, ticketCount: 2n, cumulativeCount: 3n },
  { addr: address, ticketCount: 1n, cumulativeCount: 4n },
  { addr: address, ticketCount: 5n, cumulativeCount: 9n },
  { addr: address, ticketCount: 7n, cumulativeCount: 16n },
  { addr: address, ticketCount: 10n, cumulativeCount: 26n },
  { addr: address, ticketCount: 5n, cumulativeCount: 31n },
  { addr: address, ticketCount: 2n, cumulativeCount: 33n },
  { addr: address, ticketCount: 9n, cumulativeCount: 42n },
  { addr: address, ticketCount: 12n, cumulativeCount: 54n },
  { addr: address, ticketCount: 30n, cumulativeCount: 84n },
  { addr: address, ticketCount: 1n, cumulativeCount: 85n },
  { addr: address, ticketCount: 15n, cumulativeCount: 100n },
];

export const errors = {
  winnerNotSet: "WinnerNotSet",
  callerNotWinner: "OnlyWinnerCanCall",
  callerNotOwner: "OwnableUnauthorizedAccount",
  claimPeriodElapsed: "PrizeClaimPeriodElapsed",
  insufficientBalance: "ERC20: transfer amount exceeds balance",
  noRandomWords: "AskForRandomnessFirst",
  wrongParticipants: "WrongInput",
  cannotAskNewRandomness: "CannotAskForNewRandomness",
  invalidTokenAddress: "InvalidTokenAddress",
  invalidTimestamps: "InvalidTimestamps",
  invalidCaps: "InvalidCaps",
  refundNotAvailable: "RefundNotAvailable",
  invalidTicketAmount: "InvalidTicketAmount",
  personalMaxCapReached: "PersonalMaxCapReached",
  maxCapReached: "MaxCapReached",
  raffleNotActive: "RaffleNotActive",
  raffleNotSuccessful: "RaffleNotSuccessful",
  invalidAmount: "InvalidAmount",
  unauthorizedMsgSender: "UnauthorizedMsgSender",
  withdrawAmountExceedsLimit: "WithdrawAmountExceedsLimit",
  invalidId: "InvalidId",
  noExcessPurchaseToken: "NoExcessPurchaseToken",
  invalidInitialization: "InvalidInitialization",
  rewardingAlreadyStarted: "RewardingAlreadyStarted"
};

export const expectedVRFLinkCost = process.env.npm_lifecycle_event?.includes("coverage") ? 130_000_000 : parseEther("0.15");
export const maxVRFLinkCostDraft = parseEther("0.02");
