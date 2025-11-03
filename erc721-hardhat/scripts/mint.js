import pkg from "hardhat";
const { ethers } = pkg;

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function main() {
  const [owner, user1] = await ethers.getSigners();
  const MyNFT = await ethers.getContractAt("MyNFT", CONTRACT_ADDRESS);

  const tx = await MyNFT.mintNFT(user1.address, "ipfs://bafkreifav6dweq2czijslngwqbhoym577l2z4dxlx7qxxypbonl3t3fqku");
  await tx.wait();

  console.log(`Minted NFT to ${user1.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
