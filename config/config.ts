export const ONE_DAY = 86_400;

// Raffle Rewarder Config
export const verificationTime = ONE_DAY; // 24h

// Raffle Ticket Purchase Config
export const ticketPrice = 100n;
export const openSalePeriod = 14 * ONE_DAY; // 14 days
export const minCap = 300; // 30k
export const maxCap = 1200; // 120k
export const personalMaxCap = 200; // 20k

// Chainlink config
export const baseFee = 100000000000000000n;
export const gasPriceLink = 1000000000n;
export const linkDecimals = 18n;
export const initialAnswer = 3000000000000000n;
export const wrapperGasOverhead = 20000n;
export const coordinatorGasOverheadNative = 99500
export const coordinatorGasOverheadLink = 121500
export const coordinatorGasOverheadPerWord = 435
export const coordinatorNativePremiumPercentage = 84
export const coordinatorLinkPremiumPercentage = 70
export const keyHash = "0x192234a5cda4cc07c0b66dfbcfbb785341cc790edc50032e842667dbb506cada"
export const maxNumWords = 10
export const stalenessSeconds = 172800
export const fallbackWeiPerUnitLink = 19850706000000000000n
export const fulfillmentFlatFeeNativePPM = 0
export const fulfillmentFlatFeeLinkDiscountPPM = 0
