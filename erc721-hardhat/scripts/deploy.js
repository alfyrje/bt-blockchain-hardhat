import pkg from "hardhat";
const { ethers } = pkg;

async function main() {
  const [deployer] = await ethers.getSigners();
  const MyNFT = await ethers.deployContract("MyNFT", [deployer.address]);
  await MyNFT.waitForDeployment();

  console.log("MyNFT deployed to:", await MyNFT.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
