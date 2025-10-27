async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());
  
    // Deploy MyToken
    const MyToken = await ethers.getContractFactory("MyToken");
    const initialSupply = ethers.utils.parseUnits("10000", 18); // 10k tokens
    const token = await MyToken.deploy("MyToken", "MTK", initialSupply);
    await token.deployed();
  
    console.log("Token deployed to:", token.address);

    // Deploy TokenSale
    // Rate: 1000 tokens per 1 ETH (1000 tokens = 1 ETH)
    const rate = 1000; // 1000 tokens per 1 ETH (no need to parse units for rate)
    const TokenSale = await ethers.getContractFactory("TokenSale");
    const tokenSale = await TokenSale.deploy(
        token.address,
        rate,
        deployer.address
    );
    await tokenSale.deployed();

    console.log("TokenSale deployed to:", tokenSale.address);

    // Transfer some tokens to the TokenSale contract for selling
    const tokensForSale = ethers.utils.parseUnits("5000", 18); // 5k tokens for sale
    await token.transfer(tokenSale.address, tokensForSale);
    console.log("Transferred", ethers.utils.formatUnits(tokensForSale, 18), "tokens to TokenSale contract");

    console.log("\n=== Deployment Summary ===");
    console.log("MyToken:", token.address);
    console.log("TokenSale:", tokenSale.address);
    console.log("Exchange Rate: 1000 MTK per 1 ETH");
    console.log("Tokens available for sale:", ethers.utils.formatUnits(tokensForSale, 18), "MTK");
}
  
main().catch((e) => { console.error(e); process.exit(1); });
