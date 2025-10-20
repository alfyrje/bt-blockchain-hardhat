async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with", deployer.address);
  
    const MyToken = await ethers.getContractFactory("MyToken");
    const initialSupply = ethers.utils.parseUnits("10000", 18); // 10k tokens
    const token = await MyToken.deploy("MyToken", "MTK", initialSupply);
    await token.deployed();
  
    console.log("Token deployed to:", token.address);
  }
  
  main().catch((e) => { console.error(e); process.exit(1); });
  