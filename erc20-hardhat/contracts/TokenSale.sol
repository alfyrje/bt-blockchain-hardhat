// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract TokenSale is Ownable, ReentrancyGuard {
    IERC20 public token;
    uint256 public rate; // tokens per wei (e.g., 1000 tokens per 1 ETH)
    uint256 public totalEthRaised;
    uint256 public totalTokensSold;
    
    event TokensPurchased(address indexed buyer, uint256 ethAmount, uint256 tokenAmount);
    event RateUpdated(uint256 newRate);
    event TokensWithdrawn(address indexed owner, uint256 amount);
    event EthWithdrawn(address indexed owner, uint256 amount);

    constructor(
        address _token,
        uint256 _rate,
        address _owner
    ) Ownable(_owner) {
        require(_token != address(0), "Token address cannot be zero");
        require(_rate > 0, "Rate must be greater than zero");
        
        token = IERC20(_token);
        rate = _rate;
    }

    // Buy tokens with ETH
    function buyTokens() external payable nonReentrant {
        require(msg.value > 0, "Must send ETH to buy tokens");
        
        uint256 tokenAmount = msg.value * rate;
        require(token.balanceOf(address(this)) >= tokenAmount, "Insufficient tokens in contract");
        
        totalEthRaised += msg.value;
        totalTokensSold += tokenAmount;
        
        require(token.transfer(msg.sender, tokenAmount), "Token transfer failed");
        
        emit TokensPurchased(msg.sender, msg.value, tokenAmount);
    }

    // Get token price in wei
    function getTokenPrice() external view returns (uint256) {
        return 1 ether / rate; // Price of 1 token in wei
    }

    // Calculate tokens for given ETH amount
    function calculateTokens(uint256 ethAmount) external view returns (uint256) {
        return ethAmount * rate;
    }

    // Update the exchange rate (only owner)
    function updateRate(uint256 _rate) external onlyOwner {
        require(_rate > 0, "Rate must be greater than zero");
        rate = _rate;
        emit RateUpdated(_rate);
    }

    // Owner can withdraw ETH raised
    function withdrawEth() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "ETH withdrawal failed");
        
        emit EthWithdrawn(owner(), balance);
    }

    // Owner can withdraw unsold tokens
    function withdrawTokens(uint256 amount) external onlyOwner {
        require(token.balanceOf(address(this)) >= amount, "Insufficient token balance");
        require(token.transfer(owner(), amount), "Token withdrawal failed");
        
        emit TokensWithdrawn(owner(), amount);
    }

    // Emergency function to withdraw all tokens
    function withdrawAllTokens() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        require(token.transfer(owner(), balance), "Token withdrawal failed");
        
        emit TokensWithdrawn(owner(), balance);
    }

    // Get contract token balance
    function getTokenBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }
}