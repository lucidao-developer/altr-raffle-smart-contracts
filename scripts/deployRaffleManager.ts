import { Contract } from "ethers";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import { ethers, network, upgrades, run } from "hardhat";

export const verifyContract = async (name: string, taskArguments?: any) => {
  console.log(`Verifying contract ${name}`);
  await new Promise((r) => setTimeout(r, 60_000));

  try {
    await run("verify:verify", taskArguments);
  } catch (error) {
    console.log(`Unable to verify contract ${name}`);
    console.log(error);
  }
};

const verifyProxiedContractImplementation = async (contractName: string, contract: Contract, contractParameter: string) => {
  try {
    const contractImplAddress = await getImplementationAddress(network.provider, await contract.getAddress());
    console.log(`Found ${contractName} implementation in proxied contract json. Impl address: ${contractImplAddress}`);
    await verifyContract(contractName, {
      address: contractImplAddress,
      contract: contractParameter,
    });
  } catch (error) {
    console.log(`Warning: problem while verifying ${contractName} contract. Skip! Error detail: ${error}`);
  }
};

export const deployRaffleManager = async (vrfV2WrapperAddress: string) => {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying contracts with the account: ${deployer.address}`);

  console.log(`vrf wrapper address: ${vrfV2WrapperAddress}`);

  const contractName = "RaffleManager";
  console.log(`\nDeploying contract ${contractName}`);

  const contractArgs = [vrfV2WrapperAddress];
  const RaffleManager = await ethers.getContractFactory(contractName);
  const raffleManager = await upgrades.deployProxy(RaffleManager, contractArgs, {
    initializer: "initialize",
  });
  await raffleManager.waitForDeployment();
  console.log(`${contractName} address: ${await raffleManager.getAddress()}`);

  const contractParameter = "contracts/RaffleManager.sol:RaffleManager";
  await verifyProxiedContractImplementation(contractName, raffleManager, contractParameter);
  return raffleManager;
};

export const getChainLinkInfrastructure = async () => {
  if (!process.env.VRF_V2_WRAPPER_ADDRESS) throw new Error("Missing required env variables");

  const vrfV2Wrapper = await ethers.getContractAt("VRFV2PlusWrapper", process.env.VRF_V2_WRAPPER_ADDRESS);

  return { vrfV2Wrapper };
};

async function main() {
  const { vrfV2Wrapper } = await getChainLinkInfrastructure();
  await deployRaffleManager(await vrfV2Wrapper.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
